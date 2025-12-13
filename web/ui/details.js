// ComfyUI-Usgromana-Gallery/web/ui/details.js
// Persistent details overlay + 3-image viewer (1 full + 2 thumbs)
// Details NEVER generates thumbnails. It only reuses thumbs registered by the grid/state.

import { getImages } from "../core/state.js";
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

function navigateRelative(delta) {
    const items = getImages();
    if (!items.length) return;
    const len = items.length;

    const nextIndex = currentIndex == null ? 0 : ((currentIndex + delta) % len + len) % len;
    showDetailsForIndex(nextIndex);
}

function resizeCardToImage() {
    if (!imgEl || !cardEl) return;

    const natW = imgEl.naturalWidth || 512;
    const natH = imgEl.naturalHeight || 512;

    const maxW = window.innerWidth * 0.8;
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
}

// --------------------------
// Show / hide
// --------------------------
export async function showDetailsForIndex(index) {
    if (!modalEl) initDetails();

    const items = getImages();
    if (!items.length) return;

    const len = items.length;
    currentIndex = ((index % len) + len) % len;

    const imgInfo = items[currentIndex];
    currentImageInfo = imgInfo;

    // ensure/merge metadata
    await ensureHistoryMarker(imgInfo);

    // MAIN IMAGE: full-res only here (no thumb fallbacks)
    const rel = imgInfo.relpath || imgInfo.filename || "";
    const newImageUrl = imgInfo.url || `${API_ENDPOINTS.IMAGE}?filename=${encodeURIComponent(rel)}`;
    
    // Reset zoom and drag when switching images
    resetZoomAndDrag();
    
    // Always update image URL (even if same, to ensure it displays)
    currentImageUrl = newImageUrl;
    
    // protect against out-of-order loads when navigating fast
    const loadToken = Symbol("details-load");
    imgEl._loadToken = loadToken;

    const handleImageLoad = () => {
        if (imgEl._loadToken !== loadToken) return;
        resizeCardToImage();
        fillMetadata(imgInfo);
    };

    imgEl.onload = handleImageLoad;
    imgEl.onerror = () => {
        console.warn("[UsgromanaGallery] Failed to load image:", currentImageUrl);
    };

    // Always set src to ensure image updates
    // This ensures arrow key navigation always updates the center image
    imgEl.src = currentImageUrl;
    
    // If image is already loaded (cached), trigger handler immediately
    // This handles the case where browser cache makes onload not fire
    if (imgEl.complete) {
        setTimeout(() => handleImageLoad(), 0);
    }

    // PREV/NEXT: thumbnails only, from state registry or existing thumb_url only.
    // Use the SAME items array that was used to calculate currentIndex
    const prevIndex = (currentIndex - 1 + len) % len;
    const nextIndex = (currentIndex + 1) % len;
    const prev = items[prevIndex];
    const next = items[nextIndex];

    leftTargetIndex = prevIndex;
    rightTargetIndex = nextIndex;

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

    if (leftTileImg) {
        if (prevThumb) {
            leftTileImg.src = prevThumb;
        } else {
            leftTileImg.src = "";
            leftTileImg.removeAttribute("src");
        }
    }
    if (rightTileImg) {
        if (nextThumb) {
            rightTileImg.src = nextThumb;
        } else {
            rightTileImg.src = "";
            rightTileImg.removeAttribute("src");
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

export function hideDetails() {
    if (!modalEl) return;

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
            
            // Function to update panel position based on card's right edge
            const updatePanelPosition = () => {
                const cardRect = cardEl.getBoundingClientRect();
                const panelWidth = 340;
                const gap = 20;
                const panelLeft = cardRect.right + gap;
                
                // Position panel fixed relative to viewport, next to card's right edge
                Object.assign(metaPanel.style, {
                    position: "fixed",
                    left: `${panelLeft}px`,
                    right: "auto", // Override right: 0
                    top: "50%",
                    transform: "translateY(-50%)",
                    height: "90vh",
                    maxHeight: "90vh",
                    width: `${panelWidth}px`,
                    zIndex: "20001",
                    transition: "left 0.3s ease", // Match card's transition duration
                });
            };
            
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
                // Get the ACTUAL final card position after transition
                const finalCardRect = cardEl.getBoundingClientRect();
                const finalPanelLeft = finalCardRect.right + gap;
                
                // Now transition to final position smoothly
                Object.assign(metaPanel.style, {
                    left: `${finalPanelLeft}px`,
                    transition: "left 0.3s ease", // Smooth transition
                });
            }, 350); // Wait for card's margin transition (0.3s) to complete first
            
            // Store update function for resize handler
            if (!window._galleryPanelUpdatePosition) {
                window._galleryPanelUpdatePosition = updatePanelPosition;
                window.addEventListener('resize', () => {
                    if (metadataVisible && metaPanel && cardEl) {
                        updatePanelPosition();
                    }
                });
            }
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
            
            await galleryApi.batchDelete([filename]);
            
            // Close details view
            hideDetails();
            
            // Reload images in grid (triggered by file monitor or manual refresh)
            // The grid should automatically update when the file is deleted
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