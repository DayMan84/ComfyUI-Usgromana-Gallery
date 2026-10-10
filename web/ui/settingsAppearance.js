import { colorAlpha, getTheme, normalizeThemeId, themeChoices, THEME_REVISION } from "../core/themes.js";
import { getGallerySettings, updateGallerySettings } from "../core/gallerySettings.js";
import {
    appearanceFields,
    contrastWarning,
    currentAppearance,
    previewAppearance,
    resetAppearance,
    saveAppearance,
} from "../core/appearance.js";
import { createSlideoutMenu } from "./slideoutMenu.js";

function slider(label, value, onInput) {
    const wrap = document.createElement("label");
    wrap.style.cssText = "display:block;margin:8px 0;";
    const title = document.createElement("div");
    title.textContent = label;
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:8px;";
    const input = document.createElement("input");
    input.type = "range";
    input.min = "20";
    input.max = "100";
    input.value = String(Math.round(value * 100));
    input.style.flex = "1";
    const readout = document.createElement("span");
    readout.textContent = `${input.value}%`;
    input.oninput = () => {
        readout.textContent = `${input.value}%`;
        onInput(Number(input.value) / 100);
    };
    row.append(input, readout);
    wrap.append(title, row);
    wrap.setValue = (next) => {
        input.value = String(Math.round(Number(next) * 100));
        readout.textContent = `${input.value}%`;
    };
    return wrap;
}

export function openAppearanceSettings(anchor) {
    const stored = currentAppearance() || {};
    const settings = getGallerySettings();
    const currentTheme = normalizeThemeId(
        stored.theme || settings.theme || "dark",
        stored.themeRevision == null ? settings.themeRevision : stored.themeRevision
    );
    const baseTheme = getTheme(currentTheme);
    const appearance = stored.appearance || {};
    const colors = { ...(appearance.colors || {}) };
    const content = document.createElement("div");
    const warning = document.createElement("div");
    warning.style.cssText = "color:var(--usg-danger,#fca5a5);font-size:12px;min-height:18px;margin-top:8px;";

    const themeLabel = document.createElement("div");
    themeLabel.textContent = "Base Theme";
    const themeSelect = document.createElement("select");
    themeSelect.style.cssText = "width:100%;margin:6px 0 12px;padding:6px;border-radius:8px;background:var(--usg-button-bg,#111);color:inherit;border:1px solid var(--usg-border,#455363);";
    themeChoices().forEach((choice) => {
        const option = document.createElement("option");
        option.value = choice.id;
        option.textContent = choice.label;
        option.selected = choice.id === currentTheme;
        themeSelect.appendChild(option);
    });

    const opacityTitle = document.createElement("div");
    opacityTitle.textContent = "Opacity";
    opacityTitle.style.marginTop = "8px";
    const shownOpacity = {
        windowOpacity: appearance.windowOpacity ?? colorAlpha(baseTheme.panelBackground, 0.85),
        panelOpacity: appearance.panelOpacity ?? colorAlpha(baseTheme.cardBackground, 0.92),
        menuOpacity: appearance.menuOpacity ?? colorAlpha(baseTheme.settingsBackground, 0.85),
    };
    const draft = {
        theme: currentTheme,
        themeRevision: THEME_REVISION,
        appearance: {
            windowOpacity: appearance.windowOpacity ?? null,
            panelOpacity: appearance.panelOpacity ?? null,
            menuOpacity: appearance.menuOpacity ?? null,
            colors,
        },
    };
    let persistTimer = null;
    let persistGeneration = 0;
    // Paint first. Saving is debounced and must not rebuild the gallery.
    const applyLive = () => {
        warning.textContent = contrastWarning(draft.appearance.colors);
        previewAppearance(draft);
    };
    const persist = () => {
        const generation = ++persistGeneration;
        clearTimeout(persistTimer);
        persistTimer = setTimeout(async () => {
            try {
                await saveAppearance(draft);
                if (generation !== persistGeneration) return;
                if (getGallerySettings().theme !== draft.theme) {
                    updateGallerySettings({ theme: draft.theme, themeRevision: THEME_REVISION });
                }
            } catch (err) {
                if (generation === persistGeneration) {
                    warning.textContent = err.message || "Could not save appearance.";
                }
            }
        }, 200);
    };

    const colorTitle = document.createElement("div");
    colorTitle.textContent = "Colors";
    colorTitle.style.marginTop = "12px";
    const colorList = document.createElement("div");
    appearanceFields().forEach(([key, label]) => {
        const row = document.createElement("label");
        row.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;margin:6px 0;";
        const name = document.createElement("span");
        name.textContent = label;
        const input = document.createElement("input");
        input.type = "color";
        input.value = colors[key] || "#808080";
        input.setAttribute("aria-label", label);
        input.oninput = () => {
            colors[key] = input.value;
            applyLive();
            persist();
        };
        row.append(name, input);
        colorList.appendChild(row);
    });

    const reset = document.createElement("button");
    reset.type = "button";
    reset.textContent = "Reset Customizations";
    reset.style.cssText = "margin-top:14px;width:100%;padding:8px;border-radius:8px;cursor:pointer;background:var(--usg-button-bg,#263747);color:var(--usg-text,#fff);border:2px solid var(--usg-text,#fff);";
    reset.onclick = async () => {
        try {
            clearTimeout(persistTimer);
            persistGeneration += 1;
            await resetAppearance();
            menu.close();
        } catch (err) {
            warning.textContent = err.message || "Could not reset appearance.";
        }
    };

    const windowSlider = slider("Window", shownOpacity.windowOpacity, (value) => {
        draft.appearance.windowOpacity = value;
        applyLive();
        persist();
    });
    const panelSlider = slider("Panels", shownOpacity.panelOpacity, (value) => {
        draft.appearance.panelOpacity = value;
        applyLive();
        persist();
    });
    const menuSlider = slider("Menus", shownOpacity.menuOpacity, (value) => {
        draft.appearance.menuOpacity = value;
        applyLive();
        persist();
    });
    themeSelect.onchange = () => {
        draft.theme = themeSelect.value;
        const next = getTheme(draft.theme);
        if (draft.appearance.windowOpacity == null) {
            windowSlider.setValue(colorAlpha(next.panelBackground, 0.85));
        }
        if (draft.appearance.panelOpacity == null) {
            panelSlider.setValue(colorAlpha(next.cardBackground, 0.92));
        }
        if (draft.appearance.menuOpacity == null) {
            menuSlider.setValue(colorAlpha(next.settingsBackground, 0.85));
        }
        applyLive();
        updateGallerySettings({ theme: draft.theme, themeRevision: THEME_REVISION });
        persist();
    };

    content.append(
        themeLabel,
        themeSelect,
        opacityTitle,
        windowSlider,
        panelSlider,
        menuSlider,
        colorTitle,
        colorList,
        warning,
        reset,
    );
    const menu = createSlideoutMenu({
        anchor,
        title: "Appearance",
        width: 320,
        maxHeight: 520,
        content,
    });
    return menu;
}
