/**
 * Theme overrides. The selected base theme stays in place.
 * Custom colors and opacity are applied after it, per account.
 */

import { getTheme } from "./themes.js";
import { getGallerySettings } from "./gallerySettings.js";
import { getAppearance, setAppearance } from "./socialApi.js";

let overrides = null;

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

function applyTokens(theme, appearance) {
    const root = document.documentElement;
    const colors = (appearance && appearance.colors) || {};
    const windowOpacity = appearance && appearance.windowOpacity != null ? appearance.windowOpacity : 0.85;
    const panelOpacity = appearance && appearance.panelOpacity != null ? appearance.panelOpacity : 0.92;
    const menuOpacity = appearance && appearance.menuOpacity != null ? appearance.menuOpacity : 0.85;
    const background = colors.background || "#10141b";
    const panel = colors.panel || "#17202b";
    root.style.setProperty("--usg-bg", colors.background ? withAlpha(background, windowOpacity) : (theme.panelBackground || withAlpha(background, windowOpacity)));
    root.style.setProperty("--usg-surface", colors.panel ? withAlpha(panel, panelOpacity) : (theme.cardBackground || theme.panelBackground));
    root.style.setProperty("--usg-panel", colors.panel ? withAlpha(panel, panelOpacity) : (theme.modalBackground || theme.settingsBackground || "rgba(15,23,42,0.94)"));
    root.style.setProperty("--usg-text", colors.text || theme.textPrimary || "#e5e7eb");
    root.style.setProperty("--usg-text-secondary", colors.textSecondary || theme.textSecondary || "#94a3b8");
    root.style.setProperty("--usg-text-muted", colors.textSecondary || theme.textMuted || "#94a3b8");
    root.style.setProperty("--usg-accent", colors.accent || "#42a5f5");
    root.style.setProperty("--usg-accent-hover", colors.accent || theme.buttonActiveBackground || "rgba(56,189,248,0.2)");
    root.style.setProperty("--usg-border", colors.border || theme.panelBorder || theme.buttonBorder || "rgba(148,163,184,0.4)");
    root.style.setProperty("--usg-divider", colors.border || theme.headerBorder || "rgba(148,163,184,0.3)");
    root.style.setProperty("--usg-button-bg", colors.button || theme.buttonBackground || "#263747");
    root.style.setProperty("--usg-button-hover", colors.button || theme.buttonBackgroundHover || "#334155");
    root.style.setProperty("--usg-danger", colors.danger || theme.dangerText || "#fca5a5");
    root.style.setProperty("--usg-star", colors.star || "#ffd86b");
    root.style.setProperty("--usg-window-opacity", String(windowOpacity));
    root.style.setProperty("--usg-panel-opacity", String(panelOpacity));
    root.style.setProperty("--usg-menu-opacity", String(menuOpacity));
    const menu = colors.panel ? withAlpha(panel, menuOpacity) : root.style.getPropertyValue("--usg-panel");
    root.style.setProperty("--usg-overlay", menu);
    document.querySelectorAll(".usg-gallery-panel, .usg-slideout, #usg-gallery-image-menu").forEach((node) => {
        if (colors.background) node.style.background = withAlpha(background, windowOpacity);
        if (colors.text) node.style.color = colors.text;
    });
}

export function applyResolvedTheme(themeName) {
    const settings = getGallerySettings();
    const theme = themeName || (overrides && overrides.theme) || settings.theme || "dark";
    const base = getTheme(theme);
    applyTokens(base, overrides && overrides.appearance);
    return base;
}

export async function loadAppearance() {
    try {
        const stored = await getAppearance();
        overrides = stored && stored.appearance ? stored : null;
        if (stored && stored.theme) overrides = { ...(overrides || {}), theme: stored.theme, appearance: stored.appearance };
    } catch (err) {
        overrides = null;
    }
    applyResolvedTheme();
    return overrides;
}

export async function saveAppearance(next) {
    const saved = await setAppearance(next);
    overrides = saved.appearance || saved.theme ? { theme: saved.theme, appearance: saved.appearance } : null;
    applyResolvedTheme(saved.theme);
    return overrides;
}

export async function resetAppearance() {
    await setAppearance({ reset: true });
    overrides = null;
    applyResolvedTheme();
}

export function currentAppearance() {
    return overrides;
}
