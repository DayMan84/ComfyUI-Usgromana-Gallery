// ComfyUI-Usgromana-Gallery/web/core/state.js

const state = {
    // Raw images as loaded from the backend (original order)
    images: [],

    // The current "view" of images in the grid (after filters/sorting)
    visibleImages: [],

    // Index into visibleImages
    selectedIndex: null,
};

const listeners = new Set();

/**
 * Subscribe to state changes.
 * Returns an unsubscribe function.
 */
export function subscribe(fn) {
    if (typeof fn !== "function") return () => {};

    listeners.add(fn);

    // Fire once immediately so consumers can render current state
    try {
        fn(state);
    } catch (err) {
        console.warn("[UsgromanaGallery] state listener error (initial):", err);
    }

    return () => {
        listeners.delete(fn);
    };
}

function notify() {
    for (const fn of listeners) {
        try {
            fn(state);
        } catch (err) {
            console.warn("[UsgromanaGallery] state listener error:", err);
        }
    }
}

/**
 * Replace the full images array (from backend).
 * This resets visibleImages to match, unless it already has content.
 */
export function setImages(images) {
    state.images = Array.isArray(images) ? images : [];

    // If we don't have a visible list yet, default it to the raw list
    if (!Array.isArray(state.visibleImages) || !state.visibleImages.length) {
        state.visibleImages = [...state.images];
    }

    // Clamp selected index
    const max = getImages().length;
    if (state.selectedIndex != null) {
        if (state.selectedIndex < 0 || state.selectedIndex >= max) {
            state.selectedIndex = null;
        }
    }

    notify();
}

/**
 * Set the current visible / filtered order.
 * NOTE: this does NOT notify subscribers – the caller usually just re-renders manually.
 */
export function setVisibleImages(images) {
    state.visibleImages = Array.isArray(images) ? images : [];

    // Clamp selected index into visible list
    const max = state.visibleImages.length;
    if (state.selectedIndex != null) {
        if (state.selectedIndex < 0 || state.selectedIndex >= max) {
            state.selectedIndex = null;
        }
    }
}

/**
 * Raw list as loaded from backend (unfiltered).
 */
export function getAllImagesRaw() {
    return state.images;
}

/**
 * The list the UI should use (filtered/sorted if present).
 */
export function getImages() {
    if (Array.isArray(state.visibleImages) && state.visibleImages.length) {
        return state.visibleImages;
    }
    return state.images;
}

/**
 * Backwards compat: old name still returns the current visible list.
 */
export function getFilteredImages() {
    return getImages();
}

/**
 * Update which image is currently selected in the grid.
 * Index is into the *visible* list.
 */
export function setSelectedIndex(index) {
    if (index == null) {
        state.selectedIndex = null;
    } else {
        const i = Number(index);
        if (!Number.isFinite(i)) {
            state.selectedIndex = null;
        } else {
            const max = getImages().length;
            state.selectedIndex = i >= 0 && i < max ? i : null;
        }
    }

    notify();
}

/**
 * Convenience helper for consumers that only care about the object.
 */
export function getSelectedImage() {
    const arr = getImages();
    if (state.selectedIndex == null) return null;
    if (state.selectedIndex < 0 || state.selectedIndex >= arr.length) return null;
    return arr[state.selectedIndex];
}
