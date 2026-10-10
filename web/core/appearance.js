/**
 * Theme overrides. The selected base theme stays in place.
 * Custom colors and opacity are applied on the existing UI, without
 * rebuilding the gallery window.
 */

import { getTheme, normalizeThemeId, THEME_REVISION, colorWithAlpha } from "./themes.js";
import { getGallerySettings } from "./gallerySettings.js";
import { getAppearance, setAppearance } from "./socialApi.js";

let overrides = null;
let revision = 0;
const listeners = new Set();

const COLOR_FIELDS = [
    ["accent", "Accent"],
    ["background", "Background"],
    ["panel", "Panel"],
    ["text", "Text"],
    ["textSecondary", "Muted Text"],
    ["border", "Border"],
    ["button", "Buttons"],
    ["danger", "Danger"],
    ["star", "Star rating"],
];

const MOTION_STYLE_ID = "usg-appearance-motion";

export function appearanceFields() {
    return COLOR_FIELDS;
}

function hexToRgb(hex) {
    const value = parseInt(String(hex).slice(1), 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function withAlpha(hex, alpha) {
    const [red, green, blue] = hexToRgb(hex);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function contrastRatio(foreground, background) {
    const channel = (hex, index) => {
        const value = hexToRgb(hex)[index] / 255;
        return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
    };
    const luminance = (hex) => 0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 1) + 0.0722 * channel(hex, 2);
    const lighter = Math.max(luminance(foreground), luminance(background));
    const darker = Math.min(luminance(foreground), luminance(background));
    return (lighter + 0.05) / (darker + 0.05);
}

export function contrastWarning(colors) {
    if (!colors || !colors.text || !colors.background) return "";
    const ratio = contrastRatio(colors.text, colors.panel || colors.background);
    if (ratio < 3) return "This text and background combination is hard to read. Reset is still available.";
    return "";
}

function ensureMotionStyles() {
    if (typeof document === "undefined") return;
    if (document.getElementById(MOTION_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = MOTION_STYLE_ID;
    style.textContent = `
.usg-gallery-panel,
.usg-gallery-panel button,
.usg-gallery-panel input,
.usg-gallery-panel select,
.usg-gallery-header,
.usg-gallery-title,
.usg-gallery-grid,
.usg-gallery-settings,
.usg-gallery-filters,
.usg-slideout,
#usg-gallery-image-menu,
#usg-gallery-launch-btn,
#usg-gallery-launch-btn img,
.usgromana-floating-button,
.usgromana-floating-button img,
.usgromana-radial-menu-button {
  transition-property: background-color, background, color, border-color, opacity, box-shadow, width, height, min-width, min-height, max-width, max-height, padding, font-size, gap, border-radius, filter;
  transition-duration: 180ms;
  transition-timing-function: ease;
}
.usg-gallery-panel {
  background: var(--usg-window) !important;
  color: var(--usg-text) !important;
  border-color: var(--usg-border) !important;
  box-shadow: 0 18px 55px var(--usg-shadow) !important;
}
.usg-gallery-header {
  background: var(--usg-header) !important;
  border-bottom-color: var(--usg-divider) !important;
}
.usg-gallery-title {
  color: var(--usg-text) !important;
}
.usg-gallery-settings,
.usg-gallery-filters {
  background: var(--usg-settings, var(--usg-panel)) !important;
  color: var(--usg-text) !important;
  border-color: var(--usg-border) !important;
}
.usg-gallery-panel .usg-ink { color: var(--usg-text) !important; }
.usg-gallery-panel .usg-ink-muted { color: var(--usg-text-secondary) !important; }
@media (prefers-reduced-motion: reduce) {
  .usg-gallery-panel,
  .usg-gallery-panel button,
  .usg-gallery-panel input,
  .usg-gallery-panel select,
  .usg-gallery-header,
  .usg-gallery-title,
  .usg-gallery-grid,
  .usg-gallery-settings,
  .usg-gallery-filters,
  .usg-slideout,
  #usg-gallery-image-menu,
  #usg-gallery-launch-btn,
  #usg-gallery-launch-btn img,
  .usgromana-floating-button,
  .usgromana-floating-button img,
  .usgromana-radial-menu-button {
    transition: none !important;
  }
}
`;
    document.head.appendChild(style);
}

function resolveAppearance(base, appearance) {
    const theme = { ...base };
    const colors = (appearance && appearance.colors) || {};
    const windowOpacity = appearance && appearance.windowOpacity != null ? appearance.windowOpacity : null;
    const panelOpacity = appearance && appearance.panelOpacity != null ? appearance.panelOpacity : null;
    const menuOpacity = appearance && appearance.menuOpacity != null ? appearance.menuOpacity : null;

    if (colors.text) {
        theme.textPrimary = colors.text;
        theme.textTertiary = colors.text;
        theme.buttonText = colors.text;
        theme.inputText = colors.text;
        theme.primaryText = colors.text;
        theme.dividerColor = colors.text;
    }
    if (colors.textSecondary) {
        theme.textSecondary = colors.textSecondary;
        theme.textMuted = colors.textSecondary;
    }
    if (colors.border) {
        theme.panelBorder = colors.border;
        theme.headerBorder = colors.border;
        theme.buttonBorder = colors.border;
        theme.inputBorder = colors.border;
        theme.cardBorder = colors.border;
        theme.dividerBorder = colors.border;
        theme.filterBorder = colors.border;
        theme.settingsBorder = colors.border;
        theme.modalBorder = colors.border;
    }
    if (colors.button) {
        theme.buttonBackground = colors.button;
        theme.buttonBackgroundHover = colors.button;
    }
    if (colors.accent) {
        theme.buttonActiveBackground = colorWithAlpha(colors.accent, 0.28);
        theme.primaryBackground = colors.accent;
        theme.logoGlow = colorWithAlpha(colors.accent, 0.45);
    }
    if (colors.danger) {
        theme.dangerText = colors.danger;
        theme.dangerBorder = colors.danger;
    }
    if (colors.star) theme.star = colors.star;

    if (appearance && (colors.background || windowOpacity != null)) {
        const source = colors.background || theme.panelBackground;
        theme.panelBackground = windowOpacity != null ? colorWithAlpha(source, windowOpacity) : source;
    }
    if (appearance && (colors.panel || panelOpacity != null)) {
        const source = colors.panel || theme.cardBackground;
        const painted = panelOpacity != null ? colorWithAlpha(source, panelOpacity) : source;
        theme.cardBackground = painted;
        theme.modalBackground = painted;
        theme.settingsBackground = painted;
        theme.filterBackground = painted;
        const headerSource = colors.panel || theme.headerBackground;
        theme.headerBackground = panelOpacity != null ? colorWithAlpha(headerSource, panelOpacity) : headerSource;
    }
    const menuSource = (appearance && (colors.panel || colors.background)) || theme.settingsBackground || theme.modalBackground;
    theme.menuBackground = appearance && menuOpacity != null
        ? colorWithAlpha(menuSource, menuOpacity)
        : menuSource;
    return theme;
}

function applyTokens(theme) {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    ensureMotionStyles();
    const set = (name, value) => {
        if (value != null && value !== "") root.style.setProperty(name, String(value));
    };
    set("--usg-bg", theme.panelBackground);
    set("--usg-window", theme.panelBackground);
    set("--usg-surface", theme.cardBackground);
    set("--usg-panel", theme.menuBackground || theme.settingsBackground);
    set("--usg-settings", theme.settingsBackground);
    set("--usg-header", theme.headerBackground);
    set("--usg-text", theme.textPrimary);
    set("--usg-text-secondary", theme.textSecondary);
    set("--usg-text-muted", theme.textMuted || theme.textSecondary);
    set("--usg-button-text", theme.buttonText);
    set("--usg-accent", theme.primaryBackground);
    set("--usg-accent-hover", theme.buttonActiveBackground);
    set("--usg-border", theme.panelBorder);
    set("--usg-divider", theme.headerBorder);
    set("--usg-button-bg", theme.buttonBackground);
    set("--usg-button-hover", theme.buttonBackgroundHover);
    set("--usg-danger", theme.dangerText);
    set("--usg-star", theme.star || "#ffd86b");
    set("--usg-shadow", theme.panelShadow);
    set("--usg-overlay", theme.menuBackground || theme.settingsBackground);
    if (theme.name) root.dataset.usgTheme = theme.name;
}

export function applyResolvedTheme(themeName) {
    const settings = getGallerySettings();
    const requested = themeName || (overrides && overrides.theme) || settings.theme || "dark";
    const id = normalizeThemeId(requested, THEME_REVISION);
    const base = getTheme(id);
    const theme = resolveAppearance(base, overrides && overrides.appearance);
    applyTokens(theme);
    return theme;
}

function pack(next) {
    if (!next || typeof next !== "object") return null;
    const theme = typeof next.theme === "string" && next.theme.trim()
        ? normalizeThemeId(next.theme, THEME_REVISION)
        : null;
    const source = next.appearance && typeof next.appearance === "object" ? next.appearance : null;
    let appearance = null;
    if (source) {
        appearance = { colors: { ...(source.colors || {}) } };
        ["windowOpacity", "panelOpacity", "menuOpacity"].forEach((key) => {
            if (source[key] != null) appearance[key] = source[key];
        });
    }
    if (!theme && !appearance) return null;
    return { theme, themeRevision: THEME_REVISION, appearance };
}

export function appearanceFromPayload(stored) {
    if (!stored || typeof stored !== "object") return null;
    const theme = typeof stored.theme === "string" ? stored.theme.trim() : "";
    const appearance = stored.appearance && typeof stored.appearance === "object" ? stored.appearance : null;
    if (!theme && !appearance) return null;
    const rev = stored.themeRevision == null ? 1 : Number(stored.themeRevision) || 1;
    return {
        theme: theme ? normalizeThemeId(theme, rev) : null,
        themeRevision: THEME_REVISION,
        appearance,
    };
}

function emit() {
    const theme = applyResolvedTheme();
    for (const fn of listeners) {
        try {
            fn(theme);
        } catch (err) {
            console.warn("[UsgromanaGallery] Appearance listener error:", err);
        }
    }
    return theme;
}

export function subscribeAppearance(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

/**
 * Paint appearance on the current theme immediately. Does not save.
 */
export function previewAppearance(next) {
    revision += 1;
    overrides = pack(next);
    return emit();
}

export async function loadAppearance() {
    const token = revision;
    try {
        const stored = await getAppearance();
        if (token !== revision) return overrides;
        overrides = appearanceFromPayload(stored);
    } catch (err) {
        if (token !== revision) return overrides;
        overrides = null;
    }
    emit();
    return overrides;
}

export async function saveAppearance(next) {
    const token = revision;
    const payload = pack(next);
    const saved = await setAppearance({
        theme: payload && payload.theme,
        themeRevision: THEME_REVISION,
        appearance: payload && payload.appearance,
    });
    if (token !== revision) return overrides;
    const packed = appearanceFromPayload(saved);
    if (packed) overrides = packed;
    emit();
    return overrides;
}

export async function resetAppearance() {
    revision += 1;
    await setAppearance({ reset: true });
    overrides = null;
    emit();
}

export function currentAppearance() {
    return overrides;
}
