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
import { getRatingMap } from "../core/socialApi.js";

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
            box-shadow: 0 6px 20px var(--usg-card-hover-shadow);
            z-index: 5;
        }
        .usg-gallery-scroll::-webkit-scrollbar {
            width: 8px;
            height: 8px;
        }
        .usg-gallery-scroll::-webkit-scrollbar-track {
            background: var(--usg-scrollbar-track);
            border-radius: 999px;
        }
        .usg-gallery-scroll::-webkit-scrollbar-thumb {
            background: var(--usg-scrollbar-thumb);
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
            color: var(--usg-divider-color);
            border-bottom: 1px solid var(--usg-divider-border);
        }
    `;
    document.head.appendChild(style);
}

/**
 * Apply theme colors to grid UI elements
 */
function applyThemeToGrid(theme) {
    if (!rootEl) return;
    
    // Update CSS variables on root element
    const root = rootEl.closest('.usg-gallery-panel') || document.documentElement;
    root.style.setProperty('--usg-scrollbar-track', theme.scrollbarTrack);
    root.style.setProperty('--usg-scrollbar-thumb', theme.scrollbarThumb);
    root.style.setProperty('--usg-divider-color', theme.dividerColor);
    root.style.setProperty('--usg-divider-border', theme.dividerBorder);
    root.style.setProperty('--usg-card-hover-shadow', theme.cardHoverShadow);
    
    // Update filter bar colors
    const filterBar = rootEl.querySelector('div[style*="display: flex"]');
    if (filterBar) {
        filterBar.style.color = theme.textTertiary;
    }
    
    // Update search input
    const searchInput = rootEl.querySelector('input[type="text"]');
    if (searchInput) {
        searchInput.style.border = `1px solid ${theme.inputBorder}`;
        searchInput.style.background = theme.inputBackground;
        searchInput.style.color = theme.inputText;
    }
    
    // Update buttons
    const buttons = rootEl.querySelectorAll('button');
    buttons.forEach(btn => {
        if (btn.id && btn.id.startsWith('usg-filter-btn-')) {
            // Rating filter buttons
            const isActive = btn.style.background.includes('180,180,255') || 
                           btn.style.background.includes('rgba(180,180,255');
            btn.style.border = `1px solid ${theme.cardBorder}`;
            btn.style.background = isActive ? theme.buttonActiveBackground : theme.cardBackground;
            btn.style.color = theme.textPrimary;
        } else if (btn.textContent === 'Refresh' || btn.textContent.includes('Download Selected') || btn.textContent.includes('Delete Selected')) {
            // Action buttons
            if (btn.textContent.includes('Delete')) {
                btn.style.border = `1px solid ${theme.dangerBorder}`;
                btn.style.background = theme.dangerBackground;
                btn.style.color = theme.dangerText;
            } else {
                btn.style.border = `1px solid ${theme.buttonBorder}`;
                btn.style.background = theme.buttonBackground;
                btn.style.color = theme.buttonText;
            }
        } else if (btn.textContent === 'Filters') {
            // Filter toggle button
            btn.style.border = `1px solid ${theme.buttonBorder}`;
            btn.style.background = theme.cardBackground;
            btn.style.color = theme.textPrimary;
        }
    });
    
    // Update loading indicator
    const loadingIndicator = rootEl.querySelector('.usg-loading-indicator');
    if (loadingIndicator) {
        loadingIndicator.style.background = theme.filterBackground;
        loadingIndicator.style.border = `1px solid ${theme.filterBorder}`;
    }
    
    const statusEl = rootEl.querySelector('.usg-loading-status');
    if (statusEl) {
        statusEl.style.color = theme.textPrimary;
    }
    
    const imageNameEl = rootEl.querySelector('.usg-loading-image-name');
    if (imageNameEl) {
        imageNameEl.style.color = theme.textSecondary;
    }
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
        applyCommunityRatings();
        
        // Pre-generate thumbnails in the background for faster loading
        // Don't await - let it run in background
        galleryApi.batchGenerateThumbnails().catch(err => {
            console.warn("[USG-Gallery] Background thumbnail generation failed:", err);
        });
    } catch (err) {
        console.warn("[USG-Gallery] Failed to reload images:", err);
        // fallback: at least render whatever state we already had
        renderGridContent();
        hideLoadingIndicator();
    }
}
