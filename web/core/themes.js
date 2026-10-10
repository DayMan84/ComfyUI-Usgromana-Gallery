// ComfyUI-Usgromana-Gallery/web/core/themes.js
// Color theme definitions for the gallery

/**
 * Base color theme structure
 */
const createTheme = (name, label, colors) => ({
    name,
    label,
    ...colors,
});

/**
 * Theme ids the gallery still offers.
 * Light is the former Light Subtle palette under a new name.
 * lightSubtle is accepted as an alias so saved settings keep that look.
 * Removed ids (the old opaque Light, Dark High Contrast, Dark Subtle)
 * resolve to Dark. The old Light id is only remapped when the saved
 * record has no themeRevision, because the new Light reuses "light".
 */
export const THEME_REVISION = 2;

export const THEME_ORDER = [
    "dark",
    "darkBlue",
    "light",
    "midnight",
    "ocean",
    "forest",
    "rose",
    "sand",
];

const REMOVED_THEMES = new Set(["darkHighContrast", "darkSubtle"]);

/**
 * Dark, Dark Blue, and Light (formerly Light Subtle).
 * New themes follow the same shape.
 */
export const themes = {
    dark: createTheme("dark", "Dark", {
        lightSurface: false,
        overlayBackground: "rgba(0,0,0,0.20)",
        panelBackground: "rgba(3, 7, 18, 0.52)",
        panelBorder: "rgba(148,163,184,0.35)",
        panelShadow: "rgba(0,0,0,0.65)",

        headerBackground: "rgba(15,23,42,0.40)",
        headerBorder: "rgba(51,65,85,0.3)",

        textPrimary: "#e5e7eb",
        textSecondary: "#94a3b8",
        textTertiary: "#ddd",
        textMuted: "rgba(209,213,219,0.85)",

        buttonBackground: "rgba(15,23,42,0.8)",
        buttonBackgroundHover: "rgba(15,23,42,0.9)",
        buttonBorder: "rgba(148,163,184,0.55)",
        buttonText: "#e5e7eb",
        buttonActiveBackground: "rgba(180,180,255,0.18)",

        inputBackground: "rgba(15,23,42,0.38)",
        inputBorder: "rgba(148,163,184,0.35)",
        inputText: "#e5e7eb",

        cardBackground: "rgba(10,10,15,0.5)",
        cardHoverShadow: "rgba(0, 0, 0, 0.4)",
        cardBorder: "rgba(255,255,255,0.15)",

        scrollbarTrack: "rgba(10,10,15,0.10)",
        scrollbarThumb: "rgba(120,130,160,0.10)",

        dividerColor: "rgba(209,213,219,0.85)",
        dividerBorder: "rgba(148,163,184,0.30)",

        modalBackground: "rgba(27, 27, 27, 0.9)",
        modalBorder: "rgba(94, 94, 94, 0.20)",
        modalShadow: "rgba(0,0,0,0.89)",

        settingsBackground: "rgba(27, 27, 27, 0.9)",
        settingsBorder: "rgba(94, 94, 94, 0.20)",

        filterBackground: "rgba(15, 23, 42, 0.95)",
        filterBorder: "rgba(148,163,184,0.3)",

        dangerBorder: "rgba(220,38,38,0.6)",
        dangerBackground: "rgba(220,38,38,0.2)",
        dangerText: "#fca5a5",

        primaryBackground: "rgba(59,130,246,0.8)",
        primaryText: "#e5e7eb",

        logoGlow: "rgba(56,189,248,0.35)",
        logoTextShadow: "none",
    }),

    darkBlue: createTheme("darkBlue", "Dark Blue", {
        lightSurface: false,
        overlayBackground: "rgba(0,0,0,0.25)",
        panelBackground: "rgba(15, 23, 42, 0.88)",
        panelBorder: "rgba(59,130,246,0.40)",
        panelShadow: "rgba(0,0,0,0.70)",

        headerBackground: "rgba(30,41,59,0.45)",
        headerBorder: "rgba(59,130,246,0.30)",

        textPrimary: "#e0e7ff",
        textSecondary: "#a5b4fc",
        textTertiary: "#c7d2fe",
        textMuted: "rgba(224,231,255,0.85)",

        buttonBackground: "rgba(30,41,59,0.85)",
        buttonBackgroundHover: "rgba(30,41,59,0.95)",
        buttonBorder: "rgba(59,130,246,0.60)",
        buttonText: "#e0e7ff",
        buttonActiveBackground: "rgba(59,130,246,0.25)",

        inputBackground: "rgba(30,41,59,0.45)",
        inputBorder: "rgba(59,130,246,0.40)",
        inputText: "#e0e7ff",

        cardBackground: "rgba(15,23,42,0.60)",
        cardHoverShadow: "rgba(59,130,246,0.30)",
        cardBorder: "rgba(59,130,246,0.20)",

        scrollbarTrack: "rgba(15,23,42,0.15)",
        scrollbarThumb: "rgba(59,130,246,0.15)",

        dividerColor: "rgba(224,231,255,0.85)",
        dividerBorder: "rgba(59,130,246,0.35)",

        modalBackground: "rgba(15, 23, 42, 0.95)",
        modalBorder: "rgba(59,130,246,0.30)",
        modalShadow: "rgba(0,0,0,0.90)",

        settingsBackground: "rgba(15, 23, 42, 0.95)",
        settingsBorder: "rgba(59,130,246,0.30)",

        filterBackground: "rgba(30, 41, 59, 0.98)",
        filterBorder: "rgba(59,130,246,0.40)",

        dangerBorder: "rgba(220,38,38,0.7)",
        dangerBackground: "rgba(220,38,38,0.25)",
        dangerText: "#fca5a5",

        primaryBackground: "rgba(59,130,246,0.85)",
        primaryText: "#ffffff",

        logoGlow: "rgba(59,130,246,0.70)",
        logoTextShadow: "rgba(15,23,42,0.95)",
    }),

    light: createTheme("light", "Light", {
        // Former Light Subtle palette. The name changed; the colors did not.
        lightSurface: true,
        overlayBackground: "rgba(255,255,255,0.20)",
        panelBackground: "rgba(255, 255, 255, 0.75)",
        panelBorder: "rgba(148,163,184,0.30)",
        panelShadow: "rgba(0,0,0,0.20)",

        headerBackground: "rgba(248,250,252,0.40)",
        headerBorder: "rgba(203,213,225,0.25)",

        textPrimary: "#1e293b",
        textSecondary: "#475569",
        textTertiary: "#334155",
        textMuted: "rgba(30,41,59,0.75)",

        buttonBackground: "rgba(241,245,249,0.65)",
        buttonBackgroundHover: "rgba(226,232,240,0.75)",
        buttonBorder: "rgba(148,163,184,0.50)",
        buttonText: "#1e293b",
        buttonActiveBackground: "rgba(148,163,184,0.15)",

        inputBackground: "rgba(255,255,255,0.50)",
        inputBorder: "rgba(148,163,184,0.30)",
        inputText: "#1e293b",

        cardBackground: "rgba(255,255,255,0.60)",
        cardHoverShadow: "rgba(0, 0, 0, 0.12)",
        cardBorder: "rgba(0,0,0,0.15)",

        scrollbarTrack: "rgba(241,245,249,0.15)",
        scrollbarThumb: "rgba(148,163,184,0.15)",

        dividerColor: "rgba(30,41,59,0.75)",
        dividerBorder: "rgba(148,163,184,0.30)",

        modalBackground: "rgba(255, 255, 255, 0.90)",
        modalBorder: "rgba(148,163,184,0.25)",
        modalShadow: "rgba(0,0,0,0.25)",

        settingsBackground: "rgba(255, 255, 255, 0.90)",
        settingsBorder: "rgba(148,163,184,0.25)",

        filterBackground: "rgba(248,250,252, 0.90)",
        filterBorder: "rgba(148,163,184,0.30)",

        dangerBorder: "rgba(220,38,38,0.6)",
        dangerBackground: "rgba(254,226,226,0.6)",
        dangerText: "#dc2626",

        primaryBackground: "rgba(59,130,246,0.8)",
        primaryText: "#ffffff",

        logoGlow: "rgba(59,130,246,0.50)",
        logoTextShadow: "rgba(255,255,255,0.75)",
    }),

    midnight: createTheme("midnight", "Midnight", {
        lightSurface: false,
        overlayBackground: "rgba(0,0,0,0.45)",
        panelBackground: "rgba(12, 10, 24, 0.94)",
        panelBorder: "rgba(167,139,250,0.50)",
        panelShadow: "rgba(0,0,0,0.75)",

        headerBackground: "rgba(22, 16, 46, 0.72)",
        headerBorder: "rgba(167,139,250,0.32)",

        textPrimary: "#f5f3ff",
        textSecondary: "#c4b5fd",
        textTertiary: "#ddd6fe",
        textMuted: "rgba(237,233,254,0.88)",

        buttonBackground: "rgba(36, 28, 66, 0.94)",
        buttonBackgroundHover: "rgba(54, 42, 96, 0.98)",
        buttonBorder: "rgba(167,139,250,0.58)",
        buttonText: "#f5f3ff",
        buttonActiveBackground: "rgba(167,139,250,0.32)",

        inputBackground: "rgba(22, 16, 46, 0.78)",
        inputBorder: "rgba(167,139,250,0.42)",
        inputText: "#f5f3ff",

        cardBackground: "rgba(22, 16, 42, 0.82)",
        cardHoverShadow: "rgba(0,0,0,0.5)",
        cardBorder: "rgba(196,181,253,0.32)",

        scrollbarTrack: "rgba(22,16,42,0.25)",
        scrollbarThumb: "rgba(167,139,250,0.35)",

        dividerColor: "rgba(237,233,254,0.88)",
        dividerBorder: "rgba(167,139,250,0.38)",

        modalBackground: "rgba(14, 11, 28, 0.97)",
        modalBorder: "rgba(167,139,250,0.38)",
        modalShadow: "rgba(0,0,0,0.88)",

        settingsBackground: "rgba(14, 11, 28, 0.97)",
        settingsBorder: "rgba(167,139,250,0.38)",

        filterBackground: "rgba(22, 16, 46, 0.97)",
        filterBorder: "rgba(167,139,250,0.42)",

        dangerBorder: "rgba(251,113,133,0.75)",
        dangerBackground: "rgba(190,18,60,0.32)",
        dangerText: "#fecdd3",

        primaryBackground: "rgba(139,92,246,0.92)",
        primaryText: "#ffffff",

        logoGlow: "rgba(167,139,250,0.55)",
        logoTextShadow: "none",
    }),

    ocean: createTheme("ocean", "Ocean", {
        lightSurface: false,
        overlayBackground: "rgba(0,0,0,0.40)",
        panelBackground: "rgba(4, 30, 40, 0.94)",
        panelBorder: "rgba(34,211,238,0.48)",
        panelShadow: "rgba(0,0,0,0.72)",

        headerBackground: "rgba(8, 47, 62, 0.72)",
        headerBorder: "rgba(34,211,238,0.32)",

        textPrimary: "#ecfeff",
        textSecondary: "#a5f3fc",
        textTertiary: "#cffafe",
        textMuted: "rgba(236,254,255,0.86)",

        buttonBackground: "rgba(8, 51, 68, 0.94)",
        buttonBackgroundHover: "rgba(14, 72, 92, 0.98)",
        buttonBorder: "rgba(34,211,238,0.55)",
        buttonText: "#ecfeff",
        buttonActiveBackground: "rgba(34,211,238,0.28)",

        inputBackground: "rgba(8, 47, 62, 0.78)",
        inputBorder: "rgba(34,211,238,0.40)",
        inputText: "#ecfeff",

        cardBackground: "rgba(6, 42, 56, 0.82)",
        cardHoverShadow: "rgba(0,0,0,0.48)",
        cardBorder: "rgba(165,243,252,0.28)",

        scrollbarTrack: "rgba(6,42,56,0.25)",
        scrollbarThumb: "rgba(34,211,238,0.32)",

        dividerColor: "rgba(236,254,255,0.86)",
        dividerBorder: "rgba(34,211,238,0.36)",

        modalBackground: "rgba(4, 28, 38, 0.97)",
        modalBorder: "rgba(34,211,238,0.36)",
        modalShadow: "rgba(0,0,0,0.86)",

        settingsBackground: "rgba(4, 28, 38, 0.97)",
        settingsBorder: "rgba(34,211,238,0.36)",

        filterBackground: "rgba(8, 47, 62, 0.97)",
        filterBorder: "rgba(34,211,238,0.42)",

        dangerBorder: "rgba(251,113,133,0.75)",
        dangerBackground: "rgba(190,18,60,0.30)",
        dangerText: "#fecdd3",

        primaryBackground: "rgba(14,116,144,0.94)",
        primaryText: "#ffffff",

        logoGlow: "rgba(34,211,238,0.55)",
        logoTextShadow: "none",
    }),

    forest: createTheme("forest", "Forest", {
        lightSurface: false,
        overlayBackground: "rgba(0,0,0,0.40)",
        panelBackground: "rgba(8, 28, 18, 0.94)",
        panelBorder: "rgba(52,211,153,0.46)",
        panelShadow: "rgba(0,0,0,0.70)",

        headerBackground: "rgba(12, 42, 28, 0.72)",
        headerBorder: "rgba(52,211,153,0.32)",

        textPrimary: "#ecfdf5",
        textSecondary: "#a7f3d0",
        textTertiary: "#d1fae5",
        textMuted: "rgba(236,253,245,0.86)",

        buttonBackground: "rgba(14, 48, 32, 0.94)",
        buttonBackgroundHover: "rgba(20, 68, 46, 0.98)",
        buttonBorder: "rgba(52,211,153,0.52)",
        buttonText: "#ecfdf5",
        buttonActiveBackground: "rgba(52,211,153,0.28)",

        inputBackground: "rgba(12, 42, 28, 0.78)",
        inputBorder: "rgba(52,211,153,0.40)",
        inputText: "#ecfdf5",

        cardBackground: "rgba(10, 40, 26, 0.82)",
        cardHoverShadow: "rgba(0,0,0,0.46)",
        cardBorder: "rgba(167,243,208,0.28)",

        scrollbarTrack: "rgba(10,40,26,0.25)",
        scrollbarThumb: "rgba(52,211,153,0.32)",

        dividerColor: "rgba(236,253,245,0.86)",
        dividerBorder: "rgba(52,211,153,0.36)",

        modalBackground: "rgba(6, 26, 16, 0.97)",
        modalBorder: "rgba(52,211,153,0.36)",
        modalShadow: "rgba(0,0,0,0.86)",

        settingsBackground: "rgba(6, 26, 16, 0.97)",
        settingsBorder: "rgba(52,211,153,0.36)",

        filterBackground: "rgba(12, 42, 28, 0.97)",
        filterBorder: "rgba(52,211,153,0.42)",

        dangerBorder: "rgba(251,113,133,0.75)",
        dangerBackground: "rgba(190,18,60,0.30)",
        dangerText: "#fecdd3",

        primaryBackground: "rgba(4,120,87,0.94)",
        primaryText: "#ffffff",

        logoGlow: "rgba(52,211,153,0.5)",
        logoTextShadow: "none",
    }),

    rose: createTheme("rose", "Rose", {
        lightSurface: false,
        overlayBackground: "rgba(0,0,0,0.42)",
        panelBackground: "rgba(36, 8, 18, 0.94)",
        panelBorder: "rgba(251,113,133,0.48)",
        panelShadow: "rgba(0,0,0,0.72)",

        headerBackground: "rgba(58, 16, 30, 0.72)",
        headerBorder: "rgba(251,113,133,0.32)",

        textPrimary: "#fff1f2",
        textSecondary: "#fecdd3",
        textTertiary: "#ffe4e6",
        textMuted: "rgba(255,241,242,0.86)",

        buttonBackground: "rgba(68, 20, 36, 0.94)",
        buttonBackgroundHover: "rgba(92, 28, 48, 0.98)",
        buttonBorder: "rgba(251,113,133,0.55)",
        buttonText: "#fff1f2",
        buttonActiveBackground: "rgba(251,113,133,0.30)",

        inputBackground: "rgba(58, 16, 30, 0.78)",
        inputBorder: "rgba(251,113,133,0.40)",
        inputText: "#fff1f2",

        cardBackground: "rgba(48, 12, 24, 0.82)",
        cardHoverShadow: "rgba(0,0,0,0.48)",
        cardBorder: "rgba(254,205,211,0.30)",

        scrollbarTrack: "rgba(48,12,24,0.25)",
        scrollbarThumb: "rgba(251,113,133,0.32)",

        dividerColor: "rgba(255,241,242,0.86)",
        dividerBorder: "rgba(251,113,133,0.36)",

        modalBackground: "rgba(32, 8, 16, 0.97)",
        modalBorder: "rgba(251,113,133,0.36)",
        modalShadow: "rgba(0,0,0,0.86)",

        settingsBackground: "rgba(32, 8, 16, 0.97)",
        settingsBorder: "rgba(251,113,133,0.36)",

        filterBackground: "rgba(58, 16, 30, 0.97)",
        filterBorder: "rgba(251,113,133,0.42)",

        dangerBorder: "rgba(254,202,202,0.8)",
        dangerBackground: "rgba(159,18,57,0.38)",
        dangerText: "#ffe4e6",

        primaryBackground: "rgba(190,18,60,0.94)",
        primaryText: "#fff1f2",

        logoGlow: "rgba(251,113,133,0.5)",
        logoTextShadow: "none",
    }),

    sand: createTheme("sand", "Sand", {
        lightSurface: true,
        overlayBackground: "rgba(62,48,32,0.18)",
        panelBackground: "rgba(255, 248, 238, 0.96)",
        panelBorder: "rgba(146,112,72,0.48)",
        panelShadow: "rgba(62,40,16,0.25)",

        headerBackground: "rgba(246, 236, 220, 0.88)",
        headerBorder: "rgba(146,112,72,0.32)",

        textPrimary: "#2a2118",
        textSecondary: "#5c4a38",
        textTertiary: "#3f3226",
        textMuted: "rgba(42,33,24,0.82)",

        buttonBackground: "rgba(240, 226, 206, 0.96)",
        buttonBackgroundHover: "rgba(228, 208, 180, 0.98)",
        buttonBorder: "rgba(146,112,72,0.55)",
        buttonText: "#2a2118",
        buttonActiveBackground: "rgba(180,83,9,0.20)",

        inputBackground: "rgba(255, 252, 247, 0.9)",
        inputBorder: "rgba(146,112,72,0.42)",
        inputText: "#2a2118",

        cardBackground: "rgba(255, 252, 247, 0.88)",
        cardHoverShadow: "rgba(62,40,16,0.18)",
        cardBorder: "rgba(42,33,24,0.16)",

        scrollbarTrack: "rgba(240,226,206,0.45)",
        scrollbarThumb: "rgba(146,112,72,0.4)",

        dividerColor: "rgba(42,33,24,0.82)",
        dividerBorder: "rgba(146,112,72,0.38)",

        modalBackground: "rgba(255, 248, 238, 0.98)",
        modalBorder: "rgba(146,112,72,0.38)",
        modalShadow: "rgba(62,40,16,0.28)",

        settingsBackground: "rgba(255, 248, 238, 0.98)",
        settingsBorder: "rgba(146,112,72,0.38)",

        filterBackground: "rgba(255, 248, 238, 0.98)",
        filterBorder: "rgba(146,112,72,0.42)",

        dangerBorder: "rgba(185,28,28,0.75)",
        dangerBackground: "rgba(254,226,226,0.9)",
        dangerText: "#991b1b",

        primaryBackground: "rgba(180,83,9,0.94)",
        primaryText: "#fffaf3",

        logoGlow: "rgba(180,83,9,0.35)",
        logoTextShadow: "rgba(255,248,238,0.9)",
    }),
};

/**
 * Map a stored theme id onto a theme that still exists.
 * Pass the saved themeRevision. Missing or older revisions treat "light"
 * as the removed opaque Light theme.
 */
export function normalizeThemeId(themeName, revision = THEME_REVISION) {
    const name = typeof themeName === "string" ? themeName.trim() : "";
    if (name === "lightSubtle") return "light";
    const rev = Number(revision);
    const legacy = !Number.isFinite(rev) || rev < THEME_REVISION;
    if (legacy && name === "light") return "dark";
    if (REMOVED_THEMES.has(name)) return "dark";
    if (Object.prototype.hasOwnProperty.call(themes, name)) return name;
    return "dark";
}

/**
 * Get theme by name. Unknown and removed ids fall back to Dark.
 * lightSubtle resolves to Light.
 */
export function getTheme(themeName = "dark") {
    const id = normalizeThemeId(themeName, THEME_REVISION);
    return themes[id] || themes.dark;
}

/**
 * Get all available theme ids.
 */
export function getThemeNames() {
    return THEME_ORDER.slice();
}

/**
 * Ids and user-facing names, in menu order.
 */
export function themeChoices() {
    return THEME_ORDER.map((id) => ({ id, label: themes[id].label }));
}

/**
 * Light logo for light surfaces (Light and Sand).
 */
export function themeUsesLightLogo(themeOrName) {
    const theme = themeOrName && typeof themeOrName === "object"
        ? themeOrName
        : getTheme(themeOrName);
    return !!(theme && theme.lightSurface);
}

export function parseCssColor(color) {
    if (!color) return null;
    const text = String(color).trim();
    if (text[0] === "#") {
        let hex = text.slice(1);
        if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
        if (hex.length !== 6) return null;
        const value = parseInt(hex, 16);
        if (!Number.isFinite(value)) return null;
        return {
            r: (value >> 16) & 255,
            g: (value >> 8) & 255,
            b: value & 255,
            a: 1,
        };
    }
    const match = text.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i);
    if (!match) return null;
    return {
        r: Number(match[1]),
        g: Number(match[2]),
        b: Number(match[3]),
        a: match[4] == null ? 1 : Number(match[4]),
    };
}

export function colorWithAlpha(color, alpha) {
    const parsed = parseCssColor(color);
    if (!parsed) return color;
    const a = alpha == null ? parsed.a : alpha;
    return `rgba(${Math.round(parsed.r)}, ${Math.round(parsed.g)}, ${Math.round(parsed.b)}, ${a})`;
}

export function colorAlpha(color, fallback = 1) {
    const parsed = parseCssColor(color);
    if (!parsed || !Number.isFinite(parsed.a)) return fallback;
    return parsed.a;
}

function channelLuma(value) {
    const n = value / 255;
    return n <= 0.04045 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
}

function compositeOver(color, backdrop) {
    const fg = parseCssColor(color);
    const bg = parseCssColor(backdrop);
    if (!fg || !bg) return null;
    const a = fg.a;
    return {
        r: fg.r * a + bg.r * (1 - a),
        g: fg.g * a + bg.g * (1 - a),
        b: fg.b * a + bg.b * (1 - a),
        a: 1,
    };
}

function luminance(rgb) {
    return 0.2126 * channelLuma(rgb.r) + 0.7152 * channelLuma(rgb.g) + 0.0722 * channelLuma(rgb.b);
}

export function contrastRatio(foreground, background) {
    const fg = typeof foreground === "string" ? parseCssColor(foreground) : foreground;
    const bg = typeof background === "string" ? parseCssColor(background) : background;
    if (!fg || !bg) return 1;
    const lighter = Math.max(luminance(fg), luminance(bg));
    const darker = Math.min(luminance(fg), luminance(bg));
    return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Contrast of theme text against the surfaces it sits on.
 * Light themes are composited over a light page, dark themes over a dark page.
 */
export function themeContrastReport(theme) {
    const backdrop = theme.lightSurface ? "#f8fafc" : "#0b0f14";
    const panel = compositeOver(theme.panelBackground, backdrop);
    const button = compositeOver(theme.buttonBackground, backdrop);
    const input = compositeOver(theme.inputBackground, backdrop);
    const pairs = [
        ["text", theme.textPrimary, panel, 4.5],
        ["muted", theme.textSecondary, panel, 4.5],
        ["button", theme.buttonText, button, 4.5],
        ["input", theme.inputText, input, 4.5],
        ["danger", theme.dangerText, panel, 4.5],
    ];
    return pairs.map(([name, foreground, background, minimum]) => {
        const ratio = contrastRatio(foreground, background);
        return { name, ratio, minimum, ok: ratio >= minimum };
    });
}

/**
 * Apply theme to an element's style
 */
export function applyThemeStyles(element, theme, styleMap) {
    if (!element || !theme) return;

    const styles = {};
    for (const [cssProperty, themeKey] of Object.entries(styleMap)) {
        if (theme[themeKey]) {
            styles[cssProperty] = theme[themeKey];
        }
    }

    Object.assign(element.style, styles);
}
