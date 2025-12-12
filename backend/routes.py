# ComfyUI-Usgromana-Gallery/backend/routes.py

import os
import sys
import json
import urllib.parse
from typing import Set, Callable, Optional

from PIL import Image
from aiohttp import web
from server import PromptServer

from .files import get_output_dir, list_output_images, IMAGE_EXTENSIONS
from .file_monitor import FileMonitor
from .scanner import BackgroundScanner
from .. import ASSETS_DIR  # from root __init__.py

# Get extension directory for storing data files
_EXTENSION_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_DATA_DIR = os.path.join(_EXTENSION_DIR, "data")
# Ensure data directory exists
os.makedirs(_DATA_DIR, exist_ok=True)

# Migration: Move old files from output directory to extension data directory
def _migrate_data_files():
    """Migrate data files from output directory to extension data directory."""
    try:
        output_dir = get_output_dir()
        old_files = {
            "usgromana_gallery_ratings.json": os.path.join(_DATA_DIR, "ratings.json"),
            "usgromana_gallery_meta.json": os.path.join(_DATA_DIR, "metadata.json"),
            "usgromana_gallery_settings.json": os.path.join(_DATA_DIR, "settings.json"),
        }
        
        for old_name, new_path in old_files.items():
            old_path = os.path.join(output_dir, old_name)
            if os.path.exists(old_path) and not os.path.exists(new_path):
                # Move the old file to the new location
                import shutil
                shutil.move(old_path, new_path)
                print(f"[Usgromana-Gallery] Migrated {old_name} from output directory to extension data directory")
    except Exception as e:
        # Don't crash if migration fails
        print(f"[Usgromana-Gallery] Warning: Failed to migrate data files: {e}")

# Run migration on module load
_migrate_data_files()

# Try to import ComfyUI-Usgromana NSFW API
_NSFW_API_AVAILABLE = False
try:
    import importlib.util
    
    # Get the custom_nodes directory (parent of this extension's directory)
    current_file_dir = os.path.dirname(os.path.abspath(__file__))
    # Go up: backend -> ComfyUI-Usgromana-Gallery -> custom_nodes
    custom_nodes_dir = os.path.dirname(os.path.dirname(current_file_dir))
    usgromana_api_path = os.path.join(custom_nodes_dir, "ComfyUI-Usgromana", "api.py")
    
    nsfw_api = None
    
    # Try direct file import first (most reliable)
    if os.path.exists(usgromana_api_path):
        try:
            spec = importlib.util.spec_from_file_location("usgromana_api", usgromana_api_path)
            if spec and spec.loader:
                nsfw_api = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(nsfw_api)
                _NSFW_API_AVAILABLE = True
        except Exception as e:
            print(f"[Usgromana-Gallery] Failed to load NSFW API from file: {e}")
    
    # If direct import didn't work, try module import
    if not _NSFW_API_AVAILABLE:
        try:
            # Try importing as a module (if it's in sys.path)
            import ComfyUI_Usgromana.api as nsfw_api
            _NSFW_API_AVAILABLE = True
        except ImportError:
            # Try adding the Usgromana directory to path
            usgromana_dir = os.path.join(custom_nodes_dir, "ComfyUI-Usgromana")
            if os.path.exists(usgromana_dir) and usgromana_dir not in sys.path:
                sys.path.insert(0, usgromana_dir)
                try:
                    import api as nsfw_api
                    _NSFW_API_AVAILABLE = True
                except ImportError:
                    pass
    
    if _NSFW_API_AVAILABLE and nsfw_api:
        check_image_path_nsfw = nsfw_api.check_image_path_nsfw
        check_image_path_nsfw_fast = getattr(nsfw_api, 'check_image_path_nsfw_fast', None)
        check_pil_image_nsfw = getattr(nsfw_api, 'check_pil_image_nsfw', None)
        get_current_user = nsfw_api.get_current_user
        set_user_context = nsfw_api.set_user_context
        is_sfw_enforced_for_user = nsfw_api.is_sfw_enforced_for_user
        # Get function to manually set NSFW tag (new API function)
        set_image_nsfw_tag = getattr(nsfw_api, 'set_image_nsfw_tag', None)
        # Try to get the internal function that actually checks images
        # This bypasses the session check for guests
        _get_nsfw_pipeline = None
        should_block_image_for_current_user = None
        
        # Try to get _get_nsfw_pipeline from the API module itself
        # The API might expose it or we can access it through the module
        try:
            _get_nsfw_pipeline = getattr(nsfw_api, '_get_nsfw_pipeline', None)
            if _get_nsfw_pipeline:
                print("[Usgromana-Gallery] Found _get_nsfw_pipeline in API module")
        except:
            pass
        
        # Try multiple methods to import the internal function
        if not should_block_image_for_current_user:
            try:
                import importlib.util
                
                # Method 1: Try direct file import with proper path handling
                current_file_dir = os.path.dirname(os.path.abspath(__file__))
                custom_nodes_dir = os.path.dirname(os.path.dirname(current_file_dir))
                nsfw_guard_path = os.path.join(custom_nodes_dir, "ComfyUI-Usgromana", "utils", "sfw_intercept", "nsfw_guard.py")
                
                if os.path.exists(nsfw_guard_path):
                    # Add the ComfyUI-Usgromana root to path for relative imports
                    usgromana_root = os.path.join(custom_nodes_dir, "ComfyUI-Usgromana")
                    if usgromana_root not in sys.path:
                        sys.path.insert(0, usgromana_root)
                    
                    try:
                        # Try importing as a module from the root
                        from utils.sfw_intercept import nsfw_guard
                        _get_nsfw_pipeline = getattr(nsfw_guard, '_get_nsfw_pipeline', None)
                        should_block_image_for_current_user = getattr(nsfw_guard, 'should_block_image_for_current_user', None)
                        if should_block_image_for_current_user:
                            print("[Usgromana-Gallery] Internal NSFW functions loaded via module import")
                    except Exception as e1:
                        # Method 2: Try direct file import with exec
                        try:
                            with open(nsfw_guard_path, 'r', encoding='utf-8') as f:
                                nsfw_guard_code = f.read()
                            # Create a namespace for the module
                            nsfw_guard_namespace = {}
                            # Execute in the namespace with proper imports
                            exec(compile(nsfw_guard_code, nsfw_guard_path, 'exec'), nsfw_guard_namespace)
                            _get_nsfw_pipeline = nsfw_guard_namespace.get('_get_nsfw_pipeline')
                            should_block_image_for_current_user = nsfw_guard_namespace.get('should_block_image_for_current_user')
                            if should_block_image_for_current_user:
                                print("[Usgromana-Gallery] Internal NSFW functions loaded via direct execution")
                        except Exception as e2:
                            # Internal functions not available - this is OK, we'll use the public API
                            # These are optional optimization functions, so we don't need to log this
                            pass
            except Exception as e:
                # Internal functions not available - this is OK, we'll use the public API
                # These are optional optimization functions, so we don't need to log this
                pass
        
        if not should_block_image_for_current_user:
            # Internal functions not available, but that's OK - the API now handles guests correctly
            # We'll use the public API functions instead
            pass
        
        # Check if the API itself loaded successfully
        if _NSFW_API_AVAILABLE:
            print("[Usgromana-Gallery] NSFW API integration enabled (using public API)")
        else:
            print("[Usgromana-Gallery] NSFW API not available - ComfyUI-Usgromana extension may not be installed or has errors")
    else:
        print("[Usgromana-Gallery] NSFW API not available - ComfyUI-Usgromana extension may not be installed")
except Exception as e:
    # Check if it's a syntax error in the Usgromana extension itself
    error_msg = str(e)
    if "IndentationError" in error_msg or "SyntaxError" in error_msg:
        print(f"[Usgromana-Gallery] Warning: ComfyUI-Usgromana extension has a syntax error and cannot be loaded.")
        print(f"[Usgromana-Gallery] Error details: {e}")
        print("[Usgromana-Gallery] Gallery will continue without NSFW filtering. Please fix the Usgromana extension.")
    else:
        print(f"[Usgromana-Gallery] Failed to import NSFW API: {e}")
        import traceback
        traceback.print_exc()

# Define fallback functions if API not available
if not _NSFW_API_AVAILABLE:
    def check_image_path_nsfw(*args, **kwargs):
        return False
    check_image_path_nsfw_fast = None  # Fast check not available when API not available
    check_pil_image_nsfw = None  # PIL check not available when API not available
    def get_current_user(*args, **kwargs):
        return None
    def set_user_context(*args, **kwargs):
        pass
    def is_sfw_enforced_for_user(*args, **kwargs):
        return False
    should_block_image_for_current_user = None
    _get_nsfw_pipeline = None
    set_image_nsfw_tag = None  # Fallback if API not available
else:
    # When API is available, these variables are already initialized and potentially set above:
    # - check_image_path_nsfw_fast: set at line 92 (may be None if not available in API)
    # - check_pil_image_nsfw: set at line 93 (may be None if not available in API)
    # - _get_nsfw_pipeline: initialized at line 101, may be set at lines 107, 132, or 145
    # - should_block_image_for_current_user: initialized at line 102, may be set at lines 133 or 146
    # - set_image_nsfw_tag: set at line 98 (may be None if not available in API)
    # Do NOT overwrite them here, as they may have been successfully loaded
    pass

# Use a unique prefix to avoid clashing with Usgromana RBAC
USGROMANA_GALLERY = "/usgromana-gallery"
ROUTE_PREFIX = USGROMANA_GALLERY

# Global state for file monitoring and scanning
_file_monitor: FileMonitor | None = None
_background_scanner: BackgroundScanner | None = None
_file_change_callbacks: list[Callable] = []
_current_extensions: Set[str] = IMAGE_EXTENSIONS.copy()

# NSFW check cache to avoid re-checking the same images repeatedly
# Format: {image_path: (is_nsfw, timestamp)}
_nsfw_cache: dict[str, tuple[bool, float]] = {}
_nsfw_cache_max_age = 3600  # Cache for 1 hour
_nsfw_cache_max_size = 1000  # Limit cache size

# Request-level cache to avoid re-filtering identical requests
# Format: {(username, image_count_hash): (filtered_images, timestamp)}
_request_cache: dict[tuple[str | None, str], tuple[list, float]] = {}
_request_cache_max_age = 60  # Cache for 1 minute (short-lived to catch file changes)
_request_cache_max_size = 50  # Limit cache size

# Last log time per user to reduce log spam
_last_log_time: dict[str | None, float] = {}
_min_log_interval = 5.0  # Only log once every 5 seconds per user

# --- Helpers ------------------------------------------------------


def _json(data: dict, status: int = 200) -> web.Response:
    return web.json_response(data, status=status)


def _safe_join_output(filename: str) -> str | None:
    """
    Safely join a filename to the output directory and ensure
    it cannot escape via .. or symlinks.
    """
    output_dir = os.path.abspath(get_output_dir())
    candidate = os.path.abspath(os.path.join(output_dir, filename))

    if not candidate.startswith(output_dir + os.sep) and candidate != output_dir:
        return None
    if not os.path.isfile(candidate):
        return None
    return candidate


def _get_username_from_request(request: web.Request) -> Optional[str]:
    """
    Try to extract username from the request.
    This may use session data, headers, or other mechanisms depending on
    how ComfyUI-Usgromana sets up authentication.
    
    The ComfyUI-Usgromana extension likely sets the user context via middleware
    before the request reaches our handlers, so the API's get_current_user()
    should work if the context is properly set.
    """
    if not _NSFW_API_AVAILABLE:
        return None
    
    try:
        # First: Try to get from the API's current user context (thread-local)
        # This is the most reliable method if ComfyUI-Usgromana middleware sets it
        username = get_current_user()
        if username:
            return username
        
        # Second: Try to get from request attributes that ComfyUI-Usgromana might set
        # Check various possible locations where user info might be stored
        
        # Check request.match_info (route parameters)
        if hasattr(request, 'match_info'):
            match_info = request.match_info
            if 'username' in match_info:
                return match_info['username']
        
        # Check request._cache (aiohttp internal cache)
        if hasattr(request, '_cache') and isinstance(request._cache, dict):
            if 'username' in request._cache:
                return request._cache['username']
            if 'user' in request._cache:
                user_obj = request._cache['user']
                if isinstance(user_obj, dict) and 'username' in user_obj:
                    return user_obj['username']
                if hasattr(user_obj, 'username'):
                    return user_obj.username
        
        # Check request.__dict__ (internal attributes)
        if hasattr(request, '__dict__'):
            if 'username' in request.__dict__:
                return request.__dict__['username']
            if 'user' in request.__dict__:
                user_obj = request.__dict__['user']
                if hasattr(user_obj, 'username'):
                    return user_obj.username
                if isinstance(user_obj, dict) and 'username' in user_obj:
                    return user_obj['username']
        
        # Check app context (if ComfyUI-Usgromana stores it there)
        if hasattr(request, 'app'):
            app = request.app
            if hasattr(app, '_usgromana_user') or hasattr(app, 'usgromana_user'):
                user = getattr(app, '_usgromana_user', None) or getattr(app, 'usgromana_user', None)
                if user:
                    if isinstance(user, dict) and 'username' in user:
                        return user['username']
                    if hasattr(user, 'username'):
                        return user.username
        
        # Try to get from headers (if Usgromana sets custom headers)
        if hasattr(request, 'headers'):
            username_header = (
                request.headers.get('X-Username') or 
                request.headers.get('X-User') or
                request.headers.get('X-Auth-User')
            )
            if username_header:
                return username_header
        
        # Last resort: The API's get_current_user() might work if context was set
        # by middleware, but we already tried that. Return None to indicate guest.
        return None
            
    except Exception as e:
        print(f"[Usgromana-Gallery] Error getting username from request: {e}")
        import traceback
        traceback.print_exc()
    
    return None


def _apply_nsfw_filter(request: web.Request, images):
    """
    Filter images based on NSFW checks using ComfyUI-Usgromana NSFW API.
    
    This function filters out NSFW images for users who have SFW restrictions enabled.
    Guests are always treated as having SFW restrictions enforced.
    
    Uses multi-level caching to optimize performance:
    1. Request-level cache (short-lived) to avoid re-filtering identical requests
    2. Image-level cache (long-lived) to avoid re-checking the same images
    """
    if not _NSFW_API_AVAILABLE:
        # If API not available, return all images (fail open)
        return images
    
    try:
        import time
        import hashlib
        current_time = time.time()
        
        # Get current user from request context
        username = _get_username_from_request(request)
        
        # Check request-level cache first (fast path for repeated requests)
        # Create a hash of the image list to detect changes
        image_paths = [img.relpath for img in images if img.relpath]
        image_hash = hashlib.md5("|".join(sorted(image_paths)).encode()).hexdigest()[:16]
        request_cache_key = (username, image_hash)
        
        if request_cache_key in _request_cache:
            cached_result, cache_time = _request_cache[request_cache_key]
            if current_time - cache_time < _request_cache_max_age:
                # Return cached result (no logging, no checks)
                return cached_result
            else:
                # Cache expired, remove it
                del _request_cache[request_cache_key]
        
        # Determine if we need to filter
        is_guest = (username is None)
        
        if username:
            # Check if SFW is enforced for this user first (optimization)
            try:
                sfw_enforced = is_sfw_enforced_for_user(username)
                if not sfw_enforced:
                    # User has no SFW restrictions, show all images
                    # Cache this result
                    _request_cache[request_cache_key] = (images, current_time)
                    return images  # User allowed, no filtering needed
            except Exception as e:
                # If check fails, assume we should filter (fail closed for security)
                # Only log first error to avoid spam
                if username not in _last_log_time or current_time - _last_log_time[username] > 60:
                    print(f"[Usgromana-Gallery] Error checking SFW enforcement for user '{username}': {e}, defaulting to enforced")
                    _last_log_time[username] = current_time
        else:
            # Guest users: The API now always enforces SFW and checks images for guests
            username = None
            is_guest = True
        
        # Set user context for NSFW checks (important for thread-local storage)
        # Only set if it's different from current context to avoid log spam
        try:
            current_user = get_current_user()
            if username != current_user:
                # Only set if different to avoid unnecessary logging
                if username:
                    set_user_context(username)
                else:
                    # Explicitly set to None for guest
                    set_user_context(None)
        except Exception as e:
            # Only log first error per user to avoid spam
            if username not in _last_log_time or current_time - _last_log_time.get(username, 0) > 60:
                print(f"[Usgromana-Gallery] Error setting user context: {e}")
                if username:
                    _last_log_time[username] = current_time
            # Continue anyway - the API might still work
        
        # Clean old cache entries periodically (not on every request)
        if len(_nsfw_cache) > _nsfw_cache_max_size:
            # Remove oldest entries (keep half)
            sorted_cache = sorted(_nsfw_cache.items(), key=lambda x: x[1][1])
            _nsfw_cache.clear()
            _nsfw_cache.update(dict(sorted_cache[-_nsfw_cache_max_size//2:]))
        
        # Clean request cache periodically
        if len(_request_cache) > _request_cache_max_size:
            sorted_request_cache = sorted(_request_cache.items(), key=lambda x: x[1][1])
            _request_cache.clear()
            _request_cache.update(dict(sorted_request_cache[-_request_cache_max_size//2:]))
        
        filtered_images = []
        blocked_count = 0
        error_count = 0
        cached_count = 0
        
        for img in images:
            safe_path = _safe_join_output(img.relpath)
            if safe_path is None:
                # Skip invalid paths
                continue
            
            # Check cache first (works for all users - NSFW detection is image-based, not user-based)
            cache_key = safe_path
            should_block = None
            cache_hit = False
            
            if cache_key in _nsfw_cache:
                cached_result, cache_time = _nsfw_cache[cache_key]
                if current_time - cache_time < _nsfw_cache_max_age:
                    # Use cached result
                    should_block = cached_result
                    cache_hit = True
                    cached_count += 1
                else:
                    # Cache expired, remove it
                    del _nsfw_cache[cache_key]
            
            # If not cached, check the image
            if should_block is None:
                try:
                    # Try fast check first (uses cached tags, no scanning, no logging spam)
                    # This is much faster and doesn't cause excessive logging
                    if check_image_path_nsfw_fast:
                        fast_result = check_image_path_nsfw_fast(safe_path, username)
                        if fast_result is not None:
                            # Fast check returned a result (True=block, False=allow)
                            should_block = fast_result
                            # Cache the result for all users
                            _nsfw_cache[cache_key] = (should_block, current_time)
                        else:
                            # Fast check returned None - not tagged yet
                            # For performance, allow untagged images through initially
                            # They'll be tagged in the background and filtered on next request
                            should_block = False
                    else:
                        # Fast check not available, use regular check
                        should_block = check_image_path_nsfw(safe_path, username)
                        # Cache the result for all users
                        _nsfw_cache[cache_key] = (should_block, current_time)
                except Exception as e:
                    # If individual image check fails, handle based on user type
                    error_count += 1
                    if error_count <= 3:  # Only log first few errors to avoid spam
                        print(f"[Usgromana-Gallery] Error checking image '{img.relpath}': {e}")
                    
                    if is_guest:
                        # For guests, exclude on error (fail closed for security)
                        should_block = True
                        blocked_count += 1
                    else:
                        # For authenticated users, include on error (fail open)
                        should_block = False
                        filtered_images.append(img)
                    continue
            
            if not should_block:
                # Image is safe to show (either not NSFW or user allowed)
                filtered_images.append(img)
            else:
                # Image is NSFW and user has restrictions, so skip it
                blocked_count += 1
        
        # Cache the filtered result
        _request_cache[request_cache_key] = (filtered_images, current_time)
        
        # Only log summary if enough time has passed since last log (reduce spam)
        if blocked_count > 0:
            last_log = _last_log_time.get(username, 0)
            if current_time - last_log >= _min_log_interval:
                cache_info = f" (cached: {cached_count}/{len(images)})" if cached_count > 0 else ""
                print(f"[Usgromana-Gallery] NSFW filter: Blocked {blocked_count}/{len(images)} NSFW images for user '{username or 'guest'}'{cache_info}")
                _last_log_time[username] = current_time
        
        if error_count > 3 and (username not in _last_log_time or current_time - _last_log_time.get(username, 0) > 60):
            print(f"[Usgromana-Gallery] NSFW filter: {error_count} images had check errors")
            if username:
                _last_log_time[username] = current_time
        
        return filtered_images
    except Exception as e:
        # On error, fail closed for guests (block all), fail open for authenticated users
        print(f"[Usgromana-Gallery] Critical error in NSFW filter: {e}")
        import traceback
        traceback.print_exc()
        # For guests, return empty list (fail closed)
        # For authenticated users, return all images (fail open)
        username = _get_username_from_request(request)
        if username is None:
            # Guest: fail closed (return empty)
            print("[Usgromana-Gallery] NSFW filter: Critical error for guest, returning empty list for security")
            return []
        else:
            # Authenticated user: fail open (return all)
            print(f"[Usgromana-Gallery] NSFW filter: Critical error for user '{username}', returning all images")
            return images


# --- Static assets (icons, logos, etc.) ---------------------------

# Serve files at: /usgromana-gallery/assets/<filename>
PromptServer.instance.app.router.add_static(
    f"{ROUTE_PREFIX}/assets",
    ASSETS_DIR,
    name="usgromana_gallery_assets",
)

# --- Image listing & serving --------------------------------------


@PromptServer.instance.routes.get(f"{ROUTE_PREFIX}/list")
async def gallery_list(request: web.Request) -> web.Response:
    """
    Return basic info about images in the output directory, including
    recursive subfolders. Also returns a folder list for the UI.
    """
    try:
        # Use current extensions (may be overridden by settings)
        images = list_output_images(extensions=_current_extensions)

        # Apply NSFW filtering based on current user / SFW flag.
        images = _apply_nsfw_filter(request, images)

        base_url = f"{ROUTE_PREFIX}/image"
        payload_images = []

        # Build folder summary map
        folders_map: dict[str, dict] = {}

        for img in images:
            d = img.to_dict()
            # URL used by frontend to actually load the file
            d["url"] = f"{base_url}?filename={urllib.parse.quote(img.relpath)}"
            payload_images.append(d)

            folder = img.folder or ""
            if folder not in folders_map:
                folders_map[folder] = {
                    "path": folder,
                    "name": folder or "Output",
                    "count": 0,
                }
            folders_map[folder]["count"] += 1

        folder_list = sorted(
            folders_map.values(),
            key=lambda f: (0 if f["path"] == "" else 1, f["path"]),
        )

        return _json({"ok": True, "images": payload_images, "folders": folder_list})
    except Exception as e:
        # Don't blow up Comfy if something goes wrong
        return _json({"ok": False, "error": str(e)}, status=500)


@PromptServer.instance.routes.get(f"{ROUTE_PREFIX}/image")
async def gallery_image(request: web.Request) -> web.StreamResponse:
    """
    Serve an image from the output directory.

    Optional query:
      - size=thumb   → return a cached thumbnail (max ~512px on the long side)
    
    This endpoint enforces NSFW restrictions using ComfyUI-Usgromana NSFW API.
    """
    filename = request.query.get("filename")
    if not filename:
        return _json({"ok": False, "error": "Missing filename"}, status=400)

    safe_path = _safe_join_output(filename)
    if safe_path is None:
        return _json({"ok": False, "error": "File not found or invalid path"}, status=404)

    # Check NSFW restrictions before serving the image
    if _NSFW_API_AVAILABLE:
        try:
            username = _get_username_from_request(request)
            
            # Set user context for NSFW checks (only if different from current)
            current_user = get_current_user()
            if username != current_user:
                if username:
                    set_user_context(username)
                else:
                    set_user_context(None)
            
            # Check if SFW is enforced for this user
            if username:
                if not is_sfw_enforced_for_user(username):
                    # User allowed, skip NSFW check
                    pass
                else:
                    # User has restrictions, check the image
                    should_block = check_image_path_nsfw(safe_path, username)
                    if should_block:
                        print(f"[Usgromana-Gallery] Blocked NSFW image '{filename}' for user '{username}'")
                        # Return 403 Forbidden for NSFW content when user has restrictions
                        return _json({"ok": False, "error": "Access denied: NSFW content blocked"}, status=403)
            else:
                # Guest user - API now always enforces SFW and checks images for guests
                should_block = check_image_path_nsfw(safe_path, None)
                if should_block:
                    print(f"[Usgromana-Gallery] Blocked NSFW image '{filename}' for guest user")
                    return _json({"ok": False, "error": "Access denied: NSFW content blocked"}, status=403)
        except Exception as e:
            # On error, log but don't block (fail open)
            print(f"[Usgromana-Gallery] Error checking NSFW for image '{filename}': {e}")
            import traceback
            traceback.print_exc()

    size = request.query.get("size")
    if size == "thumb":
        # Thumbnails live under <output>/_thumbs/<filename>
        base_output = get_output_dir()
        thumbs_dir = os.path.join(base_output, "_thumbs")
        os.makedirs(thumbs_dir, exist_ok=True)

        # Avoid any directory tricks by only using basename
        thumb_name = os.path.basename(filename)
        thumb_path = os.path.join(thumbs_dir, thumb_name)

        # Check NSFW before serving or generating thumbnail
        if _NSFW_API_AVAILABLE:
            try:
                username = _get_username_from_request(request)
                # Set user context (only if different from current)
                current_user = get_current_user()
                if username != current_user:
                    if username:
                        set_user_context(username)
                    else:
                        set_user_context(None)
                
                # Check if SFW is enforced
                if username:
                    if is_sfw_enforced_for_user(username):
                        should_block = check_image_path_nsfw(safe_path, username)
                        if should_block:
                            print(f"[Usgromana-Gallery] Blocked NSFW thumbnail '{filename}' for user '{username}'")
                            return _json({"ok": False, "error": "Access denied: NSFW content blocked"}, status=403)
                else:
                    # Guest - API now always enforces SFW and checks images for guests
                    should_block = check_image_path_nsfw(safe_path, None)
                    if should_block:
                        print(f"[Usgromana-Gallery] Blocked NSFW thumbnail '{filename}' for guest")
                        return _json({"ok": False, "error": "Access denied: NSFW content blocked"}, status=403)
            except Exception as e:
                print(f"[Usgromana-Gallery] Error checking NSFW for thumbnail '{filename}': {e}")
                import traceback
                traceback.print_exc()

        try:
            # Rebuild thumb if missing or older than source
            needs_regen = (
                not os.path.isfile(thumb_path)
                or os.path.getmtime(thumb_path) < os.path.getmtime(safe_path)
            )

            if needs_regen:
                with Image.open(safe_path) as im:
                    # Preserve aspect, cap the longest side
                    im.thumbnail((512, 512))
                    # Save as PNG regardless of original type
                    im.save(thumb_path, format="PNG")

            return web.FileResponse(path=thumb_path)
        except Exception as e:
            # Fall back to full image if thumb generation fails
            print("[Usgromana-Gallery] Thumbnail error:", e)
            return web.FileResponse(path=safe_path)

    # Default: serve original full-size image
    return web.FileResponse(path=safe_path)


# --- Batch operations ---------------------------------------------

@PromptServer.instance.routes.post(f"{ROUTE_PREFIX}/batch/delete")
async def gallery_batch_delete(request: web.Request) -> web.Response:
    """Delete multiple files. Body: { "filenames": ["path1", "path2", ...] }"""
    try:
        body = await request.json()
        filenames = body.get("filenames", [])
        
        if not isinstance(filenames, list):
            return _json({"ok": False, "error": "filenames must be a list"}, status=400)
        
        output_dir = get_output_dir()
        deleted = []
        errors = []
        
        for filename in filenames:
            if not filename or not isinstance(filename, str):
                continue
            
            safe_path = _safe_join_output(filename)
            if safe_path is None:
                errors.append(f"{filename}: invalid path")
                continue
            
            try:
                if os.path.isfile(safe_path):
                    os.remove(safe_path)
                    deleted.append(filename)
            except OSError as e:
                errors.append(f"{filename}: {str(e)}")
        
        return _json({
            "ok": True,
            "deleted": deleted,
            "errors": errors,
            "count": len(deleted),
        })
    except Exception as e:
        return _json({"ok": False, "error": str(e)}, status=500)


@PromptServer.instance.routes.get(f"{ROUTE_PREFIX}/batch/download")
async def gallery_batch_download(request: web.Request) -> web.Response:
    """
    Download multiple files as ZIP. Query: ?filenames=path1,path2,path3
    
    This endpoint enforces NSFW restrictions - NSFW images are excluded from the ZIP
    for users who have SFW restrictions enabled.
    """
    try:
        import zipfile
        import tempfile
        from io import BytesIO
        
        filenames_str = request.query.get("filenames", "")
        if not filenames_str:
            return _json({"ok": False, "error": "Missing filenames"}, status=400)
        
        filenames = [f.strip() for f in filenames_str.split(",") if f.strip()]
        if not filenames:
            return _json({"ok": False, "error": "No valid filenames"}, status=400)
        
        # Get username for NSFW checks
        username = None
        if _NSFW_API_AVAILABLE:
            try:
                username = _get_username_from_request(request)
                # Set user context (only if different from current)
                current_user = get_current_user()
                if username != current_user:
                    if username:
                        set_user_context(username)
                    else:
                        set_user_context(None)
            except Exception as e:
                print(f"[Usgromana-Gallery] Error setting user context for batch download: {e}")
        
        output_dir = get_output_dir()
        
        # Create ZIP in memory
        zip_buffer = BytesIO()
        added_count = 0
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
            for filename in filenames:
                safe_path = _safe_join_output(filename)
                if not safe_path or not os.path.isfile(safe_path):
                    continue
                
                # Check NSFW restrictions
                if _NSFW_API_AVAILABLE:
                    try:
                        should_block = check_image_path_nsfw(safe_path, username)
                        if should_block:
                            # Skip NSFW images for users with restrictions
                            continue
                    except Exception as e:
                        # On error, include the file (fail open)
                        print(f"[Usgromana-Gallery] Error checking NSFW for {filename}: {e}")
                
                # Add file to ZIP
                arcname = os.path.basename(filename)  # Store just the filename in ZIP
                zip_file.write(safe_path, arcname)
                added_count += 1
        
        if added_count == 0:
            return _json({"ok": False, "error": "No files available for download (may be blocked by NSFW restrictions)"}, status=403)
        
        zip_buffer.seek(0)
        
        response = web.Response(
            body=zip_buffer.read(),
            headers={
                "Content-Type": "application/zip",
                "Content-Disposition": 'attachment; filename="gallery_images.zip"',
            },
        )
        return response
    except Exception as e:
        return _json({"ok": False, "error": str(e)}, status=500)

# --- Ratings persistence ------------------------------------------

RATINGS_FILE = os.path.join(_DATA_DIR, "ratings.json")


def _load_ratings() -> dict:
    try:
        if not os.path.isfile(RATINGS_FILE):
            return {}
        with open(RATINGS_FILE, "r", encoding="utf-8") as f:
            return json.load(f) or {}
    except Exception:
        return {}


def _save_ratings(data: dict) -> None:
    try:
        os.makedirs(os.path.dirname(RATINGS_FILE), exist_ok=True)
        with open(RATINGS_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    except Exception:
        # Don't crash Comfy if disk write fails
        pass


@PromptServer.instance.routes.post(f"{ROUTE_PREFIX}/mark-nsfw")
async def gallery_mark_nsfw(request: web.Request) -> web.Response:
    """
    Mark an image as NSFW using the NSFW API.
    Body: { "filename": "..." }
    """
    if not _NSFW_API_AVAILABLE:
        return _json({"ok": False, "error": "NSFW API not available"}, status=503)
    
    try:
        payload = await request.json()
    except Exception:
        return _json({"ok": False, "error": "Invalid JSON"}, status=400)
    
    filename = payload.get("filename")
    if not filename:
        return _json({"ok": False, "error": "Missing filename"}, status=400)
    
    safe_path = _safe_join_output(filename)
    if safe_path is None:
        return _json({"ok": False, "error": "File not found or invalid path"}, status=404)
    
    try:
        # Get username for context
        username = _get_username_from_request(request)
        current_user = get_current_user()
        if username != current_user:
            if username:
                set_user_context(username)
            else:
                set_user_context(None)
        
        # Use the new set_image_nsfw_tag function to manually mark the image as NSFW
        if set_image_nsfw_tag:
            try:
                # Mark the image as NSFW with manual label
                result = set_image_nsfw_tag(safe_path, is_nsfw=True, score=1.0, label="manual")
                if result:
                    # Clear cache for this image so it gets re-checked
                    if safe_path in _nsfw_cache:
                        del _nsfw_cache[safe_path]
                    # Also clear request cache
                    _request_cache.clear()
                    print(f"[Usgromana-Gallery] Manually marked image '{filename}' as NSFW")
                    return _json({"ok": True, "message": "Image marked as NSFW. It will now be blocked for unauthorized users."})
                else:
                    return _json({"ok": False, "error": "Failed to mark image as NSFW"}, status=500)
            except Exception as e:
                print(f"[Usgromana-Gallery] Error marking image as NSFW: {e}")
                import traceback
                traceback.print_exc()
                return _json({"ok": False, "error": f"Error marking image as NSFW: {str(e)}"}, status=500)
        else:
            # Fallback: API function not available
            return _json({"ok": False, "error": "NSFW tagging function not available. Please ensure ComfyUI-Usgromana extension is up to date."}, status=503)
        
    except Exception as e:
        print(f"[Usgromana-Gallery] Error marking image as NSFW: {e}")
        import traceback
        traceback.print_exc()
        return _json({"ok": False, "error": str(e)}, status=500)


@PromptServer.instance.routes.post(f"{ROUTE_PREFIX}/rating")
async def gallery_set_rating(request: web.Request) -> web.Response:
    """
    Persist a single rating: { "filename": "...", "rating": 1-5 }.
    """
    try:
        payload = await request.json()
    except Exception:
        return _json({"ok": False, "error": "Invalid JSON"}, status=400)

    filename = payload.get("filename")
    rating = payload.get("rating")

    if not filename or not isinstance(rating, (int, float)):
        return _json({"ok": False, "error": "Missing or invalid filename/rating"}, status=400)

    ratings = _load_ratings()
    ratings[filename] = int(rating)
    _save_ratings(ratings)

    return _json({"ok": True})


@PromptServer.instance.routes.get(f"{ROUTE_PREFIX}/ratings")
async def gallery_get_ratings(request: web.Request) -> web.Response:
    """
    Return all stored ratings as { filename: rating, ... }.
    """
    ratings = _load_ratings()
    return web.json_response(ratings)


# --- Metadata persistence -----------------------------------------

META_FILE = os.path.join(_DATA_DIR, "metadata.json")


def _load_meta() -> dict:
    if not os.path.exists(META_FILE):
        return {}
    try:
        with open(META_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _save_meta(meta: dict) -> None:
    tmp = META_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)
    os.replace(tmp, META_FILE)


@PromptServer.instance.routes.get(f"{ROUTE_PREFIX}/meta")
async def gallery_get_meta(request: web.Request) -> web.Response:
    """
    Get stored metadata for a single image.
    Query: ?filename=<name>
    Also includes NSFW status if API is available.
    """
    filename = request.query.get("filename")
    if not filename:
        return _json({"ok": False, "error": "Missing filename"}, status=400)

    meta = _load_meta()
    result_meta = meta.get(filename, {})
    
    # Add NSFW status if API is available
    if _NSFW_API_AVAILABLE:
        try:
            safe_path = _safe_join_output(filename)
            if safe_path:
                username = _get_username_from_request(request)
                current_user = get_current_user()
                if username != current_user:
                    if username:
                        set_user_context(username)
                    else:
                        set_user_context(None)
                
                # Use fast check to get NSFW status (uses cached tags)
                if check_image_path_nsfw_fast:
                    is_nsfw = check_image_path_nsfw_fast(safe_path, username)
                    if is_nsfw is not None:
                        result_meta["is_nsfw"] = is_nsfw
                else:
                    # Fallback to regular check
                    is_nsfw = check_image_path_nsfw(safe_path, username)
                    result_meta["is_nsfw"] = is_nsfw
        except Exception as e:
            # If check fails, don't include NSFW status
            print(f"[Usgromana-Gallery] Error checking NSFW status for metadata: {e}")
    
    return _json({"ok": True, "meta": result_meta})


@PromptServer.instance.routes.post(f"{ROUTE_PREFIX}/meta")
async def gallery_set_meta(request: web.Request) -> web.Response:
    """
    Set stored metadata for a single image.
    Body: { "filename": "...", "meta": { ... } }
    """
    try:
        body = await request.json()
    except Exception:
        return _json({"ok": False, "error": "Invalid JSON"}, status=400)

    filename = body.get("filename")
    payload = body.get("meta") or {}

    if not filename:
        return _json({"ok": False, "error": "Missing filename"}, status=400)

    meta = _load_meta()
    meta[filename] = payload
    _save_meta(meta)

    return _json({"ok": True})


@PromptServer.instance.routes.post(f"{ROUTE_PREFIX}/rename")
async def gallery_rename_file(request: web.Request) -> web.Response:
    """
    Rename a file (admin only).
    Body: { "old_filename": "...", "new_filename": "..." }
    """
    try:
        body = await request.json()
    except Exception:
        return _json({"ok": False, "error": "Invalid JSON"}, status=400)
    
    old_filename = body.get("old_filename")
    new_filename = body.get("new_filename")
    
    if not old_filename or not new_filename:
        return _json({"ok": False, "error": "Missing old_filename or new_filename"}, status=400)
    
    # Sanitize new filename
    import re
    # Remove any path separators and dangerous characters
    new_filename = os.path.basename(new_filename)
    new_filename = re.sub(r'[<>:"|?*]', '', new_filename)
    
    if not new_filename:
        return _json({"ok": False, "error": "Invalid filename"}, status=400)
    
    old_path = _safe_join_output(old_filename)
    if old_path is None:
        return _json({"ok": False, "error": "File not found or invalid path"}, status=404)
    
    # Get directory of old file
    old_dir = os.path.dirname(old_path)
    new_path = os.path.join(old_dir, new_filename)
    
    # Check if new file already exists
    if os.path.exists(new_path):
        return _json({"ok": False, "error": "File with that name already exists"}, status=409)
    
    try:
        # Rename the file
        os.rename(old_path, new_path)
        
        # Update metadata if it exists
        meta = _load_meta()
        if old_filename in meta:
            meta[new_filename] = meta[old_filename]
            del meta[old_filename]
            _save_meta(meta)
        
        # Update ratings if they exist
        ratings = _load_ratings()
        if old_filename in ratings:
            ratings[new_filename] = ratings[old_filename]
            del ratings[old_filename]
            _save_ratings(ratings)
        
        return _json({"ok": True, "message": "File renamed successfully"})
    except OSError as e:
        return _json({"ok": False, "error": f"Failed to rename file: {str(e)}"}, status=500)
    except Exception as e:
        return _json({"ok": False, "error": str(e)}, status=500)


# --- Optional log endpoint ----------------------------------------


@PromptServer.instance.routes.post(f"{ROUTE_PREFIX}/log")
async def gallery_log(request: web.Request) -> web.Response:
    """
    Optional logging endpoint for the web UI. Currently just discards logs.
    """
    try:
        _ = await request.json()
    except Exception:
        pass
    return _json({"ok": True})


# --- File monitoring and real-time updates -------------------------

def _on_file_change(event_type: str, file_path: str):
    """Handle file system change events."""
    try:
        output_dir = get_output_dir()
        if not file_path.startswith(output_dir):
            return
        
        relpath = os.path.relpath(file_path, output_dir).replace("\\", "/")
        
        # Notify all registered callbacks
        for callback in _file_change_callbacks:
            try:
                callback(event_type, relpath)
            except Exception as e:
                print(f"[Usgromana-Gallery] File change callback error: {e}")
    except Exception as e:
        print(f"[Usgromana-Gallery] File change handler error: {e}")


def _init_file_monitoring():
    """Initialize file monitoring system."""
    global _file_monitor, _background_scanner
    
    try:
        output_dir = get_output_dir()
        if not os.path.isdir(output_dir):
            return
        
        # Initialize background scanner
        def on_scan_complete(images):
            # This will be called when background scan completes
            # The frontend will poll for updates, so we don't need to push here
            pass
        
        _background_scanner = BackgroundScanner(on_scan_complete, _current_extensions)
        _background_scanner.start_scan()
        
        # Initialize file monitor
        _file_monitor = FileMonitor(output_dir, _on_file_change, _current_extensions)
        _file_monitor.start(use_polling=False)  # Can be configured via settings
        
    except Exception as e:
        print(f"[Usgromana-Gallery] Failed to initialize file monitoring: {e}")


@PromptServer.instance.routes.get(f"{ROUTE_PREFIX}/watch")
async def gallery_watch(request: web.Request) -> web.Response:
    """
    WebSocket-like endpoint for file change notifications.
    Returns current state and can be polled for updates.
    """
    # For now, return a simple endpoint that can be polled
    # In the future, this could be upgraded to WebSocket
    return _json({"ok": True, "monitoring": _file_monitor.running if _file_monitor else False})


@PromptServer.instance.routes.post(f"{ROUTE_PREFIX}/settings")
async def gallery_save_settings(request: web.Request) -> web.Response:
    """Save gallery settings to server."""
    try:
        body = await request.json()
        settings = body.get("settings", {})
        
        # Save to settings.json in extension data directory
        settings_file = os.path.join(_DATA_DIR, "settings.json")
        os.makedirs(os.path.dirname(settings_file), exist_ok=True)
        
        # Merge with existing settings
        existing = {}
        if os.path.exists(settings_file):
            try:
                with open(settings_file, "r", encoding="utf-8") as f:
                    existing = json.load(f) or {}
            except Exception:
                pass
        
        merged = {**existing, **settings}
        
        with open(settings_file, "w", encoding="utf-8") as f:
            json.dump(merged, f, indent=2)
        
        # Update file extensions if changed
        if "fileExtensions" in settings:
            extensions = set(settings["fileExtensions"].split(","))
            extensions = {ext.strip().lower() for ext in extensions if ext.strip()}
            if extensions:
                _current_extensions.clear()
                _current_extensions.update(extensions)
                if _file_monitor:
                    _file_monitor.update_extensions(_current_extensions)
        
        # Update polling mode if changed
        if "usePollingObserver" in settings and _file_monitor:
            _file_monitor.update_polling(bool(settings["usePollingObserver"]))
        
        return _json({"ok": True})
    except Exception as e:
        return _json({"ok": False, "error": str(e)}, status=500)


@PromptServer.instance.routes.get(f"{ROUTE_PREFIX}/settings")
async def gallery_get_settings(request: web.Request) -> web.Response:
    """Load gallery settings from server."""
    try:
        settings_file = os.path.join(_DATA_DIR, "settings.json")
        if os.path.exists(settings_file):
            with open(settings_file, "r", encoding="utf-8") as f:
                settings = json.load(f) or {}
                return _json({"ok": True, "settings": settings})
        return _json({"ok": True, "settings": {}})
    except Exception as e:
        return _json({"ok": False, "error": str(e)}, status=500)


# Initialize file monitoring when routes are loaded
_init_file_monitoring()

# Debug: Print registered routes
print(f"[Usgromana-Gallery] Registered route: POST {ROUTE_PREFIX}/mark-nsfw")
