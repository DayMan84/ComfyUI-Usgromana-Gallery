// ComfyUI-Usgromana-Gallery/web/core/themes.js
// Color theme definitions for the gallery

/**
 * Base color theme structure
 */
const createTheme = (name, colors) => ({
    name,
    ...colors,
});

/**
 * Dark theme variants with different transparency levels
 */
export const themes = {
    dark: createTheme("dark", {
        // Overlay and backdrop
        overlayBackground: "rgba(0,0,0,0.20)",
        panelBackground: "rgba(3, 7, 18, 0.52)",
        panelBorder: "rgba(148,163,184,0.35)",
        panelShadow: "rgba(0,0,0,0.65)",
        
        // Header
        headerBackground: "rgba(15,23,42,0.40)",
        headerBorder: "rgba(51,65,85,0.3)",
        
        // Text colors
        textPrimary: "#e5e7eb",
        textSecondary: "#94a3b8",
        textTertiary: "#ddd",
        textMuted: "rgba(209,213,219,0.85)",
        
        // Buttons
        buttonBackground: "rgba(15,23,42,0.8)",
        buttonBackgroundHover: "rgba(15,23,42,0.9)",
        buttonBorder: "rgba(148,163,184,0.55)",
        buttonText: "#e5e7eb",
        buttonActiveBackground: "rgba(180,180,255,0.18)",
        
        // Input fields
        inputBackground: "rgba(15,23,42,0.38)",
        inputBorder: "rgba(148,163,184,0.35)",
        inputText: "#e5e7eb",
        
        // Cards and items
        cardBackground: "rgba(10,10,15,0.5)",
        cardHoverShadow: "rgba(0, 0, 0, 0.4)",
        cardBorder: "rgba(255,255,255,0.15)",
        
        // Scrollbar
        scrollbarTrack: "rgba(10,10,15,0.10)",
        scrollbarThumb: "rgba(120,130,160,0.10)",
        
        // Dividers
        dividerColor: "rgba(209,213,219,0.85)",
        dividerBorder: "rgba(148,163,184,0.30)",
        
        // Modals and dialogs
        modalBackground: "rgba(27, 27, 27, 0.9)",
        modalBorder: "rgba(94, 94, 94, 0.20)",
        modalShadow: "rgba(0,0,0,0.89)",
        
        // Settings modal
        settingsBackground: "rgba(27, 27, 27, 0.9)",
        settingsBorder: "rgba(94, 94, 94, 0.20)",
        
        // Filter panel
        filterBackground: "rgba(15, 23, 42, 0.95)",
        filterBorder: "rgba(148,163,184,0.3)",
        
        // Danger/Delete actions
        dangerBorder: "rgba(220,38,38,0.6)",
        dangerBackground: "rgba(220,38,38,0.2)",
        dangerText: "#fca5a5",
        
        // Primary actions
        primaryBackground: "rgba(59,130,246,0.8)",
        primaryText: "#e5e7eb",
        
        // Logo glow
        logoGlow: "rgba(56,189,248,0.35)",
        logoTextShadow: "none",
    }),
    
    darkHighContrast: createTheme("darkHighContrast", {
        // Higher opacity for better contrast
        overlayBackground: "rgba(0,0,0,0.40)",
        panelBackground: "rgba(3, 7, 18, 0.95)",
        panelBorder: "rgba(148,163,184,0.50)",
        panelShadow: "rgba(0,0,0,0.80)",
        
        headerBackground: "rgba(15,23,42,0.60)",
        headerBorder: "rgba(51,65,85,0.5)",
        
        textPrimary: "#ffffff",
        textSecondary: "#cbd5e1",
        textTertiary: "#f1f5f9",
        textMuted: "rgba(255,255,255,0.95)",
        
        buttonBackground: "rgba(15,23,42,0.95)",
        buttonBackgroundHover: "rgba(15,23,42,1.0)",
        buttonBorder: "rgba(148,163,184,0.70)",
        buttonText: "#ffffff",
        buttonActiveBackground: "rgba(180,180,255,0.30)",
        
        inputBackground: "rgba(15,23,42,0.60)",
        inputBorder: "rgba(148,163,184,0.50)",
        inputText: "#ffffff",
        
        cardBackground: "rgba(10,10,15,0.70)",
        cardHoverShadow: "rgba(0, 0, 0, 0.6)",
        cardBorder: "rgba(255,255,255,0.25)",
        
        scrollbarTrack: "rgba(10,10,15,0.20)",
        scrollbarThumb: "rgba(120,130,160,0.20)",
        
        dividerColor: "rgba(255,255,255,0.95)",
        dividerBorder: "rgba(148,163,184,0.50)",
        
        modalBackground: "rgba(27, 27, 27, 0.98)",
        modalBorder: "rgba(94, 94, 94, 0.40)",
        modalShadow: "rgba(0,0,0,0.95)",
        
        settingsBackground: "rgba(27, 27, 27, 0.98)",
        settingsBorder: "rgba(94, 94, 94, 0.40)",
        
        filterBackground: "rgba(15, 23, 42, 0.98)",
        filterBorder: "rgba(148,163,184,0.50)",
        
        dangerBorder: "rgba(220,38,38,0.8)",
        dangerBackground: "rgba(220,38,38,0.35)",
        dangerText: "#fca5a5",
        
        primaryBackground: "rgba(59,130,246,0.9)",
        primaryText: "#ffffff",
        
        logoGlow: "rgba(56,189,248,0.40)",
        logoTextShadow: "none",
    }),
    
    darkSubtle: createTheme("darkSubtle", {
        // Lower opacity for more transparency
        overlayBackground: "rgba(0,0,0,0.15)",
        panelBackground: "rgba(3, 7, 18, 0.70)",
        panelBorder: "rgba(148,163,184,0.25)",
        panelShadow: "rgba(0,0,0,0.50)",
        
        headerBackground: "rgba(15,23,42,0.35)",
        headerBorder: "rgba(51,65,85,0.25)",
        
        textPrimary: "#e5e7eb",
        textSecondary: "#94a3b8",
        textTertiary: "#ddd",
        textMuted: "rgba(209,213,219,0.75)",
        
        buttonBackground: "rgba(15,23,42,0.65)",
        buttonBackgroundHover: "rgba(15,23,42,0.75)",
        buttonBorder: "rgba(148,163,184,0.40)",
        buttonText: "#e5e7eb",
        buttonActiveBackground: "rgba(180,180,255,0.12)",
        
        inputBackground: "rgba(15,23,42,0.25)",
        inputBorder: "rgba(148,163,184,0.25)",
        inputText: "#e5e7eb",
        
        cardBackground: "rgba(10,10,15,0.35)",
        cardHoverShadow: "rgba(0, 0, 0, 0.3)",
        cardBorder: "rgba(255,255,255,0.10)",
        
        scrollbarTrack: "rgba(10,10,15,0.05)",
        scrollbarThumb: "rgba(120,130,160,0.05)",
        
        dividerColor: "rgba(209,213,219,0.75)",
        dividerBorder: "rgba(148,163,184,0.20)",
        
        modalBackground: "rgba(27, 27, 27, 0.80)",
        modalBorder: "rgba(94, 94, 94, 0.15)",
        modalShadow: "rgba(0,0,0,0.75)",
        
        settingsBackground: "rgba(27, 27, 27, 0.80)",
        settingsBorder: "rgba(94, 94, 94, 0.15)",
        
        filterBackground: "rgba(15, 23, 42, 0.85)",
        filterBorder: "rgba(148,163,184,0.20)",
        
        dangerBorder: "rgba(220,38,38,0.5)",
        dangerBackground: "rgba(220,38,38,0.15)",
        dangerText: "#fca5a5",
        
        primaryBackground: "rgba(59,130,246,0.7)",
        primaryText: "#e5e7eb",
        
        logoGlow: "rgba(56,189,248,0.25)",
        logoTextShadow: "none",
    }),
    
    light: createTheme("light", {
        // Light theme colors
        overlayBackground: "rgba(255,255,255,0.30)",
        panelBackground: "rgba(255, 255, 255, 0.95)",
        panelBorder: "rgba(148,163,184,0.40)",
        panelShadow: "rgba(0,0,0,0.25)",
        
        headerBackground: "rgba(248,250,252,0.50)",
        headerBorder: "rgba(203,213,225,0.30)",
        
        textPrimary: "#1e293b",
        textSecondary: "#475569",
        textTertiary: "#334155",
        textMuted: "rgba(30,41,59,0.85)",
        
        buttonBackground: "rgba(241,245,249,0.9)",
        buttonBackgroundHover: "rgba(226,232,240,0.95)",
        buttonBorder: "rgba(148,163,184,0.60)",
        buttonText: "#1e293b",
        buttonActiveBackground: "rgba(148,163,184,0.20)",
        
        inputBackground: "rgba(255,255,255,0.60)",
        inputBorder: "rgba(148,163,184,0.40)",
        inputText: "#1e293b",
        
        cardBackground: "rgba(255,255,255,0.70)",
        cardHoverShadow: "rgba(0, 0, 0, 0.15)",
        cardBorder: "rgba(0,0,0,0.20)",
        
        scrollbarTrack: "rgba(241,245,249,0.20)",
        scrollbarThumb: "rgba(148,163,184,0.20)",
        
        dividerColor: "rgba(30,41,59,0.85)",
        dividerBorder: "rgba(148,163,184,0.40)",
        
        modalBackground: "rgba(255, 255, 255, 0.98)",
        modalBorder: "rgba(148,163,184,0.30)",
        modalShadow: "rgba(0,0,0,0.30)",
        
        settingsBackground: "rgba(255, 255, 255, 0.98)",
        settingsBorder: "rgba(148,163,184,0.30)",
        
        filterBackground: "rgba(248,250,252, 0.98)",
        filterBorder: "rgba(148,163,184,0.40)",
        
        dangerBorder: "rgba(220,38,38,0.7)",
        dangerBackground: "rgba(254,226,226,0.8)",
        dangerText: "#dc2626",
        
        primaryBackground: "rgba(59,130,246,0.9)",
        primaryText: "#ffffff",
        
        logoGlow: "rgba(59,130,246,0.60)",
        logoTextShadow: "rgba(255,255,255,0.9)",
    }),
    
    lightSubtle: createTheme("lightSubtle", {
        // Light theme with more transparency
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
    
    darkBlue: createTheme("darkBlue", {
        // Dark theme with blue accent
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
};

/**
 * Get theme by name
 */
export function getTheme(themeName = "dark") {
    return themes[themeName] || themes.dark;
}

/**
 * Get all available theme names
 */
export function getThemeNames() {
    return Object.keys(themes);
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

