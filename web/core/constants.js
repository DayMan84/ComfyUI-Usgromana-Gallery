// ComfyUI-Usgromana-Gallery/web/core/constants.js
// Centralized constants for the entire extension

export const API_BASE = "/usgromana-gallery";
export const ASSETS_BASE = `${API_BASE}/assets`;

// Asset paths
export const ASSETS = {
    LIGHT_LOGO: `${ASSETS_BASE}/light_logo_transparent.png`,
    DARK_LOGO: `${ASSETS_BASE}/dark_logo_transparent.png`,
    LIGHT_ICON: `${ASSETS_BASE}/light_icon.ico`,
    DARK_ICON: `${ASSETS_BASE}/dark_icon.ico`,
};

// API endpoints
export const API_ENDPOINTS = {
    LIST: `${API_BASE}/list`,
    IMAGE: `${API_BASE}/image`,
    META: `${API_BASE}/meta`,
    RATING: `${API_BASE}/rating`,
    RATINGS: `${API_BASE}/ratings`,
    LOG: `${API_BASE}/log`,
    SETTINGS: `${API_BASE}/settings`,
    WATCH: `${API_BASE}/watch`,
    UPLOAD: `${API_BASE}/upload`,
};

// Image file extensions
export const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"];

// Thumbnail settings
export const THUMBNAIL = {
    MAX_SIZE: 512,
    CACHE_DIR: "_thumbs",
};

// Performance settings
export const PERFORMANCE = {
    IMAGE_LIMIT: 400,
    HISTORY_MAX: 80,
    DEBOUNCE_DELAY: 300,
    ANCHOR_WATCH_INTERVAL: 1500,
    FILE_WATCH_POLL_INTERVAL: 2000, // Poll for file changes every 2 seconds
};

// Storage keys
export const STORAGE_KEYS = {
    SETTINGS: "usgromana.gallery.settings.v1",
};

