// ComfyUI-Usgromana-Gallery/web/core/gallerySettings.js

import { STORAGE_KEYS } from "./constants.js";
import { galleryApi } from "./api.js";

const STORAGE_KEY = STORAGE_KEYS.SETTINGS;

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
    
    // File monitoring
    fileExtensions: ".png,.jpg,.jpeg,.webp,.gif,.bmp", // Comma-separated list
    usePollingObserver: false, // Use polling instead of native file watcher
    enableRealTimeUpdates: true, // Enable real-time file monitoring
    
    // Root gallery folder (empty = use default ComfyUI output directory)
    rootGalleryFolder: "", // Custom path to gallery root folder
};

let settings = loadSettingsFromStorage();
const listeners = new Set();

// Load server settings on init and merge with local
(async () => {
    try {
        const serverSettings = await galleryApi.getServerSettings();
        if (serverSettings && Object.keys(serverSettings).length > 0) {
            settings = { ...settings, ...serverSettings };
            saveSettingsToStorage(settings);
        }
    } catch (err) {
        // Server settings might not be available yet
    }
})();

export function getGallerySettings() {
    return settings;
}

export function updateGallerySettings(patch) {
    settings = { ...settings, ...patch };
    saveSettingsToStorage(settings);
    
    // Also save to server for persistence
    galleryApi.saveServerSettings(settings).catch(() => {
        // Silently fail if server isn't ready
    });

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
