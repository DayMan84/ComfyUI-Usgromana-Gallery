// ComfyUI-Usgromana-Gallery/web/core/themeManager.js
// Manages theme application across all UI components

import { getGallerySettings, subscribeGallerySettings } from "./gallerySettings.js";
import { applyResolvedTheme, loadAppearance, subscribeAppearance } from "./appearance.js";
import { getTheme, normalizeThemeId, THEME_REVISION } from "./themes.js";

let currentTheme = null;
let themeListeners = new Set();

function publish(theme) {
    currentTheme = theme;
    for (const listener of themeListeners) {
        try {
            listener(theme);
        } catch (err) {
            console.warn("[UsgromanaGallery] Theme listener error:", err);
        }
    }
    if (typeof window !== "undefined") {
        window.USG_GALLERY_CURRENT_THEME = theme;
    }
}

/**
 * Apply theme to all UI components that are already on screen.
 * This paints the existing nodes. It does not rebuild the gallery.
 */
export function applyTheme(themeName = null) {
    const settings = getGallerySettings();
    const theme = applyResolvedTheme(themeName || settings.theme || "dark");
    publish(theme);
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
    subscribeAppearance((theme) => {
        publish(theme);
    });

    applyTheme();
    loadAppearance();

    const initial = getGallerySettings();
    let appliedId = normalizeThemeId(
        initial.theme || "dark",
        initial.themeRevision == null ? THEME_REVISION : initial.themeRevision
    );
    // Only a new base theme id repaints from settings. Opacity, custom
    // colors, and button scale must not come through here: those paint
    // themselves and a settings broadcast used to rebuild the gallery.
    subscribeGallerySettings((settings) => {
        const id = normalizeThemeId(
            settings.theme || "dark",
            settings.themeRevision == null ? THEME_REVISION : settings.themeRevision
        );
        if (id === appliedId) return;
        appliedId = id;
        applyTheme(id);
    });

    if (typeof window !== "undefined") {
        window.USG_GALLERY_APPLY_THEME = applyTheme;
    }
}
