# ComfyUI-Usgromana-Gallery/backend/files.py

import os
import shutil
import subprocess
import time
from dataclasses import dataclass, asdict
from typing import List

import folder_paths

# Basic image extensions (matches frontend constants)
# Can be overridden via settings
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}
# ComfyUI video outputs (SaveWEBM / Video Combine / Save Video).
VIDEO_EXTENSIONS = {".mp4", ".webm"}
MEDIA_EXTENSIONS = IMAGE_EXTENSIONS | VIDEO_EXTENSIONS
DEFAULT_FILE_EXTENSIONS = ".png,.jpg,.jpeg,.webp,.gif,.bmp,.mp4,.webm"


@dataclass
class GalleryImage:
    filename: str          # just the file name, e.g. "image.png"
    relpath: str           # path relative to output dir, e.g. "sub/folder/image.png"
    size: int
    mtime: float
    folder: str = ""       # relative folder, e.g. "sub/folder" or "" for root

    @property
    def mtime_iso(self) -> str:
        # simple ISO-ish format; frontend doesn't care much beyond "sortable"
        return time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(self.mtime))

    def to_dict(self) -> dict:
        d = asdict(self)
        d["mtime_iso"] = self.mtime_iso
        d["media_type"] = "video" if is_video_filename(self.filename) else "image"
        return d


def is_video_filename(name: str) -> bool:
    """True when the file is a gallery video (mp4 or webm)."""
    _, ext = os.path.splitext(name or "")
    return ext.lower() in VIDEO_EXTENSIONS


def parse_extension_list(raw: str | None) -> list[str]:
    """Parse a comma-separated extension setting, preserving order."""
    found: list[str] = []
    seen: set[str] = set()
    for part in (raw or "").split(","):
        ext = part.strip().lower()
        if not ext:
            continue
        if not ext.startswith("."):
            ext = "." + ext
        if ext in seen:
            continue
        seen.add(ext)
        found.append(ext)
    return found


def resolve_scan_extensions(raw: str | None) -> set[str]:
    """
    Extensions the gallery should discover.

    Image extensions come from settings. mp4 and webm are always included so
    generated videos show up beside images, including when an older settings
    file still lists only still-image types.
    """
    parsed = parse_extension_list(raw)
    if not parsed:
        parsed = parse_extension_list(DEFAULT_FILE_EXTENSIONS)
    return set(parsed) | set(VIDEO_EXTENSIONS)


def merge_video_extensions(raw: str | None) -> str:
    """Return the settings string with mp4 and webm appended when missing."""
    parsed = parse_extension_list(raw)
    if not parsed:
        return DEFAULT_FILE_EXTENSIONS
    for ext in (".mp4", ".webm"):
        if ext not in parsed:
            parsed.append(ext)
    return ",".join(parsed)


def normalize_tags(value) -> list[str]:
    """Normalize stored tag metadata to a de-duplicated list of strings."""
    if value is None:
        return []
    if isinstance(value, str):
        value = [part.strip() for part in value.split(",")]
    if not isinstance(value, (list, tuple)):
        return []
    tags: list[str] = []
    seen: set[str] = set()
    for tag in value:
        text = str(tag).strip()
        key = text.lower()
        if not text or key in seen:
            continue
        seen.add(key)
        tags.append(text)
    return tags


def lookup_stored_tags(meta: dict | None, relpath: str, filename: str) -> list[str]:
    """
    Read tags from the gallery metadata store.

    Entries are keyed by relpath and, for older records, by filename.
    An empty tag list is a real value and stops the lookup.
    """
    if not isinstance(meta, dict):
        return []
    keys: list[str] = []
    for key in (
        relpath,
        filename,
        os.path.basename(relpath or ""),
        os.path.basename(filename or ""),
    ):
        if key and key not in keys:
            keys.append(key)
    for key in keys:
        entry = meta.get(key)
        if isinstance(entry, dict) and "tags" in entry:
            return normalize_tags(entry.get("tags"))
    return []


def thumb_cache_name(filename: str) -> str:
    """
    Cache filename for a gallery thumbnail.

    Still images keep the existing names. Videos store a PNG poster so the
    thumbnail response is an image the grid can show.
    """
    import hashlib

    base = os.path.basename(filename or "")
    ext = os.path.splitext(base)[1] or ".png"
    if is_video_filename(filename):
        ext = ".png"
        base = f"{os.path.splitext(base)[0]}.png"
    if "/" in (filename or "") or "\\" in (filename or ""):
        digest = hashlib.md5(filename.encode("utf-8")).hexdigest()[:16]
        return f"{digest}{ext}"
    return base


# Drawn play-icon poster. Used when Pillow cannot draw one, so a video thumb
# is still a real PNG the grid can show.
_FALLBACK_POSTER_PNG = (
    b"iVBORw0KGgoAAAANSUhEUgAAAQAAAACQCAIAAABoASLGAAACSElEQVR4nO3cu1UdQRRFQaGlOPCJATmyFS82"
    b"DoHJkw2Pnv7MropgjLvXaWuenl9ef0DVz9UfACsJgDQBkCYA0gRAmgBIEwBpAiBNAKQJgDQBkCYA0gRAmgBI"
    b"EwBpAiBNAKQJgDQBkCYA0gRAmgBIEwBpAiBNAKQJgDQBkCYA0gRAmgBIEwBpAiBNAKQJgDQBkCYA0gRAmgBI"
    b"EwBpAiBNAKQJgDQBkCYA0gRAmgBIEwBpAiBNAKQJgDQBkCYA0gRAmgBIEwBpAiBNAKQJgDQBkCaAAT7e31Z/"
    b"Ag8SwBgf728yONGv1R9wK/8b+P3n79ov4ZMswCUMwikswIUMwv4swAwGYVsCmEcGG/IEms27aCsWYBmDsAM"
    b"LsJhBWMsC7MIgLCGAvchgMk+gHXkXTWMBtmYQrmYBDmAQrmMBTmIQhhPAeWQwkCfQqbyLhrAAxzMI32EBbs"
    b"IgPMYC3I1B+BILcDcW4EsEcBPu/jECOJ7T/w4BnMrdDyGA8zj9gQRwEqc/nAAO4O6vI4CtOf2rCWBH7n4a"
    b"AezF6U8mgF04/SUEsJi7X0sAyzj9HQhgNne/FQHM4/Q3JIAZnP62BHAhd78/AVzC6Z9CACO5++MIYAynf6in"
    b"55fX1d8Ay/grBGkCIE0ApAmANAGQJgDSBECaAEgTAGkCIE0ApAmANAGQJgDSBECaAEgTAGkCIE0ApAmANAGQ"
    b"JgDSBECaAEgTAGkCIE0ApAmANAGQJgDSBECaAEgTAGkCIE0ApAmANAGQJgDSBECaAEgTAGkCIE0ApAmANAGQ"
    b"JgDSBECaAEgTAGkCIO0fo+lhczyTYkwAAAAASUVORK5CYII="
)


def image_file_ok(path: str) -> bool:
    """True when path is a non-empty image Pillow can open."""
    if not path or not os.path.isfile(path) or os.path.getsize(path) <= 32:
        return False
    try:
        from PIL import Image

        with Image.open(path) as im:
            im.load()
            width, height = im.size
        return width > 0 and height > 0
    except Exception:
        return False


def generate_video_poster(src_path: str, dest_path: str) -> bool:
    """Extract one poster frame with ffmpeg. Returns False when that is unavailable."""
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return False
    folder = os.path.dirname(dest_path)
    if folder:
        os.makedirs(folder, exist_ok=True)
    scale = "scale=256:256:force_original_aspect_ratio=decrease"
    commands = [
        [ffmpeg, "-y", "-ss", "0.25", "-i", src_path, "-frames:v", "1", "-vf", scale, dest_path],
        [ffmpeg, "-y", "-i", src_path, "-frames:v", "1", "-vf", scale, dest_path],
    ]
    for cmd in commands:
        try:
            subprocess.run(
                cmd,
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=20,
            )
        except Exception:
            continue
        if image_file_ok(dest_path):
            return True
        try:
            if os.path.isfile(dest_path):
                os.remove(dest_path)
        except OSError:
            pass
    return False


def write_video_placeholder(dest_path: str) -> None:
    """Static poster used when a video frame cannot be extracted."""
    import base64

    folder = os.path.dirname(dest_path)
    if folder:
        os.makedirs(folder, exist_ok=True)
    try:
        from PIL import Image, ImageDraw

        image = Image.new("RGB", (256, 144), (30, 41, 59))
        draw = ImageDraw.Draw(image)
        draw.polygon([(108, 52), (108, 92), (156, 72)], fill=(226, 232, 240))
        image.save(dest_path, format="PNG")
        if image_file_ok(dest_path):
            return
    except Exception:
        pass
    with open(dest_path, "wb") as handle:
        handle.write(base64.b64decode(_FALLBACK_POSTER_PNG))


def write_thumbnail(src_path: str, thumb_path: str) -> None:
    """
    Write a thumbnail for an image or video.

    Images use the existing Pillow resize. Videos prefer an ffmpeg poster and
    always fall back to a real PNG placeholder. The grid never receives the
    video file as an image thumbnail.
    """
    folder = os.path.dirname(thumb_path)
    if folder:
        os.makedirs(folder, exist_ok=True)
    if is_video_filename(src_path):
        try:
            if generate_video_poster(src_path, thumb_path) and image_file_ok(thumb_path):
                return
        except Exception:
            pass
        write_video_placeholder(thumb_path)
        return
    from PIL import Image

    with Image.open(src_path) as im:
        im.thumbnail((256, 256), Image.Resampling.LANCZOS)
        im.save(thumb_path, format="PNG", optimize=True)


def video_thumbnail_current(src_path: str, thumb_path: str) -> bool:
    """True when a video already has a usable poster newer than the source."""
    if not is_video_filename(src_path):
        return False
    if not os.path.isfile(src_path) or not image_file_ok(thumb_path):
        return False
    try:
        return os.path.getmtime(thumb_path) >= os.path.getmtime(src_path)
    except OSError:
        return False


def get_output_dir() -> str:
    """
    Return the directory the gallery should scan for this call.

    With ComfyUI-Usgromana installed, share handling sets this to the signed-in
    account's output folder for the current request. On its own, the gallery
    uses ComfyUI's output directory.
    """
    from .account_scope import peek_account_root

    override = peek_account_root()
    if override:
        return override
    return folder_paths.get_output_directory()


def get_gallery_root_dir() -> str:
    """
    Return the root gallery directory.

    A custom rootGalleryFolder is used only when it is this directory or a
    folder inside it, so a setting cannot point the gallery at another account.
    """
    base = os.path.abspath(get_output_dir())
    try:
        _EXTENSION_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        _DATA_DIR = os.path.join(_EXTENSION_DIR, "data")
        settings_file = os.path.join(_DATA_DIR, "settings.json")

        if os.path.exists(settings_file):
            import json
            with open(settings_file, "r", encoding="utf-8") as f:
                settings = json.load(f) or {}
                custom_root = settings.get("rootGalleryFolder", "").strip()
                if custom_root and os.path.isdir(custom_root):
                    custom_abs = os.path.abspath(custom_root)
                    base_key = os.path.normcase(base)
                    custom_key = os.path.normcase(custom_abs)
                    if custom_key == base_key or custom_key.startswith(base_key + os.sep):
                        return custom_abs
    except Exception:
        pass

    return base


def _is_image_file(name: str, extensions: set[str] | None = None) -> bool:
    """Check if file has a gallery media extension (image or video)."""
    _, ext = os.path.splitext(name)
    exts = extensions or MEDIA_EXTENSIONS
    return ext.lower() in exts


def list_output_images(limit: int | None = None, extensions: set[str] | None = None) -> List[GalleryImage]:
    """
    Scan the output directory (recursive) and return media metadata.
    Most recent first. Videos are included alongside images.
    
    Args:
        limit: Maximum number of items to return
        extensions: Set of file extensions to include (defaults to images + videos)
    """
    root = get_gallery_root_dir()
    if not os.path.isdir(root):
        return []

    items: List[GalleryImage] = []
    exts = extensions or MEDIA_EXTENSIONS

    for dirpath, dirnames, filenames in os.walk(root):
        # Skip thumbnail directories
        if "_thumbs" in dirpath:
            continue
            
        for fname in filenames:
            if not _is_image_file(fname, exts):
                continue
            
            # Skip thumbnail files (they're in _thumbs directory, but also skip if filename suggests it's a thumb)
            # Thumbnails are served separately and shouldn't appear in main gallery
            if fname.startswith("thumb_") or "_thumb" in fname.lower():
                continue

            full_path = os.path.join(dirpath, fname)
            try:
                stat = os.stat(full_path)
            except FileNotFoundError:
                # File disappeared between scandir and stat; ignore
                continue

            relpath = os.path.relpath(full_path, root)
            relpath_norm = relpath.replace("\\", "/")

            rel_dir = os.path.dirname(relpath_norm)
            folder = rel_dir if rel_dir and rel_dir != "." else ""

            items.append(
                GalleryImage(
                    filename=fname,
                    relpath=relpath_norm,
                    size=stat.st_size,
                    mtime=stat.st_mtime,
                    folder=folder,
                )
            )

    # newest first
    items.sort(key=lambda x: x.mtime, reverse=True)

    if limit is not None:
        items = items[:limit]

    return items
