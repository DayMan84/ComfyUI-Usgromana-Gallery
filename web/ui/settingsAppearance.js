import { getThemeNames } from "../core/themes.js";
import { getGallerySettings, updateGallerySettings } from "../core/gallerySettings.js";
import {
    appearanceFields,
    contrastWarning,
    currentAppearance,
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
    return wrap;
}

export function openAppearanceSettings(anchor) {
    const stored = currentAppearance() || {};
    const appearance = stored.appearance || {
        windowOpacity: 0.85,
        panelOpacity: 0.92,
        menuOpacity: 0.85,
        colors: {},
    };
    const colors = { ...(appearance.colors || {}) };
    const content = document.createElement("div");
    const warning = document.createElement("div");
    warning.style.cssText = "color:var(--usg-danger,#fca5a5);font-size:12px;min-height:18px;margin-top:8px;";

    const themeLabel = document.createElement("div");
    themeLabel.textContent = "Base Theme";
    const themeSelect = document.createElement("select");
    themeSelect.style.cssText = "width:100%;margin:6px 0 12px;padding:6px;border-radius:8px;background:var(--usg-button-bg,#111);color:inherit;border:1px solid var(--usg-border,#455363);";
    const currentTheme = stored.theme || getGallerySettings().theme || "dark";
    getThemeNames().forEach((name) => {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        option.selected = name === currentTheme;
        themeSelect.appendChild(option);
    });

    const opacityTitle = document.createElement("div");
    opacityTitle.textContent = "Opacity";
    opacityTitle.style.marginTop = "8px";
    const draft = {
        theme: currentTheme,
        appearance: {
            windowOpacity: appearance.windowOpacity ?? 0.85,
            panelOpacity: appearance.panelOpacity ?? 0.92,
            menuOpacity: appearance.menuOpacity ?? 0.85,
            colors,
        },
    };
    const persist = async () => {
        warning.textContent = contrastWarning(draft.appearance.colors);
        try {
            await saveAppearance(draft);
            updateGallerySettings({ theme: draft.theme });
        } catch (err) {
            warning.textContent = err.message || "Could not save appearance.";
        }
    };

    themeSelect.onchange = () => {
        draft.theme = themeSelect.value;
        persist();
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
            await resetAppearance();
            menu.close();
        } catch (err) {
            warning.textContent = err.message || "Could not reset appearance.";
        }
    };

    content.append(
        themeLabel,
        themeSelect,
        opacityTitle,
        slider("Window", draft.appearance.windowOpacity, (value) => {
            draft.appearance.windowOpacity = value;
            persist();
        }),
        slider("Panels", draft.appearance.panelOpacity, (value) => {
            draft.appearance.panelOpacity = value;
            persist();
        }),
        slider("Menus", draft.appearance.menuOpacity, (value) => {
            draft.appearance.menuOpacity = value;
            persist();
        }),
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
