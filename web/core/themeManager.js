// ComfyUI-Usgromana-Gallery/web/core/themeManager.js
// Manages theme application across all UI components

import { getTheme } from "./themes.js";
import { getGallerySettings, subscribeGallerySettings } from "./gallerySettings.js";

let currentTheme = null;
let themeListeners = new Set();

/**
 * Apply theme to all UI components
 */
export function applyTheme(themeName = null) {
    const settings = getGallerySettings();
    const theme = getTheme(themeName || settings.theme || "dark");
    currentTheme = theme;
    
    // Notify all listeners
    for (const listener of themeListeners) {
        try {
            listener(theme);
        } catch (err) {
            console.warn("[UsgromanaGallery] Theme listener error:", err);
        }
    }
    
    // Also expose globally for components that need it
    if (typeof window !== "undefined") {
        window.USG_GALLERY_CURRENT_THEME = theme;
    }
}

/**
 * Get current theme
 */
export function getCurrentTheme() {
    if (!currentTheme) {
        const settings = getGallerySettings();
        currentTheme = getTheme(settings.theme || "dark");
    }
    return currentTheme;
}

/**
 * Subscribe to theme changes
 */
export function subscribeTheme(fn) {
    themeListeners.add(fn);
    // Immediately call with current theme
    if (currentTheme) {
        try {
            fn(currentTheme);
        } catch (err) {
            console.warn("[UsgromanaGallery] Theme listener error on subscribe:", err);
        }
    }
    return () => themeListeners.delete(fn);
}

/**
 * Initialize theme system
 */
export function initThemeSystem() {
    // Apply initial theme
    applyTheme();
    
    // Subscribe to settings changes to update theme
    subscribeGallerySettings((settings) => {
        if (settings.theme) {
            applyTheme(settings.theme);
        }
    });
    
    // Expose global function for theme updates
    if (typeof window !== "undefined") {
        window.USG_GALLERY_APPLY_THEME = applyTheme;
    }
}

