"""Notification list, read state, preferences, and appearance settings."""

from __future__ import annotations

import sys

from .notification_store import (
    get_preferences,
    list_notifications,
    mark_all_read,
    mark_read,
    set_preferences,
    unread_count,
)
from .social_http import SocialError, caller_identity
from . import social_store

PREFIX = "/usgromana-gallery"

COLOR_KEYS = (
    "accent",
    "background",
    "panel",
    "text",
    "textSecondary",
    "border",
    "button",
    "danger",
    "star",
)

# Keep in sync with web/core/themes.js normalizeThemeId / THEME_REVISION.
THEME_REVISION = 2
CURRENT_THEMES = {
    "dark",
    "darkBlue",
    "light",
    "midnight",
    "ocean",
    "forest",
    "rose",
    "sand",
}
REMOVED_THEMES = {"darkHighContrast", "darkSubtle"}


def normalize_theme(theme, revision=None) -> str:
    """Map a stored theme onto one that still exists.

    lightSubtle is the old id for Light. A legacy record whose theme is
    "light" and which has no current themeRevision is the removed opaque
    Light theme, so it falls back to Dark. Current clients send revision 2.
    """
    if not isinstance(theme, str):
        return "dark"
    name = theme.strip()
    if name == "lightSubtle":
        return "light"
    try:
        rev = int(revision) if revision is not None else 1
    except (TypeError, ValueError):
        rev = 1
    if rev < THEME_REVISION and name == "light":
        return "dark"
    if name in REMOVED_THEMES:
        return "dark"
    if name in CURRENT_THEMES:
        return name
    return "dark"


def migrate_stored_appearance(stored: dict | None) -> dict:
    if not isinstance(stored, dict) or not stored:
        return {}
    theme = stored.get("theme")
    if not isinstance(theme, str) or not theme.strip():
        return stored
    return {
        **stored,
        "theme": normalize_theme(theme, stored.get("themeRevision")),
        "themeRevision": THEME_REVISION,
    }


def _flag(value, default: bool) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    raise SocialError("INVALID_COMMENT", "Notification settings must be true or false.", 400)


def preferences_payload(user_id: str) -> dict:
    prefs = get_preferences(user_id)
    prefs["ok"] = True
    return prefs


def update_preferences(user_id: str, data: dict) -> dict:
    current = get_preferences(user_id)
    enabled = _flag(data.get("enabled"), current["enabled"])
    comments = _flag(data.get("comment_actions"), current["comment_actions"])
    ratings = _flag(data.get("rating_actions"), current["rating_actions"])
    saved = set_preferences(user_id, enabled, comments, ratings)
    saved["ok"] = True
    return saved


def notifications_payload(user_id: str, unread_only: bool, limit: int, after: str | None) -> dict:
    return {
        "ok": True,
        "unread_count": unread_count(user_id),
        "notifications": list_notifications(user_id, unread_only=unread_only, limit=limit, after=after),
    }


def _hex_color(value: str) -> str | None:
    if not isinstance(value, str):
        return None
    text = value.strip()
    if len(text) != 7 or not text.startswith("#"):
        return None
    try:
        int(text[1:], 16)
    except ValueError:
        return None
    return text.lower()


def _opacity(value, default: float) -> float:
    if value is None:
        return default
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise SocialError("INVALID_COMMENT", "Opacity must be a number from 0.2 to 1.", 400)
    number = float(value)
    if number < 0.2 or number > 1:
        raise SocialError("INVALID_COMMENT", "Opacity must stay between 20% and 100%.", 400)
    return number


def clean_appearance(data: dict, previous: dict | None) -> dict:
    base = previous if isinstance(previous, dict) else {}
    theme = data.get("theme", base.get("theme"))
    if theme is not None and not isinstance(theme, str):
        raise SocialError("INVALID_COMMENT", "Theme must be a theme name.", 400)
    revision = data.get("themeRevision", base.get("themeRevision"))
    appearance = data.get("appearance", base.get("appearance") or {})
    if not isinstance(appearance, dict):
        raise SocialError("INVALID_COMMENT", "Appearance settings must be an object.", 400)
    colors_in = appearance.get("colors") or {}
    if not isinstance(colors_in, dict):
        raise SocialError("INVALID_COMMENT", "Colors must be an object.", 400)
    colors = {}
    for key in COLOR_KEYS:
        if key not in colors_in or colors_in[key] in (None, ""):
            continue
        color = _hex_color(colors_in[key])
        if color is None:
            raise SocialError("INVALID_COMMENT", f"{key} must be a #RRGGBB color.", 400)
        colors[key] = color
    previous_appearance = base.get("appearance") if isinstance(base.get("appearance"), dict) else {}
    cleaned = {"colors": colors}
    for key in ("windowOpacity", "panelOpacity", "menuOpacity"):
        if key in appearance and appearance.get(key) is not None:
            cleaned[key] = _opacity(appearance.get(key), None)
        elif previous_appearance.get(key) is not None:
            cleaned[key] = _opacity(previous_appearance.get(key), None)
    result = {"appearance": cleaned}
    if isinstance(theme, str) and theme.strip():
        result["theme"] = normalize_theme(theme, revision)
        result["themeRevision"] = THEME_REVISION
    return result


def appearance_payload(user_id: str) -> dict:
    stored = migrate_stored_appearance(social_store.get_appearance(user_id) or {})
    return {"ok": True, **stored}


def save_appearance(user_id: str, data: dict) -> dict:
    if data.get("reset") is True:
        social_store.set_appearance(user_id, {})
        return {"ok": True}
    previous = social_store.get_appearance(user_id)
    cleaned = clean_appearance(data, previous)
    social_store.set_appearance(user_id, cleaned)
    return {"ok": True, **cleaned}


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
        if not isinstance(data, dict):
            raise SocialError("INVALID_COMMENT", "Expected a JSON object.", 400)
        return data

    routes = PromptServer.instance.routes

    @routes.get(f"{PREFIX}/notifications")
    async def list_user_notifications(request):
        try:
            user_id, _username = caller_identity(request)
            unread = request.rel_url.query.get("unread")
            unread_only = str(unread).lower() in {"1", "true", "yes"}
            limit = request.rel_url.query.get("limit") or 20
            try:
                limit = int(limit)
            except (TypeError, ValueError):
                limit = 20
            after = request.rel_url.query.get("after")
            return web.json_response(notifications_payload(user_id, unread_only, limit, after))
        except SocialError as exc:
            return fail(exc)

    @routes.post(f"{PREFIX}/notifications/read-all")
    async def read_all_notifications(request):
        try:
            user_id, _username = caller_identity(request)
            mark_all_read(user_id)
            return web.json_response({"ok": True})
        except SocialError as exc:
            return fail(exc)

    @routes.post(f"{PREFIX}/notifications/{{notification_id}}/read")
    async def read_notification(request):
        try:
            user_id, _username = caller_identity(request)
            found = mark_read(user_id, request.match_info["notification_id"])
            if not found:
                return fail(SocialError("IMAGE_NOT_FOUND", "Notification not found.", 404))
            return web.json_response({"ok": True})
        except SocialError as exc:
            return fail(exc)

    @routes.get(f"{PREFIX}/notification-preferences")
    async def get_notification_preferences(request):
        try:
            user_id, _username = caller_identity(request)
            return web.json_response(preferences_payload(user_id))
        except SocialError as exc:
            return fail(exc)

    @routes.put(f"{PREFIX}/notification-preferences")
    async def put_notification_preferences(request):
        try:
            user_id, _username = caller_identity(request)
            data = await read_json(request)
            return web.json_response(update_preferences(user_id, data))
        except SocialError as exc:
            return fail(exc)

    @routes.get(f"{PREFIX}/appearance")
    async def get_appearance(request):
        try:
            user_id, _username = caller_identity(request)
            return web.json_response(appearance_payload(user_id))
        except SocialError as exc:
            return fail(exc)

    @routes.put(f"{PREFIX}/appearance")
    async def put_appearance(request):
        try:
            user_id, _username = caller_identity(request)
            data = await read_json(request)
            return web.json_response(save_appearance(user_id, data))
        except SocialError as exc:
            return fail(exc)

    print("[Usgromana-Gallery] Notification routes registered.")


def _register_if_possible() -> None:
    if "server" not in sys.modules:
        return
    try:
        register()
    except Exception as exc:
        print(f"[Usgromana-Gallery] Could not register notification routes: {exc}")


_register_if_possible()
