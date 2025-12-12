// ComfyUI-Usgromana-Gallery/web/ui/overlay.js

import { initGrid, clearGridThumbnails } from "./grid.js";
import { initDetails, hideDetails } from "./details.js"; 
import {
    getGallerySettings,
    updateGallerySettings,
    subscribeGallerySettings,
} from "../core/gallerySettings.js";

const GALLERY_ASSETS_BASE = "/usgromana-gallery/assets";
const LIGHT_LOGO = `${GALLERY_ASSETS_BASE}/light_logo_transparent.png`;
const DARK_LOGO  = `${GALLERY_ASSETS_BASE}/dark_logo_transparent.png`;

let overlayEl = null;
let gridRootEl = null;
let initialized = false;
let settingsModalEl = null;

// Floating filter panel
let filterPanelEl = null;
let lastInlineDividerStyle = "timeline";

// -------------------------------------------------------------------
// Overlay creation
// -------------------------------------------------------------------

function ensureOverlay() {
    if (initialized && overlayEl) return overlayEl;

    overlayEl = document.createElement("div");
    overlayEl.className = "usg-gallery-overlay";
    Object.assign(overlayEl.style, {
        position: "fixed",
        inset: "0",
        zIndex: "10000",
        background: "rgba(0,0,0,0.20)",
        display: "none",
        justifyContent: "center",
        alignItems: "center",
    });

    const panel = document.createElement("div");
    panel.className = "usg-gallery-panel";
    Object.assign(panel.style, {
        width: "90vw",
        height: "90vh",
        maxWidth: "1200px",
        maxHeight: "800px",
        background: "rgba(3, 7, 18, 0.82)",
        borderRadius: "16px",
        border: "1px solid rgba(148,163,184,0.35)",
        boxShadow: "0 18px 55px rgba(0,0,0,0.65)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        color: "#e5e7eb",
        fontFamily:
            "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    });

    // ---------------------------------------------------------------
    // Header
    // ---------------------------------------------------------------
    const header = document.createElement("div");
    Object.assign(header.style, {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 12px 6px",
        borderBottom: "1px solid rgba(51,65,85,0.7)",
        background: "rgba(15,23,42,0.78)",
        backdropFilter: "blur(6px)",
    });

    const leftHeader = document.createElement("div");
    Object.assign(leftHeader.style, {
        display: "flex",
        alignItems: "center",
        gap: "8px",
    });

    const logoImg = document.createElement("img");
    logoImg.alt = "Usgromana Gallery Pro";
    logoImg.src = DARK_LOGO;
    Object.assign(logoImg.style, {
        height: "18px",
        width: "auto",
        filter: "drop-shadow(0 0 6px rgba(56,189,248,0.55))",
    });

    const titleEl = document.createElement("div");
    titleEl.textContent = "USGROMANA GALLERY PRO";
    Object.assign(titleEl.style, {
        fontSize: "13px",
        fontWeight: "600",
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: "#e5e7eb",
        textShadow: "0 0 4px rgba(15,23,42,0.9)",
    });

    leftHeader.appendChild(logoImg);
    leftHeader.appendChild(titleEl);

    const rightHeader = document.createElement("div");
    Object.assign(rightHeader.style, {
        display: "flex",
        alignItems: "center",
        gap: "6px",
    });

    // Settings button
    const settingsButton = document.createElement("button");
    settingsButton.title = "Gallery settings";
    Object.assign(settingsButton.style, {
        borderRadius: "999px",
        border: "1px solid rgba(148,163,184,0.55)",
        padding: "4px 10px",
        fontSize: "11px",
        cursor: "pointer",
        background: "rgba(15,23,42,0.8)",
        color: "#e5e7eb",
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
    });
    settingsButton.innerHTML = `<span>Settings</span><span style="font-size:10px;">▾</span>`;
    settingsButton.onclick = () => openSettingsModal(panel);
    rightHeader.appendChild(settingsButton);

    // Close button
    const closeButton = document.createElement("button");
    closeButton.textContent = "✕";
    Object.assign(closeButton.style, {
        borderRadius: "999px",
        border: "1px solid rgba(148,163,184,0.45)",
        width: "22px",
        height: "22px",
        fontSize: "11px",
        cursor: "pointer",
        background: "rgba(15,23,42,0.85)",
        color: "#e5e7eb",
    });
    
    closeButton.onclick = () => {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/6712329c-12ed-47b3-85f9-78457616d544',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'overlay.js:146',message:'Overlay closing - cleanup start',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
        // Hide overlay
        overlayEl.style.display = "none";
        // Close the floating filter panel
        closeFilterPanel();
        // Wipe all grid thumbnails + DOM to free memory
        clearGridThumbnails();
        // Also close the big details overlay if it is open
        hideDetails();
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/6712329c-12ed-47b3-85f9-78457616d544',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'overlay.js:155',message:'Overlay closed - cleanup complete',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
    };

    rightHeader.appendChild(closeButton);

    header.appendChild(leftHeader);
    header.appendChild(rightHeader);

    // ---------------------------------------------------------------
    // Content – single full-width grid
    // ---------------------------------------------------------------
    const content = document.createElement("div");
    Object.assign(content.style, {
        flex: "1",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
    });

    gridRootEl = document.createElement("div");
    Object.assign(gridRootEl.style, {
        padding: "10px",
        display: "flex",
        flexDirection: "column",
        minWidth: "0",
        minHeight: "0",
    });

    content.appendChild(gridRootEl);

    panel.appendChild(header);
    panel.appendChild(content);
    overlayEl.appendChild(panel);

    document.body.appendChild(overlayEl);
    ensureOverlayStyles();

    // Init grid + details
    initGrid(gridRootEl);
    initDetails(null); // details attaches its own modal

    // Theme/logo + remember last inline divider style
    subscribeGallerySettings((s) => {
        logoImg.src = s.theme === "light" ? LIGHT_LOGO : DARK_LOGO;
        if (s.dividerStyle && s.dividerStyle !== "page") {
            lastInlineDividerStyle = s.dividerStyle;
        }
    });

    initialized = true;
    return overlayEl;
}

// -------------------------------------------------------------------
// Public API (entry.js)
// -------------------------------------------------------------------

export function createOverlay() {
    return ensureOverlay();
}

export function showOverlay() {
    const el = ensureOverlay();
    if (!el) return;
    el.style.display = "flex";
}

export function openGalleryOverlay() {
    showOverlay();
}

// -------------------------------------------------------------------
// Settings modal  (no group toggle anymore)
// -------------------------------------------------------------------

function openSettingsModal(panel) {
    const current = getGallerySettings();

    if (!settingsModalEl) {
        settingsModalEl = document.createElement("div");
        Object.assign(settingsModalEl.style, {
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            background: "rgba(27, 27, 27, 0.9)",
            borderRadius: "12px",
            border: "1px solid rgba(94, 94, 94, 0.20)",
            boxShadow: "0 18px 40px rgba(0,0,0,0.89)",
            padding: "14px 18px",
            minWidth: "260px",
            maxWidth: "380px",
            color: "#e5e7eb",
            zIndex: "20000",
        });

        const title = document.createElement("div");
        title.textContent = "Gallery Settings";
        Object.assign(title.style, {
            fontSize: "13px",
            fontWeight: "600",
            marginBottom: "4px",
        });
        settingsModalEl.appendChild(title);

        const form = document.createElement("div");
        Object.assign(form.style, {
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            fontSize: "12px",
        });

        const addToggle = (labelText, key) => {
            const row = document.createElement("label");
            Object.assign(row.style, {
                display: "flex",
                alignItems: "center",
                gap: "6px",
            });

            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.checked = Boolean(getGallerySettings()[key]);
            checkbox.onchange = () => {
                updateGallerySettings({ [key]: checkbox.checked });
            };

            const label = document.createElement("span");
            label.textContent = labelText;

            row.appendChild(checkbox);
            row.appendChild(label);
            form.appendChild(row);
        };

        addToggle("Masonry layout", "masonryLayout");
        addToggle("Enable drag & drop", "enableDrag");
        addToggle("Show rating overlay in grid", "showRatingInGrid");
        addToggle("Anchor Gallery pill to top bar", "anchorToManagerBar");

        // Theme
        const themeRow = document.createElement("div");
        Object.assign(themeRow.style, {
            display: "flex",
            alignItems: "center",
            gap: "6px",
        });
        const themeLabel = document.createElement("span");
        themeLabel.textContent = "Theme:";
        const themeSelect = document.createElement("select");
        ["dark", "light"].forEach((opt) => {
            const o = document.createElement("option");
            o.value = opt;
            o.textContent = opt;
            themeSelect.appendChild(o);
        });
        themeSelect.value = current.theme || "dark";
        themeSelect.onchange = () => {
            updateGallerySettings({ theme: themeSelect.value });
        };
        themeRow.appendChild(themeLabel);
        themeRow.appendChild(themeSelect);
        form.appendChild(themeRow);

        // Thumbnail size
        const sizeRow = document.createElement("div");
        Object.assign(sizeRow.style, {
            display: "flex",
            alignItems: "center",
            gap: "6px",
        });
        const sizeLabel = document.createElement("span");
        sizeLabel.textContent = "Thumbnail size:";
        const sizeSelect = document.createElement("select");
        [
            ["sm", "Small"],
            ["md", "Medium"],
            ["lg", "Large"],
        ].forEach(([value, label]) => {
            const o = document.createElement("option");
            o.value = value;
            o.textContent = label;
            sizeSelect.appendChild(o);
        });
        sizeSelect.value = current.thumbSize || "md";
        sizeSelect.onchange = () => {
            updateGallerySettings({ thumbSize: sizeSelect.value });
        };
        sizeRow.appendChild(sizeLabel);
        sizeRow.appendChild(sizeSelect);
        form.appendChild(sizeRow);

        settingsModalEl.appendChild(form);

        const footer = document.createElement("div");
        Object.assign(footer.style, {
            marginTop: "10px",
            display: "flex",
            justifyContent: "flex-end",
        });

        const closeBtn = document.createElement("button");
        closeBtn.textContent = "Close";
        Object.assign(closeBtn.style, {
            borderRadius: "999px",
            border: "1px solid rgba(148,163,184,0.55)",
            padding: "3px 10px",
            fontSize: "11px",
            cursor: "pointer",
            background: "rgba(15,23,42,0.85)",
            color: "#e5e7eb",
        });
        closeBtn.onclick = () => {
            settingsModalEl.style.display = "none";
        };
        footer.appendChild(closeBtn);
        settingsModalEl.appendChild(footer);

        panel.appendChild(settingsModalEl);
    }

    settingsModalEl.style.display = "block";
}

// -------------------------------------------------------------------
// Floating Image Group Filter panel
// -------------------------------------------------------------------

function openFilterPanel() {
    const current = getGallerySettings();

    if (!filterPanelEl) {
        filterPanelEl = document.createElement("div");
        Object.assign(filterPanelEl.style, {
            position: "fixed",
            top: "90px",
            right: "40px",
            width: "320px",
            background: "rgba(15,23,42,0.92)",
            borderRadius: "14px",
            border: "1px solid rgba(148,163,184,0.35)",
            boxShadow: "0 18px 50px rgba(0,0,0,0.85)",
            color: "#e5e7eb",
            zIndex: "20010",
            display: "flex",
            flexDirection: "column",
            backdropFilter: "blur(10px)",
        });

        const header = document.createElement("div");
        Object.assign(header.style, {
            padding: "6px 10px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: "move",
            borderBottom: "1px solid rgba(51,65,85,0.8)",
        });

        const title = document.createElement("span");
        title.textContent = "IMAGE GROUP FILTERS";
        Object.assign(title.style, {
            fontSize: "11px",
            fontWeight: "600",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
        });

        const closeBtn = document.createElement("button");
        closeBtn.textContent = "✕";
        Object.assign(closeBtn.style, {
            borderRadius: "999px",
            border: "1px solid rgba(148,163,184,0.45)",
            width: "20px",
            height: "20px",
            fontSize: "11px",
            cursor: "pointer",
            background: "rgba(15,23,42,0.9)",
            color: "#e5e7eb",
        });
        closeBtn.onclick = () => {
            filterPanelEl.style.display = "none";
        };

        header.appendChild(title);
        header.appendChild(closeBtn);
        filterPanelEl.appendChild(header);

        const body = document.createElement("div");
        Object.assign(body.style, {
            padding: "8px 10px 10px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            fontSize: "11px",
        });

        // Sort type (dividerMode)
        const sortRow = document.createElement("div");
        Object.assign(sortRow.style, {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "6px",
        });
        const sortLabel = document.createElement("span");
        sortLabel.textContent = "Sort type:";
        const sortSelect = document.createElement("select");
        const sortOptions = [
            ["none", "None"],
            ["alpha", "Alphabetical"],
            ["folder", "Folder"],
            ["day", "Day"],
            ["month", "Month"],
            ["year", "Year"],
        ];
        sortOptions.forEach(([value, label]) => {
            const o = document.createElement("option");
            o.value = value;
            o.textContent = label;
            sortSelect.appendChild(o);
        });
        sortRow.appendChild(sortLabel);
        sortRow.appendChild(sortSelect);
        body.appendChild(sortRow);

        // Arrange (arrangeBy)
        const arrangeRow = document.createElement("div");
        Object.assign(arrangeRow.style, {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "6px",
        });
        const arrangeLabel = document.createElement("span");
        arrangeLabel.textContent = "Arrange:";
        const arrangeSelect = document.createElement("select");
        const arrangeOptions = [
            ["none", "None"],
            ["name", "Name"],
            ["time", "Time"],
            ["size", "File size"],
            ["pixels", "Pixel count"],
        ];
        arrangeOptions.forEach(([value, label]) => {
            const o = document.createElement("option");
            o.value = value;
            o.textContent = label;
            arrangeSelect.appendChild(o);
        });
        arrangeRow.appendChild(arrangeLabel);
        arrangeRow.appendChild(arrangeSelect);
        body.appendChild(arrangeRow);

        // Direction
        const dirRow = document.createElement("div");
        Object.assign(dirRow.style, {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "6px",
        });
        const dirLabel = document.createElement("span");
        dirLabel.textContent = "Direction:";
        const dirSelect = document.createElement("select");
        [
            ["asc", "Ascending"],
            ["desc", "Descending"],
        ].forEach(([value, label]) => {
            const o = document.createElement("option");
            o.value = value;
            o.textContent = label;
            dirSelect.appendChild(o);
        });
        dirRow.appendChild(dirLabel);
        dirRow.appendChild(dirSelect);
        body.appendChild(dirRow);

        // Layout: Split pages vs Inline
        const modeRow = document.createElement("div");
        Object.assign(modeRow.style, {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "6px",
            marginTop: "4px",
        });
        const modeLabel = document.createElement("span");
        modeLabel.textContent = "Layout:";
        const modeButtons = document.createElement("div");
        Object.assign(modeButtons.style, {
            display: "inline-flex",
            gap: "4px",
        });

        const splitBtn = document.createElement("button");
        splitBtn.textContent = "Split pages";
        const inlineBtn = document.createElement("button");
        inlineBtn.textContent = "Inline";

        [splitBtn, inlineBtn].forEach((btn) => {
            Object.assign(btn.style, {
                borderRadius: "999px",
                border: "1px solid rgba(148,163,184,0.55)",
                padding: "2px 8px",
                fontSize: "11px",
                cursor: "pointer",
                background: "rgba(15,23,42,0.8)",
                color: "#e5e7eb",
            });
        });

        modeButtons.appendChild(splitBtn);
        modeButtons.appendChild(inlineBtn);
        modeRow.appendChild(modeLabel);
        modeRow.appendChild(modeButtons);
        body.appendChild(modeRow);

        // Inline divider style
        const styleRow = document.createElement("div");
        Object.assign(styleRow.style, {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "6px",
        });
        const styleLabel = document.createElement("span");
        styleLabel.textContent = "Divider style:";
        const styleSelect = document.createElement("select");
        const styleOptions = [
            ["timeline", "Timeline"],
            ["pill", "Pill"],
            ["label", "Label"],
            ["none", "None"],
        ];
        styleOptions.forEach(([value, label]) => {
            const o = document.createElement("option");
            o.value = value;
            o.textContent = label;
            styleSelect.appendChild(o);
        });
        styleRow.appendChild(styleLabel);
        styleRow.appendChild(styleSelect);
        body.appendChild(styleRow);

        filterPanelEl.appendChild(body);
        document.body.appendChild(filterPanelEl);

        // --- Wiring updates ------------------------------------------
        const applyFromSettings = () => {
            const s = getGallerySettings();

            sortSelect.value = s.dividerMode || "none";
            arrangeSelect.value = s.arrangeBy || "none";
            dirSelect.value = s.sortAscending === false ? "desc" : "asc";

            const layout = s.dividerLayout || "inline"; // "page" | "inline"

            if (layout === "page") {
                splitBtn.style.background = "rgba(55,65,194,0.9)";
                inlineBtn.style.background = "rgba(15,23,42,0.8)";
            } else {
                splitBtn.style.background = "rgba(15,23,42,0.8)";
                inlineBtn.style.background = "rgba(55,65,194,0.9)";
            }

            styleSelect.value = s.dividerStyle || "timeline";
        };

        sortSelect.onchange = () => {
            updateGallerySettings({ dividerMode: sortSelect.value });
        };

        arrangeSelect.onchange = () => {
            updateGallerySettings({ arrangeBy: arrangeSelect.value });
        };

        dirSelect.onchange = () => {
            updateGallerySettings({
                sortAscending: dirSelect.value === "asc",
            });
        };

        splitBtn.onclick = () => {
            updateGallerySettings({ dividerLayout: "page", showDividers: true });
        };

        inlineBtn.onclick = () => {
            updateGallerySettings({ dividerLayout: "inline", showDividers: true });
        };

        styleSelect.onchange = () => {
            updateGallerySettings({ dividerStyle: styleSelect.value || "timeline" });
        };

        // Dragging
        makePanelDraggable(filterPanelEl, header);

        // Keep panel synced when settings change elsewhere
        subscribeGallerySettings(() => applyFromSettings());
        applyFromSettings();
    } else {
        filterPanelEl.style.display = "flex";
    }
}

function closeFilterPanel() {
    if (filterPanelEl) {
        filterPanelEl.style.display = "none";
    }
}

function makePanelDraggable(panel, handle) {
    let dragState = null;

    handle.addEventListener("mousedown", (ev) => {
        const rect = panel.getBoundingClientRect();
        dragState = {
            offsetX: ev.clientX - rect.left,
            offsetY: ev.clientY - rect.top,
        };
        panel.style.left = rect.left + "px";
        panel.style.top = rect.top + "px";
        panel.style.right = "auto";

        const onMove = (e) => {
            if (!dragState) return;
            panel.style.left = e.clientX - dragState.offsetX + "px";
            panel.style.top = e.clientY - dragState.offsetY + "px";
        };
        const onUp = () => {
            dragState = null;
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
        };

        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
        ev.preventDefault();
    });
}

// -------------------------------------------------------------------

function ensureOverlayStyles() {
    if (document.getElementById("usg-gallery-overlay-style")) return;

    const style = document.createElement("style");
    style.id = "usg-gallery-overlay-style";
    style.textContent = `
        .usg-gallery-overlay {
            animation: usg-fade-in 0.2s ease-out forwards;
            z-index: 10000;
        }
        @keyframes usg-fade-in {
            0% { opacity: 0; }
            100% { opacity: 1; }
        }
        /* Prevents flicker during animation */
        .usg-gallery-panel {
            will-change: transform, opacity;
        }
    `;
    document.head.appendChild(style);
}

// Expose filter panel open/close so grid.js can call them without imports.
if (typeof window !== "undefined") {
    window.USG_GALLERY_OPEN_FILTERS = () => openFilterPanel();
    window.USG_GALLERY_CLOSE_FILTERS = () => closeFilterPanel();
}