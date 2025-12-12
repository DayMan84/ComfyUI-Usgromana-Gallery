# ComfyUI-Usgromana-Gallery/server.py

import os
from aiohttp import web

import folder_paths
from server import PromptServer

GALLERY_PREFIX = "/usgromana/gallery"

OUTPUT_DIR = folder_paths.get_output_directory()


def _log(msg: str):
    print(f"[Usgromana-Gallery] {msg}", flush=True)


# --- Static files: /static_gallery/** -> Comfy output tree ------------------

def _ensure_static_route():
    app = PromptServer.instance.app

    # avoid duplicating the route on reloads
    for r in app.router.routes():
        try:
            if r.resource.canonical == "/static_gallery":
                return
        except Exception:
            continue

    app.router.add_static("/static_gallery", OUTPUT_DIR, show_index=False)
    _log(f"Serving static files from {OUTPUT_DIR} at /static_gallery")


_ensure_static_route()


# --- Helper: collect images recursively ------------------------------------

IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".webp", ".bmp")


def _collect_images(limit: int = 400):
    """
    Walks the entire OUTPUT_DIR tree and returns the newest `limit` images
    with relative paths so /static_gallery/<relpath> works.
    """
    entries = []

    for root, dirs, files in os.walk(OUTPUT_DIR):
        for name in files:
            if not name.lower().endswith(IMAGE_EXTS):
                continue

            full = os.path.join(root, name)

            try:
                stat = os.stat(full)
            except OSError:
                continue

            # path relative to OUTPUT_DIR, with forward slashes
            rel = os.path.relpath(full, OUTPUT_DIR).replace("\\", "/")

            entries.append(
                {
                    "id": rel,
                    "filename": rel,
                    "mtime": stat.st_mtime,
                    "size": stat.st_size,
                    "url": f"/static_gallery/{rel}",
                }
            )

    # newest first
    entries.sort(key=lambda e: e["mtime"], reverse=True)

    if len(entries) > limit:
        entries = entries[:limit]

    _log(f"_collect_images → {len(entries)} files")
    return entries


# --- API: list images ------------------------------------------------------

@PromptServer.instance.routes.get(f"{GALLERY_PREFIX}/list")
async def list_images(request: web.Request):
    _log("GET /list")
    images = _collect_images()
    return web.json_response({"images": images})


# --- API: delete image -----------------------------------------------------

@PromptServer.instance.routes.post(f"{GALLERY_PREFIX}/delete")
async def delete_image(request: web.Request):
    data = await request.json()
    filename = (data.get("filename") or "").strip()
    if not filename:
        return web.json_response({"ok": False, "error": "Missing filename"}, status=400)

    # `filename` is a relative path under OUTPUT_DIR
    target = os.path.join(OUTPUT_DIR, filename)

    _log(f"DELETE requested: {target}")

    # sanity check: keep deletes inside OUTPUT_DIR
    try:
        common = os.path.commonpath([os.path.abspath(OUTPUT_DIR), os.path.abspath(target)])
        if common != os.path.abspath(OUTPUT_DIR):
            return web.json_response({"ok": False, "error": "Invalid path"}, status=400)
    except Exception:
        return web.json_response({"ok": False, "error": "Invalid path"}, status=400)

    if not os.path.isfile(target):
        return web.json_response({"ok": False, "error": "File not found"}, status=404)

    try:
        os.remove(target)
    except OSError as e:
        return web.json_response({"ok": False, "error": str(e)}, status=500)

    return web.json_response({"ok": True})
