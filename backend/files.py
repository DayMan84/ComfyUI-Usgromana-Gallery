# ComfyUI-Usgromana-Gallery/backend/files.py

import os
import time
from dataclasses import dataclass, asdict
from typing import List

import folder_paths

# Basic image extensions (matches frontend constants)
# Can be overridden via settings
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}


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
        return d


def get_output_dir() -> str:
    """
    Return ComfyUI's default output directory.
    """
    return folder_paths.get_output_directory()


def get_gallery_root_dir() -> str:
    """
    Return the root gallery directory.
    Checks settings for custom rootGalleryFolder, otherwise uses default output directory.
    """
    # Try to load settings to check for custom root folder
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
                    return os.path.abspath(custom_root)
    except Exception:
        # If anything fails, fall back to default
        pass
    
    # Default: use ComfyUI output directory
    return get_output_dir()


def _is_image_file(name: str, extensions: set[str] | None = None) -> bool:
    """Check if file has a valid image extension."""
    _, ext = os.path.splitext(name)
    exts = extensions or IMAGE_EXTENSIONS
    return ext.lower() in exts


def list_output_images(limit: int | None = None, extensions: set[str] | None = None) -> List[GalleryImage]:
    """
    Scan the output directory (recursive) and return image metadata.
    Most recent first.
    
    Args:
        limit: Maximum number of images to return
        extensions: Set of file extensions to include (defaults to IMAGE_EXTENSIONS)
    """
    root = get_gallery_root_dir()
    if not os.path.isdir(root):
        return []

    items: List[GalleryImage] = []
    exts = extensions or IMAGE_EXTENSIONS

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
