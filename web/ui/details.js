// ComfyUI-Usgromana-Gallery/web/ui/details.js
// Persistent details overlay + 3-image viewer (1 full + 2 thumbs)
// Details NEVER generates thumbnails. It only reuses thumbs registered by the grid/state.

import { getImages, setImages, resetGridHasSetVisibleImagesFlag } from "../core/state.js";
import { galleryApi } from "../core/api.js";
import { fetchCurrentUser, canEditMetadata } from "../core/user.js";
import { API_BASE, API_ENDPOINTS, PERFORMANCE } from "../core/constants.js";
import { formatFileSize, formatDate, unloadImage } from "../core/utils.js";

let modalEl = null;
let cardEl = null;
let imgEl = null;

let btnMeta = null;
let btnOpen = null;
let btnClose = null;
let btnZoom = null;

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
    const topControls = document.createElement("div");
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
    Object.assign(metaContent.style, {
        overflow: "auto",
        paddingRight: "6px",
        flex: "1",
        color: "#e5e7eb",
        fontSize: "12px",
    });

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

function createSideTile(side) {
    const tile = document.createElement("div");
    Object.assign(tile.style, {
        position: "fixed",
        top: "50%",
        transform: "translateY(-50%)",
        width: "120px",
        height: "200px",
        borderRadius: "12px",
        overflow: "hidden",
        border: "1px solid rgba(120,120,120,0.5)",
        background: "rgba(0,0,0,0.35)",
        cursor: "pointer",
        zIndex: "20001",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "opacity 0.2s ease, transform 0.2s ease",
    });

    tile.style[side === "left" ? "left" : "right"] = "24px";

    const img = document.createElement("img");
    img.decoding = "async";
    Object.assign(img.style, {
        width: "100%",
        height: "100%",
        objectFit: "cover",
        filter: "blur(3px) brightness(0.5)",
        transform: "scale(1.05)",
        transition: "filter 0.2s ease",
    });
    tile.appendChild(img);

    if (side === "left") leftTileImg = img;
    if (side === "right") rightTileImg = img;

    const arrow = document.createElement("div");
    arrow.textContent = side === "left" ? "❮" : "❯";
    Object.assign(arrow.style, {
        position: "absolute",
        inset: "0",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "40px",
        color: "rgba(255,255,255,0.35)",
        textShadow: "0 2px 10px rgba(0,0,0,0.8)",
        userSelect: "none",
    });
    tile.appendChild(arrow);

    tile.onmouseenter = () => {
        img.style.filter = "blur(2px) brightness(0.7)";
        arrow.style.color = "rgba(255,255,255,0.85)";
    };
    tile.onmouseleave = () => {
        img.style.filter = "blur(3px) brightness(0.5)";
        arrow.style.color = "rgba(255,255,255,0.35)";
    };

    tile.onclick = (ev) => {
        ev.stopPropagation();
        const idx = side === "left" ? leftTargetIndex : rightTargetIndex;
        if (idx == null) return;
        showDetailsForIndex(idx);
    };

    return tile;
}

function getFilteredImages() {
    const items = getImages();
    if (!folderFilter) {
        return items; // No filter, return all images
    }
    
    // Filter images to only those in the current folder
    return items.filter(img => {
        const imgFolder = img.folder || "";
        const relpath = img.relpath || "";
        
        if (folderFilter === "") {
            // Root folder - images with no folder or empty folder
            // Check if relpath has no folder separator (is in root)
            if (imgFolder === "") {
                return true;
            }
            // Also check if relpath has no "/" (root level file)
            return !relpath.includes("/");
        }
        
        // Normalize folder paths for comparison (handle both "/" and "\" separators)
        const normalizePath = (path) => path.replace(/\\/g, "/").replace(/\/+/g, "/");
        const normalizedFilter = normalizePath(folderFilter);
        const normalizedImgFolder = normalizePath(imgFolder);
        const normalizedRelpath = normalizePath(relpath);
        
        // Match exact folder
        if (normalizedImgFolder === normalizedFilter) {
            return true;
        }
        
        // Check if relpath starts with folder path (for subfolder files)
        if (normalizedRelpath.startsWith(normalizedFilter + "/")) {
            return true;
        }
        
        // Check if relpath matches folder exactly (folder itself as a file, though unlikely)
        if (normalizedRelpath === normalizedFilter) {
            return true;
        }
        
        // Extract folder from relpath and compare
        const relpathFolder = normalizedRelpath.includes("/") 
            ? normalizedRelpath.substring(0, normalizedRelpath.lastIndexOf("/"))
            : "";
        
        return relpathFolder === normalizedFilter;
    });
}

function navigateRelative(delta) {
    const allItems = getImages();
    const filteredItems = getFilteredImages();
    
    if (!filteredItems.length) {
        return;
    }
    
    // Find current image in filtered list
    let filteredIndex = -1;
    if (currentIndex != null && currentIndex < allItems.length) {
        const currentImg = allItems[currentIndex];
        filteredIndex = filteredItems.findIndex(img => 
            (img.relpath && currentImg.relpath && img.relpath === currentImg.relpath) ||
            (img.filename && currentImg.filename && img.filename === currentImg.filename)
        );
    }
    
    if (filteredIndex < 0) {
        filteredIndex = 0; // Fallback to first image if current not found
    }
    
    const len = filteredItems.length;
    const nextFilteredIndex = ((filteredIndex + delta) % len + len) % len;
    const nextImage = filteredItems[nextFilteredIndex];
    
    // Find the index of this image in the full list
    const nextIndex = allItems.findIndex(img =>
        (img.relpath && nextImage.relpath && img.relpath === nextImage.relpath) ||
        (img.filename && nextImage.filename && img.filename === nextImage.filename)
    );
    
    if (nextIndex >= 0) {
        showDetailsForIndex(nextIndex);
    }
}

function resizeCardToImage() {
    if (!imgEl || !cardEl) return;

    const natW = imgEl.naturalWidth || 512;
    const natH = imgEl.naturalHeight || 512;

    // Account for metadata panel if visible
    let maxW = window.innerWidth * 0.8;
    if (metadataVisible) {
        const panelWidth = 340;
        const gap = 20;
        maxW = window.innerWidth - panelWidth - gap - 40; // Leave room for panel
    }

    const maxH = window.innerHeight * 0.8;

    const paddingW = 10 * 2 + 8 * 2;
    const paddingH = 10 * 2 + 8 * 2;

    const scaleByWidth = (maxW - paddingW) / natW;
    const scaleByHeight = (maxH - paddingH) / natH;
    const scale = Math.min(scaleByWidth, scaleByHeight, 1);

    const imgDisplayW = natW * scale;
    const imgDisplayH = natH * scale;

    cardEl.style.width = `${Math.round(imgDisplayW + paddingW)}px`;
    cardEl.style.height = `${Math.round(imgDisplayH + paddingH)}px`;
    
    // Update metadata panel position after card resizes (if metadata is visible)
    if (metadataVisible && metaPanel) {
        // Use a small delay to ensure layout has updated
        setTimeout(() => {
            updateMetadataPanelPosition();
        }, 50);
    }
}

// --------------------------
// Show / hide
// --------------------------
export async function showDetailsForIndex(index) {
    // CRITICAL: Increment navigation sequence to invalidate any stale concurrent calls
    const navSeq = ++detailsNavSeq;
    const stillCurrent = () => navSeq === detailsNavSeq;
    
    if (!modalEl) initDetails();
    
    // Check if this call is still current before proceeding
    if (!stillCurrent()) {
        return;
    }

    const items = getImages();
    if (!items.length) {
        return;
    }

    const len = items.length;
    currentIndex = ((index % len) + len) % len;

    const imgInfo = items[currentIndex];
    if (!imgInfo) {
        return;
    }
    
    // CRITICAL FIX: Capture previous image info BEFORE overwriting currentImageInfo
    // This is needed for proper collision detection (same filename, different folder)
    const prevImageInfo = currentImageInfo;
    currentImageInfo = imgInfo;
    

    // Unload previous image to free memory (especially important for large images)
    // CRITICAL FIX: Guard unload to prevent stale callbacks from unloading the current image
    // Capture the src to unload and navSeq BEFORE checking, so we only unload what we intended
    if (imgEl && imgEl.src) {
        const srcToUnload = imgEl.src;  // Capture what "previous" actually was
        const seqToUnload = navSeq;     // Tie cleanup to this navigation
        
        // Cancel any older scheduled unloads (they're stale by definition)
        cancelPendingUnload();
        
        // Only unload if this is actually a different image (not the same URL)
        if (srcToUnload !== currentImageUrl) {
            const prevSize = prevImageInfo?.file_size || prevImageInfo?.size || 0;
            
            // Safe unload function: only unloads if still the intended image and navigation
            const safeUnload = () => {
                // Only unload if:
                // 1) this navigation is still current (no newer navigation occurred)
                // 2) the element is STILL showing the old src we captured (not the new image)
                if (seqToUnload !== detailsNavSeq) {
                    return;
                }
                if (!imgEl || imgEl.src !== srcToUnload) {
                    return;
                }
                unloadImage(imgEl);
            };
            
            // Use requestIdleCallback to unload when browser is idle
            if ('requestIdleCallback' in window) {
                pendingUnload.idleId = requestIdleCallback(safeUnload, { timeout: 150 });
            } else {
                // Fallback: unload after a short delay
                pendingUnload.timeoutId = setTimeout(safeUnload, 75);
            }
        }
    }

    // Show modal immediately for instant feedback
    modalEl.style.display = "flex";
    
    // Show loading indicator in center image
    if (imgEl) {
        imgEl.style.opacity = "0.3";
        // Add loading spinner overlay
        let loadingSpinner = cardEl?.querySelector(".details-loading-spinner");
        if (!loadingSpinner && cardEl) {
            loadingSpinner = document.createElement("div");
            loadingSpinner.className = "details-loading-spinner";
            Object.assign(loadingSpinner.style, {
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                width: "40px",
                height: "40px",
                border: "3px solid rgba(56,189,248,0.3)",
                borderTop: "3px solid rgba(56,189,248,0.9)",
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
                zIndex: "10",
                pointerEvents: "none",
            });
            // Add spin animation if not exists
            if (!document.getElementById("details-spinner-style")) {
                const style = document.createElement("style");
                style.id = "details-spinner-style";
                style.textContent = `@keyframes spin { 0% { transform: translate(-50%, -50%) rotate(0deg); } 100% { transform: translate(-50%, -50%) rotate(360deg); } }`;
                document.head.appendChild(style);
            }
            cardEl.appendChild(loadingSpinner);
        }
        if (loadingSpinner) loadingSpinner.style.display = "block";
    }

    // ensure/merge metadata
    // CRITICAL: Check if still current before and after await to prevent stale calls from proceeding
    if (!stillCurrent()) return;
    await ensureHistoryMarker(imgInfo);
    if (!stillCurrent()) return;

    // MAIN IMAGE: full-res only here (no thumb fallbacks)
    // Ensure we always use the full-size image, never thumbnails
    // CRITICAL: Always use relpath (includes folder) to avoid URL collisions for same-named files in different folders
    const rel = imgInfo.relpath || imgInfo.filename || "";
    
    // ALWAYS reconstruct URL from relpath to ensure uniqueness and avoid collisions
    // Don't trust imgInfo.url as it might have been constructed from filename only
    let newImageUrl = `${API_ENDPOINTS.IMAGE}?filename=${encodeURIComponent(rel)}`;
    
    // Remove any size=thumb parameter if present (shouldn't happen, but safety check)
    if (newImageUrl.includes("size=thumb")) {
        newImageUrl = newImageUrl.replace(/[?&]size=thumb/, "").replace(/&$/, "");
    }
    
    // Ensure we're not using a thumbnail URL (shouldn't happen, but safety check)
    if (newImageUrl.includes("_thumbs") || newImageUrl.includes("/thumb")) {
        // Reconstruct URL without thumb path - ALWAYS use relpath to ensure uniqueness
        newImageUrl = `${API_ENDPOINTS.IMAGE}?filename=${encodeURIComponent(rel)}`;
    }
    
    // Check if URL is the same as previous (potential collision issue)
    const urlChanged = newImageUrl !== currentImageUrl;
    
    
    // Reset zoom and drag when switching images
    resetZoomAndDrag();
    
    // CRITICAL FIX: Only clear src if there's a potential collision (same filename)
    // This prevents browser from using cached image when navigating between images
    // with the same name but different folder paths, while avoiding unnecessary
    // clearing that could break normal navigation
    // Use prevImageInfo (captured before overwriting currentImageInfo) for collision detection
    const currentFilename = prevImageInfo?.filename || "";
    const newFilename = imgInfo.filename || "";
    // Extract filename from currentImageUrl if prevImageInfo isn't available
    // Match the actual filename at the end of the path (after the last /)
    const urlFilename = currentImageUrl ? currentImageUrl.match(/[^/]+\.(png|jpg|jpeg|webp|gif|bmp)(?:\?|$)/i)?.[0] : "";
    const checkFilename = currentFilename || urlFilename;
    // Only consider it a collision if:
    // 1. Both filenames exist and are the same
    // 2. The URL actually changed (different paths)
    // 3. We have a valid filename to check
    const potentialCollision = checkFilename && newFilename && 
                                checkFilename === newFilename && 
                                urlChanged &&
                                currentImageUrl !== newImageUrl;
    
    if (potentialCollision && imgEl && imgEl.src) {
        // CRITICAL: Check if still current before doing destructive src clearing
        if (!stillCurrent()) return;
        
        const oldSrc = imgEl.src;
        // Clear src to force browser to recognize new image
        imgEl.src = "";
        imgEl.removeAttribute("src");
        // Small delay to ensure browser processes the src clearing
        await new Promise(resolve => setTimeout(resolve, 10));
        
        // CRITICAL: Check if still current after await - another navigation may have occurred
        if (!stillCurrent()) {
            return;
        }
        
    } else if (!potentialCollision && imgEl && imgEl.src) {
    }
    
    // Always update image URL (even if same, to ensure it displays)
    // CRITICAL: If URL is the same as current src, we need to force a reload
    // This happens when navigating back to a previously viewed image
    const needsForceReload = imgEl.src && (imgEl.src === newImageUrl || imgEl.src.endsWith(newImageUrl));
    
    // CRITICAL FIX: If needsForceReload is true, append a cache-buster to force browser to reload
    // This ensures onload fires even when the browser thinks the image is already cached
    let finalImageUrl = newImageUrl;
    if (needsForceReload) {
        finalImageUrl += (finalImageUrl.includes("?") ? "&" : "?") + "v=" + Date.now();
    }
    
    currentImageUrl = finalImageUrl;
    
    // protect against out-of-order loads when navigating fast
    const loadToken = Symbol("details-load");
    imgEl._loadToken = loadToken;
    imgEl._loadStartTime = Date.now();
    
    if (needsForceReload) {
    }

    const handleImageLoad = () => {
        if (imgEl._loadToken !== loadToken) {
            return;
        }
        
        // CRITICAL: Validate image actually loaded - check dimensions
        // If dimensions are 0x0, the image hasn't actually loaded yet
        // This can happen when decode() resolves before image data is ready
        if (imgEl.naturalWidth === 0 || imgEl.naturalHeight === 0) {
            // Wait a bit and check again - if still 0x0, trigger actual load
            setTimeout(() => {
                // CRITICAL: Check if this navigation is still current before proceeding
                if (!stillCurrent()) return;
                
                if (imgEl._loadToken === loadToken && (imgEl.naturalWidth === 0 || imgEl.naturalHeight === 0)) {
                    // Image still not loaded - force reload by clearing and resetting src
                    const oldSrc = imgEl.src;
                    imgEl.src = "";
                    imgEl.removeAttribute("src");
                    setTimeout(() => {
                        if (imgEl._loadToken === loadToken) {
                            imgEl.src = currentImageUrl;
                        }
                    }, 10);
                } else if (imgEl._loadToken === loadToken && imgEl.naturalWidth > 0 && imgEl.naturalHeight > 0) {
                    // Image now loaded - proceed with handler
                    handleImageLoad();
                }
            }, 100);
            return;
        }
        
        const loadTime = Date.now() - (imgEl._loadStartTime || Date.now());
        const imageSize = imgInfo.file_size || imgInfo.size || 0;
        
        
        // Hide loading spinner
        const loadingSpinner = cardEl?.querySelector(".details-loading-spinner");
        if (loadingSpinner) loadingSpinner.style.display = "none";
        imgEl.style.opacity = "1";
        
        // Remove will-change after image loads to free resources
        if (imgEl.style.willChange) {
            // Defer removal to avoid layout thrashing
            requestAnimationFrame(() => {
                imgEl.style.willChange = "auto";
            });
        }
        
        // Use requestAnimationFrame for resize to avoid blocking
        requestAnimationFrame(() => {
            resizeCardToImage();
            fillMetadata(imgInfo);
            // Update metadata panel position if it's visible (after card resizes)
            // Use a small delay to ensure card has finished resizing
            if (metadataVisible && metaPanel) {
                // Use double requestAnimationFrame to ensure layout is complete
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        updateMetadataPanelPosition();
                    });
                });
            }
        });
    };

    imgEl.onload = handleImageLoad;
    imgEl.onerror = () => {
        const loadingSpinner = cardEl?.querySelector(".details-loading-spinner");
        if (loadingSpinner) loadingSpinner.style.display = "none";
        imgEl.style.opacity = "1";
        console.warn("[UsgromanaGallery] Failed to load image:", currentImageUrl);
    };

    // Check image size before loading - large images need special handling
    const imageSize = imgInfo.file_size || imgInfo.size || imgInfo.bytes || 0;
    const isLargeImage = imageSize > 10 * 1024 * 1024; // > 10MB
    
    
    // For large images, use async decoding and defer non-critical operations
    if (isLargeImage) {
        // Use will-change to hint browser about upcoming changes
        if (imgEl) {
            imgEl.style.willChange = "contents";
        }
        
        // Use Image.decode() API if available for async decoding
        // This prevents blocking the main thread for large images
        if ('decode' in imgEl) {
            imgEl.src = currentImageUrl;
            
            // Check if image is already loaded (cached) - decode() might resolve immediately
            if (imgEl.complete && imgEl.src === currentImageUrl) {
            }
            
            // Use decode() to decode image off main thread
            // CRITICAL: Store the current src when calling decode() to detect if it changed
            // Also store the decode promise so we can track if it's still the current one
            const decodeSrc = imgEl.src;
            const decodePromise = imgEl.decode();
            imgEl._decodePromise = decodePromise; // Store for tracking
            imgEl._decodeSrc = decodeSrc; // Store src that decode() was called for
            
            decodePromise
                .then(() => {
                    // Only proceed if src hasn't changed (navigation hasn't occurred) and this is still the current decode promise
                    if (imgEl._loadToken === loadToken && imgEl.src === decodeSrc && imgEl._decodePromise === decodePromise) {
                        // Use requestAnimationFrame to avoid blocking
                        requestAnimationFrame(() => {
                            if (imgEl._loadToken === loadToken) { // Double-check token hasn't changed
                                handleImageLoad();
                            }
                        });
                    } else {
                    }
                })
                .catch((err) => {
                    // Only fallback to onload if src hasn't changed, token matches, and this is still the current decode promise
                    // If any of these changed, it means navigation occurred and we should ignore this error
                    if (imgEl._loadToken === loadToken && imgEl.src === decodeSrc && imgEl._decodePromise === decodePromise) {
                        requestAnimationFrame(() => {
                            if (imgEl._loadToken === loadToken) { // Double-check token
                                handleImageLoad();
                            }
                        });
                    } else {
                        // This is a decode error from a previous image - ignore it silently
                    }
                });
        } else {
            // Fallback for browsers without decode API
            // Use setTimeout to defer loading slightly and avoid blocking
            setTimeout(() => {
                imgEl.src = currentImageUrl;
                // Check if already complete after setting src
                if (imgEl.complete && imgEl.src === currentImageUrl) {
                    setTimeout(() => {
                        if (imgEl._loadToken === loadToken) {
                            handleImageLoad();
                        }
                    }, 0);
                }
            }, 0);
        }
    } else {
        // Small images can load normally
        imgEl.src = currentImageUrl;
    }
    
    // If image is already loaded (cached), trigger handler immediately
    // This handles the case where browser cache makes onload not fire
    // CRITICAL: Check complete AFTER setting src with a small delay to allow browser to update
    // This is especially important when navigating back to previously viewed images
    // Use a longer delay if src was cleared (potential collision) to allow browser to reload
    // CRITICAL: When potentialCollision is true, src is cleared and then set again
    // We need to wait longer to ensure src is actually set before checking
    const delayAfterSrcClear = potentialCollision ? 200 : 50;
    setTimeout(() => {
        // CRITICAL: Check if this navigation is still current before proceeding
        if (!stillCurrent()) {
            return;
        }
        
        const srcAfterSet = imgEl.src;
        
        
        // CRITICAL: If src is empty, it means src was cleared but not set yet
        // This can happen when potentialCollision triggers src clearing
        // If src is still empty after delay, check again after a bit more time
        if (!srcAfterSet || srcAfterSet === "" || srcAfterSet === window.location.href) {
            // Retry after a bit more time - src should be set by now
            // Use longer retry delay if potentialCollision was true
            const retryDelay = potentialCollision ? 100 : 50;
            setTimeout(() => {
                // CRITICAL: Check if this navigation is still current before proceeding
                if (!stillCurrent()) {
                    return;
                }
                
                const retrySrc = imgEl.src;
                if (retrySrc && retrySrc !== "" && retrySrc !== window.location.href && imgEl._loadToken === loadToken) {
                    // Normalize URLs for comparison
                    const normalizeUrl = (url) => {
                        if (!url) return "";
                        try {
                            if (url.startsWith("http://") || url.startsWith("https://")) {
                                const urlObj = new URL(url);
                                return urlObj.pathname + urlObj.search;
                            }
                            return url;
                        } catch {
                            return url;
                        }
                    };
                    const normalizedRetrySrc = normalizeUrl(retrySrc);
                    const normalizedCurrent = normalizeUrl(currentImageUrl);
                    const srcMatches = normalizedRetrySrc === normalizedCurrent || 
                                      normalizedRetrySrc.endsWith(normalizedCurrent) || 
                                      normalizedCurrent.endsWith(normalizedRetrySrc) ||
                                      retrySrc.includes(currentImageUrl) ||
                                      currentImageUrl.includes(retrySrc);
                    // Now check if image is complete
                    if (imgEl.complete && srcMatches && imgEl.naturalWidth > 0 && imgEl.naturalHeight > 0) {
                        if (imgEl._loadToken === loadToken) {
                            handleImageLoad();
                        }
                    }
                }
            }, 50); // Small additional delay
            return; // Wait for retry or onload
        }
        
        // Normalize URLs for comparison - extract the path+query part
        const normalizeUrl = (url) => {
            if (!url) return "";
            try {
                // If it's a full URL, extract pathname + search
                if (url.startsWith("http://") || url.startsWith("https://")) {
                    const urlObj = new URL(url);
                    return urlObj.pathname + urlObj.search;
                }
                // If it's a relative URL, use as-is
                return url;
            } catch {
                // Fallback: just use the URL as-is
                return url;
            }
        };
        const normalizedSrc = normalizeUrl(srcAfterSet);
        const normalizedCurrent = normalizeUrl(currentImageUrl);
        // Check if src matches (accounting for URL encoding differences and full vs relative URLs)
        const srcMatches = normalizedSrc === normalizedCurrent || 
                          normalizedSrc.endsWith(normalizedCurrent) || 
                          normalizedCurrent.endsWith(normalizedSrc) ||
                          srcAfterSet.includes(currentImageUrl) ||
                          currentImageUrl.includes(srcAfterSet);
        
        
        if (imgEl.complete && srcMatches && imgEl._loadToken === loadToken) {
            // Also validate dimensions are valid before considering it loaded
            if (imgEl.naturalWidth > 0 && imgEl.naturalHeight > 0) {
                // For both large and small images, if they're cached, trigger handler
                // But only if loadToken still matches (navigation hasn't changed)
                if (imgEl._loadToken === loadToken) {
                    handleImageLoad();
                }
            } else {
            }
        }
    }, delayAfterSrcClear); // Delay longer if src was cleared

    // PREV/NEXT: thumbnails only, from state registry or existing thumb_url only.
    // Calculate prev/next indices - use filtered images if folder filter is active
    let prevIndex, nextIndex, prev, next;
    
    if (folderFilter) {
        // Use filtered images for navigation
        const filteredItems = getFilteredImages();
        if (filteredItems.length > 0) {
            // Find current image in filtered list
            let filteredCurrentIndex = filteredItems.findIndex(img =>
                (img.relpath && imgInfo.relpath && img.relpath === imgInfo.relpath) ||
                (img.filename && imgInfo.filename && img.filename === imgInfo.filename)
            );
            
            if (filteredCurrentIndex < 0) {
                filteredCurrentIndex = 0;
            }
            
            const filteredLen = filteredItems.length;
            // Wrap around - if only one image, prev and next both point to it
            const prevFilteredIndex = filteredLen > 0 ? (filteredCurrentIndex - 1 + filteredLen) % filteredLen : 0;
            const nextFilteredIndex = filteredLen > 0 ? (filteredCurrentIndex + 1) % filteredLen : 0;
            
            prev = filteredItems[prevFilteredIndex];
            next = filteredItems[nextFilteredIndex];
            
            // Find indices in full list
            prevIndex = prev ? items.findIndex(img =>
                (img.relpath && prev.relpath && img.relpath === prev.relpath) ||
                (img.filename && prev.filename && img.filename === prev.filename)
            ) : -1;
            
            nextIndex = next ? items.findIndex(img =>
                (img.relpath && next.relpath && img.relpath === next.relpath) ||
                (img.filename && next.filename && img.filename === next.filename)
            ) : -1;
        } else {
            prevIndex = -1;
            nextIndex = -1;
            prev = null;
            next = null;
        }
    } else {
        // No filter - use all images
        prevIndex = (currentIndex - 1 + len) % len;
        nextIndex = (currentIndex + 1) % len;
        prev = items[prevIndex];
        next = items[nextIndex];
    }

    leftTargetIndex = prevIndex >= 0 ? prevIndex : null;
    rightTargetIndex = nextIndex >= 0 ? nextIndex : null;

    // Generate thumbnail URLs directly from image data to ensure correctness
    // Don't rely on registry which may have stale/incorrect mappings
    let prevThumb = null;
    let nextThumb = null;
    
    if (prev) {
        // Try thumb_url first (from backend), then generate from relpath
        prevThumb = prev.thumb_url || prev.url || null;
        if (!prevThumb) {
            const rel = prev.relpath || prev.filename || "";
            if (rel) {
                prevThumb = `${API_ENDPOINTS.IMAGE}?filename=${encodeURIComponent(rel)}&size=thumb`;
            }
        }
    }
    
    if (next) {
        // Try thumb_url first (from backend), then generate from relpath
        nextThumb = next.thumb_url || next.url || null;
        if (!nextThumb) {
            const rel = next.relpath || next.filename || "";
            if (rel) {
                nextThumb = `${API_ENDPOINTS.IMAGE}?filename=${encodeURIComponent(rel)}&size=thumb`;
            }
        }
    }

    // Update left/right tiles with proper visibility
    if (leftTile) {
        if (prevThumb && leftTargetIndex != null) {
            if (leftTileImg) {
                leftTileImg.src = prevThumb;
            }
            leftTile.style.opacity = "1";
            leftTile.style.pointerEvents = "auto";
        } else {
            if (leftTileImg) {
                leftTileImg.src = "";
                leftTileImg.removeAttribute("src");
            }
            // Keep tiles visible even with one image (they'll wrap to the same image)
            leftTile.style.opacity = "1";
            leftTile.style.pointerEvents = "auto";
        }
    }
    
    if (rightTile) {
        if (nextThumb && rightTargetIndex != null) {
            if (rightTileImg) {
                rightTileImg.src = nextThumb;
            }
            rightTile.style.opacity = "1";
            rightTile.style.pointerEvents = "auto";
        } else {
            if (rightTileImg) {
                rightTileImg.src = "";
                rightTileImg.removeAttribute("src");
            }
            // Keep tiles visible even with one image (they'll wrap to the same image)
            rightTile.style.opacity = "1";
            rightTile.style.pointerEvents = "auto";
        }
    }

    // show overlay
    modalEl.style.display = "flex";
    modalEl.style.backdropFilter = "blur(3px)";

    // default: meta closed
    if (!metadataVisible) {
        metaPanel.style.display = "none";
    }
}

export function setFolderFilter(folderPath) {
    folderFilter = folderPath;
}

export function clearFolderFilter() {
    folderFilter = null;
}

export function hideDetails() {
    if (!modalEl) return;
    // Clear folder filter when hiding details
    folderFilter = null;

    // persistent overlay: do NOT remove from DOM
    modalEl.style.display = "none";
    modalEl.style.backdropFilter = "none";

    // wipe the 3 live images (proper cleanup)
    if (imgEl) unloadImage(imgEl);
    if (leftTileImg) unloadImage(leftTileImg);
    if (rightTileImg) unloadImage(rightTileImg);


    // reset meta panel
    metadataVisible = false;
    if (metaPanel) {
        metaPanel.style.display = "none";
        // Reset panel position to default (viewport edge)
        Object.assign(metaPanel.style, {
            left: "auto",
            right: "0",
        });
    }

    // Restore card position to center (reset marginRight)
    if (cardEl) {
        Object.assign(cardEl.style, {
            marginRight: "0",
        });
    }

    // Restore side tiles visibility
    if (leftTile) {
        leftTile.style.display = "flex";
    }
    if (rightTile) {
        rightTile.style.display = "flex";
    }

    currentIndex = null;
    currentImageUrl = null;
    currentImageInfo = null;
    
    // Reset zoom and drag state
    resetZoomAndDrag();
    
    // Clear metadata cache periodically to prevent memory leaks
    if (metaCache.size > MAX_META_CACHE_SIZE * 0.8) {
        const keysToDelete = Array.from(metaCache.keys()).slice(0, MAX_META_CACHE_SIZE / 2);
        keysToDelete.forEach(key => metaCache.delete(key));
    }
}

// --------------------------
// Metadata panel
// --------------------------

function updateMetadataPanelPosition() {
    if (!metaPanel || !cardEl || !metadataVisible) return;
    
    const cardRect = cardEl.getBoundingClientRect();
    const panelWidth = 340;
    const gap = 20;
    const panelLeft = cardRect.right + gap;
    
    // Ensure panel doesn't go off-screen
    const viewportWidth = window.innerWidth;
    const maxLeft = viewportWidth - panelWidth - 10; // 10px padding from edge
    const finalLeft = Math.min(panelLeft, maxLeft);
    
    // Position panel fixed relative to viewport, next to card's right edge
    Object.assign(metaPanel.style, {
        position: "fixed",
        left: `${finalLeft}px`,
        right: "auto", // Override right: 0
        top: "50%",
        transform: "translateY(-50%)",
        height: "90vh",
        maxHeight: "90vh",
        width: `${panelWidth}px`,
        zIndex: "20001",
        transition: "left 0.2s ease", // Smooth transition
    });
    
    // Also update image max width dynamically to prevent overlap
    if (imgEl) {
        const availableWidth = Math.max(300, finalLeft - 40); // Ensure minimum width
        Object.assign(imgEl.style, {
            maxWidth: `${availableWidth}px`,
            transition: "max-width 0.2s ease",
        });
    }
}

function toggleMetadata() {
    metadataVisible = !metadataVisible;

    if (metadataVisible) {
        metaPanel.style.display = "flex";
        btnMeta.title = "Hide metadata";
        
        // Collapse side tiles when metadata is shown
        if (leftTile) {
            leftTile.style.display = "none";
        }
        if (rightTile) {
            rightTile.style.display = "none";
        }
        
        // Adjust layout: card moves left, metadata panel on right
        if (cardEl) {
            // Card should be positioned to the left to make room for metadata panel
            Object.assign(cardEl.style, {
                position: "relative",
                marginRight: "360px", // Make room for metadata panel (340px + 20px gap)
                transition: "margin-right 0.3s ease",
            });
        }
        
        // Metadata panel positioning - position it relative to the card's right edge
        if (metaPanel && cardEl) {
            // Ensure panel is visible before getting its position
            if (metaPanel.style.display === "none") {
                metaPanel.style.display = "flex";
            }
            
            // Use the global updateMetadataPanelPosition function
            
            // Get current panel position (at right: 0, viewport edge)
            const currentPanelRect = metaPanel.getBoundingClientRect();
            const currentPanelLeft = currentPanelRect.left;
            const gap = 20;
            
            // Start from current position (viewport edge) to avoid jump
            Object.assign(metaPanel.style, {
                left: `${currentPanelLeft}px`,
                right: "auto", // Remove right: 0 to allow left positioning
                transition: "none", // No transition initially
            });
            
            // Force a reflow to ensure the left value is applied
            void metaPanel.offsetWidth;
            
            // Wait for card transition to complete, THEN calculate and transition panel position
            // This ensures we use the actual final card position, not a predicted one
            setTimeout(() => {
                updateMetadataPanelPosition();
            }, 350); // Wait for card's margin transition (0.3s) to complete first
            
            // Store update function for resize handler
            if (!window._galleryPanelUpdatePosition) {
                window._galleryPanelUpdatePosition = updateMetadataPanelPosition;
                window.addEventListener('resize', () => {
                    if (metadataVisible && metaPanel && cardEl) {
                        updateMetadataPanelPosition();
                    }
                });
            }
            
            // Initial position update
            setTimeout(() => {
                updateMetadataPanelPosition();
            }, 100);
        }
        
        // if we already have an image open, rebuild metadata
        if (currentImageInfo) {
            fillMetadata(currentImageInfo);
        }
    } else {
        metaPanel.style.display = "none";
        btnMeta.title = "Show metadata";
        
        // Restore card position: center (with transition)
        if (cardEl) {
            Object.assign(cardEl.style, {
                marginRight: "0",
                transition: "margin-right 0.3s ease",
            });
        }
        
        // Reset panel position when hidden (with smooth transition)
        if (metaPanel) {
            // Get current position before resetting
            const currentLeft = metaPanel.style.left || metaPanel.getBoundingClientRect().left;
            
            // Transition back to right edge smoothly
            Object.assign(metaPanel.style, {
                left: `${currentLeft}px`, // Start from current position
                right: "auto",
                transition: "left 0.3s ease", // Smooth transition
            });
            
            // Force reflow, then move to right edge
            void metaPanel.offsetWidth;
            requestAnimationFrame(() => {
                Object.assign(metaPanel.style, {
                    left: "auto",
                    right: "0", // Restore to viewport edge when hidden
                });
            });
        }
        
        // Restore side tiles immediately, then ensure they stay visible after transitions
        if (leftTile) {
            leftTile.style.display = "flex";
        }
        if (rightTile) {
            rightTile.style.display = "flex";
        }
        
        // Ensure side tiles stay visible after transitions complete (in case they get hidden somehow)
        setTimeout(() => {
            if (leftTile) {
                leftTile.style.display = "flex";
            }
            if (rightTile) {
                rightTile.style.display = "flex";
            }
            if (cardEl && cardEl.style.marginRight !== "0") {
                cardEl.style.marginRight = "0";
            }
        }, 350); // Wait for card transition (0.3s) to complete
    }
}

async function persistMetadata() {
    if (!currentImageInfo || !currentImageInfo.filename) return;

    try {
        const metaKey = currentImageInfo.relpath || currentImageInfo.filename;
        await galleryApi.saveMetadata(metaKey, {
            tags: currentImageInfo.tags || [],
            display_name: currentImageInfo.display_name || null,
            rating: currentImageInfo.rating || 0,
            folder: currentImageInfo.folder || null,
            prompt: currentImageInfo.full_prompt || currentImageInfo.prompt || null,
            history_key: currentImageInfo.history_key || null,
        });

        metaCache.set(currentImageInfo.filename, {
            ...(metaCache.get(currentImageInfo.filename) || {}),
            tags: currentImageInfo.tags || [],
            display_name: currentImageInfo.display_name || null,
            rating: currentImageInfo.rating || 0,
            folder: currentImageInfo.folder || null,
            prompt: currentImageInfo.full_prompt || currentImageInfo.prompt || null,
            history_key: currentImageInfo.history_key || null,
        });
    } catch (err) {
        console.warn("[UsgromanaGallery] Failed to save metadata", err);
    }
}

function addRow(label, value) {
    const row = document.createElement("div");
    Object.assign(row.style, { marginBottom: "8px" });

    const nameEl = document.createElement("div");
    Object.assign(nameEl.style, {
        fontSize: "10px",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        color: "rgba(200,200,200,0.7)",
        marginBottom: "2px",
    });
    nameEl.textContent = label;

    const valueEl = document.createElement("div");
    Object.assign(valueEl.style, {
        fontSize: "12px",
        color: "#f0f0f0",
        wordBreak: "break-word",
        whiteSpace: "pre-wrap",
    });
    valueEl.textContent = value;

    row.appendChild(nameEl);
    row.appendChild(valueEl);
    metaContent.appendChild(row);
}

async function fillMetadata(imgInfo) {
    if (!metaContent) return;

    // if meta panel is hidden, don't waste time building it
    if (!metadataVisible) {
        return;
    }

    metaContent.innerHTML = "";

    const {
        filename,
        relpath,
        size,
        mtime,
        tags = [],
        rating = 0,
        folder,
        workflow_id,
        model,
        model_name,
        sampler,
        prompt,
        full_prompt,
        display_name,
    } = imgInfo;

    const dateStr = formatDate(mtime);
    const sizeStr = formatFileSize(size);
    
    // Check if user is admin (needed for editable fields)
    const isAdmin = canEditMeta && currentUser && (currentUser.is_admin === true || (Array.isArray(currentUser.groups) && currentUser.groups.includes("admin")));

    // Helper function to create editable field with pencil icon
    const createEditableField = (label, value, isAdmin, onSave) => {
        const row = document.createElement("div");
        Object.assign(row.style, { marginBottom: "8px" });
        
        const labelRow = document.createElement("div");
        Object.assign(labelRow.style, {
            display: "flex",
            alignItems: "center",
            gap: "6px",
            marginBottom: "2px",
        });
        
        const labelEl = document.createElement("div");
        Object.assign(labelEl.style, {
            fontSize: "10px",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "rgba(200,200,200,0.7)",
        });
        labelEl.textContent = label;
        labelRow.appendChild(labelEl);
        
        // Pencil icon (only for admins)
        let pencilIcon = null;
        let valueDisplay = null;
        let valueInput = null;
        let isEditing = false;
        
        if (isAdmin) {
            pencilIcon = document.createElement("span");
            pencilIcon.textContent = "✏️";
            Object.assign(pencilIcon.style, {
                fontSize: "10px",
                cursor: "pointer",
                opacity: "0.6",
                transition: "opacity 0.2s",
                userSelect: "none",
            });
            pencilIcon.onmouseenter = () => {
                pencilIcon.style.opacity = "1";
            };
            pencilIcon.onmouseleave = () => {
                if (!isEditing) {
                    pencilIcon.style.opacity = "0.6";
                }
            };
            pencilIcon.onclick = () => {
                if (!isEditing) {
                    isEditing = true;
                    pencilIcon.style.opacity = "1";
                    valueDisplay.style.display = "none";
                    valueInput.style.display = "block";
                    valueInput.focus();
                    valueInput.select();
                }
            };
            labelRow.appendChild(pencilIcon);
        }
        
        const valueContainer = document.createElement("div");
        Object.assign(valueContainer.style, {
            position: "relative",
        });
        
        // Display value (read-only)
        valueDisplay = document.createElement("div");
        Object.assign(valueDisplay.style, {
            fontSize: "12px",
            color: "#f0f0f0",
            wordBreak: "break-word",
            padding: "4px 0",
        });
        valueDisplay.textContent = value || "—";
        valueContainer.appendChild(valueDisplay);
        
        // Input field (hidden by default, shown when editing)
        if (isAdmin) {
            valueInput = document.createElement("input");
            valueInput.type = "text";
            valueInput.value = value || "";
            Object.assign(valueInput.style, {
                width: "100%",
                padding: "4px 6px",
                borderRadius: "6px",
                border: "1px solid rgba(255,255,255,0.18)",
                background: "rgba(0,0,0,0.25)",
                color: "#e5e7eb",
                fontSize: "12px",
                outline: "none",
                display: "none",
            });
            
            valueInput.onblur = () => {
                isEditing = false;
                pencilIcon.style.opacity = "0.6";
                const newValue = valueInput.value.trim();
                if (newValue !== value) {
                    onSave(newValue);
                } else {
                    valueDisplay.style.display = "block";
                    valueInput.style.display = "none";
                }
            };
            
            valueInput.onkeydown = (ev) => {
                if (ev.key === "Enter") {
                    valueInput.blur();
                } else if (ev.key === "Escape") {
                    valueInput.value = value || "";
                    valueInput.blur();
                }
            };
            
            valueContainer.appendChild(valueInput);
        }
        
        row.appendChild(labelRow);
        row.appendChild(valueContainer);
        return row;
    };
    
    // File name (editable for admins)
    // Use relpath if available (includes subdirectory), otherwise fall back to filename
    const fileKey = relpath || filename;
    const fileRow = createEditableField(
        "File",
        filename || relpath || "—",
        isAdmin,
        async (newName) => {
            if (newName && newName !== (filename || relpath)) {
                try {
                    // Use relpath if available, otherwise use filename
                    const response = await galleryApi.renameFile(fileKey, newName);
                    
                    // Update current image info
                    // Use the new_filename from response if available (includes relpath), otherwise construct it
                    const newRelpath = response?.new_filename || (relpath ? `${relpath.split('/').slice(0, -1).join('/')}/${newName}`.replace(/^\/+/, '') : newName);
                    currentImageInfo.filename = newName;
                    currentImageInfo.relpath = newRelpath;
                    
                    // Reload metadata
                    fillMetadata(currentImageInfo);
                } catch (err) {
                    console.error("[UsgromanaGallery] Failed to rename file:", err);
                    alert("Failed to rename file: " + (err.message || "Unknown error"));
                }
            }
        }
    );
    metaContent.appendChild(fileRow);
    addRow("Modified", dateStr);
    addRow("Size", sizeStr);
    addRow("Folder", folder || "Unsorted");
    
    // Get extracted metadata from saved meta (load once, use for both display and NSFW check)
    const metaKey = relpath || filename;
    const savedMeta = await getSavedMeta(metaKey);
    
    // Display basic image info (Width, Height, Format, MimeType)
    if (savedMeta.fileinfo) {
        const fileinfo = savedMeta.fileinfo;
        if (fileinfo.width !== undefined) {
            addRow("Width", String(fileinfo.width));
        }
        if (fileinfo.height !== undefined) {
            addRow("Height", String(fileinfo.height));
        }
        if (fileinfo.format) {
            addRow("Format", fileinfo.format);
        }
        if (fileinfo.mimetype) {
            addRow("MimeType", fileinfo.mimetype);
        }
    }
    
    // Display extracted generation parameters (editable for admins)
    if (savedMeta.steps !== undefined) {
        const stepsRow = createEditableField(
            "Steps",
            String(savedMeta.steps || ""),
            isAdmin,
            async (newValue) => {
                const numValue = parseInt(newValue, 10);
                if (!isNaN(numValue)) {
                    await galleryApi.saveMetadata(metaKey, { steps: numValue });
                    metaCache.set(metaKey, { ...savedMeta, steps: numValue });
                }
            }
        );
        metaContent.appendChild(stepsRow);
    }
    
    if (savedMeta.cfg_scale !== undefined) {
        const cfgRow = createEditableField(
            "CFG Scale",
            String(savedMeta.cfg_scale || ""),
            isAdmin,
            async (newValue) => {
                const numValue = parseFloat(newValue);
                if (!isNaN(numValue)) {
                    await galleryApi.saveMetadata(metaKey, { cfg_scale: numValue });
                    metaCache.set(metaKey, { ...savedMeta, cfg_scale: numValue });
                }
            }
        );
        metaContent.appendChild(cfgRow);
    }
    
    if (savedMeta.seed !== undefined) {
        const seedRow = createEditableField(
            "Seed",
            String(savedMeta.seed || ""),
            isAdmin,
            async (newValue) => {
                const numValue = parseInt(newValue, 10);
                if (!isNaN(numValue)) {
                    await galleryApi.saveMetadata(metaKey, { seed: numValue });
                    metaCache.set(metaKey, { ...savedMeta, seed: numValue });
                }
            }
        );
        metaContent.appendChild(seedRow);
    }
    
    if (savedMeta.scheduler) {
        const schedulerRow = createEditableField(
            "Scheduler",
            savedMeta.scheduler || "",
            isAdmin,
            async (newValue) => {
                await galleryApi.saveMetadata(metaKey, { scheduler: newValue });
                metaCache.set(metaKey, { ...savedMeta, scheduler: newValue });
            }
        );
        metaContent.appendChild(schedulerRow);
    }
    
    if (savedMeta.loras && Array.isArray(savedMeta.loras) && savedMeta.loras.length > 0) {
        const loraList = savedMeta.loras.map(l => `${l.name} (${l.model_strength || 'N/A'}/${l.clip_strength || 'N/A'})`).join(", ");
        addRow("LoRAs", loraList);
    }
    
    // Display model and sampler (editable for admins)
    const modelRow = createEditableField(
        "Model",
        savedMeta.model || model || model_name || "",
        isAdmin,
        async (newValue) => {
            await galleryApi.saveMetadata(metaKey, { model: newValue });
            metaCache.set(metaKey, { ...savedMeta, model: newValue });
        }
    );
    metaContent.appendChild(modelRow);
    
    const samplerRow = createEditableField(
        "Sampler",
        savedMeta.sampler || sampler || "",
        isAdmin,
        async (newValue) => {
            await galleryApi.saveMetadata(metaKey, { sampler: newValue });
            metaCache.set(metaKey, { ...savedMeta, sampler: newValue });
        }
    );
    metaContent.appendChild(samplerRow);
    
    // Display prompts (editable for admins)
    if (savedMeta.positive_prompt) {
        const posPromptRow = createEditableField(
            "Positive Prompt",
            savedMeta.positive_prompt || "",
            isAdmin,
            async (newValue) => {
                await galleryApi.saveMetadata(metaKey, { positive_prompt: newValue });
                metaCache.set(metaKey, { ...savedMeta, positive_prompt: newValue });
            }
        );
        metaContent.appendChild(posPromptRow);
    }
    
    if (savedMeta.negative_prompt) {
        const negPromptRow = createEditableField(
            "Negative Prompt",
            savedMeta.negative_prompt || "",
            isAdmin,
            async (newValue) => {
                await galleryApi.saveMetadata(metaKey, { negative_prompt: newValue });
                metaCache.set(metaKey, { ...savedMeta, negative_prompt: newValue });
            }
        );
        metaContent.appendChild(negPromptRow);
    }
    
    // Fallback to full prompt if structured prompts not available
    if (!savedMeta.positive_prompt && !savedMeta.negative_prompt) {
        const promptRow = createEditableField(
            "Prompt",
            (full_prompt || prompt || ""),
            isAdmin,
            async (newValue) => {
                await galleryApi.saveMetadata(metaKey, { prompt: newValue });
                metaCache.set(metaKey, { ...savedMeta, prompt: newValue });
            }
        );
        metaContent.appendChild(promptRow);
    }
    
    // Display workflow ID if available (read-only)
    if (workflow_id) {
        addRow("Workflow ID", workflow_id);
    }
    
    // NSFW indicator - check if image is marked as NSFW by the NSFW Guard
    // This should display the actual NSFW status from the guard, not just blocking status
    try {
        // Check UsgromanaNSFW tag first (from PNG text chunks), then fallback to is_nsfw
        const isNSFW = savedMeta && (
            savedMeta.usgromana_nsfw === true || 
            savedMeta.is_nsfw === true
        );
        
        if (isNSFW) {
            const nsfwRow = document.createElement("div");
            Object.assign(nsfwRow.style, {
                marginTop: "8px",
                marginBottom: "8px",
            });
            
            const nsfwLabel = document.createElement("div");
            Object.assign(nsfwLabel.style, {
                fontSize: "10px",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "rgba(200,200,200,0.7)",
                marginBottom: "2px",
            });
            nsfwLabel.textContent = "Content Warning";
            
            const nsfwBadge = document.createElement("div");
            Object.assign(nsfwBadge.style, {
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                padding: "4px 10px",
                borderRadius: "6px",
                background: "rgba(220,38,38,0.25)",
                border: "1px solid rgba(220,38,38,0.7)",
                color: "#fca5a5",
                fontSize: "11px",
                fontWeight: "600",
                textTransform: "uppercase",
            });
            nsfwBadge.textContent = "⚠️ NSFW";
            
            nsfwRow.appendChild(nsfwLabel);
            nsfwRow.appendChild(nsfwBadge);
            metaContent.appendChild(nsfwRow);
        }
    } catch (err) {
        // Log errors for debugging
        console.warn("[UsgromanaGallery] Error checking NSFW status:", err);
    }

    // Editable metadata (only if allowed)
    const editBox = document.createElement("div");
    Object.assign(editBox.style, {
        marginTop: "10px",
        paddingTop: "10px",
        borderTop: "1px solid rgba(255,255,255,0.12)",
    });

    const title = document.createElement("div");
    title.textContent = "Metadata";
    Object.assign(title.style, {
        fontSize: "10px",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        color: "rgba(200,200,200,0.7)",
        marginBottom: "8px",
    });
    editBox.appendChild(title);

    // Stars
    const starsRow = document.createElement("div");
    Object.assign(starsRow.style, { display: "flex", gap: "4px", marginBottom: "8px" });

    const renderStars = () => {
        starsRow.innerHTML = "";
        const val = Number(imgInfo.rating || 0);
        for (let s = 1; s <= 5; s++) {
            const star = document.createElement("span");
            star.textContent = s <= val ? "★" : "☆";
            Object.assign(star.style, {
                cursor: canEditMeta ? "pointer" : "default",
                color: s <= val ? "#ffd86b" : "rgba(255,255,255,0.45)",
                fontSize: "16px",
                userSelect: "none",
            });
            if (canEditMeta) {
                star.onclick = async () => {
                    imgInfo.rating = s;
                    renderStars();
                    await persistMetadata();
                    // Notify grid to update rating display
                    if (window.__USG_GALLERY_UPDATE_RATING__) {
                        const key = imgInfo.relpath || imgInfo.filename;
                        window.__USG_GALLERY_UPDATE_RATING__(key, s);
                    }
                };
            }
            starsRow.appendChild(star);
        }
    };
    renderStars();
    editBox.appendChild(starsRow);

    // Display name (editable with pencil icon)
    const displayNameRow = createEditableField(
        "Display name",
        display_name || "",
        canEditMeta,
        (newValue) => {
            imgInfo.display_name = newValue || null;
            persistMetadata();
            // Update display immediately
            const displayEl = displayNameRow.querySelector("div[style*='wordBreak']");
            if (displayEl) {
                displayEl.textContent = newValue || "—";
            }
        }
    );
    editBox.appendChild(displayNameRow);

    // Tags (editable with pencil icon) - display as colored pills
    const tagsArray = Array.isArray(tags) ? tags : (typeof tags === 'string' ? tags.split(',').map(t => t.trim()).filter(Boolean) : []);
    const tagsValue = tagsArray.join(", ");
    
    // Helper function to create tag pills
    const createTagPills = (tagArray) => {
        const container = document.createElement("div");
        Object.assign(container.style, {
            display: "flex",
            flexWrap: "wrap",
            gap: "6px",
            alignItems: "center",
        });
        
        if (tagArray.length === 0) {
            const empty = document.createElement("span");
            empty.textContent = "—";
            empty.style.color = "rgba(200,200,200,0.5)";
            container.appendChild(empty);
        } else {
            tagArray.forEach(tag => {
                const pill = document.createElement("span");
                pill.textContent = tag;
                Object.assign(pill.style, {
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "3px 10px",
                    borderRadius: "12px",
                    fontSize: "11px",
                    fontWeight: "500",
                    background: "rgba(99, 102, 241, 0.2)",
                    border: "1px solid rgba(99, 102, 241, 0.4)",
                    color: "#a5b4fc",
                    whiteSpace: "nowrap",
                });
                container.appendChild(pill);
            });
        }
        
        return container;
    };
    
    // Create custom editable field for tags with pill display
    const tagsRow = document.createElement("div");
    Object.assign(tagsRow.style, { marginBottom: "8px" });
    
    const labelRow = document.createElement("div");
    Object.assign(labelRow.style, {
        display: "flex",
        alignItems: "center",
        gap: "6px",
        marginBottom: "2px",
    });
    
    const labelEl = document.createElement("div");
    Object.assign(labelEl.style, {
        fontSize: "10px",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        color: "rgba(200,200,200,0.7)",
    });
    labelEl.textContent = "Tags";
    labelRow.appendChild(labelEl);
    
    // Pencil icon (only for admins)
    let pencilIcon = null;
    let valueDisplay = null;
    let valueInput = null;
    let isEditing = false;
    
    if (canEditMeta) {
        pencilIcon = document.createElement("span");
        pencilIcon.textContent = "✏️";
        Object.assign(pencilIcon.style, {
            fontSize: "10px",
            cursor: "pointer",
            opacity: "0.6",
            transition: "opacity 0.2s",
            userSelect: "none",
        });
        pencilIcon.onmouseenter = () => {
            pencilIcon.style.opacity = "1";
        };
        pencilIcon.onmouseleave = () => {
            if (!isEditing) {
                pencilIcon.style.opacity = "0.6";
            }
        };
        pencilIcon.onclick = () => {
            if (!isEditing) {
                isEditing = true;
                pencilIcon.style.opacity = "1";
                valueDisplay.style.display = "none";
                valueInput.style.display = "block";
                valueInput.focus();
                valueInput.select();
            }
        };
        labelRow.appendChild(pencilIcon);
    }
    
    const valueContainer = document.createElement("div");
    Object.assign(valueContainer.style, {
        position: "relative",
    });
    
    // Display value as pills (read-only)
    valueDisplay = createTagPills(tagsArray);
    valueContainer.appendChild(valueDisplay);
    
    // Input field (hidden by default, shown when editing)
    if (canEditMeta) {
        valueInput = document.createElement("input");
        valueInput.type = "text";
        valueInput.value = tagsValue;
        Object.assign(valueInput.style, {
            width: "100%",
            padding: "4px 6px",
            borderRadius: "6px",
            border: "1px solid rgba(255,255,255,0.18)",
            background: "rgba(0,0,0,0.25)",
            color: "#e5e7eb",
            fontSize: "12px",
            outline: "none",
            display: "none",
        });
        
        valueInput.onblur = () => {
            isEditing = false;
            pencilIcon.style.opacity = "0.6";
            const newValue = valueInput.value.trim();
            const arr = newValue ? newValue.split(",").map((t) => t.trim()).filter(Boolean) : [];
            imgInfo.tags = arr;
            persistMetadata();
            // Update display with new pills
            valueDisplay.remove();
            valueDisplay = createTagPills(arr);
            valueContainer.insertBefore(valueDisplay, valueInput);
        };
        
        valueInput.onkeydown = (ev) => {
            if (ev.key === "Enter") {
                valueInput.blur();
            } else if (ev.key === "Escape") {
                valueInput.value = tagsValue;
                valueInput.blur();
            }
        };
        
        valueContainer.appendChild(valueInput);
    }
    
    tagsRow.appendChild(labelRow);
    tagsRow.appendChild(valueContainer);
    editBox.appendChild(tagsRow);

    // NSFW Mark Button (only if user can edit)
    if (canEditMeta) {
        const nsfwButtonRow = document.createElement("div");
        Object.assign(nsfwButtonRow.style, {
            display: "flex",
            gap: "8px",
            marginTop: "8px",
            alignItems: "center",
        });

        const nsfwButton = document.createElement("button");
        nsfwButton.textContent = "Mark as NSFW";
        Object.assign(nsfwButton.style, {
            padding: "6px 12px",
            borderRadius: "8px",
            border: "1px solid rgba(220,38,38,0.6)",
            background: "rgba(220,38,38,0.2)",
            color: "#fca5a5",
            cursor: "pointer",
            fontSize: "12px",
            fontWeight: "500",
            outline: "none",
            transition: "all 0.2s ease",
        });

        nsfwButton.onmouseenter = () => {
            nsfwButton.style.background = "rgba(220,38,38,0.35)";
            nsfwButton.style.borderColor = "rgba(220,38,38,0.8)";
        };
        nsfwButton.onmouseleave = () => {
            nsfwButton.style.background = "rgba(220,38,38,0.2)";
            nsfwButton.style.borderColor = "rgba(220,38,38,0.6)";
        };

        nsfwButton.onclick = async () => {
            if (!currentImageInfo || !currentImageInfo.filename) return;
            
            if (!confirm("Mark this image as NSFW? This will prevent unauthorized users from viewing it.")) {
                return;
            }

            try {
                nsfwButton.disabled = true;
                nsfwButton.textContent = "Marking...";
                await galleryApi.markAsNSFW(currentImageInfo.filename);
                nsfwButton.textContent = "Marked as NSFW ✓";
                nsfwButton.style.background = "rgba(34,197,94,0.2)";
                nsfwButton.style.borderColor = "rgba(34,197,94,0.6)";
                nsfwButton.style.color = "#86efac";
                
                // Clear cache so the image gets re-filtered
                metaCache.delete(currentImageInfo.filename);
                
                setTimeout(() => {
                    nsfwButton.textContent = "Mark as NSFW";
                    nsfwButton.style.background = "rgba(220,38,38,0.2)";
                    nsfwButton.style.borderColor = "rgba(220,38,38,0.6)";
                    nsfwButton.style.color = "#fca5a5";
                    nsfwButton.disabled = false;
                }, 2000);
            } catch (err) {
                console.error("[UsgromanaGallery] Failed to mark image as NSFW:", err);
                alert("Failed to mark image as NSFW: " + (err.message || "Unknown error"));
                nsfwButton.textContent = "Mark as NSFW";
                nsfwButton.disabled = false;
            }
        };

        nsfwButtonRow.appendChild(nsfwButton);
        editBox.appendChild(nsfwButtonRow);
    }

    metaContent.appendChild(editBox);

    // Add delete button for admins at the bottom
    if (isAdmin) {
        addDeleteButton(imgInfo);
    }
}

function addDeleteButton(imgInfo) {
    if (!metaContent || !imgInfo) return;
    
    // Create separator
    const separator = document.createElement("div");
    Object.assign(separator.style, {
        marginTop: "16px",
        marginBottom: "12px",
        paddingTop: "12px",
        borderTop: "1px solid rgba(255,255,255,0.12)",
    });
    
    // Create delete button
    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "🗑️ Delete Image";
    Object.assign(deleteBtn.style, {
        width: "100%",
        padding: "10px 16px",
        background: "rgba(220, 38, 38, 0.2)",
        border: "1px solid rgba(220, 38, 38, 0.5)",
        borderRadius: "6px",
        color: "#fca5a5",
        fontSize: "12px",
        fontWeight: "600",
        cursor: "pointer",
        transition: "all 0.2s ease",
    });
    
    deleteBtn.onmouseenter = () => {
        deleteBtn.style.background = "rgba(220, 38, 38, 0.3)";
        deleteBtn.style.borderColor = "rgba(220, 38, 38, 0.7)";
    };
    
    deleteBtn.onmouseleave = () => {
        deleteBtn.style.background = "rgba(220, 38, 38, 0.2)";
        deleteBtn.style.borderColor = "rgba(220, 38, 38, 0.5)";
    };
    
    deleteBtn.onclick = async (ev) => {
        ev.stopPropagation();
        
        const filename = imgInfo.relpath || imgInfo.filename;
        if (!filename) return;
        
        const confirmed = confirm(`Are you sure you want to delete "${filename}"?\n\nThis action cannot be undone.`);
        if (!confirmed) return;
        
        try {
            deleteBtn.disabled = true;
            deleteBtn.textContent = "Deleting...";
            deleteBtn.style.opacity = "0.6";
            deleteBtn.style.cursor = "not-allowed";
            
            const result = await galleryApi.batchDelete([filename]);
            
            
            // CRITICAL: Immediately reload images to remove deleted image from grid
            // This provides instant feedback instead of waiting for file monitor polling
            try {
                const images = await galleryApi.listImages();
                // CRITICAL: Reset the grid flag first to allow setImages to update visibleImages
                // Then call setImages with resetVisible=true to ensure the grid sees the change
                if (typeof window !== 'undefined' && window.__USG_GALLERY_GRID_INIT__) {
                    // Reset the flag so setImages can update visibleImages
                    resetGridHasSetVisibleImagesFlag();
                }
                setImages(images, true); // Force reset to ensure grid sees the change
                // Grid will auto-update via state subscription
            } catch (reloadErr) {
                console.warn("[UsgromanaGallery] Failed to reload images after deletion:", reloadErr);
                // Non-fatal - file monitor will catch it eventually
            }
            
            // Close details view
            hideDetails();
        } catch (err) {
            console.error("[UsgromanaGallery] Failed to delete image:", err);
            alert(`Failed to delete image: ${err.message || "Unknown error"}`);
            deleteBtn.disabled = false;
            deleteBtn.textContent = "🗑️ Delete Image";
            deleteBtn.style.opacity = "1";
            deleteBtn.style.cursor = "pointer";
        }
    };
    
    separator.appendChild(deleteBtn);
    metaContent.appendChild(separator);
}

// --------------------------
// Zoom and drag functionality
// --------------------------

function setupZoomAndDrag() {
    if (!imgEl || !cardEl) return;
    
    // Mouse wheel zoom
    cardEl.addEventListener("wheel", handleWheel, { passive: false });
    
    // Mouse drag
    imgEl.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
}

function toggleZoomMode() {
    zoomEnabled = !zoomEnabled;
    
    if (zoomEnabled) {
        btnZoom.title = "Disable zoom and drag mode";
        btnZoom.style.background = "rgba(99, 102, 241, 0.3)";
        currentZoom = 1.0;
        currentPanX = 0;
        currentPanY = 0;
        updateImageTransform();
    } else {
        btnZoom.title = "Zoom and drag mode";
        btnZoom.style.background = "rgba(0, 0, 0, 0.1)";
        resetZoomAndDrag();
    }
}

function resetZoomAndDrag() {
    zoomEnabled = false;
    currentZoom = 1.0;
    currentPanX = 0;
    currentPanY = 0;
    isDragging = false;
    
    if (btnZoom) {
        btnZoom.title = "Zoom and drag mode";
        btnZoom.style.background = "rgba(0, 0, 0, 0.1)";
    }
    
    if (imgEl) {
        imgEl.style.transform = "scale(1) translate(0, 0)";
    }
}

function handleWheel(ev) {
    if (!zoomEnabled || !imgEl) return;
    
    ev.preventDefault();
    ev.stopPropagation();
    
    const delta = ev.deltaY > 0 ? -0.1 : 0.1;
    const newZoom = Math.max(0.5, Math.min(5.0, currentZoom + delta));
    
    if (newZoom !== currentZoom) {
        // Calculate zoom point relative to image
        const rect = imgEl.getBoundingClientRect();
        const x = ev.clientX - rect.left - rect.width / 2;
        const y = ev.clientY - rect.top - rect.height / 2;
        
        // Adjust pan to zoom towards mouse position
        const zoomFactor = newZoom / currentZoom;
        currentPanX = currentPanX * zoomFactor - x * (zoomFactor - 1);
        currentPanY = currentPanY * zoomFactor - y * (zoomFactor - 1);
        
        currentZoom = newZoom;
        updateImageTransform();
    }
}

function handleMouseDown(ev) {
    if (!zoomEnabled || !imgEl || currentZoom <= 1.0) return;
    
    ev.preventDefault();
    ev.stopPropagation();
    
    isDragging = true;
    dragStartX = ev.clientX - currentPanX;
    dragStartY = ev.clientY - currentPanY;
    zoomStartPanX = currentPanX;
    zoomStartPanY = currentPanY;
    
    imgEl.style.cursor = "grabbing";
}

function handleMouseMove(ev) {
    if (!zoomEnabled || !isDragging || !imgEl) return;
    
    ev.preventDefault();
    
    currentPanX = ev.clientX - dragStartX;
    currentPanY = ev.clientY - dragStartY;
    
    updateImageTransform();
}

function handleMouseUp(ev) {
    if (!zoomEnabled || !imgEl) return;
    
    isDragging = false;
    imgEl.style.cursor = zoomEnabled && currentZoom > 1.0 ? "grab" : "default";
}

function updateImageTransform() {
    if (!imgEl) return;
    
    imgEl.style.transform = `scale(${currentZoom}) translate(${currentPanX / currentZoom}px, ${currentPanY / currentZoom}px)`;
    
    if (imgEl.style.cursor !== "grabbing") {
        imgEl.style.cursor = zoomEnabled && currentZoom > 1.0 ? "grab" : "default";
    }
}
