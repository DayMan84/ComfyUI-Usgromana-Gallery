"""Save images dropped onto the gallery into the current library folder."""

from __future__ import annotations

import os
import re
from io import BytesIO

from PIL import Image, UnidentifiedImageError

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}
MAX_IMAGE_BYTES = 80 * 1024 * 1024


class UploadError(ValueError):
    """The dropped file cannot be added to the library."""


def save_uploaded_image(root: str, filename: str, data: bytes, folder: str = "") -> dict:
    """Write one image under root. folder must stay inside that directory."""
    if not data:
        raise UploadError("Empty file")
    if len(data) > MAX_IMAGE_BYTES:
        raise UploadError("Image is too large")

    safe_name = _safe_filename(filename)
    _verify_image(data)

    library = os.path.abspath(root)
    destination_dir = _destination_dir(library, folder)
    os.makedirs(destination_dir, exist_ok=True)
    path = _unique_path(destination_dir, safe_name)
    with open(path, "wb") as handle:
        handle.write(data)

    relpath = os.path.relpath(path, library).replace("\\", "/")
    parent = os.path.dirname(relpath).replace("\\", "/")
    return {
        "filename": os.path.basename(path),
        "relpath": relpath,
        "folder": "" if parent == "." else parent,
        "size": len(data),
    }


def _safe_filename(filename: str) -> str:
    base = os.path.basename((filename or "").replace("\\", "/")).strip()
    stem, ext = os.path.splitext(base)
    ext = ext.lower()
    if ext not in IMAGE_EXTENSIONS:
        raise UploadError("Only PNG, JPG, WEBP, GIF, and BMP images can be added")
    stem = re.sub(r"[^A-Za-z0-9._-]+", "_", stem).strip("._") or "image"
    return f"{stem[:80]}{ext}"


def _verify_image(data: bytes) -> None:
    try:
        with Image.open(BytesIO(data)) as image:
            image.verify()
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError) as exc:
        raise UploadError("File is not a valid image") from exc


def _destination_dir(library: str, folder: str) -> str:
    cleaned = (folder or "").strip().replace("\\", "/").strip("/")
    if not cleaned:
        return library
    lowered = cleaned.lower()
    if lowered == "shared" or lowered.startswith("shared/"):
        raise UploadError("Shared images cannot be changed here")
    normalized = os.path.normpath(cleaned)
    if normalized.startswith("..") or os.path.isabs(normalized):
        raise UploadError("Invalid folder")
    destination = os.path.abspath(os.path.join(library, normalized))
    if destination != library and not destination.startswith(library + os.sep):
        raise UploadError("Invalid folder")
    return destination


def _unique_path(directory: str, filename: str) -> str:
    candidate = os.path.join(directory, filename)
    if not os.path.exists(candidate):
        return candidate
    stem, ext = os.path.splitext(filename)
    number = 1
    while True:
        candidate = os.path.join(directory, f"{stem}-{number}{ext}")
        if not os.path.exists(candidate):
            return candidate
        number += 1


def _attach_image_identity(root: str, item: dict, owner_id: str, username: str | None) -> str | None:
    try:
        from .image_identity import ensure_image_identity

        full = os.path.join(root, *item["relpath"].split("/"))
        return ensure_image_identity(
            full,
            owner_id or "local",
            owner_username=username,
            storage_type="library",
            relpath=item["relpath"],
            owner_root=root,
        )
    except Exception as exc:
        print(f"[Usgromana-Gallery] Image identity registration failed: {exc}")
        return None


def register() -> None:
    from aiohttp import web
    from server import PromptServer

    from .files import get_gallery_root_dir
    from . import usgromana_accounts as accounts

    prefix = "/usgromana-gallery"

    @PromptServer.instance.routes.post(f"{prefix}/upload")
    async def gallery_upload(request: web.Request) -> web.Response:
        owner_id = "local"
        username = None
        if accounts.installed():
            owner_id, username = accounts.caller_from_request(request)
            if not owner_id:
                return web.json_response(
                    {"ok": False, "error": "Sign in to add images to your library"},
                    status=401,
                )

        folder = ""
        pending: list[tuple[str, bytes]] = []
        try:
            # Usgromana's sanitizer already reads the body via request.post().
            # The cached form keeps the original files.
            form = await request.post()
        except Exception:
            return web.json_response({"ok": False, "error": "Expected uploaded images"}, status=400)

        for key, value in form.items():
            if key == "folder" and isinstance(value, str):
                folder = value.strip()
                continue
            filename = getattr(value, "filename", None)
            stream = getattr(value, "file", None)
            if not filename or stream is None:
                continue
            try:
                stream.seek(0)
            except Exception:
                pass
            pending.append((filename, stream.read()))

        if not pending:
            return web.json_response({"ok": False, "error": "No images were dropped"}, status=400)

        saved = []
        errors = []
        root = get_gallery_root_dir()
        for filename, data in pending:
            try:
                item = save_uploaded_image(root, filename, data, folder)
                image_id = _attach_image_identity(root, item, owner_id, username)
                if image_id:
                    item["image_id"] = image_id
                saved.append(item)
            except UploadError as exc:
                errors.append({"filename": filename, "error": str(exc)})

        if not saved:
            message = errors[0]["error"] if errors else "No images were added"
            return web.json_response({"ok": False, "error": message, "errors": errors}, status=400)
        return web.json_response({"ok": True, "images": saved, "errors": errors})


def _register_if_possible() -> None:
    import sys

    if "server" not in sys.modules:
        return
    try:
        register()
    except Exception as exc:
        print(f"[Usgromana-Gallery] Could not register image upload: {exc}")


_register_if_possible()
