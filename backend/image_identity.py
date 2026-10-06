"""Permanent gallery image identity.

The UUID embedded in the image (when the format allows it) is the identity.
SQLite records the path, content hash, and social relationships. A filename
change does not create a new id.
"""

from __future__ import annotations

import hashlib
import json
import os
import uuid
from io import BytesIO

from PIL import Image, UnidentifiedImageError
from PIL.PngImagePlugin import PngInfo

from . import social_store

ID_KEY = "UsgromanaGalleryImageId"
VERSION_KEY = "UsgromanaGallerySchemaVersion"
AVERAGE_KEY = "UsgromanaGalleryRatingAverage"
COUNT_KEY = "UsgromanaGalleryRatingCount"
SCHEMA_VERSION = "1"
_USER_COMMENT = 37510

_shares_path: str | None = None
_ratings_path: str | None = None
_account_resolver = None


def configure_legacy(shares_path: str | None = None, ratings_path: str | None = None, account_resolver=None) -> None:
    global _shares_path, _ratings_path, _account_resolver
    _shares_path = shares_path
    _ratings_path = ratings_path
    _account_resolver = account_resolver


def create_image_id() -> str:
    return str(uuid.uuid4())


def _valid_uuid(value) -> bool:
    if not isinstance(value, str) or not value.strip():
        return False
    try:
        uuid.UUID(value.strip())
    except (ValueError, AttributeError):
        return False
    return True


def parse_image_id(value) -> str | None:
    if not isinstance(value, str):
        return None
    text = value.strip()
    try:
        return str(uuid.UUID(text))
    except (ValueError, AttributeError):
        return None


def request_owner_id() -> str:
    """Account that owns the gallery folder for this request."""
    try:
        from .account_scope import peek_account_root
    except Exception:
        return social_store.LOCAL_OWNER
    root = peek_account_root()
    if not root:
        return social_store.LOCAL_OWNER
    name = os.path.basename(os.path.abspath(root))
    if _valid_uuid(name):
        return name
    return social_store.LOCAL_OWNER


def calculate_content_hash(filepath: str) -> str:
    """SHA-256 of uncompressed RGBA pixels. Metadata rewrites do not change it."""
    with Image.open(filepath) as image:
        frame = image.convert("RGBA")
        payload = frame.tobytes()
    return hashlib.sha256(payload).hexdigest()


def _data_dir() -> str:
    return os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")


def _shares_file() -> str:
    return _shares_path or os.path.join(_data_dir(), "image_shares.json")


def _ratings_file() -> str:
    return _ratings_path or os.path.join(_data_dir(), "ratings.json")


def _accounts() -> list[dict]:
    if _account_resolver is not None:
        return list(_account_resolver() or [])
    try:
        from .usgromana_accounts import known_accounts

        return known_accounts()
    except Exception:
        return []


def _decode_comment(value) -> str:
    if value is None:
        return ""
    if isinstance(value, bytes):
        value = value.decode("utf-8", "ignore")
    return str(value)


def _id_from_text(text: str) -> str | None:
    for line in text.splitlines():
        if line.startswith(f"{ID_KEY}="):
            parsed = parse_image_id(line.split("=", 1)[1].strip())
            if parsed:
                return parsed
    parsed = parse_image_id(text.strip())
    return parsed


def read_image_id(filepath: str) -> str | None:
    try:
        with Image.open(filepath) as image:
            info = getattr(image, "info", {}) or {}
            embedded = info.get(ID_KEY)
            if isinstance(embedded, str):
                parsed = parse_image_id(embedded.strip())
                if parsed:
                    return parsed
            comment = _decode_comment(info.get("comment") or info.get("Comment"))
            parsed = _id_from_text(comment)
            if parsed:
                return parsed
            try:
                exif = image.getexif()
            except Exception:
                exif = None
            if exif:
                parsed = _id_from_text(_decode_comment(exif.get(_USER_COMMENT)))
                if parsed:
                    return parsed
    except (UnidentifiedImageError, OSError, ValueError):
        return None
    return None


def _png_fields(image_id: str, average=None, count=None) -> dict:
    fields = {ID_KEY: image_id, VERSION_KEY: SCHEMA_VERSION}
    if average is not None:
        fields[AVERAGE_KEY] = _format_average(average)
    if count is not None:
        fields[COUNT_KEY] = str(int(count))
    return fields


def _format_average(average) -> str:
    try:
        number = float(average)
    except (TypeError, ValueError):
        return str(average)
    text = f"{number:.4f}".rstrip("0").rstrip(".")
    return text or "0"


def write_image_id(filepath: str, image_id: str, average=None, count=None) -> bool:
    """Embed identity when the format can be rewritten safely. Returns False on fallback."""
    if not parse_image_id(image_id):
        return False
    ext = os.path.splitext(filepath)[1].lower()
    try:
        if ext == ".png":
            return _write_png(filepath, _png_fields(image_id, average, count))
        if ext in {".jpg", ".jpeg"}:
            return _write_comment(filepath, image_id, average, count, "JPEG")
        if ext == ".webp":
            return _write_comment(filepath, image_id, average, count, "WEBP")
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        print(f"[Usgromana-Gallery] Metadata synchronization failure for {os.path.basename(filepath)}: {exc}")
        return False
    return False


def _write_png(filepath: str, fields: dict) -> bool:
    with Image.open(filepath) as image:
        info = PngInfo()
        for key, value in (image.info or {}).items():
            if key in fields:
                continue
            if isinstance(key, str) and isinstance(value, str):
                info.add_text(key, value)
        for key, value in fields.items():
            info.add_text(key, str(value))
        image.save(filepath, format="PNG", pnginfo=info)
    return read_image_id(filepath) == fields[ID_KEY]


def _comment_payload(image_id: str, average=None, count=None) -> str:
    lines = [f"{ID_KEY}={image_id}", f"{VERSION_KEY}={SCHEMA_VERSION}"]
    if average is not None:
        lines.append(f"{AVERAGE_KEY}={_format_average(average)}")
    if count is not None:
        lines.append(f"{COUNT_KEY}={int(count)}")
    return "\n".join(lines)


def _write_comment(filepath: str, image_id: str, average, count, image_format: str) -> bool:
    payload = _comment_payload(image_id, average, count)
    with Image.open(filepath) as image:
        exif = image.getexif()
        exif[_USER_COMMENT] = payload
        image.save(filepath, format=image_format, exif=exif.tobytes())
    return read_image_id(filepath) == image_id


def sync_rating_metadata(filepath: str, image_id: str, average, count: int) -> bool:
    """Write the aggregate onto the file. A failure leaves the database rating in place."""
    try:
        return write_image_id(filepath, image_id, average, count)
    except Exception as exc:
        print(f"[Usgromana-Gallery] Metadata synchronization failure: {exc}")
        return False


def _registered_file_missing(owner_root: str | None, relpath: str | None) -> bool:
    """True only when we can see that the registered file is gone."""
    if not owner_root or not relpath:
        return False
    candidate = os.path.join(owner_root, *str(relpath).split("/"))
    return not os.path.isfile(candidate)


def ensure_image_identity(
    filepath: str,
    owner_id: str,
    owner_username: str | None = None,
    storage_type: str | None = None,
    relpath: str | None = None,
    owner_root: str | None = None,
) -> str:
    """Return the permanent gallery UUID for this file, registering it when needed."""
    if not os.path.isfile(filepath):
        raise FileNotFoundError(filepath)
    if not relpath:
        relpath = os.path.basename(filepath)
    relpath = relpath.replace("\\", "/")
    filename = os.path.basename(relpath)
    embedded = read_image_id(filepath)
    content_hash = None
    recovered = False
    created = False

    image_id = None
    if embedded:
        existing = social_store.get_image(embedded)
        if existing is None or existing.get("owner_id") == owner_id:
            image_id = embedded
        else:
            embedded = None

    if image_id is None:
        by_path = social_store.get_image_by_path(owner_id, relpath)
        if by_path:
            image_id = by_path["image_id"]

    if image_id is None:
        content_hash = calculate_content_hash(filepath)
        matches = social_store.images_by_hash(content_hash, owner_id)
        if len(matches) == 1 and _registered_file_missing(owner_root, matches[0].get("relpath")):
            if matches[0].get("relpath") != relpath:
                image_id = matches[0]["image_id"]
                recovered = True
                print(f"[Usgromana-Gallery] Image identity recovered: {image_id}")

    if image_id is None:
        image_id = create_image_id()
        created = True
        print(f"[Usgromana-Gallery] Image identity created: {image_id}")

    if content_hash is None:
        try:
            content_hash = calculate_content_hash(filepath)
        except (UnidentifiedImageError, OSError, ValueError):
            content_hash = None

    if read_image_id(filepath) != image_id:
        wrote = write_image_id(filepath, image_id)
        if not wrote:
            print(
                f"[Usgromana-Gallery] Metadata synchronization failure: "
                f"identity kept in the database for {relpath}"
            )

    social_store.register_image(
        image_id,
        owner_id,
        relpath,
        filename=filename,
        owner_username=owner_username,
        storage_type=storage_type,
        content_hash=content_hash,
    )
    _import_legacy(image_id, owner_id, relpath)
    if recovered:
        social_store.update_image_path(image_id, relpath, filename)
    return image_id


def _load_json(path: str, fallback):
    if not os.path.isfile(path):
        return fallback
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, json.JSONDecodeError):
        return fallback


def _import_legacy(image_id: str, owner_id: str, relpath: str) -> None:
    share_key = social_store.share_migration_key(image_id)
    if not social_store.migration_done(share_key):
        data = _load_json(_shares_file(), {"shares": []})
        accounts = _accounts()
        by_name = {
            str(account.get("username")): str(account.get("id"))
            for account in accounts
            if account.get("username") and account.get("id")
        }
        viewers = []
        for entry in data.get("shares", []) if isinstance(data, dict) else []:
            if not isinstance(entry, dict):
                continue
            if entry.get("owner_id") == owner_id and entry.get("relpath") == relpath:
                for name in entry.get("viewers") or []:
                    viewer_id = by_name.get(str(name))
                    if viewer_id and str(name).lower() != "guest":
                        viewers.append((viewer_id, str(name)))
        if viewers:
            social_store.set_shares(image_id, viewers, owner_id)
            print(f"[Usgromana-Gallery] Legacy share migrated for image {image_id}")
        social_store.mark_migration(share_key)

    rating_key = social_store.rating_migration_key(image_id)
    if not social_store.migration_done(rating_key):
        ratings = _load_json(_ratings_file(), {})
        value = ratings.get(relpath) if isinstance(ratings, dict) else None
        if isinstance(value, bool):
            value = None
        if isinstance(value, float) and value.is_integer():
            value = int(value)
        if isinstance(value, int) and 1 <= value <= 5:
            social_store.set_legacy_rating(image_id, value)
            print(f"[Usgromana-Gallery] Legacy rating migrated for image {image_id}")
        social_store.mark_migration(rating_key)


def note_path_changed(owner_id: str, old_relpath: str, new_relpath: str) -> str | None:
    old_relpath = (old_relpath or "").replace("\\", "/").strip("/")
    new_relpath = (new_relpath or "").replace("\\", "/").strip("/")
    if not old_relpath or not new_relpath or old_relpath == new_relpath:
        return None
    row = social_store.get_image_by_path(owner_id, old_relpath)
    if row is None:
        return None
    social_store.update_image_path(row["image_id"], new_relpath, os.path.basename(new_relpath))
    return row["image_id"]


def note_prefix_changed(owner_id: str, old_prefix: str, new_prefix: str) -> int:
    return social_store.rewrite_relpath_prefix(owner_id, old_prefix, new_prefix)


def note_image_removed(owner_id: str, relpath: str) -> str | None:
    relpath = (relpath or "").replace("\\", "/").strip("/")
    return social_store.delete_image_by_path(owner_id, relpath)


def note_prefix_removed(owner_id: str, prefix: str) -> int:
    return social_store.delete_images_under_prefix(owner_id, prefix)


def resolve_image(image_id: str) -> dict | None:
    parsed = parse_image_id(image_id)
    if not parsed:
        return None
    return social_store.get_image(parsed)


def identity_from_bytes(data: bytes) -> str | None:
    try:
        with Image.open(BytesIO(data)) as image:
            info = getattr(image, "info", {}) or {}
            embedded = info.get(ID_KEY)
            if isinstance(embedded, str):
                return parse_image_id(embedded.strip())
    except (UnidentifiedImageError, OSError, ValueError):
        return None
    return None
