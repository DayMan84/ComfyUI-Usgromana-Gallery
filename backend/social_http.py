"""HTTP API for gallery sharing, comments, and ratings.

Every mutation checks the signed-in account. Owner ids from the browser
are ignored. Routes live under /usgromana-gallery/social/.
"""

from __future__ import annotations

import os
import sys

from . import notification_store, social_store
from .image_identity import (
    ensure_image_identity,
    parse_image_id,
    sync_rating_metadata,
)
from .shares import normalize_relpath, parse_shared_relpath

PREFIX = "/usgromana-gallery/social"


class SocialError(Exception):
    def __init__(self, code: str, message: str, status: int = 400):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


def _accounts_module():
    from . import usgromana_accounts as accounts

    return accounts


def caller_identity(request) -> tuple[str, str]:
    accounts = _accounts_module()
    if accounts.installed():
        user_id, username = accounts.caller_from_request(request)
        if not user_id:
            raise SocialError("NOT_AUTHORIZED", "Sign in to use gallery social features.", 401)
        return user_id, username or "User"
    return social_store.LOCAL_OWNER, "local"


def require_object(data) -> dict:
    if not isinstance(data, dict):
        raise SocialError("INVALID_COMMENT", "Expected a JSON object.", 400)
    return data


def validate_comment(body) -> str:
    if not isinstance(body, str):
        raise SocialError("INVALID_COMMENT", "Comment must be text.", 400)
    text = body.strip()
    if not text:
        raise SocialError("INVALID_COMMENT", "Comment cannot be empty.", 400)
    if len(text) > social_store.COMMENT_MAX_LENGTH:
        raise SocialError("INVALID_COMMENT", "Comment is too long.", 400)
    return text


def parse_rating(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if isinstance(value, float) and not value.is_integer():
        return None
    number = int(value)
    if number < 1 or number > 5:
        return None
    return number


def load_image(image_id: str) -> dict:
    parsed = parse_image_id(image_id)
    if not parsed:
        raise SocialError("IMAGE_NOT_FOUND", "Image not found.", 404)
    image = social_store.get_image(parsed)
    if image is None:
        raise SocialError("IMAGE_NOT_FOUND", "Image not found.", 404)
    return image


def _perms(user_id: str, image: dict) -> dict:
    return social_store.permissions_for(user_id, image)


def _require_view(user_id: str, image: dict) -> dict:
    perms = _perms(user_id, image)
    if not perms["can_view"]:
        raise SocialError("NOT_AUTHORIZED", "You do not have access to this image.", 403)
    return perms


def image_file(image: dict) -> str | None:
    try:
        return _image_file(image)
    except Exception as exc:
        print(f"[Usgromana-Gallery] Metadata synchronization failure: {exc}")
        return None


def _image_file(image: dict) -> str | None:
    relpath = image.get("relpath") or ""
    owner_id = image.get("owner_id")
    if owner_id == social_store.LOCAL_OWNER:
        from .files import get_output_dir

        root = get_output_dir()
    else:
        root = os.path.join(_accounts_module().global_output_dir(), owner_id)
    candidate = os.path.realpath(os.path.join(root, *relpath.split("/")))
    root_real = os.path.realpath(root)
    if candidate != root_real and not candidate.startswith(root_real + os.sep):
        return None
    if not os.path.isfile(candidate):
        return None
    return candidate


def _library_root(path: str, relpath: str) -> str:
    root = os.path.abspath(path)
    for _part in relpath.split("/"):
        root = os.path.dirname(root)
    return root


def _owned_file(relpath: str) -> str | None:
    from .files import get_output_dir

    normalized = normalize_relpath(relpath)
    if not normalized:
        return None
    root = os.path.realpath(get_output_dir())
    candidate = os.path.realpath(os.path.join(root, *normalized.split("/")))
    if candidate != root and not candidate.startswith(root + os.sep):
        return None
    if not os.path.isfile(candidate):
        return None
    return candidate


def _json_can_view(user_id, username, owner_id, relpath) -> bool:
    try:
        from .share_http import get_share_store
    except Exception:
        return False
    try:
        return bool(get_share_store().can_view(user_id, username, owner_id, relpath))
    except Exception:
        return False


def can_open_shared(user_id: str, username: str, owner_id: str, relpath: str) -> bool:
    if user_id == owner_id:
        return True
    row = social_store.get_image_by_path(owner_id, relpath)
    migrated = bool(row and social_store.migration_done(social_store.share_migration_key(row["image_id"])))
    if migrated:
        return social_store.has_share(row["image_id"], user_id)
    if _json_can_view(user_id, username, owner_id, relpath):
        return True
    if row and social_store.has_share(row["image_id"], user_id):
        return True
    return False


def ensure_for_relpath(user_id: str, username: str, relpath: str) -> dict:
    shared = parse_shared_relpath(relpath)
    if shared is not None:
        owner_id, inner = shared
        if not can_open_shared(user_id, username, owner_id, inner):
            raise SocialError("NOT_AUTHORIZED", "You do not have access to this image.", 403)
        path = _owner_library_file(owner_id, inner)
        if not path:
            raise SocialError("IMAGE_NOT_FOUND", "Image not found.", 404)
        image_id = ensure_image_identity(
            path,
            owner_id,
            storage_type="library",
            relpath=inner,
            owner_root=_library_root(path, inner),
        )
        return {"image_id": image_id, "relpath": f"shared/{owner_id}/{inner}", "owned_relpath": inner}
    normalized = normalize_relpath(relpath)
    if not normalized:
        raise SocialError("IMAGE_NOT_FOUND", "Image not found.", 404)
    path = _owned_file(normalized)
    if not path:
        raise SocialError("IMAGE_NOT_FOUND", "Image not found.", 404)
    from .files import get_output_dir

    image_id = ensure_image_identity(
        path,
        user_id,
        owner_username=username,
        storage_type="library",
        relpath=normalized,
        owner_root=get_output_dir(),
    )
    return {"image_id": image_id, "relpath": normalized}


def _owner_library_file(owner_id: str, relpath: str) -> str | None:
    try:
        from .share_http import get_share_store
    except Exception:
        return None
    return get_share_store().resolve_owned_file(owner_id, relpath)


def summary_for(user_id: str, image_id: str) -> dict:
    image = load_image(image_id)
    perms = _require_view(user_id, image)
    rating = social_store.get_rating_summary(image["image_id"], user_id)
    return {
        "image_id": image["image_id"],
        "relpath": image["relpath"],
        "filename": image["filename"],
        "is_owner": perms["is_owner"],
        "can_comment": perms["can_comment"],
        "can_rate": perms["can_rate"],
        "can_manage_sharing": perms["can_manage_sharing"],
        "rating": {
            "average": rating["average"],
            "count": rating["count"],
            "mine": rating["mine"],
        },
        "comment_count": social_store.comment_count(image["image_id"]),
        "share_count": len(social_store.get_shares(image["image_id"])),
    }


def eligible_accounts(owner_id: str) -> list[dict]:
    from .image_identity import _accounts

    return [
        account
        for account in _accounts()
        if account.get("id")
        and account.get("id") != owner_id
        and str(account.get("username", "")).lower() != "guest"
    ]


def shares_payload(user_id: str, image_id: str) -> dict:
    image = load_image(image_id)
    perms = _require_view(user_id, image)
    if not perms["can_manage_sharing"]:
        raise SocialError("SHARE_NOT_ALLOWED", "Only the owner can manage sharing.", 403)
    granted = {row["viewer_id"]: row for row in social_store.get_shares(image["image_id"])}
    users = []
    for account in eligible_accounts(image["owner_id"]):
        users.append(
            {
                "id": account["id"],
                "username": account["username"],
                "shared": account["id"] in granted,
            }
        )
    return {
        "image_id": image["image_id"],
        "shared_with_all": bool(users) and all(user["shared"] for user in users),
        "users": users,
    }


def _viewers_from_ids(owner_id: str, user_ids: list) -> list[tuple[str, str | None]]:
    if not isinstance(user_ids, list):
        raise SocialError("SHARE_NOT_ALLOWED", "Choose accounts to share with.", 400)
    known = {account["id"]: account["username"] for account in eligible_accounts(owner_id)}
    viewers = []
    for user_id in user_ids:
        if not isinstance(user_id, str) or user_id not in known:
            raise SocialError("USER_NOT_FOUND", "That account cannot receive this image.", 404)
        viewers.append((user_id, known[user_id]))
    return viewers


def update_shares(user_id: str, image_id: str, user_ids: list) -> dict:
    image = load_image(image_id)
    perms = _perms(user_id, image)
    if not perms["can_manage_sharing"]:
        raise SocialError("SHARE_NOT_ALLOWED", "Only the owner can manage sharing.", 403)
    viewers = _viewers_from_ids(image["owner_id"], user_ids)
    social_store.set_shares(image["image_id"], viewers, user_id)
    social_store.mark_migration(social_store.share_migration_key(image["image_id"]))
    return shares_payload(user_id, image["image_id"])


def update_one_share(user_id: str, image_id: str, viewer_id: str, shared: bool) -> dict:
    image = load_image(image_id)
    perms = _perms(user_id, image)
    if not perms["can_manage_sharing"]:
        raise SocialError("SHARE_NOT_ALLOWED", "Only the owner can manage sharing.", 403)
    if not isinstance(shared, bool):
        raise SocialError("SHARE_NOT_ALLOWED", "Shared must be true or false.", 400)
    known = {account["id"]: account["username"] for account in eligible_accounts(image["owner_id"])}
    if viewer_id not in known:
        raise SocialError("USER_NOT_FOUND", "That account cannot receive this image.", 404)
    if shared:
        social_store.share_with_user(image["image_id"], viewer_id, known[viewer_id], user_id)
    else:
        social_store.revoke_share(image["image_id"], viewer_id, user_id)
    social_store.mark_migration(social_store.share_migration_key(image["image_id"]))
    return shares_payload(user_id, image["image_id"])


def share_all(user_id: str, image_id: str) -> dict:
    image = load_image(image_id)
    perms = _perms(user_id, image)
    if not perms["can_manage_sharing"]:
        raise SocialError("SHARE_NOT_ALLOWED", "Only the owner can manage sharing.", 403)
    viewers = [(account["id"], account["username"]) for account in eligible_accounts(image["owner_id"])]
    social_store.set_shares(image["image_id"], viewers, user_id)
    social_store.mark_migration(social_store.share_migration_key(image["image_id"]))
    return shares_payload(user_id, image["image_id"])


def revoke_all(user_id: str, image_id: str) -> dict:
    image = load_image(image_id)
    perms = _perms(user_id, image)
    if not perms["can_manage_sharing"]:
        raise SocialError("SHARE_NOT_ALLOWED", "Only the owner can manage sharing.", 403)
    social_store.revoke_all_shares(image["image_id"])
    social_store.mark_migration(social_store.share_migration_key(image["image_id"]))
    return shares_payload(user_id, image["image_id"])


def _decorate_comment(comment: dict, user_id: str, image: dict) -> dict:
    perms = _perms(user_id, image)
    rating = social_store.get_rating(image["image_id"], comment["user_id"])
    created = comment["created_at"]
    updated = comment["updated_at"]
    return {
        "comment_id": comment["comment_id"],
        "user_id": comment["user_id"],
        "username": comment["username_snapshot"],
        "body": comment["body"],
        "rating": int(rating["rating"]) if rating else comment.get("user_rating"),
        "created_at": created,
        "updated_at": updated,
        "edited": updated > created,
        "is_mine": comment["user_id"] == user_id,
        "can_edit": social_store.can_edit_comment(user_id, perms, comment),
        "can_delete": social_store.can_delete_comment(user_id, perms, comment),
    }


def comments_payload(user_id: str, image_id: str, limit: int = 50, cursor: str | None = None) -> dict:
    image = load_image(image_id)
    perms = _require_view(user_id, image)
    rows, next_cursor = social_store.get_comments(image["image_id"], limit=limit, cursor=cursor)
    rating = social_store.get_rating_summary(image["image_id"], user_id)
    return {
        "image_id": image["image_id"],
        "is_owner": perms["is_owner"],
        "average_rating": rating["average"],
        "rating_count": rating["count"],
        "my_rating": rating["mine"],
        "comments": [_decorate_comment(row, user_id, image) for row in rows],
        "next_cursor": next_cursor,
    }


def add_comment(user_id: str, username: str, image_id: str, body) -> dict:
    image = load_image(image_id)
    perms = _perms(user_id, image)
    if not perms["can_comment"]:
        raise SocialError("NOT_AUTHORIZED", "You do not have access to this image.", 403)
    text = validate_comment(body)
    try:
        comment = social_store.create_comment(image["image_id"], user_id, username, text)
    except Exception as exc:
        print(f"[Usgromana-Gallery] Comment creation failure: {exc}")
        raise SocialError("DATABASE_ERROR", "Could not save the comment.", 500) from exc
    notification_store.create_notification(
        image["owner_id"],
        user_id,
        username,
        image["image_id"],
        notification_store.EVENT_COMMENT,
        comment["comment_id"],
    )
    return _decorate_comment(comment, user_id, image)


def edit_comment(user_id: str, comment_id: str, body) -> dict:
    parsed = parse_image_id(comment_id)
    if not parsed:
        raise SocialError("COMMENT_NOT_FOUND", "Comment not found.", 404)
    comment = social_store.get_comment(parsed)
    if comment is None:
        raise SocialError("COMMENT_NOT_FOUND", "Comment not found.", 404)
    image = load_image(comment["image_id"])
    perms = _require_view(user_id, image)
    if not social_store.can_edit_comment(user_id, perms, comment):
        raise SocialError("NOT_AUTHORIZED", "You can edit only your own comment.", 403)
    text = validate_comment(body)
    updated = social_store.update_comment(comment["comment_id"], text)
    return _decorate_comment(updated, user_id, image)


def remove_comment(user_id: str, comment_id: str) -> dict:
    parsed = parse_image_id(comment_id)
    if not parsed:
        raise SocialError("COMMENT_NOT_FOUND", "Comment not found.", 404)
    comment = social_store.get_comment(parsed)
    if comment is None:
        raise SocialError("COMMENT_NOT_FOUND", "Comment not found.", 404)
    image = load_image(comment["image_id"])
    perms = _perms(user_id, image)
    if not perms["can_view"] and not perms["is_owner"]:
        raise SocialError("NOT_AUTHORIZED", "You do not have access to this image.", 403)
    if not social_store.can_delete_comment(user_id, perms, comment):
        raise SocialError("NOT_AUTHORIZED", "You cannot delete this comment.", 403)
    social_store.delete_comment(comment["comment_id"])
    return {"ok": True}


def rating_payload(user_id: str, image_id: str) -> dict:
    image = load_image(image_id)
    _require_view(user_id, image)
    summary = social_store.get_rating_summary(image["image_id"], user_id)
    return {"image_id": image["image_id"], "rating": _public_rating(summary)}


def _public_rating(summary: dict) -> dict:
    return {
        "average": summary["average"],
        "count": summary["count"],
        "mine": summary["mine"],
    }


def apply_rating(user_id: str, username: str, image_id: str, value) -> dict:
    image = load_image(image_id)
    perms = _perms(user_id, image)
    if not perms["can_rate"]:
        raise SocialError("NOT_AUTHORIZED", "You do not have access to this image.", 403)
    rating = parse_rating(value)
    if rating is None:
        raise SocialError("INVALID_RATING", "Rating must be a whole number from 1 to 5.", 400)
    try:
        created = social_store.set_rating(image["image_id"], user_id, username, rating)
    except Exception as exc:
        print(f"[Usgromana-Gallery] Rating failure: {exc}")
        raise SocialError("DATABASE_ERROR", "Could not save the rating.", 500) from exc
    summary = social_store.get_rating_summary(image["image_id"], user_id)
    metadata_sync = False
    path = image_file(image)
    average = summary["average"] if summary["count"] else summary.get("legacy")
    if path is not None and average is not None:
        metadata_sync = sync_rating_metadata(path, image["image_id"], average, summary["count"])
        if not metadata_sync:
            print(f"[Usgromana-Gallery] Metadata synchronization failure for image {image['image_id']}")
    if created:
        notification_store.create_notification(
            image["owner_id"],
            user_id,
            username,
            image["image_id"],
            notification_store.EVENT_RATING,
        )
    return {
        "ok": True,
        "rating": _public_rating(summary),
        "metadata_sync": metadata_sync,
    }


def clear_rating(user_id: str, image_id: str) -> dict:
    image = load_image(image_id)
    perms = _perms(user_id, image)
    if not perms["can_rate"]:
        raise SocialError("NOT_AUTHORIZED", "You do not have access to this image.", 403)
    social_store.remove_rating(image["image_id"], user_id)
    summary = social_store.get_rating_summary(image["image_id"], user_id)
    path = image_file(image)
    metadata_sync = False
    if path is not None:
        average = summary["average"] if summary["count"] else None
        metadata_sync = sync_rating_metadata(path, image["image_id"], average, summary["count"])
    return {"ok": True, "rating": _public_rating(summary), "metadata_sync": metadata_sync}


def rating_map(user_id: str) -> dict:
    owned = social_store.community_ratings_for_owner(user_id)
    combined = {}
    for relpath, info in owned.items():
        combined[relpath] = {
            "image_id": info["image_id"],
            "average": info["average"],
            "count": info["count"],
            "legacy": info["legacy"],
        }
    for image in social_store.shared_images_for_viewer(user_id):
        summary = social_store.get_rating_summary(image["image_id"], user_id)
        key = f"shared/{image['owner_id']}/{image['relpath']}"
        combined[key] = {
            "image_id": image["image_id"],
            "average": summary["average"],
            "count": summary["count"],
            "legacy": summary["legacy"],
        }
    return {"ok": True, "ratings": combined}


def register() -> None:
    from aiohttp import web
    from server import PromptServer

    def fail(exc: SocialError):
        return web.json_response(
            {"ok": False, "error": {"code": exc.code, "message": exc.message}},
            status=exc.status,
        )

    async def read_json(request):
        ctype = request.headers.get("Content-Type", "")
        if "application/json" not in ctype.lower():
            raise SocialError("INVALID_COMMENT", "Expected application/json.", 415)
        try:
            data = await request.json()
        except Exception as exc:
            raise SocialError("INVALID_COMMENT", "Expected JSON.", 400) from exc
        return require_object(data)

    routes = PromptServer.instance.routes

    @routes.post(f"{PREFIX}/ensure")
    async def social_ensure(request):
        try:
            user_id, username = caller_identity(request)
            data = await read_json(request)
            relpath = data.get("relpath")
            if not isinstance(relpath, str):
                raise SocialError("IMAGE_NOT_FOUND", "Image not found.", 404)
            payload = ensure_for_relpath(user_id, username, relpath)
            payload["ok"] = True
            return web.json_response(payload)
        except SocialError as exc:
            return fail(exc)

    @routes.get(f"{PREFIX}/rating-map")
    async def social_rating_map(request):
        try:
            user_id, _username = caller_identity(request)
            return web.json_response(rating_map(user_id))
        except SocialError as exc:
            return fail(exc)

    @routes.get(f"{PREFIX}/images/{{image_id}}")
    async def social_summary(request):
        try:
            user_id, _username = caller_identity(request)
            return web.json_response(summary_for(user_id, request.match_info["image_id"]))
        except SocialError as exc:
            return fail(exc)

    @routes.get(f"{PREFIX}/images/{{image_id}}/shares")
    async def social_get_shares(request):
        try:
            user_id, _username = caller_identity(request)
            return web.json_response(shares_payload(user_id, request.match_info["image_id"]))
        except SocialError as exc:
            return fail(exc)

    @routes.put(f"{PREFIX}/images/{{image_id}}/shares")
    async def social_put_shares(request):
        try:
            user_id, _username = caller_identity(request)
            data = await read_json(request)
            payload = update_shares(user_id, request.match_info["image_id"], data.get("user_ids"))
            payload["ok"] = True
            return web.json_response(payload)
        except SocialError as exc:
            return fail(exc)

    @routes.put(f"{PREFIX}/images/{{image_id}}/shares/{{user_id}}")
    async def social_put_share_user(request):
        try:
            user_id, _username = caller_identity(request)
            data = await read_json(request)
            payload = update_one_share(
                user_id,
                request.match_info["image_id"],
                request.match_info["user_id"],
                data.get("shared"),
            )
            payload["ok"] = True
            return web.json_response(payload)
        except SocialError as exc:
            return fail(exc)

    @routes.post(f"{PREFIX}/images/{{image_id}}/shares/all")
    async def social_share_all(request):
        try:
            user_id, _username = caller_identity(request)
            ctype = request.headers.get("Content-Type", "")
            if ctype and "application/json" not in ctype.lower():
                raise SocialError("SHARE_NOT_ALLOWED", "Expected application/json.", 415)
            payload = share_all(user_id, request.match_info["image_id"])
            payload["ok"] = True
            return web.json_response(payload)
        except SocialError as exc:
            return fail(exc)

    @routes.delete(f"{PREFIX}/images/{{image_id}}/shares")
    async def social_revoke_all(request):
        try:
            user_id, _username = caller_identity(request)
            payload = revoke_all(user_id, request.match_info["image_id"])
            payload["ok"] = True
            return web.json_response(payload)
        except SocialError as exc:
            return fail(exc)

    @routes.get(f"{PREFIX}/images/{{image_id}}/comments")
    async def social_get_comments(request):
        try:
            user_id, _username = caller_identity(request)
            limit = request.rel_url.query.get("limit") or 50
            cursor = request.rel_url.query.get("cursor")
            try:
                limit = int(limit)
            except (TypeError, ValueError):
                limit = 50
            return web.json_response(
                comments_payload(user_id, request.match_info["image_id"], limit=limit, cursor=cursor)
            )
        except SocialError as exc:
            return fail(exc)

    @routes.post(f"{PREFIX}/images/{{image_id}}/comments")
    async def social_add_comment(request):
        try:
            user_id, username = caller_identity(request)
            data = await read_json(request)
            comment = add_comment(user_id, username, request.match_info["image_id"], data.get("body"))
            return web.json_response({"ok": True, "comment": comment})
        except SocialError as exc:
            return fail(exc)

    @routes.patch(f"{PREFIX}/comments/{{comment_id}}")
    async def social_edit_comment(request):
        try:
            user_id, _username = caller_identity(request)
            data = await read_json(request)
            comment = edit_comment(user_id, request.match_info["comment_id"], data.get("body"))
            return web.json_response({"ok": True, "comment": comment})
        except SocialError as exc:
            return fail(exc)

    @routes.delete(f"{PREFIX}/comments/{{comment_id}}")
    async def social_delete_comment(request):
        try:
            user_id, _username = caller_identity(request)
            return web.json_response(remove_comment(user_id, request.match_info["comment_id"]))
        except SocialError as exc:
            return fail(exc)

    @routes.get(f"{PREFIX}/images/{{image_id}}/rating")
    async def social_get_rating(request):
        try:
            user_id, _username = caller_identity(request)
            return web.json_response(rating_payload(user_id, request.match_info["image_id"]))
        except SocialError as exc:
            return fail(exc)

    @routes.put(f"{PREFIX}/images/{{image_id}}/rating")
    async def social_put_rating(request):
        try:
            user_id, username = caller_identity(request)
            data = await read_json(request)
            return web.json_response(
                apply_rating(user_id, username, request.match_info["image_id"], data.get("rating"))
            )
        except SocialError as exc:
            return fail(exc)

    @routes.delete(f"{PREFIX}/images/{{image_id}}/rating")
    async def social_delete_rating(request):
        try:
            user_id, _username = caller_identity(request)
            return web.json_response(clear_rating(user_id, request.match_info["image_id"]))
        except SocialError as exc:
            return fail(exc)

    print("[Usgromana-Gallery] Social routes registered.")


def _register_if_possible() -> None:
    if "server" not in sys.modules:
        return
    try:
        register()
    except Exception as exc:
        print(f"[Usgromana-Gallery] Could not register social routes: {exc}")


_register_if_possible()
