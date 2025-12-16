// ComfyUI-Usgromana-Gallery/web/ui/grid.js

import {
    subscribe,
    getAllImagesRaw,
    setSelectedIndex,
    setVisibleImages,
    setImages,
    registerThumbnail,
    getImageKey,
    getImages,
    resetGridHasSetVisibleImagesFlag,
} from "../core/state.js";
import { showDetailsForIndex, clearFolderFilter } from "./details.js";
import {
    getGallerySettings,
    subscribeGallerySettings,
    updateGallerySettings,
} from "../core/gallerySettings.js";
import { galleryApi } from "../core/api.js";
import { API_BASE, API_ENDPOINTS, PERFORMANCE } from "../core/constants.js";
import { debounce, unloadImage } from "../core/utils.js"; 

let rootEl = null;
let gridContentEl = null;
let loadingIndicatorEl = null;

let lastState = null;
let lastImageCount = 0; // Track previous image count separately to detect deletions
let ratingMap = new Map();
let minRatingFilter = 0;
let gallerySettings = getGallerySettings();
let searchQuery = "";
let unsubscribeState = null;
let unsubscribeSettings = null;

// Image loading progress tracking
let imageLoadProgress = {
    total: 0,
    loaded: 0,
    failed: 0,
    visible: 0,  // Images that have entered viewport
    currentImage: null,
    startTime: null,
    imageElements: new Map(),  // Track all image elements
};

let filterToggleBtn = null;
let selectedImages = new Set(); // For batch operations
let batchDownloadBtn = null;
let batchDeleteBtn = null;

// Debounced search render with cancellation support
let debounceTimer = null;
const debouncedRender = debounce(() => {
    // Cancel any pending hideLoadingIndicator timeouts
    if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
    }
    renderGridContent();
}, PERFORMANCE.DEBOUNCE_DELAY);

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
        /* Optimize large images in grid */
        .usg-gallery-card img {
            image-rendering: -webkit-optimize-contrast;
            image-rendering: crisp-edges;
            backface-visibility: hidden;
            transform: translateZ(0); /* Force GPU acceleration */
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
        unloadImage(img);
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
    
    // Reset progress tracking
    imageLoadProgress.total = 0;
    imageLoadProgress.loaded = 0;
    imageLoadProgress.failed = 0;
    imageLoadProgress.visible = 0;
    imageLoadProgress.currentImage = null;
    imageLoadProgress.imageElements.clear();
    
    showLoadingIndicator();

    try {
        const images = await galleryApi.listImages();
        
        
        // On manual refresh, reset the flag so setImages can reset visibleImages
        // This allows grid to re-apply filters/sort from scratch
        // We'll reset the flag in setVisibleImages after renderGridContent() sets it
        // NOTE: Don't update lastImageCount here - let the subscription callback handle it
        // This prevents race conditions where lastImageCount is updated before subscription fires
        setImages(images, true);   // subscribe() → renderGridContent()
        
        // Pre-generate thumbnails in the background for faster loading
        // Don't await - let it run in background
        galleryApi.batchGenerateThumbnails().catch(err => {
            console.warn("[USG-Gallery] Background thumbnail generation failed:", err);
        });
    } catch (err) {
        console.warn("[USG-Gallery] Failed to reload images:", err);
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/53126dc7-8464-4cbf-a9de-c8319b36dae0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'grid.js:165',message:'reloadImagesAndRender error',data:{error:err.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run3',hypothesisId:'W'})}).catch(()=>{});
        // #endregion
        // fallback: at least render whatever state we already had
        renderGridContent();
        hideLoadingIndicator();
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

    // ⬇️ Ensure we have images on first open
    // Reset the flag to allow initial load - always reset on initGrid
    resetGridHasSetVisibleImagesFlag();
    
    // Expose loading functions to window for entry.js to use
    if (typeof window !== 'undefined') {
        window.__USG_GALLERY_GRID_INIT__ = true;
        window.USG_GALLERY_SHOW_LOADING = showLoadingIndicator;
        window.USG_GALLERY_HIDE_LOADING = hideLoadingIndicator;
        window.USG_GALLERY_RELOAD_IMAGES = reloadImagesAndRender;
        // Expose function to update rating from details panel
        window.__USG_GALLERY_UPDATE_RATING__ = (key, rating) => {
            if (key) {
                ratingMap.set(key, rating);
                // Also update with filename if relpath was used
                const parts = key.split('/');
                if (parts.length > 1 && parts[parts.length - 1]) {
                    const filename = parts[parts.length - 1];
                    ratingMap.set(filename, rating);
                }
                // Update image object if it exists in state
                const allImages = getAllImagesRaw();
                for (const img of allImages) {
                    const imgKey = img.relpath || img.filename;
                    if (imgKey === key) {
                        img.rating = rating;
                        break;
                    }
                }
                renderGridContent();
            }
        };
    }
    
    reloadImagesAndRender();

    unsubscribeSettings = subscribeGallerySettings((s) => {
        gallerySettings = s;
        renderGridContent();
    });

    loadRatingsFromServer();

    unsubscribeState = subscribe((state) => {
        const prevImages = lastState ? lastState.images : null;
        const newImages = state ? state.images : null;
        // CRITICAL: Use separately tracked count instead of lastState.images.length
        // This prevents issues when lastState and state reference the same object
        const prevCount = lastImageCount;
        const newCount = newImages?.length || 0;


        // Update tracking variables AFTER capturing previous values
        lastState = state;
        lastImageCount = newCount;

        const isEmpty = !gridContentEl || gridContentEl.childElementCount === 0;
        
        // CRITICAL FIX: Check count change FIRST - if count changed, always re-render
        // This handles deletions/additions even if reference appears the same
        const countChanged = prevCount !== newCount;
        const countDecreased = newCount < prevCount; // Deletion detected
        const sameReference = prevImages === newImages && prevImages !== null;
        
        // Always re-render if:
        // 1. Count changed (including deletions)
        // 2. Reference changed
        // 3. Grid is empty
        // 4. Count decreased (force re-render on deletion even if count appears same due to timing)
        if (!isEmpty && sameReference && !countChanged && !countDecreased) {
            return;
        }

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
        searchQuery = searchInput.value || "";
        debouncedRender();
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

    // Batch operations buttons
    batchDownloadBtn = document.createElement("button");
    batchDownloadBtn.textContent = "Download Selected";
    batchDownloadBtn.style.display = "none";
    Object.assign(batchDownloadBtn.style, {
        borderRadius: "999px",
        border: "1px solid rgba(148,163,184,0.6)",
        padding: "4px 10px",
        fontSize: "12px",
        background: "rgba(15,23,42,0.9)",
        color: "#e5e7eb",
        cursor: "pointer",
        marginLeft: "6px",
    });
    batchDownloadBtn.onclick = async () => {
        if (selectedImages.size === 0) return;
        const filenames = Array.from(selectedImages);
        try {
            const blob = await galleryApi.batchDownload(filenames);
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "gallery_images.zip";
            a.click();
            URL.revokeObjectURL(url);
            selectedImages.clear();
            updateBatchButtons();
            renderGridContent();
        } catch (err) {
            alert("Download failed: " + err.message);
        }
    };
    filterBar.appendChild(batchDownloadBtn);

    batchDeleteBtn = document.createElement("button");
    batchDeleteBtn.textContent = "Delete Selected";
    batchDeleteBtn.style.display = "none";
    Object.assign(batchDeleteBtn.style, {
        borderRadius: "999px",
        border: "1px solid rgba(220,38,38,0.6)",
        padding: "4px 10px",
        fontSize: "12px",
        background: "rgba(220,38,38,0.2)",
        color: "#fca5a5",
        cursor: "pointer",
        marginLeft: "6px",
    });
    batchDeleteBtn.onclick = async () => {
        if (selectedImages.size === 0) return;
        if (!confirm(`Delete ${selectedImages.size} image(s)?`)) return;
        const filenames = Array.from(selectedImages);
        try {
            await galleryApi.batchDelete(filenames);
            selectedImages.clear();
            updateBatchButtons();
            reloadImagesAndRender();
        } catch (err) {
            alert("Delete failed: " + err.message);
        }
    };
    filterBar.appendChild(batchDeleteBtn);

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
        // Toggle filter panel visibility only (no state change)
        if (window.USG_GALLERY_TOGGLE_FILTERS) {
            window.USG_GALLERY_TOGGLE_FILTERS();
        } else if (window.USG_GALLERY_OPEN_FILTERS) {
            // Fallback: just open if toggle not available
            window.USG_GALLERY_OPEN_FILTERS();
        }
    };
    filterBar.appendChild(filterToggleBtn);
    rootEl.appendChild(filterBar);

    const scrollContainer = document.createElement("div");
    scrollContainer.classList.add("usg-gallery-scroll");
    Object.assign(scrollContainer.style, {
        flex: "1", overflowY: "auto", width: "100%", paddingRight: "5px",
        position: "relative", // Needed for loading indicator positioning
    });

    gridContentEl = document.createElement("div");
    gridContentEl.className = "usg-gallery-grid";
    scrollContainer.appendChild(gridContentEl);
    rootEl.appendChild(scrollContainer);

    // Create loading indicator
    createLoadingIndicator();

    updateFilterButtons();
    updateBatchButtons();
}

function updateBatchButtons() {
    const count = selectedImages.size;
    if (batchDownloadBtn) {
        batchDownloadBtn.style.display = count > 0 ? "inline-block" : "none";
        batchDownloadBtn.textContent = `Download Selected (${count})`;
    }
    if (batchDeleteBtn) {
        batchDeleteBtn.style.display = count > 0 ? "inline-block" : "none";
        batchDeleteBtn.textContent = `Delete Selected (${count})`;
    }
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

// ---------------------------------------------------------------------
// Loading indicator
// ---------------------------------------------------------------------

function createLoadingIndicator() {
    if (loadingIndicatorEl && loadingIndicatorEl.parentElement) return;
    
    // If indicator exists but was removed from DOM, recreate it
    if (loadingIndicatorEl && !loadingIndicatorEl.parentElement) {
        loadingIndicatorEl = null;
    }
    
    if (loadingIndicatorEl) return;
    
    loadingIndicatorEl = document.createElement("div");
    loadingIndicatorEl.className = "usg-gallery-loading";
    
    Object.assign(loadingIndicatorEl.style, {
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        display: "none", // Start hidden, will be shown by showLoadingIndicator()
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "16px",
        zIndex: "1000",
        pointerEvents: "none", // Important: don't block interactions
        background: "rgba(15, 23, 42, 0.95)",
        padding: "24px 32px",
        borderRadius: "12px",
        border: "1px solid rgba(148,163,184,0.3)",
        minWidth: "400px",
    });
    
    // Status message
    const statusEl = document.createElement("div");
    statusEl.className = "usg-loading-status";
    statusEl.textContent = "Loading images...";
    Object.assign(statusEl.style, {
        fontSize: "16px",
        color: "#e5e7eb",
        fontWeight: "600",
        textAlign: "center",
        marginBottom: "8px",
    });
    
    // Current image name
    const imageNameEl = document.createElement("div");
    imageNameEl.className = "usg-loading-image-name";
    imageNameEl.textContent = "";
    Object.assign(imageNameEl.style, {
        fontSize: "12px",
        color: "#94a3b8",
        textAlign: "center",
        marginBottom: "12px",
        maxWidth: "100%",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
    });
    
    // Progress bar container
    const progressContainer = document.createElement("div");
    Object.assign(progressContainer.style, {
        width: "100%",
        height: "8px",
        background: "rgba(148,163,184,0.2)",
        borderRadius: "4px",
        overflow: "hidden",
        position: "relative",
        marginBottom: "8px",
    });
    
    // Progress bar fill
    const progressBar = document.createElement("div");
    progressBar.className = "usg-gallery-progress-bar";
    Object.assign(progressBar.style, {
        height: "100%",
        width: "0%",
        background: "linear-gradient(90deg, rgba(56,189,248,0.9) 0%, rgba(147,51,234,0.9) 100%)",
        borderRadius: "4px",
        transition: "width 0.3s ease",
    });
    
    // Progress percentage text
    const progressTextEl = document.createElement("div");
    progressTextEl.className = "usg-loading-progress-text";
    progressTextEl.textContent = "0%";
    Object.assign(progressTextEl.style, {
        fontSize: "14px",
        color: "#38bdf8",
        fontWeight: "500",
        textAlign: "center",
    });
    
    progressContainer.appendChild(progressBar);
    loadingIndicatorEl.appendChild(statusEl);
    loadingIndicatorEl.appendChild(imageNameEl);
    loadingIndicatorEl.appendChild(progressContainer);
    loadingIndicatorEl.appendChild(progressTextEl);
    
    // Insert into scroll container (parent of gridContentEl), not into gridContentEl itself
    // This ensures it survives gridContentEl.innerHTML = "" calls
    if (gridContentEl && gridContentEl.parentElement) {
        const scrollContainer = gridContentEl.parentElement;
        scrollContainer.style.position = "relative";
        // Only append if not already there
        if (!scrollContainer.contains(loadingIndicatorEl)) {
            scrollContainer.appendChild(loadingIndicatorEl);
        }
    }
}

function updateLoadingProgress(loaded, total, currentImageName = null, status = "Loading images...") {
    // Ensure loading indicator exists and is in DOM
    if (!loadingIndicatorEl || !loadingIndicatorEl.parentElement) {
        createLoadingIndicator();
    }
    
    // Ensure it's visible when updating
    if (loadingIndicatorEl && loadingIndicatorEl.style.display === "none") {
        loadingIndicatorEl.style.display = "flex";
    }
    
    imageLoadProgress.loaded = loaded;
    imageLoadProgress.total = total;
    imageLoadProgress.currentImage = currentImageName;
    
    // Calculate percentage based on visible images, not total
    // CRITICAL: Account for failed images (e.g., deleted files) in progress calculation
    const visibleTotal = imageLoadProgress.visible || total;
    const attempted = imageLoadProgress.loaded + imageLoadProgress.failed;
    // Calculate percentage based on attempted images (loaded + failed) vs visible total
    const percentage = visibleTotal > 0 ? Math.round((attempted / visibleTotal) * 100) : 0;
    
    const statusEl = loadingIndicatorEl.querySelector(".usg-loading-status");
    const imageNameEl = loadingIndicatorEl.querySelector(".usg-loading-image-name");
    const progressBar = loadingIndicatorEl.querySelector(".usg-gallery-progress-bar");
    const progressTextEl = loadingIndicatorEl.querySelector(".usg-loading-progress-text");
    
    if (statusEl) statusEl.textContent = status;
    if (imageNameEl) {
        imageNameEl.textContent = currentImageName || "";
        imageNameEl.style.display = currentImageName ? "block" : "none";
    }
    if (progressBar) progressBar.style.width = `${percentage}%`;
    if (progressTextEl) {
        // Show both visible progress and total count, including failed images
        if (visibleTotal < total) {
            if (imageLoadProgress.failed > 0) {
                progressTextEl.textContent = `${percentage}% (${loaded} loaded, ${imageLoadProgress.failed} failed / ${visibleTotal} visible, ${total} total)`;
            } else {
                progressTextEl.textContent = `${percentage}% (${loaded}/${visibleTotal} visible, ${total} total)`;
            }
        } else {
            if (imageLoadProgress.failed > 0) {
                progressTextEl.textContent = `${percentage}% (${loaded} loaded, ${imageLoadProgress.failed} failed / ${total})`;
            } else {
                progressTextEl.textContent = `${percentage}% (${loaded}/${total})`;
            }
        }
    }
    
    // Auto-hide when all visible images are loaded
    // Don't auto-hide immediately - let user see completion
    // Hide will be triggered manually when appropriate
}

function showLoadingIndicator() {
    if (!loadingIndicatorEl) createLoadingIndicator();
    if (loadingIndicatorEl) {
        // Ensure it's in the DOM
        if (!loadingIndicatorEl.parentElement && gridContentEl && gridContentEl.parentElement) {
            gridContentEl.parentElement.appendChild(loadingIndicatorEl);
        }
        loadingIndicatorEl.style.display = "flex";
        imageLoadProgress.startTime = Date.now();
    }
}

function hideLoadingIndicator() {
    if (loadingIndicatorEl) {
        loadingIndicatorEl.style.display = "none";
        // Don't reset progress completely - keep totals for reference
        imageLoadProgress.currentImage = null;
    }
}


// ---------------------------------------------------------------------
// Core render
// ---------------------------------------------------------------------

function renderGridContent() {
    if (!gridContentEl) return;

    
    // Clear grid content but preserve loading indicator (it's in parent)
    gridContentEl.innerHTML = "";
    const allImages = getAllImagesRaw();
    

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

    // Only apply grouping/sorting if filters are enabled
    let groups;
    let flatList = [];
    if (gallerySettings.showDividers) {
        groups = groupImagesForDividers(filtered, gallerySettings);
        groups.forEach((g) => g.items.forEach((img) => flatList.push(img)));
    } else {
        // When filters are disabled, use images in their original order (no sorting/grouping)
        flatList = filtered;
        groups = [{ header: null, items: flatList }];
    }
    
    setVisibleImages(flatList);

    if (!flatList.length) {
        const empty = document.createElement("div");
        empty.textContent = "No images found.";
        Object.assign(empty.style, {
            color: "#aaa", fontSize: "14px", textAlign: "center", marginTop: "40px", width: "100%",
        });
        gridContentEl.appendChild(empty);
        return;
    }

    const baseThumbWidth = gallerySettings.thumbSize === "sm" ? 120 : gallerySettings.thumbSize === "lg" ? 220 : 160;
    // Only show dividers if filters are enabled AND a divider mode is selected
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

    // Initialize loading progress tracking
    // Cancel any pending hide timer when re-rendering
    if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
    }
    
    // Clear any existing progress timeout
    if (imageLoadProgress.progressTimeout) {
        clearTimeout(imageLoadProgress.progressTimeout);
        imageLoadProgress.progressTimeout = null;
    }
    
    imageLoadProgress.total = flatList.length;
    imageLoadProgress.loaded = 0;
    imageLoadProgress.failed = 0;
    imageLoadProgress.visible = 0;
    imageLoadProgress.currentImage = null;
    imageLoadProgress.imageElements.clear();
    
    // Set a safety timeout to hide loading indicator if it gets stuck
    // This prevents the loading bar from freezing indefinitely
    imageLoadProgress.progressTimeout = setTimeout(() => {
        if (imageLoadProgress.loaded > 0) {
            // If some images loaded, hide the indicator (they'll continue loading in background)
            hideLoadingIndicator();
        }
        imageLoadProgress.progressTimeout = null;
    }, 10000); // 10 second timeout
    
    
    if (flatList.length > 0) {
        // Ensure loading indicator exists and is visible
        if (!loadingIndicatorEl) {
            createLoadingIndicator();
        }
        showLoadingIndicator();
        updateLoadingProgress(0, flatList.length, null, `Ready to load ${flatList.length} images (scroll to load more)...`);
    } else {
        hideLoadingIndicator();
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
                // #region agent log
            });
        });
    }
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
    const imageKey = getImageKey(img);
    const isSelected = imageKey && selectedImages.has(img.filename || img.relpath);

    Object.assign(card.style, {
        background: isSelected ? "rgba(56,189,248,0.15)" : "transparent",
        border: isSelected ? "2px solid rgba(56,189,248,0.7)" : "none",
        cursor: "pointer",
        display: "flex",
        justifyContent: "center",
        width: "100%",
        position: "relative",
        breakInside: "avoid",
    });

    const frame = document.createElement("div");
    Object.assign(frame.style, {
        borderRadius: "10px", overflow: "hidden", display: "flex",
        alignItems: "center", justifyContent: "center", width: "100%", position: "relative",
    });

    const imgEl = document.createElement("img");

    // Build safest thumbnail URL we can
    // Always use relpath if available to ensure correct thumbnail mapping
    const rel = img.relpath || img.filename || "";
    let thumbUrl =
        img.thumb_url ||
        (() => {
            if (rel) {
                const encoded = encodeURIComponent(rel);
                return `${API_ENDPOINTS.IMAGE}?filename=${encoded}&size=thumb`;
            }
            return img.url || ""; // Fallback to full URL if no relpath
        })();

    // #region agent log
    // #endregion

    // 🔹 Register thumbnail so Details & History can reuse it
    if (imageKey && thumbUrl) {
        registerThumbnail(imageKey, thumbUrl);
    }

    imgEl.alt = img.filename || img.relpath || "";
    imgEl.loading = "lazy";
    imgEl.decoding = "async";
    
    // Check if this is a large image - if so, optimize loading
    const imageSize = img.file_size || img.size || img.bytes || 0;
    const isLargeImage = imageSize > 10 * 1024 * 1024; // > 10MB
    
    if (isLargeImage) {
        // Use will-change hint for large images
        imgEl.style.willChange = "contents";
        // Ensure we're using thumbnail, not full-size
        if (!thumbUrl.includes("size=thumb") && !thumbUrl.includes("_thumbs")) {
            const rel = img.relpath || img.filename || "";
            const encoded = encodeURIComponent(rel);
            thumbUrl = `${API_ENDPOINTS.IMAGE}?filename=${encoded}&size=thumb`;
        }
    }

    Object.assign(imgEl.style, {
        width: "100%",
        height: "auto",
        objectFit: "contain",
        display: "block",
        borderRadius: "inherit",
        opacity: "0",
        transition: "opacity 0.2s ease",
    });
    
    // Track image loading progress
    const imageName = img.filename || img.relpath || "Unknown";
    const loadStartTime = Date.now();
    
    
    // Track this image element
    imageLoadProgress.imageElements.set(imageName, imgEl);
    
    // Use IntersectionObserver for better performance with large grids
    if ("IntersectionObserver" in window) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    if (!imgEl.src) {
                        imageLoadProgress.visible++;
                        imgEl.src = thumbUrl;
                        updateLoadingProgress(
                            imageLoadProgress.loaded,
                            imageLoadProgress.total,
                            imageName,
                            `Loading: ${imageName}`
                        );
                        
                        // Check if image is already cached (browser cache)
                        // If so, trigger onload immediately after a small delay
                        // This ensures the onload handler is set up first
                        setTimeout(() => {
                            if (imgEl.complete && imgEl.naturalWidth > 0 && imgEl.naturalHeight > 0) {
                                // Image was cached, trigger onload manually
                                if (imgEl.onload) {
                                    imgEl.onload();
                                }
                            }
                        }, 10);
                    }
                    observer.unobserve(imgEl);
                }
            });
        }, { rootMargin: "50px" });
        
        // Store observer on element for potential cleanup
        imgEl._intersectionObserver = observer;
        observer.observe(imgEl);
        
        // #region agent log
        // #endregion
    } else {
        // Fallback for browsers without IntersectionObserver - load immediately
        imageLoadProgress.visible++;
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/53126dc7-8464-4cbf-a9de-c8319b36dae0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'grid.js:1088',message:'No IntersectionObserver, setting src immediately',data:{imageName,thumbUrl,visible:imageLoadProgress.visible},timestamp:Date.now(),sessionId:'debug-session',runId:'run3',hypothesisId:'S'})}).catch(()=>{});
        // #endregion
        imgEl.src = thumbUrl;
        updateLoadingProgress(
            imageLoadProgress.loaded,
            imageLoadProgress.total,
            imageName,
            `Loading: ${imageName}`
        );
    }
    
    imgEl.onload = () => {
        const loadTime = Date.now() - loadStartTime;
        imageLoadProgress.loaded++;
        
        // Remove will-change after load to free resources
        if (imgEl.style.willChange === "contents") {
            requestAnimationFrame(() => {
                imgEl.style.willChange = "auto";
            });
        }
        
        // #region agent log
        const imageSize = img.file_size || img.size || 0;
        fetch('http://127.0.0.1:7244/ingest/53126dc7-8464-4cbf-a9de-c8319b36dae0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'grid.js:1200',message:'Image loaded',data:{imageName,loadTime,imageSize,loaded:imageLoadProgress.loaded,visible:imageLoadProgress.visible,total:imageLoadProgress.total},timestamp:Date.now(),sessionId:'debug-session',runId:'run4',hypothesisId:'I'})}).catch(()=>{});
        // #endregion
        
        // Use requestAnimationFrame to avoid blocking main thread
        requestAnimationFrame(() => {
            imgEl.style.opacity = "1";
        });
        
        const visibleTotal = imageLoadProgress.visible || imageLoadProgress.total;
        updateLoadingProgress(
            imageLoadProgress.loaded,
            imageLoadProgress.total,
            null,
            `Loaded ${imageLoadProgress.loaded}/${visibleTotal} visible images`
        );
        
        // Hide loading indicator when all visible images have been attempted (loaded or failed)
        // CRITICAL: Account for failed images (e.g., deleted files) so progress bar completes
        const attempted = imageLoadProgress.loaded + imageLoadProgress.failed;
        if (attempted >= visibleTotal && visibleTotal > 0) {
            // Clear safety timeout since we're completing normally
            if (imageLoadProgress.progressTimeout) {
                clearTimeout(imageLoadProgress.progressTimeout);
                imageLoadProgress.progressTimeout = null;
            }
            
            // Cancel any previous hide timer
            if (debounceTimer) {
                clearTimeout(debounceTimer);
            }
            debounceTimer = setTimeout(() => {
                // Double-check before hiding - ensure all visible images have been attempted
                const currentAttempted = imageLoadProgress.loaded + imageLoadProgress.failed;
                if (currentAttempted >= imageLoadProgress.visible && 
                    imageLoadProgress.visible > 0) {
                    hideLoadingIndicator();
                }
                debounceTimer = null;
            }, 500);
        }
    };
    
    // Handle cached images - if image is already loaded, trigger onload immediately
    if (imgEl.complete && imgEl.naturalWidth > 0) {
        // Image is already cached and loaded
        setTimeout(() => {
            if (imgEl.complete) {
                imgEl.onload();
            }
        }, 0);
    }
    
    imgEl.onerror = () => {
        imageLoadProgress.failed++;
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/53126dc7-8464-4cbf-a9de-c8319b36dae0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'grid.js:1092',message:'Image load error',data:{imageName,thumbUrl,failed:imageLoadProgress.failed},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'J'})}).catch(()=>{});
        // #endregion
        updateLoadingProgress(
            imageLoadProgress.loaded,
            imageLoadProgress.total,
            null,
            `Error loading ${imageName} (${imageLoadProgress.failed} failed)`
        );
        
        // CRITICAL: Check if all visible images have been attempted (loaded or failed)
        // This ensures progress bar completes even when images are deleted
        const visibleTotal = imageLoadProgress.visible || imageLoadProgress.total;
        const attempted = imageLoadProgress.loaded + imageLoadProgress.failed;
        if (attempted >= visibleTotal && visibleTotal > 0) {
            // Clear safety timeout since we're completing normally
            if (imageLoadProgress.progressTimeout) {
                clearTimeout(imageLoadProgress.progressTimeout);
                imageLoadProgress.progressTimeout = null;
            }
            
            // Cancel any previous hide timer
            if (debounceTimer) {
                clearTimeout(debounceTimer);
            }
            debounceTimer = setTimeout(() => {
                // Double-check before hiding - ensure all visible images have been attempted
                const currentAttempted = imageLoadProgress.loaded + imageLoadProgress.failed;
                if (currentAttempted >= imageLoadProgress.visible && 
                    imageLoadProgress.visible > 0) {
                    hideLoadingIndicator();
                }
                debounceTimer = null;
            }, 500);
        }
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
                // Build image URL - prefer relpath for accuracy
                const rel = img.relpath || img.filename || "";
                const imageUrl = img.url || 
                    (rel ? `${API_ENDPOINTS.IMAGE}?filename=${encodeURIComponent(rel)}` : thumbUrl);
                
                const payload = {
                    type: "usgromana-image",
                    filename: img.filename,
                    relpath: img.relpath || img.filename, // Include relpath for proper image loading
                    url: imageUrl,
                    workflow_id: img.workflow_id || null,
                    model: img.model || img.model_name || null,
                    prompt: img.prompt || img.full_prompt || null,
                };
                const json = JSON.stringify(payload);
                ev.dataTransfer.setData("application/json+usgromana-image", json);
                ev.dataTransfer.setData("application/json", json);
                ev.dataTransfer.setData("text/plain", json);
                ev.dataTransfer.effectAllowed = "copy";
                
                // Also set a drag image (optional - shows preview while dragging)
                if (imgEl && imgEl.complete) {
                    try {
                        ev.dataTransfer.setDragImage(imgEl, imgEl.width / 2, imgEl.height / 2);
                    } catch (e) {
                        // setDragImage might fail in some browsers, ignore
                    }
                }
            } catch (err) {
                console.warn("[UsgromanaGallery] Drag payload error:", err);
            }
        });
    }

    card.addEventListener("click", (ev) => {
        // Ctrl/Cmd+Click for multi-select
        if (ev.ctrlKey || ev.metaKey) {
            ev.stopPropagation();
            const key = img.filename || img.relpath;
            if (selectedImages.has(key)) {
                selectedImages.delete(key);
            } else {
                selectedImages.add(key);
            }
            updateBatchButtons();
            renderGridContent(); // Re-render to show selection state
            return;
        }
        
        // Regular click: open details
        const finalIndex = Number(card.dataset.index);
        
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/53126dc7-8464-4cbf-a9de-c8319b36dae0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'grid.js:1250',message:'Card clicked, opening details',data:{index:finalIndex,imageName:img.filename||img.relpath,relpath:img.relpath,thumbUrl,imageUrl:img.url},timestamp:Date.now(),sessionId:'debug-session',runId:'run4',hypothesisId:'AD'})}).catch(()=>{});
        // #endregion
        
        // Clear folder filter when opening from grid (show all images)
        clearFolderFilter();
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
    // Check img.rating first (from image data, may come from metadata)
    if (typeof img.rating === "number") return img.rating;
    // Check ratingMap (from server ratings endpoint)
    // Use relpath if available, fallback to filename
    const key = img.relpath || img.filename;
    if (key && ratingMap.has(key)) return ratingMap.get(key);
    // Also check with just filename if relpath was used but not found
    if (img.relpath && img.filename && ratingMap.has(img.filename)) {
        return ratingMap.get(img.filename);
    }
    return 0;
}

async function setRating(img, rating) {
    if (img) {
        img.rating = rating;
        const key = img.relpath || img.filename;
        if (key) {
            // Update ratingMap for immediate display
            ratingMap.set(key, rating);
            // Also update with filename if relpath was used
            if (img.relpath && img.filename && img.relpath !== img.filename) {
                ratingMap.set(img.filename, rating);
            }
            // Save to ratings endpoint (legacy)
            saveRatingToServer(key, rating);
            // Also save to metadata (newer approach, ensures consistency)
            try {
                await galleryApi.saveMetadata(key, { rating });
            } catch (err) {
                console.warn("[UsgromanaGallery] Failed to save rating to metadata:", err);
            }
        }
    }
    renderGridContent();
}

async function saveRatingToServer(filename, rating) {
    try {
        await fetch(API_ENDPOINTS.RATING, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename, rating }),
        });
    } catch (err) { console.warn("[UsgromanaGallery] Failed to persist rating:", err); }
}

async function loadRatingsFromServer() {
    try {
        const res = await fetch(API_ENDPOINTS.RATINGS, {
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
