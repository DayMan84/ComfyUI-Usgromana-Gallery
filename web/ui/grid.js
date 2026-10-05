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
import { subscribeTheme, getCurrentTheme } from "../core/themeManager.js"; 
import { bindImageContextMenu } from "./imageMenu.js";

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

window.__USG_GALLERY_CAPTURE__ = window.__USG_GALLERY_CAPTURE__ || false;

let comfyGuardInstalled = false;
let origQueuePrompt = null;
let origQueuePromptAll = null;
let origClearGraph = null;

function ensureGalleryGridStyles() {
    if (document.getElementById("usg-gallery-grid-style")) return;
    const style = document.createElement("style");
    style.id = "usg-gallery-grid-style";
    style.textContent = `
        .usg-gallery-grid img { border-radius: inherit; display: block; }
    `;
    document.head.appendChild(style);
}

export function clearGridThumbnails() {
    if (!gridContentEl) return;
    gridContentEl.innerHTML = "";
}

export async function reloadImagesAndRender() {
    clearGridThumbnails();
}

export function initGrid(root) {
    rootEl = root;
    ensureGalleryGridStyles();
}

function createCard(img, index) {
    const card = document.createElement("div");
    bindImageContextMenu(card, img);
    return card;
}
