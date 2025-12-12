// ComfyUI-Usgromana-Gallery/web/core/gallerySettings.js

const STORAGE_KEY = "usgromana.gallery.settings.v1";

const DEFAULT_SETTINGS = {
    masonryLayout: false,
    enableDrag: true,
    theme: "dark",          // "dark" | "light"
    showRatingInGrid: true,
    thumbSize: "md",        // "sm" | "md" | "lg"
    anchorToManagerBar: false,

    // Grouping / dividers
    showDividers: false,
    dividerMode: "none",    // "none" | "alpha" | "folder" | "day" | "month" | "year"
    dividerStyle: "timeline", // "timeline" | "pill" | "label" | "page" | "none"

    // Sorting / arranging
    arrangeBy: "none",      // "none" | "name" | "time" | "size" | "pixels"
    sortAscending: true,    // true = ascending, false = descending

    // Where to anchor the launch pill
    openButtonBoxQuery: ".actionbar-container .comfyui-button-group:nth-of-type(2)",
};

let settings = loadSettingsFromStorage();
const listeners = new Set();

export function getGallerySettings() {
    return settings;
}

export function updateGallerySettings(patch) {
    settings = { ...settings, ...patch };
    saveSettingsToStorage(settings);

    for (const fn of listeners) {
        try {
            fn(settings);
        } catch (err) {
            console.warn("[UsgromanaGallery] settings listener error:", err);
        }
    }
}

export function subscribeGallerySettings(fn) {
    listeners.add(fn);
    try {
        fn(settings);
    } catch (err) {
        console.warn("[UsgromanaGallery] settings listener error on subscribe:", err);
    }
    return () => listeners.delete(fn);
}

// -------------------------------------------------------------------
// Persistence helpers
// -------------------------------------------------------------------

function loadSettingsFromStorage() {
    if (typeof window === "undefined" || !window.localStorage) {
        return { ...DEFAULT_SETTINGS };
    }

    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return { ...DEFAULT_SETTINGS };

        const parsed = JSON.parse(raw);
        return { ...DEFAULT_SETTINGS, ...parsed };
    } catch (err) {
        console.warn("[UsgromanaGallery] Failed to load settings from storage:", err);
        return { ...DEFAULT_SETTINGS };
    }
}

function saveSettingsToStorage(current) {
    if (typeof window === "undefined" || !window.localStorage) return;

    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    } catch (err) {
        console.warn("[UsgromanaGallery] Failed to save settings to storage:", err);
    }
}
