// ComfyUI-Usgromana-Gallery/web/ui/details.js
// Persistent details overlay + 3-image viewer (1 full + 2 thumbs)
// Details NEVER generates thumbnails. It only reuses thumbs registered by the grid/state.

import { getImages, setImages, resetGridHasSetVisibleImagesFlag } from "../core/state.js";
import { galleryApi } from "../core/api.js";
import { fetchCurrentUser, canEditMetadata } from "../core/user.js";
import { API_BASE, API_ENDPOINTS, PERFORMANCE } from "../core/constants.js";
import { formatFileSize, formatDate, unloadImage } from "../core/utils.js";
import { attachPreviewControls, onPreviewHide, onPreviewImage, onPreviewLayout, registerPreviewHost } from "./previewSocial.js";

let modalEl = null;
let cardEl = null;
let imgEl = null;

let btnMeta = null;
let btnOpen = null;
let btnClose = null;
let btnZoom = null;
let topControls = null;

// Zoom and drag state
let zoomEnabled = false;
let currentZoom = 1.0;
let currentPanX = 0;
let currentPanY = 0;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let zoomStartPanX = 0;
let zoomStartPanY = 0;

let leftTile = null;
let rightTile = null;
let leftTileImg = null;
let rightTileImg = null;

let metaPanel = null;
let metaContent = null;


let currentIndex = null;
let currentFilteredIndex = null; // Track filtered index directly - never re-derive
let currentImageUrl = null;
let currentImageInfo = null;
let metadataVisible = false;
let leftTargetIndex = null;
let rightTargetIndex = null;

// Folder context for navigation (when opened from explorer)
let folderFilter = null; // null = all images, string = folder path to filter by

// Navigation sequence counter to prevent race conditions from concurrent showDetailsForIndex calls
let detailsNavSeq = 0;

// Track pending unload operations to prevent stale callbacks from unloading the current image
let pendingUnload = { idleId: null, timeoutId: null };

function cancelPendingUnload() {
    if (pendingUnload.idleId != null && "cancelIdleCallback" in window) {
        cancelIdleCallback(pendingUnload.idleId);
    }
    if (pendingUnload.timeoutId != null) {
        clearTimeout(pendingUnload.timeoutId);
    }
    pendingUnload.idleId = null;
    pendingUnload.timeoutId = null;
}

// permissions
let currentUser = null;
let canEditMeta = false;

// metadata cache (filename -> meta) with size limit to prevent memory leaks
const metaCache = new Map();
const MAX_META_CACHE_SIZE = 500;

// --------------------------
// Helpers: metadata
// --------------------------

async function getSavedMeta(filename) {
    if (!filename) return {};
    if (metaCache.has(filename)) return metaCache.get(filename);

    try {
        const m = await galleryApi.getMetadata(filename);
        const meta = (m && typeof m === "object") ? m : {};
        
        // Limit cache size - remove oldest entries if over limit
        if (metaCache.size >= MAX_META_CACHE_SIZE) {
            const firstKey = metaCache.keys().next().value;
            metaCache.delete(firstKey);
        }
        metaCache.set(filename, meta);
        return meta;
    } catch {
        const meta = {};
        // Limit cache size
        if (metaCache.size >= MAX_META_CACHE_SIZE) {
            const firstKey = metaCache.keys().next().value;
            metaCache.delete(firstKey);
        }
        metaCache.set(filename, meta);
        return meta;
    }
}

async function ensureHistoryMarker(imgInfo) {
    if (!imgInfo || !imgInfo.filename) return null;

    // merge saved meta (non-destructive)
    // Use relpath if available (includes subdirectory), otherwise fall back to filename
    const metaKey = imgInfo.relpath || imgInfo.filename;
    const saved = await getSavedMeta(metaKey);
    if (saved && typeof saved === "object") {
        if (imgInfo.tags == null && Array.isArray(saved.tags)) imgInfo.tags = saved.tags;
        if (imgInfo.rating == null && typeof saved.rating === "number") imgInfo.rating = saved.rating;
        if (imgInfo.display_name == null && typeof saved.display_name === "string") imgInfo.display_name = saved.display_name;
        if (imgInfo.folder == null && typeof saved.folder === "string") imgInfo.folder = saved.folder;
        if (imgInfo.prompt == null && typeof saved.prompt === "string") imgInfo.prompt = saved.prompt;
        if (imgInfo.full_prompt == null && typeof saved.full_prompt === "string") imgInfo.full_prompt = saved.full_prompt;
    }

    return null;
}

// --------------------------
// Init persistent overlay (build once)
// --------------------------
export function initDetails(_rootIgnored) {
    if (modalEl) return; // persistent build-once

    // permissions fetch (async)
    fetchCurrentUser()
        .then((user) => {
            currentUser = user;
            canEditMeta = canEditMetadata(user);
            if (modalEl && modalEl.style.display !== "none" && currentImageInfo) {
                // re-render metadata to reflect edit permissions
                fillMetadata(currentImageInfo);
            }
        })
        .catch(() => {
            currentUser = null;
            canEditMeta = false;
        });

    // backdrop
    modalEl = document.createElement("div");
    modalEl.className = "usg-gallery-modal-overlay";
    Object.assign(modalEl.style, {
        position: "fixed",
        inset: "0",
        zIndex: "20000",
        display: "none",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.82)",
        backdropFilter: "none",
    });

    modalEl.addEventListener("click", (ev) => {
        if (ev.target === modalEl) hideDetails();
    });

    // card container
    cardEl = document.createElement("div");
    cardEl.className = "usg-gallery-modal-card";
    Object.assign(cardEl.style, {
        position: "relative",
        borderRadius: "12px",
        background: "rgba(20,20,20,0.92)",
        border: "1px solid rgba(255,255,255,0.12)",
        boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
        padding: "10px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "10px",
    });

    imgEl = document.createElement("img");
    imgEl.alt = "Selected image";
    imgEl.decoding = "async";
    Object.assign(imgEl.style, {
        maxWidth: "85vw",
        maxHeight: "85vh",
        borderRadius: "10px",
        display: "block",
        userSelect: "none",
        padding: "-6px",
        transition: "transform 0.1s ease-out",
        transformOrigin: "center center",
    });
    cardEl.appendChild(imgEl);
    
    // Setup zoom and drag event listeners
    setupZoomAndDrag();

    // top-right buttons
    topControls = document.createElement("div");
    Object.assign(topControls.style, {
        position: "absolute",
        top: "10px",
        right: "10px",
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        zIndex: "2",
    });

    const mkBtn = (label, title) => {
        const b = document.createElement("button");
        b.textContent = label;
        b.title = title;
        Object.assign(b.style, {
            fontSize: "12px",
            cursor: "pointer",
            background: "rgba(0, 0, 0, 0.1)",
            border: "none",
            padding: "4px 6px",
            margin: "0",
            color: "#e5e7eb",
            borderRadius: "1px",
        });
        return b;
    };

    btnClose = mkBtn("✖", "Close");
    btnClose.onclick = (ev) => {
        ev.stopPropagation();
        hideDetails();
    };

    btnMeta = mkBtn("ⓘ", "Show metadata");
    btnMeta.onclick = (ev) => {
        ev.stopPropagation();
        toggleMetadata();
    };

    btnOpen = mkBtn("⌕", "Open image in new tab");
    btnOpen.onclick = (ev) => {
        ev.stopPropagation();
        if (currentImageUrl) window.open(currentImageUrl, "_blank", "noopener,noreferrer");
    };

    btnZoom = mkBtn("+", "Zoom and drag mode");
    btnZoom.onclick = (ev) => {
        ev.stopPropagation();
        toggleZoomMode();
    };

    topControls.appendChild(btnClose);
    topControls.appendChild(btnMeta);
    topControls.appendChild(btnOpen);
    topControls.appendChild(btnZoom);
    attachPreviewControls();
    cardEl.appendChild(topControls);

    // side tiles
    leftTile = createSideTile("left");
    rightTile = createSideTile("right");
    modalEl.appendChild(leftTile);
    modalEl.appendChild(rightTile);

    // metadata panel
    metaPanel = document.createElement("div");
    Object.assign(metaPanel.style, {
        position: "fixed", // Fixed relative to viewport, not modal
        top: "50%",
        right: "0",
        transform: "translateY(-50%)", // Center vertically
        height: "90vh", // Use viewport height instead of 100%
        maxHeight: "85vh",
        width: "340px",
        padding: "10px",
        display: "none",
        flexDirection: "column",
        background: "rgba(15,15,15,0.92)",
        borderLeft: "1px solid rgba(255,255,255,0.12)",
        zIndex: "20001", // Above the card
    });

    metaContent = document.createElement("div");
    metaContent.className = "usg-gallery-meta-content";
    Object.assign(metaContent.style, {
        overflow: "auto",
        paddingRight: "6px",
        flex: "1",
        color: "#e5e7eb",
        fontSize: "12px",
        // Hide scrollbar but keep scrolling
        scrollbarWidth: "none", // Firefox
        msOverflowStyle: "none", // IE/Edge
    });
    
    // Add CSS to hide scrollbar for webkit browsers (Chrome, Safari)
    if (!document.getElementById("usg-gallery-meta-scrollbar-style")) {
        const style = document.createElement("style");
        style.id = "usg-gallery-meta-scrollbar-style";
        style.textContent = `
            .usg-gallery-meta-content::-webkit-scrollbar {
                width: 0px;
                background: transparent;
            }
            .usg-gallery-meta-content::-webkit-scrollbar-track {
                background: transparent;
            }
            .usg-gallery-meta-content::-webkit-scrollbar-thumb {
                background: transparent;
            }
        `;
        document.head.appendChild(style);
    }

    metaPanel.appendChild(metaContent);
    // Attach metadata panel to modalEl so it's positioned relative to the modal, not the card
    modalEl.appendChild(metaPanel);

    // compose
    modalEl.appendChild(cardEl);
    document.body.appendChild(modalEl);

    // keyboard nav
    window.addEventListener("keydown", (ev) => {
        if (!modalEl || modalEl.style.display === "none") return;

        if (ev.key === "Escape") {
            ev.preventDefault();
            hideDetails();
        } else if (ev.key === "ArrowLeft") {
            ev.preventDefault();
            navigateRelative(-1);
        } else if (ev.key === "ArrowRight") {
            ev.preventDefault();
            navigateRelative(1);
        }
    });
}
