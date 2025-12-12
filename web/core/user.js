// ComfyUI-Usgromana-Gallery/web/core/user.js

let cachedUser = undefined;
let userPromise = null;

export function fetchCurrentUser() {
    if (userPromise) return userPromise;

    userPromise = (async () => {
        try {
            const res = await fetch("/usgromana/api/me", {
                credentials: "same-origin",
            });
            if (!res.ok) {
                cachedUser = null;
                return null;
            }
            const data = await res.json();
            cachedUser = data;
            return data;
        } catch (err) {
            console.warn("[UsgromanaGallery] Failed to fetch /usgromana/api/me", err);
            cachedUser = null;
            return null;
        }
    })();

    return userPromise;
}

export function canEditMetadata(user) {
    if (!user) return false;

    // Your RBAC may expose these directly
    if (user.is_admin === true) return true;
    if (user.can_edit === true) return true;

    // Fallback: group-based admin
    if (Array.isArray(user.groups) && user.groups.includes("admin")) {
        return true;
    }

    return false;
}
