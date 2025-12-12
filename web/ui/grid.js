// ComfyUI-Usgromana-Gallery/web/ui/grid.js

import {
    subscribe,
    getAllImagesRaw,
    setSelectedIndex,
    setVisibleImages,
    setImages,
} from "../core/state.js";
import { showDetailsForIndex } from "./details.js";
import {
    getGallerySettings,
    subscribeGallerySettings,
    updateGallerySettings,
} from "../core/gallerySettings.js";
import { galleryApi } from "../core/api.js"; 

let rootEl = null;
let gridContentEl = null;

let lastState = null;
let ratingMap = new Map();
let minRatingFilter = 0;
let gallerySettings = getGallerySettings();
let searchQuery = "";

let filterToggleBtn = null;

const USE_MASONRY_LAYOUT = false;

// ---------------------------------------------------------------------
// Comfy shortcut guard
// ---------------------------------------------------------------------
window.__USG_GALLERY_CAPTURE__ = window.__USG_GALLERY_CAPTURE__ || false;

let comfyGuardInstalled = false;
let origQueuePrompt = null;
let origQueuePromptAll = null;
let origClearGraph = null;

// ---------------------------------------------------------------------
// CSS injection (PERFORMANCE OPTIMIZED)
// ---------------------------------------------------------------------

function ensureGalleryGridStyles() {
    if (document.getElementById("usg-gallery-grid-style")) return;

    const style = document.createElement("style");
    style.id = "usg-gallery-grid-style";
    style.textContent = `
        .usg-gallery-grid img {
            border-radius: inherit;
            display: block;
        }
        /* CRITICAL PERF FIX: Prevents layout calc for off-screen cards */
        .usg-gallery-card {
            content-visibility: auto; 
            contain-intrinsic-size: 160px 200px; 
            contain: layout paint;
            transition: transform 0.1s ease-out, box-shadow 0.1s ease-out;
        }
        .usg-gallery-card:hover {
            transform: translateY(-2px) scale(1.01);
            box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
            z-index: 5;
        }
        .usg-gallery-scroll::-webkit-scrollbar {
            width: 8px;
            height: 8px;
        }
        .usg-gallery-scroll::-webkit-scrollbar-track {
            background: rgba(10,10,15,0.10);
            border-radius: 999px;
        }
        .usg-gallery-scroll::-webkit-scrollbar-thumb {
            background: rgba(120,130,160,0.10);
            border-radius: 999px;
        }
        .usg-gallery-divider {
            width: 100%;
            box-sizing: border-box;
            padding: 6px 4px 2px;
            margin-top: 8px;
            margin-bottom: 4px;
            font-size: 11px;
            font-weight: 600;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            color: rgba(209,213,219,0.85);
            border-bottom: 1px solid rgba(148,163,184,0.30);
        }
    `;
    document.head.appendChild(style);
}

// ---------------------------------------------------------------------
// Additional Helpers / clear Imgs + reload from backend
// ---------------------------------------------------------------------

export function clearGridThumbnails() {
    if (!gridContentEl) return;

    const imgs = gridContentEl.querySelectorAll("img");
    imgs.forEach((img) => {
        img.src = "";
        img.removeAttribute("src");
    });

    gridContentEl.innerHTML = "";
    lastState = null;
}

/**
 * Hard refresh from backend:
 *  - wipe existing DOM & src attributes
 *  - fetch fresh list from /usgromana-gallery/list
 *  - push into core state (which will trigger render via subscribe)
 */
export async function reloadImagesAndRender() {
    clearGridThumbnails();

    try {
        const images = await galleryApi.listImages();
        setImages(images);   // subscribe() → renderGridContent()
    } catch (err) {
        console.warn("[USG-Gallery] Failed to reload images:", err);
        // fallback: at least render whatever state we already had
        renderGridContent();
    }
}

// ---------------------------------------------------------------------
// Divider / grouping helpers
// ---------------------------------------------------------------------

const MONTH_NAMES = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December"
];

function getImageDate(img) {
    let value = null;
    if (img.datetime) value = img.datetime;
    else if (img.created_at) value = img.created_at;
    else if (img.timestamp) value = img.timestamp;
    else if (img.mtime != null) value = img.mtime * 1000;

    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d;
}

function getFolderName(img) {
    if (img.folder) return img.folder;
    if (img.directory) return img.directory;
    const rel = img.relpath || img.filename || "";
    if (!rel.includes("/") && !rel.includes("\\")) return "(root)";
    const parts = rel.split(/[/\\]+/);
    if (parts.length <= 1) return "(root)";
    return parts[parts.length - 2] || "(root)";
}

function getAlphaKey(img) {
    const name = img.name || img.filename || img.title || "";
    if (!name) return "#";
    const ch = name.trim().charAt(0).toUpperCase();
    return /[A-Z]/.test(ch) ? ch : "#";
}

function getDateKey(img, mode) {
    const d = getImageDate(img);
    if (!d) return "Unknown";
    const year = d.getFullYear();
    const month = d.getMonth();
    const day = d.getDate();
    switch (mode) {
        case "day":
            return `${year.toString().padStart(4,"0")}-${(month+1)
                .toString().padStart(2,"0")}-${day.toString().padStart(2,"0")}`;
        case "month":
            return `${MONTH_NAMES[month]} ${year}`;
        case "year":
            return String(year);
        default:
            return "Unknown";
    }
}

function getDividerKeyForImage(img, settings) {
    const mode = settings?.dividerMode || "none";
    switch (mode) {
        case "alpha": return getAlphaKey(img);
        case "folder": return getFolderName(img);
        case "day":
        case "month":
        case "year": return getDateKey(img, mode);
        default: return "";
    }
}

function getArrangeValue(img, arrangeBy) {
    switch (arrangeBy) {
        case "name": {
            const name = (img.name || img.filename || img.title || "").toLowerCase();
            return name;
        }
        case "time": {
            const t = getImageDate(img)?.getTime();
            return t != null ? t : 0;
        }
        case "size": {
            const size = img.file_size || img.size || img.bytes || img.length || 0;
            return size;
        }
        case "pixels": {
            const w = img.width || img.w || img.resolution_x || 0;
            const h = img.height || img.h || img.resolution_y || 0;
            return w * h;
        }
        default: return 0;
    }
}

function groupImagesForDividers(images, settings) {
    const mode = settings?.dividerMode || "none";
    const arrangeBy = settings?.arrangeBy || "none";
    const ascending = settings?.sortAscending !== false;

    const sorted = [...images];

    sorted.sort((a, b) => {
        if (mode && mode !== "none") {
            const ka = getDividerKeyForImage(a, settings) || "";
            const kb = getDividerKeyForImage(b, settings) || "";
            if (ka !== kb) {
                const res = ka.localeCompare(kb, undefined, { numeric: true, sensitivity: "base" });
                return ascending ? res : -res;
            }
        }
        let res = 0;
        if (arrangeBy && arrangeBy !== "none") {
            const va = getArrangeValue(a, arrangeBy);
            const vb = getArrangeValue(b, arrangeBy);
            if (typeof va === "string" || typeof vb === "string") {
                res = String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: "base" });
            } else {
                res = (va || 0) - (vb || 0);
            }
            if (res !== 0) return ascending ? res : -res;
        }
        const fa = (a.name || a.filename || "").toLowerCase();
        const fb = (b.name || b.filename || "").toLowerCase();
        res = fa.localeCompare(fb, undefined, { numeric: true, sensitivity: "base" });
        return ascending ? res : -res;
    });

    const groups = new Map();
    for (const img of sorted) {
        const key = (mode && mode !== "none") ? (getDividerKeyForImage(img, settings) || "") : "";
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(img);
    }

    return Array.from(groups.entries()).map(([header, items]) => ({
        header: mode && mode !== "none" ? header || null : null,
        items,
    }));
}

// ---------------------------------------------------------------------
// Comfy guards
// ---------------------------------------------------------------------

function installComfyShortcutGuards() {
    if (comfyGuardInstalled) return;
    const app = window.app;
    if (!app) return;
    comfyGuardInstalled = true;
    if (typeof app.queuePrompt === "function") {
        origQueuePrompt = app.queuePrompt.bind(app);
        app.queuePrompt = function (...args) {
            if (window.__USG_GALLERY_CAPTURE__) return;
            return origQueuePrompt(...args);
        };
    }
    if (typeof app.queuePromptAll === "function") {
        origQueuePromptAll = app.queuePromptAll.bind(app);
        app.queuePromptAll = function (...args) {
            if (window.__USG_GALLERY_CAPTURE__) return;
            return origQueuePromptAll(...args);
        };
    }
    if (typeof app.clearGraph === "function") {
        origClearGraph = app.clearGraph.bind(app);
        app.clearGraph = function (...args) {
            if (window.__USG_GALLERY_CAPTURE__) return;
            return origClearGraph(...args);
        };
    }
    console.info("[USG-Gallery] Comfy shortcut guards installed.");
}

// ---------------------------------------------------------------------
// Public init (LOGIC FIXED to ensure load)
// ---------------------------------------------------------------------

export function initGrid(root) {
    rootEl = root;
    ensureGalleryGridStyles();
    installComfyShortcutGuards();

    buildStaticUI();

    gallerySettings = getGallerySettings();
    updateFilterToggleVisual();

    // ⬇️ Ensure we have images on first open
    reloadImagesAndRender();

    subscribeGallerySettings((s) => {
        gallerySettings = s;
        updateFilterToggleVisual();
        reloadImagesAndRender();
    });

    loadRatingsFromServer();

    subscribe((state) => {
        const prevImages = lastState ? lastState.images : null;
        const newImages = state ? state.images : null;

        lastState = state;

        const isEmpty = !gridContentEl || gridContentEl.childElementCount === 0;
        if (!isEmpty && prevImages === newImages && prevImages !== null) return;

        renderGridContent();
    });
}

// ---------------------------------------------------------------------
// Static UI (search + rating filter + filter button)
// ---------------------------------------------------------------------

function buildStaticUI() {
    if (!rootEl) return;
    rootEl.innerHTML = "";

    const filterBar = document.createElement("div");
    Object.assign(filterBar.style, {
        display: "flex", alignItems: "center", gap: "8px", fontSize: "11px", color: "#ddd",
        marginBottom: "10px", flexShrink: "0", width: "100%", boxSizing: "border-box",
    });

    // 1. Search
    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Search (name, tags, model, prompt)…";
    searchInput.value = searchQuery;
    Object.assign(searchInput.style, {
        flex: "1", minWidth: "0", padding: "4px 8px", borderRadius: "999px",
        border: "1px solid rgba(148,163,184,0.28)", background: "rgba(15,23,42,0.38)",
        color: "#e5e7eb", fontSize: "11px", outline: "none",
    });

    searchInput.addEventListener("focus", () => { window.__USG_GALLERY_CAPTURE__ = true; });
    searchInput.addEventListener("blur", () => { window.__USG_GALLERY_CAPTURE__ = false; });
    ["keydown","keyup","keypress"].forEach(evt => searchInput.addEventListener(evt, ev => ev.stopPropagation()));
    searchInput.addEventListener("input", () => {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/6712329c-12ed-47b3-85f9-78457616d544',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'grid.js:370',message:'Search input changed',data:{query:searchInput.value},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
        // #endregion
        searchQuery = searchInput.value || "";
        renderGridContent();
    });
    filterBar.appendChild(searchInput);

    // 2. Rating Filters
    const filterLabel = document.createElement("span");
    filterLabel.textContent = "Rating filter:";
    filterLabel.style.opacity = "0.7";
    filterLabel.style.marginRight = "4px";
    filterBar.appendChild(filterLabel);

    const options = [
        { label: "All", value: 0 }, { label: "3★+", value: 3 },
        { label: "4★+", value: 4 }, { label: "5★", value: 5 },
    ];

    const refreshBtn = document.createElement("button");
    refreshBtn.textContent = "Refresh";
    Object.assign(refreshBtn.style, {
        borderRadius: "999px",
        border: "1px solid rgba(148,163,184,0.6)",
        padding: "4px 10px",
        fontSize: "12px",
        background: "rgba(15,23,42,0.9)",
        color: "#e5e7eb",
        cursor: "pointer",
    });
    refreshBtn.onclick = () => {
        reloadImagesAndRender();
    };

    filterBar.appendChild(refreshBtn);

    options.forEach((opt) => {
        const btn = document.createElement("button");
        btn.textContent = opt.label;
        btn.dataset.minRating = String(opt.value);
        btn.id = `usg-filter-btn-${opt.value}`;
        Object.assign(btn.style, {
            borderRadius: "999px", border: "1px solid rgba(255,255,255,0.15)",
            padding: "2px 8px", fontSize: "11px", cursor: "pointer",
            background: "rgba(10,10,15,0.5)", color: "#eee", opacity: "0.75", transition: "all 0.15s ease-out",
        });
        btn.onclick = () => {
            minRatingFilter = Number(btn.dataset.minRating || "0");
            updateFilterButtons();
            renderGridContent();
        };
        filterBar.appendChild(btn);
    });

    // 3. Filter Toggle Button (Triggers Overlay Panel)
    filterToggleBtn = document.createElement("button");
    filterToggleBtn.textContent = "Filters";
    Object.assign(filterToggleBtn.style, {
        borderRadius: "999px", border: "1px solid rgba(148,163,184,0.55)",
        padding: "2px 10px", fontSize: "11px", cursor: "pointer",
        background: "rgba(10,10,15,0.6)", color: "#e5e7eb", opacity: "0.85",
        marginLeft: "6px", transition: "all 0.15s ease-out", display: "inline-flex",
        alignItems: "center", gap: "4px",
    });
    filterToggleBtn.onclick = () => {
        const s = getGallerySettings();
        const newEnabled = !s.showDividers;
        updateGallerySettings({ showDividers: newEnabled });
        
        // This relies on overlay.js being loaded and setting these globals
        if (newEnabled) {
            if (window.USG_GALLERY_OPEN_FILTERS) window.USG_GALLERY_OPEN_FILTERS();
        } else {
            if (window.USG_GALLERY_CLOSE_FILTERS) window.USG_GALLERY_CLOSE_FILTERS();
        }
        updateFilterToggleVisual();
        renderGridContent();
    };
    filterBar.appendChild(filterToggleBtn);
    rootEl.appendChild(filterBar);

    const scrollContainer = document.createElement("div");
    scrollContainer.classList.add("usg-gallery-scroll");
    Object.assign(scrollContainer.style, {
        flex: "1", overflowY: "auto", width: "100%", paddingRight: "5px",
    });

    gridContentEl = document.createElement("div");
    gridContentEl.className = "usg-gallery-grid";
    scrollContainer.appendChild(gridContentEl);
    rootEl.appendChild(scrollContainer);

    updateFilterButtons();
    updateFilterToggleVisual();
}

function updateFilterButtons() {
    [0, 3, 4, 5].forEach((val) => {
        const btn = document.getElementById(`usg-filter-btn-${val}`);
        if (!btn) return;
        const isActive = val === minRatingFilter;
        btn.style.background = isActive ? "rgba(180,180,255,0.18)" : "rgba(10,10,15,0.6)";
        btn.style.opacity = isActive ? "1" : "0.75";
    });
}

function updateFilterToggleVisual() {
    if (!filterToggleBtn) return;
    const s = getGallerySettings();
    const enabled = !!s.showDividers;
    filterToggleBtn.style.background = enabled ? "rgba(56,189,248,0.18)" : "rgba(10,10,15,0.6)";
    filterToggleBtn.style.borderColor = enabled ? "rgba(56,189,248,0.7)" : "rgba(148,163,184,0.55)";
    filterToggleBtn.style.opacity = enabled ? "1" : "0.85";
}

// ---------------------------------------------------------------------
// Core render
// ---------------------------------------------------------------------

function renderGridContent() {
    if (!gridContentEl) return;

    // #region agent log
    const renderStart = Date.now();
    fetch('http://127.0.0.1:7242/ingest/6712329c-12ed-47b3-85f9-78457616d544',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'grid.js:488',message:'renderGridContent start',data:{timestamp:renderStart},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    gridContentEl.innerHTML = "";
    const allImages = getAllImagesRaw();
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/6712329c-12ed-47b3-85f9-78457616d544',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'grid.js:492',message:'Images loaded for render',data:{count:allImages.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion

    let filtered = allImages.filter((img) => {
        const rating = getRatingForImage(img);
        if (rating < minRatingFilter) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            const fn = (img.filename || "").toLowerCase();
            const model = (img.model || img.model_name || "").toLowerCase();
            const prompt = (img.prompt || img.full_prompt || "").toLowerCase();
            if (!fn.includes(q) && !model.includes(q) && !prompt.includes(q)) return false;
        }
        return true;
    });

    const seen = new Set();
    filtered = filtered.filter((img) => {
        const key = img.relpath || img.filename || img.url;
        if (!key) return true;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    const groups = groupImagesForDividers(filtered, gallerySettings);
    const flatList = [];
    groups.forEach((g) => g.items.forEach((img) => flatList.push(img)));
    setVisibleImages(flatList);

    if (!flatList.length) {
        const empty = document.createElement("div");
        empty.textContent = "No images found.";
        Object.assign(empty.style, {
            color: "#aaa", fontSize: "14px", textAlign: "center", marginTop: "40px", width: "100%",
        });
        gridContentEl.appendChild(empty);
        // #region agent log
        const renderDuration = Date.now() - renderStart;
        fetch('http://127.0.0.1:7242/ingest/6712329c-12ed-47b3-85f9-78457616d544',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'grid.js:528',message:'renderGridContent complete (empty)',data:{duration_ms:renderDuration},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
        // #endregion
        return;
    }

    const baseThumbWidth = gallerySettings.thumbSize === "sm" ? 120 : gallerySettings.thumbSize === "lg" ? 220 : 160;
    const showDividers = gallerySettings.showDividers && gallerySettings.dividerMode !== "none";
    const layout = gallerySettings.dividerLayout || "inline";
    const pageMode = showDividers && layout === "page";

    if (pageMode) {
        Object.assign(gridContentEl.style, {
            display: "flex", flexDirection: "column", gap: "16px", padding: "6px",
            borderRadius: "14px", background: "rgba(15,23,42,0.18)", width: "100%",
            boxSizing: "border-box", alignItems: "stretch",
        });
    } else {
        const commonGridStyle = {
            padding: "6px", borderRadius: "14px", background: "rgba(15, 23, 42, 0.32)",
            width: "100%", boxSizing: "border-box",
        };
        if (USE_MASONRY_LAYOUT || gallerySettings.masonryLayout) {
            Object.assign(gridContentEl.style, {
                ...commonGridStyle, display: "block", columnWidth: baseThumbWidth + "px", columnGap: "10px",
            });
        } else {
            Object.assign(gridContentEl.style, {
                ...commonGridStyle, display: "grid",
                gridTemplateColumns: `repeat(auto-fill, minmax(${baseThumbWidth}px, 1fr))`,
                gap: "10px", alignItems: "center",
            });
        }
    }

    let index = 0;
    if (pageMode) {
        let perSectionMinHeight = baseThumbWidth + 80;
        if (groups.length > 0) {
            const viewport = window.innerHeight || 900;
            const availableHeight = viewport * 0.7 - 80;
            const share = availableHeight / groups.length;
            perSectionMinHeight = Math.max(perSectionMinHeight, share);
        }
        groups.forEach((group) => {
            if (!group.items.length) return;
            const section = document.createElement("div");
            Object.assign(section.style, {
                width: "100%", boxSizing: "border-box", alignSelf: "stretch",
                padding: "8px 10px 10px", borderRadius: "14px", background: "rgba(15,23,42,0.65)",
                border: "1px solid rgba(148,163,184,0.40)", boxShadow: "0 10px 28px rgba(0,0,0,0.55)",
                display: "flex", flexDirection: "column", minHeight: `${perSectionMinHeight}px`,
            });
            if (group.header) {
                const headerEl = createDividerElement(group.header, true);
                if (headerEl) {
                    headerEl.style.marginTop = "0";
                    headerEl.style.marginBottom = "6px";
                    section.appendChild(headerEl);
                }
            }
            const innerGrid = document.createElement("div");
            const innerCommon = { width: "100%", boxSizing: "border-box", flex: "1" };
            if (USE_MASONRY_LAYOUT || gallerySettings.masonryLayout) {
                Object.assign(innerGrid.style, {
                    ...innerCommon, display: "block", columnWidth: baseThumbWidth + "px", columnGap: "10px",
                });
            } else {
                Object.assign(innerGrid.style, {
                    ...innerCommon, display: "grid",
                    gridTemplateColumns: `repeat(auto-fill, minmax(${baseThumbWidth}px, 1fr))`,
                    gap: "10px", alignItems: "center",
                });
            }
            group.items.forEach((img) => {
                const card = createCard(img, index);
                innerGrid.appendChild(card);
                index++;
            });
            section.appendChild(innerGrid);
            gridContentEl.appendChild(section);
        });
    } else {
        groups.forEach((group) => {
            if (showDividers && group.header) {
                const dividerEl = createDividerElement(group.header, false);
                if (dividerEl) gridContentEl.appendChild(dividerEl);
            }
            group.items.forEach((img) => {
                const card = createCard(img, index);
                gridContentEl.appendChild(card);
                index++;
            });
        });
    }
    // #region agent log
    const renderDuration = Date.now() - renderStart;
    fetch('http://127.0.0.1:7242/ingest/6712329c-12ed-47b3-85f9-78457616d544',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'grid.js:620',message:'renderGridContent complete',data:{duration_ms:renderDuration,items_rendered:flatList.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
}

// ---------------------------------------------------------------------
// Divider element
// ---------------------------------------------------------------------

function createDividerElement(headerText, isPageHeader = false) {
    if (!headerText) return null;
    const styleKey = (gallerySettings && gallerySettings.dividerStyle) || "timeline";
    if (styleKey === "none") return null;

    const row = document.createElement("div");
    row.className = "usg-gallery-divider";
    const baseMargins = isPageHeader ? { marginTop: "0", marginBottom: "6px" } : { marginTop: "8px", marginBottom: "4px" };

    switch (styleKey) {
        case "pill": {
            Object.assign(row.style, {
                display: "flex", alignItems: "center", gap: "8px", borderBottom: "none",
                padding: "4px 0 2px", ...baseMargins,
            });
            const lineLeft = document.createElement("div");
            Object.assign(lineLeft.style, { flex: "1", height: "1px", background: "rgba(148,163,184,0.35)", opacity: "0.7" });
            const label = document.createElement("span");
            label.textContent = headerText;
            Object.assign(label.style, {
                padding: "2px 10px", borderRadius: "999px", border: "1px solid rgba(148,163,184,0.55)",
                background: "rgba(15,23,42,0.88)", fontSize: "11px", letterSpacing: "0.06em", textTransform: "uppercase",
            });
            const lineRight = document.createElement("div");
            Object.assign(lineRight.style, { flex: "1", height: "1px", background: "rgba(148,163,184,0.35)", opacity: "0.7" });
            row.appendChild(lineLeft); row.appendChild(label); row.appendChild(lineRight);
            break;
        }
        case "label": {
            Object.assign(row.style, { borderBottom: "none", paddingLeft: "4px", paddingTop: "4px", paddingBottom: "2px", ...baseMargins });
            row.textContent = headerText;
            break;
        }
        case "timeline":
        default: {
            Object.assign(row.style, {
                width: "100%", boxSizing: "border-box", padding: "6px 4px 2px", fontSize: "11px",
                fontWeight: "600", letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(209,213,219,0.85)",
                borderBottom: "1px solid rgba(148,163,184,0.30)", ...baseMargins,
            });
            row.textContent = headerText;
            break;
        }
    }
    return row;
}

// ---------------------------------------------------------------------
// Card creation
// ---------------------------------------------------------------------

function createCard(img, index) {
    const card = document.createElement("div");
    card.className = "usg-gallery-card";
    card.dataset.index = index;

    Object.assign(card.style, {
        background: "transparent", border: "none", cursor: "pointer", display: "flex",
        justifyContent: "center", width: "100%", position: "relative", breakInside: "avoid",
    });

    const frame = document.createElement("div");
    Object.assign(frame.style, {
        borderRadius: "10px", overflow: "hidden", display: "flex",
        alignItems: "center", justifyContent: "center", width: "100%", position: "relative",
    });

    const imgEl = document.createElement("img");

    // Build safest thumbnail URL we can
    let thumbUrl =
        img.thumb_url ||
        img.url || // backend already gave us a working URL
        (() => {
            const rel = img.relpath || img.filename || "";
            const encoded = encodeURIComponent(rel);
            return `/usgromana-gallery/image?filename=${encoded}&size=thumb`;
        })();

    imgEl.src = thumbUrl;
    imgEl.alt = img.filename || img.relpath || "";
    imgEl.loading = "lazy";
    imgEl.decoding = "async";

    Object.assign(imgEl.style, {
        width: "100%",
        height: "auto",
        objectFit: "contain",
        display: "block",
        borderRadius: "inherit",
        opacity: "0",
        transition: "opacity 0.2s ease",
    });
    imgEl.onload = () => {
        imgEl.style.opacity = "1";
    };
    frame.appendChild(imgEl);

    if (gallerySettings.showRatingInGrid) {
        const ratingOverlay = document.createElement("div");
        Object.assign(ratingOverlay.style, {
            position: "absolute", left: "3px", bottom: "3px", padding: "2px 6px",
            borderRadius: "999px", background: "rgba(0,0,0,0.25)", display: "flex",
            alignItems: "center", gap: "2px", fontSize: "11px",
        });
        const currentRating = getRatingForImage(img);
        for (let star = 1; star <= 5; star++) {
            const starEl = document.createElement("span");
            starEl.textContent = star <= currentRating ? "★" : "☆";
            Object.assign(starEl.style, {
                cursor: "pointer", color: star <= currentRating ? "#ffd86b" : "#bbbbbb",
                textShadow: star <= currentRating ? "0 0 2px rgba(0,0,0,0.7)" : "none",
            });
            starEl.onclick = (ev) => { ev.stopPropagation(); setRating(img, star); };
            ratingOverlay.appendChild(starEl);
        }
        frame.appendChild(ratingOverlay);
    }

    if (gallerySettings.enableDrag) {
        card.draggable = true;
        card.addEventListener("dragstart", (ev) => {
            try {
                const payload = {
                    type: "usgromana-image",
                    filename: img.filename,
                    url: img.url || thumbUrl,
                    workflow_id: img.workflow_id || null,
                    model: img.model || img.model_name || null,
                    prompt: img.prompt || img.full_prompt || null,
                };
                const json = JSON.stringify(payload);
                ev.dataTransfer.setData("application/json+usgromana-image", json);
                ev.dataTransfer.setData("application/json", json);
                ev.dataTransfer.setData("text/plain", json);
                ev.dataTransfer.effectAllowed = "copyMove";
            } catch (err) {
                console.warn("[UsgromanaGallery] Drag payload error:", err);
            }
        });
    }

    card.addEventListener("click", () => {
        const finalIndex = Number(card.dataset.index);
        setSelectedIndex(finalIndex);
        showDetailsForIndex(finalIndex);
    });

    card.appendChild(frame);
    return card;
}

// ---------------------------------------------------------------------
// Ratings + persistence
// ---------------------------------------------------------------------

function getRatingForImage(img) {
    if (typeof img.rating === "number") return img.rating;
    if (img.filename && ratingMap.has(img.filename)) return ratingMap.get(img.filename);
    return 0;
}

function setRating(img, rating) {
    if (img) {
        img.rating = rating;
        if (img.filename) {
            ratingMap.set(img.filename, rating);
            saveRatingToServer(img.filename, rating);
        }
    }
    renderGridContent();
}

async function saveRatingToServer(filename, rating) {
    try {
        await fetch("/usgromana-gallery/rating", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename, rating }),
        });
    } catch (err) { console.warn("[UsgromanaGallery] Failed to persist rating:", err); }
}

async function loadRatingsFromServer() {
    try {
        const res = await fetch("/usgromana-gallery/ratings", {
            method: "GET", headers: { Accept: "application/json" },
        });
        if (res.ok) {
            const data = await res.json();
            if (data && typeof data === "object") {
                ratingMap = new Map(Object.entries(data));
            }
        } else if (res.status !== 404) {
            console.warn("[USG-Gallery] Ratings fetch failed:", res.status, res.statusText);
        }
    } catch (err) {
        console.warn("[USG-Gallery] Ratings fetch error:", err);
    } finally {
        // 🔹 No matter what happened, try to render with whatever we have
        renderGridContent();
    }
}
