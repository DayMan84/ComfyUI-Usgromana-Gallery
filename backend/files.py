# ComfyUI-Usgromana-Gallery/backend/files.py

import os
import time
from dataclasses import dataclass, asdict
from typing import List

import folder_paths

# Basic image extensions
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}


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


def _is_image_file(name: str) -> bool:
    _, ext = os.path.splitext(name)
    return ext.lower() in IMAGE_EXTENSIONS


def list_output_images(limit: int | None = None) -> List[GalleryImage]:
    """
    Scan the output directory (recursive) and return image metadata.
    Most recent first.
    """
    import json
    import time
    # #region agent log
    start_time = time.time()
    log_data = {"location": "files.py:45", "message": "list_output_images start", "data": {"limit": limit}, "timestamp": int(time.time() * 1000), "sessionId": "debug-session", "runId": "run1", "hypothesisId": "C"}
    try:
        with open(r"c:\Users\tansh\.github\ComfyUI-Usgromana-Gallery\.cursor\debug.log", "a", encoding="utf-8") as f:
            f.write(json.dumps(log_data) + "\n")
    except: pass
    # #endregion
    root = get_output_dir()
    if not os.path.isdir(root):
        return []

    items: List[GalleryImage] = []
    dir_count = 0
    file_count = 0

    for dirpath, dirnames, filenames in os.walk(root):
        dir_count += 1
        for fname in filenames:
            file_count += 1
            if not _is_image_file(fname):
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

    duration = time.time() - start_time
    # #region agent log
    log_data = {"location": "files.py:90", "message": "list_output_images complete", "data": {"count": len(items), "dirs_scanned": dir_count, "files_scanned": file_count, "duration_ms": int(duration * 1000)}, "timestamp": int(time.time() * 1000), "sessionId": "debug-session", "runId": "run1", "hypothesisId": "C"}
    try:
        with open(r"c:\Users\tansh\.github\ComfyUI-Usgromana-Gallery\.cursor\debug.log", "a", encoding="utf-8") as f:
            f.write(json.dumps(log_data) + "\n")
    except: pass
    # #endregion
    return items
