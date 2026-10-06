"""Optional link to a sibling ComfyUI-Usgromana install.

Sharing and per-account gallery folders stay in this package. They turn on
only when that sibling is installed and the request belongs to one of its
accounts. A gallery install on its own keeps the normal output folder.
"""

from __future__ import annotations

import importlib
import os
import sys

_PACKAGE = None
_LOOKED_UP = False


def sharing_status(installed: bool, user_id: str | None, username: str | None) -> dict:
    """Whether share controls should be offered for this request."""
    if not installed:
        return {"available": False, "enabled": False}
    name = username.strip() if isinstance(username, str) else ""
    enabled = bool(user_id) and bool(name) and name.lower() != "guest"
    return {"available": True, "enabled": enabled}


def _sibling_root() -> str | None:
    here = os.path.dirname(os.path.abspath(__file__))
    custom_nodes = os.path.dirname(os.path.dirname(here))
    for folder in ("Usgromana", "ComfyUI-Usgromana"):
        candidate = os.path.join(custom_nodes, folder)
        init_py = os.path.join(candidate, "__init__.py")
        globals_py = os.path.join(candidate, "globals.py")
        if os.path.isfile(init_py) and os.path.isfile(globals_py):
            return candidate
    return None


def _package():
    """Return the loaded Usgromana package, or None when it is not installed."""
    global _PACKAGE, _LOOKED_UP
    if _LOOKED_UP:
        return _PACKAGE
    _LOOKED_UP = True
    root = _sibling_root()
    if not root:
        _PACKAGE = None
        return None

    init_py = os.path.normcase(os.path.abspath(os.path.join(root, "__init__.py")))
    for mod in list(sys.modules.values()):
        mod_file = getattr(mod, "__file__", None)
        if not mod_file:
            continue
        if os.path.normcase(os.path.abspath(mod_file)) == init_py:
            _PACKAGE = mod
            return mod

    parent = os.path.dirname(root)
    folder = os.path.basename(root)
    if folder.isidentifier():
        if parent not in sys.path:
            sys.path.insert(0, parent)
        try:
            _PACKAGE = importlib.import_module(folder)
        except Exception as exc:
            print(f"[Usgromana-Gallery] Usgromana is present but did not import: {exc}")
            _PACKAGE = None
    return _PACKAGE


def installed() -> bool:
    return _package() is not None


def _globals():
    pkg = _package()
    if pkg is None:
        return None
    name = getattr(pkg, "__name__", None) or "Usgromana"
    module_name = f"{name}.globals"
    mod = sys.modules.get(module_name)
    if mod is not None:
        return mod
    try:
        return importlib.import_module(module_name)
    except Exception as exc:
        print(f"[Usgromana-Gallery] Could not read Usgromana accounts: {exc}")
        return None


def caller_from_request(request) -> tuple[str | None, str | None]:
    """JWT account for this request. Comfy-User headers are ignored."""
    globs = _globals()
    if globs is None or request is None:
        return None, None
    jwt_auth = getattr(globs, "jwt_auth", None)
    users_db = getattr(globs, "users_db", None)
    if jwt_auth is None or users_db is None:
        return None, None
    token = jwt_auth.get_token_from_request(request)
    if not token:
        return None, None
    try:
        payload = jwt_auth.decode_access_token(token)
    except Exception:
        return None, None
    username = payload.get("username")
    user_id = payload.get("id")
    if not username or not user_id:
        return None, None
    stored_id, _record = users_db.get_user(str(username))
    if stored_id != user_id:
        return None, None
    return str(user_id), str(username)


def known_usernames() -> set[str]:
    return {account["username"] for account in known_accounts()} | _guest_names()


def _guest_names() -> set[str]:
    globs = _globals()
    if globs is None:
        return set()
    users_db = globs.users_db
    users_db.load_users()
    return {
        str(user.get("username"))
        for user in users_db.users.values()
        if isinstance(user, dict) and str(user.get("username", "")).lower() == "guest"
    }


def known_accounts() -> list[dict]:
    """Signed-in accounts that can receive a share. The guest account is omitted."""
    globs = _globals()
    if globs is None:
        return []
    users_db = globs.users_db
    users_db.load_users()
    accounts = []
    for user_id, user in users_db.users.items():
        if not isinstance(user, dict):
            continue
        name = user.get("username")
        if not name or str(name).lower() == "guest":
            continue
        accounts.append({"id": str(user_id), "username": str(name)})
    accounts.sort(key=lambda item: item["username"].lower())
    return accounts


def global_output_dir() -> str:
    pkg = _package()
    if pkg is not None:
        name = getattr(pkg, "__name__", None) or "Usgromana"
        try:
            media = importlib.import_module(f"{name}.utils.media_paths")
            return os.path.abspath(media.global_output_directory())
        except Exception:
            pass
    import folder_paths

    return os.path.abspath(folder_paths.get_output_directory())


def account_output_dir(user_id: str | None) -> str:
    """Folder this account may list. Anonymous callers get an empty directory."""
    folder = user_id if user_id else ".usgromana-no-user"
    path = os.path.join(global_output_dir(), folder)
    os.makedirs(path, exist_ok=True)
    return os.path.abspath(path)


def reset_lookup() -> None:
    """Test helper."""
    global _PACKAGE, _LOOKED_UP
    _PACKAGE = None
    _LOOKED_UP = False
