"""Gallery share routes and per-account scoping.

Share controls live on the gallery image right-click menu. They do nothing
unless ComfyUI-Usgromana is installed beside it, so a standalone gallery
keeps its original output folder and has no share controls.
"""

from __future__ import annotations

import json
import os
import time
from urllib.parse import quote

from aiohttp import web
from server import PromptServer

from .account_scope import use_account_root
from .shares import ImageShareStore, normalize_relpath, parse_shared_relpath
from . import usgromana_accounts as accounts

ROUTE_PREFIX = "/usgromana-gallery"
_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
_store: ImageShareStore | None = None


def get_share_store() -> ImageShareStore:
    global _store
    if _store is None:
        os.makedirs(_DATA_DIR, exist_ok=True)
        destination = os.path.join(_DATA_DIR, "image_shares.json")
        _migrate_legacy_store(destination)
        _store = ImageShareStore(destination, accounts.global_output_dir())
    return _store


def _migrate_legacy_store(destination: str) -> None:
    """Pick up shares that were previously stored inside Usgromana."""
    if os.path.isfile(destination):
        return
    root = accounts._sibling_root()
    if not root:
        return
    legacy = os.path.join(root, "users", "image_shares.json")
    if not os.path.isfile(legacy):
        return
    try:
        with open(legacy, "r", encoding="utf-8") as handle:
            data = handle.read()
        with open(destination, "w", encoding="utf-8") as handle:
            handle.write(data)
        print("[Usgromana-Gallery] Moved image share records into the gallery data folder.")
    except OSError as exc:
        print(f"[Usgromana-Gallery] Could not move legacy share records: {exc}")


def _json_error(message: str, status: int = 400) -> web.Response:
    return web.json_response({"ok": False, "error": message}, status=status)


async def _body(request: web.Request) -> dict:
    try:
        data = await request.json()
    except Exception:
        return {}
    return data if isinstance(data, dict) else {}


def _as_list(value) -> list:
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        return value
    return []


def _require_owner(request: web.Request) -> tuple[str, str] | web.Response:
    if not accounts.installed():
        return _json_error("Usgromana accounts are not installed", 404)
    user_id, username = accounts.caller_from_request(request)
    status = accounts.sharing_status(True, user_id, username)
    if not status["enabled"]:
        return _json_error("Authentication required", 401)
    return user_id, username


@PromptServer.instance.routes.get(f"{ROUTE_PREFIX}/shares/status")
async def share_status(request: web.Request) -> web.Response:
    present = accounts.installed()
    user_id, username = accounts.caller_from_request(request) if present else (None, None)
    payload = accounts.sharing_status(present, user_id, username)
    payload["ok"] = True
    return web.json_response(payload)


@PromptServer.instance.routes.get(f"{ROUTE_PREFIX}/shares/accounts")
async def share_accounts(request: web.Request) -> web.Response:
    caller = _require_owner(request)
    if isinstance(caller, web.Response):
        return caller
    _user_id, username = caller
    others = sorted(
        name
        for name in accounts.known_usernames()
        if name != username and name.lower() != "guest"
    )
    return web.json_response({"ok": True, "users": others})


@PromptServer.instance.routes.post(f"{ROUTE_PREFIX}/shares/visibility")
async def share_visibility(request: web.Request) -> web.Response:
    caller = _require_owner(request)
    if isinstance(caller, web.Response):
        return caller
    user_id, username = caller
    data = await _body(request)
    shares = get_share_store().visibility(user_id, _as_list(data.get("relpaths")))
    images = [
        {
            "relpath": item["relpath"],
            "owner": username,
            "viewers": _effective_viewers(user_id, item["relpath"], item["viewers"]),
        }
        for item in shares
    ]
    return web.json_response({"ok": True, "images": images})


@PromptServer.instance.routes.post(f"{ROUTE_PREFIX}/shares")
async def share_images(request: web.Request) -> web.Response:
    caller = _require_owner(request)
    if isinstance(caller, web.Response):
        return caller
    user_id, username = caller
    data = await _body(request)
    usernames = [name for name in _as_list(data.get("usernames")) if name != username]
    try:
        result = get_share_store().share(
            user_id,
            _as_list(data.get("relpaths")),
            usernames,
            accounts.known_usernames(),
        )
    except ValueError as exc:
        return _json_error(str(exc))
    _sync_sqlite_shares(user_id, username, _as_list(data.get("relpaths")))
    images = [
        {
            "relpath": item["relpath"],
            "owner": username,
            "viewers": _effective_viewers(user_id, item["relpath"], item["viewers"]),
        }
        for item in result["shares"]
    ]
    return web.json_response({"ok": True, "images": images})


@PromptServer.instance.routes.post(f"{ROUTE_PREFIX}/shares/revoke")
async def revoke_shares(request: web.Request) -> web.Response:
    caller = _require_owner(request)
    if isinstance(caller, web.Response):
        return caller
    user_id, username = caller
    data = await _body(request)
    try:
        result = get_share_store().revoke(
            user_id,
            _as_list(data.get("relpaths")),
            _as_list(data.get("usernames")),
        )
    except ValueError as exc:
        return _json_error(str(exc))
    _sync_sqlite_shares(user_id, username, _as_list(data.get("relpaths")))
    images = [
        {
            "relpath": item["relpath"],
            "owner": username,
            "viewers": _effective_viewers(user_id, item["relpath"], item["viewers"]),
        }
        for item in result["shares"]
    ]
    return web.json_response({"ok": True, "images": images})


def _migrated_image(owner_id: str, relpath: str):
    try:
        from .social_store import get_image_by_path, migration_done, share_migration_key
    except Exception:
        return None
    row = get_image_by_path(owner_id, relpath)
    if row and migration_done(share_migration_key(row["image_id"])):
        return row
    return None


def _effective_viewers(owner_id: str, relpath: str, json_viewers: list) -> list:
    row = _migrated_image(owner_id, relpath)
    if row is None:
        return json_viewers
    from .social_store import get_shares

    return [
        item["viewer_username"]
        for item in get_shares(row["image_id"])
        if item.get("viewer_username")
    ]


def _sync_sqlite_shares(owner_id: str, username: str, relpaths: list) -> None:
    """Copy the JSON viewer list into SQLite after a legacy share change."""
    try:
        from .image_identity import ensure_image_identity
        from .social_store import mark_migration, set_shares, share_migration_key
    except Exception as exc:
        print(f"[Usgromana-Gallery] Legacy share migration failed: {exc}")
        return
    store = get_share_store()
    known = {account["username"]: account["id"] for account in accounts.known_accounts()}
    for relpath in relpaths:
        normalized = normalize_relpath(relpath) if isinstance(relpath, str) else None
        if not normalized:
            continue
        path = store.resolve_owned_file(owner_id, normalized)
        if not path:
            continue
        try:
            image_id = ensure_image_identity(
                path,
                owner_id,
                owner_username=username,
                storage_type="library",
                relpath=normalized,
                owner_root=store.owner_output_dir(owner_id),
            )
            names = []
            visible = store.visibility(owner_id, [normalized])
            if visible:
                names = visible[0].get("viewers") or []
            viewers = [(known[name], name) for name in names if name in known]
            set_shares(image_id, viewers, owner_id)
            mark_migration(share_migration_key(image_id))
        except Exception as exc:
            print(f"[Usgromana-Gallery] Legacy share migration failed: {exc}")


def viewer_can_open(user_id: str | None, username: str | None, owner_id: str, relpath: str) -> bool:
    store = get_share_store()
    if user_id and user_id == owner_id and store.resolve_owned_file(owner_id, relpath):
        return True
    row = _migrated_image(owner_id, relpath)
    if row is not None:
        from .social_store import has_share

        return has_share(row["image_id"], user_id)
    if store.can_view(user_id, username, owner_id, relpath):
        return True
    try:
        from .social_store import get_image_by_path, has_share

        found = get_image_by_path(owner_id, relpath)
    except Exception:
        return False
    return bool(found and has_share(found["image_id"], user_id))


def _shared_row(owner_id: str, relpath: str, filename: str, size: int, mtime: float) -> dict:
    rel = f"shared/{owner_id}/{relpath}"
    quoted = quote(rel, safe="")
    return {
        "filename": filename,
        "relpath": rel,
        "size": size,
        "mtime": mtime,
        "mtime_iso": time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(mtime)),
        "folder": "Shared with you",
        "shared": True,
        "owner_id": owner_id,
        "url": f"{ROUTE_PREFIX}/image?filename={quoted}",
        "thumb_url": f"{ROUTE_PREFIX}/image?filename={quoted}&size=thumb",
    }


def _shared_rows(viewer_user_id: str | None, viewer_username: str | None) -> list[dict]:
    if not viewer_username and not viewer_user_id:
        return []
    rows = []
    seen = set()
    if viewer_user_id:
        try:
            from .social_store import shared_images_for_viewer

            root = accounts.global_output_dir()
            for item in shared_images_for_viewer(viewer_user_id):
                if item["owner_id"] == viewer_user_id:
                    continue
                full = os.path.join(root, item["owner_id"], *item["relpath"].split("/"))
                if not os.path.isfile(full):
                    continue
                stat = os.stat(full)
                seen.add((item["owner_id"], item["relpath"]))
                rows.append(
                    _shared_row(
                        item["owner_id"],
                        item["relpath"],
                        item.get("filename") or os.path.basename(item["relpath"]),
                        stat.st_size,
                        stat.st_mtime,
                    )
                )
        except Exception as exc:
            print(f"[Usgromana-Gallery] Could not list shared images: {exc}")
    if viewer_username:
        for item in get_share_store().shares_for_viewer(viewer_username):
            key = (item["owner_id"], item["relpath"])
            if key in seen or (viewer_user_id and item["owner_id"] == viewer_user_id):
                continue
            if _migrated_image(item["owner_id"], item["relpath"]):
                continue
            rows.append(
                _shared_row(
                    item["owner_id"],
                    item["relpath"],
                    item["filename"],
                    item["size"],
                    item["mtime"],
                )
            )
    return rows


def _append_shared(response: web.Response, viewer_user_id: str, viewer_username: str) -> web.Response:
    body = getattr(response, "body", None)
    if response.status != 200 or body is None:
        return response
    if isinstance(body, memoryview):
        body = body.tobytes()
    try:
        payload = json.loads(body)
    except (TypeError, json.JSONDecodeError):
        return response
    if not isinstance(payload, dict) or not isinstance(payload.get("images"), list):
        return response

    own_images = []
    for image in payload["images"]:
        if not isinstance(image, dict):
            continue
        relpath = str(image.get("relpath") or image.get("filename") or "")
        if relpath.startswith("shared/"):
            continue
        own_images.append(image)
    shared_images = _shared_rows(viewer_user_id, viewer_username)
    payload["images"] = own_images + shared_images
    if shared_images:
        folders = payload.get("folders")
        if not isinstance(folders, list):
            folders = []
        if not any(isinstance(folder, dict) and folder.get("path") == "Shared with you" for folder in folders):
            folders.append(
                {
                    "path": "Shared with you",
                    "name": "Shared with you",
                    "count": len(shared_images),
                }
            )
        payload["folders"] = folders
    return web.json_response(payload, status=200)


def _nsfw_blocked(path: str, username: str | None) -> bool:
    try:
        from . import routes as gallery_routes
    except Exception:
        return False
    if not getattr(gallery_routes, "_NSFW_API_AVAILABLE", False):
        return False
    try:
        if username and not gallery_routes.is_sfw_enforced_for_user(username):
            return False
        return bool(gallery_routes.check_image_path_nsfw(path, username))
    except Exception:
        return False


def _thumbnail_bytes(path: str) -> tuple[bytes, str]:
    import mimetypes

    try:
        import io

        from PIL import Image

        with Image.open(path) as image:
            image = image.convert("RGB")
            image.thumbnail((512, 512))
            buffer = io.BytesIO()
            image.save(buffer, format="JPEG", quality=80)
            return buffer.getvalue(), "image/jpeg"
    except Exception:
        with open(path, "rb") as handle:
            guessed = mimetypes.guess_type(path)[0] or "application/octet-stream"
            return handle.read(), guessed


def _shared_file_response(request: web.Request, user_id: str | None, username: str | None):
    filename = request.rel_url.query.get("filename") or ""
    parsed = parse_shared_relpath(filename)
    if parsed is None:
        return None
    owner_id, relpath = parsed
    store = get_share_store()
    if not viewer_can_open(user_id, username, owner_id, relpath):
        return _json_error("Access denied", 403)
    file_path = store.resolve_owned_file(owner_id, relpath)
    if not file_path:
        return _json_error("File not found", 404)
    if _nsfw_blocked(file_path, username):
        return _json_error("Access denied: NSFW content blocked", 403)
    if request.rel_url.query.get("size") == "thumb":
        body, content_type = _thumbnail_bytes(file_path)
        return web.Response(body=body, content_type=content_type)
    return web.FileResponse(file_path)


@web.middleware
async def gallery_account_middleware(request: web.Request, handler):
    path = request.path or ""
    if not path.startswith(ROUTE_PREFIX) or not accounts.installed():
        return await handler(request)

    user_id, username = accounts.caller_from_request(request)
    if (
        request.method == "GET"
        and path.rstrip("/").endswith("/image")
    ):
        shared = _shared_file_response(request, user_id, username)
        if shared is not None:
            return shared

    with use_account_root(accounts.account_output_dir(user_id)):
        response = await handler(request)

    if (
        request.method == "GET"
        and path.rstrip("/").endswith("/list")
        and user_id
    ):
        return _append_shared(response, user_id, username)
    return response


def _own_image_file(relpath: str) -> str | None:
    from .files import get_output_dir

    normalized = normalize_relpath(relpath)
    if not normalized:
        return None
    root = os.path.realpath(get_output_dir())
    joined = os.path.realpath(os.path.join(root, *normalized.split("/")))
    if joined != root and not joined.startswith(root + os.sep):
        return None
    if not os.path.isfile(joined):
        return None
    return joined


def _workflow_file(filename: str, user_id: str | None, username: str | None):
    parsed = parse_shared_relpath(filename)
    if parsed is not None:
        if not accounts.installed():
            return _json_error("File not found", 404)
        owner_id, relpath = parsed
        store = get_share_store()
        if not viewer_can_open(user_id, username, owner_id, relpath):
            return _json_error("Access denied", 403)
        file_path = store.resolve_owned_file(owner_id, relpath)
        if not file_path:
            return _json_error("File not found", 404)
        return file_path
    file_path = _own_image_file(filename)
    if not file_path:
        return _json_error("File not found", 404)
    return file_path


@PromptServer.instance.routes.get(f"{ROUTE_PREFIX}/shares/workflow")
async def image_workflow(request: web.Request) -> web.Response:
    """Return the workflow embedded in an image the caller can already see."""
    filename = request.rel_url.query.get("filename") or ""
    user_id, username = (None, None)
    if accounts.installed():
        user_id, username = accounts.caller_from_request(request)
    resolved = _workflow_file(filename, user_id, username)
    if isinstance(resolved, web.Response):
        return resolved
    if _nsfw_blocked(resolved, username):
        return _json_error("Access denied: NSFW content blocked", 403)
    try:
        from .metadata_extractor import extract_image_metadata

        extracted = extract_image_metadata(resolved)
    except Exception as exc:
        return _json_error(f"Could not read the image workflow: {exc}", 400)
    workflow = extracted.get("workflow") or None
    prompt = extracted.get("prompt") or None
    if workflow == {}:
        workflow = None
    if prompt == {}:
        prompt = None
    return web.json_response({"ok": True, "workflow": workflow, "prompt": prompt})


def register() -> None:
    try:
        PromptServer.instance.app.middlewares.append(gallery_account_middleware)
        print("[Usgromana-Gallery] Account sharing hooks registered.")
    except Exception as exc:
        print(f"[Usgromana-Gallery] Could not register account sharing hooks: {exc}")


register()
