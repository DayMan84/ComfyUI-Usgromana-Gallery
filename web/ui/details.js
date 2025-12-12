// ComfyUI-Usgromana-Gallery/web/ui/details.js
// Persistent details overlay + 3-image viewer (1 full + 2 thumbs) + history via metadata markers
// Details NEVER generates thumbnails. It only reuses thumbs registered by the grid/state.

import { getImages, getImageKey, getThumbnail } from "../core/state.js";
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

let leftTile = null;
let rightTile = null;
let leftTileImg = null;
let rightTileImg = null;

let metaPanel = null;
let metaContent = null;

let historyContainer = null;
let historyObserver = null;

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
// Helpers: history marker
// --------------------------
function computeStem(filename = "") {
    const base = (filename.split("/").pop() || filename).replace(/\.[^.]+$/, "");
    return base
        .replace(/[_-]\d{3,}$/g, "")
        .replace(/\(\d+\)$/g, "")
        .trim();
}

function computeHistoryKey(imgInfo = {}) {
    if (!imgInfo) return null;
    if (imgInfo.history_key) return imgInfo.history_key;

    const wf = imgInfo.workflow_id || imgInfo.workflow || null;
    if (wf) return `wf:${wf}`;

    const rel = imgInfo.relpath || imgInfo.filename || "";
    const stem = computeStem(rel);
    return stem ? `stem:${stem}` : null;
}

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
    const saved = await getSavedMeta(imgInfo.filename);
    if (saved && typeof saved === "object") {
        if (imgInfo.history_key == null && saved.history_key != null) imgInfo.history_key = saved.history_key;
        if (imgInfo.tags == null && Array.isArray(saved.tags)) imgInfo.tags = saved.tags;
        if (imgInfo.rating == null && typeof saved.rating === "number") imgInfo.rating = saved.rating;
        if (imgInfo.display_name == null && typeof saved.display_name === "string") imgInfo.display_name = saved.display_name;
        if (imgInfo.folder == null && typeof saved.folder === "string") imgInfo.folder = saved.folder;
        if (imgInfo.prompt == null && typeof saved.prompt === "string") imgInfo.prompt = saved.prompt;
        if (imgInfo.full_prompt == null && typeof saved.full_prompt === "string") imgInfo.full_prompt = saved.full_prompt;
    }

    const key = computeHistoryKey(imgInfo);
    if (!key) return null;

    // already matches
    if (imgInfo.history_key === key) return key;

    // best-effort persist marker (will fail for guests; UI should still work)
    imgInfo.history_key = key;
    try {
        await galleryApi.saveMetadata(imgInfo.filename, { history_key: key });
        metaCache.set(imgInfo.filename, { ...(metaCache.get(imgInfo.filename) || {}), history_key: key });
    } catch (err) {
        console.warn("[UsgromanaGallery] Unable to persist history marker:", err);
    }

    return key;
}

// --------------------------
// History strip lazy-load/unload
// --------------------------
function setupHistoryLazyLoading(container) {
    if (historyObserver) {
        historyObserver.disconnect();
        historyObserver = null;
    }

    if (!("IntersectionObserver" in window)) {
        const imgs = container.querySelectorAll("img[data-src]");
        imgs.forEach((img) => { img.src = img.dataset.src; });
        return;
    }

    historyObserver = new IntersectionObserver(
        (entries) => {
            for (const entry of entries) {
                const img = entry.target;
                if (!img.dataset.src) continue;

                if (entry.isIntersecting) {
                    if (!img.src) img.src = img.dataset.src;
                } else {
                    // unload when offscreen to free memory
                    unloadImage(img);
                }
            }
        },
        { root: container, rootMargin: "256px 0px", threshold: 0.01 }
    );

    container.querySelectorAll("img[data-src]").forEach((img) => historyObserver.observe(img));
}

function clearHistoryStrip() {
    if (historyObserver) {
        historyObserver.disconnect();
        historyObserver = null;
    }
    if (historyContainer) {
        historyContainer.querySelectorAll("img").forEach((img) => {
            unloadImage(img);
        });
        historyContainer.innerHTML = "";
        historyContainer.style.display = "none";
    }
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
                fillMetadata(currentImageInfo, currentImageInfo.history_key || computeHistoryKey(currentImageInfo));
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
        maxWidth: "80vw",
        maxHeight: "80vh",
        borderRadius: "10px",
        display: "block",
        userSelect: "none",
    });
    cardEl.appendChild(imgEl);

    // top-right buttons
    const topControls = document.createElement("div");
    Object.assign(topControls.style, {
        position: "absolute",
        top: "10px",
        right: "10px",
        display: "flex",
        gap: "6px",
        zIndex: "2",
    });

    const mkBtn = (label, title) => {
        const b = document.createElement("button");
        b.textContent = label;
        b.title = title;
        Object.assign(b.style, {
            borderRadius: "999px",
            border: "1px solid rgba(148,163,184,0.45)",
            padding: "4px 10px",
            fontSize: "12px",
            cursor: "pointer",
            background: "rgba(15,23,42,0.85)",
            color: "#e5e7eb",
        });
        return b;
    };

    btnMeta = mkBtn("Meta", "Show metadata");
    btnMeta.onclick = (ev) => {
        ev.stopPropagation();
        toggleMetadata();
    };

    btnOpen = mkBtn("Open", "Open image in new tab");
    btnOpen.onclick = (ev) => {
        ev.stopPropagation();
        if (currentImageUrl) window.open(currentImageUrl, "_blank", "noopener,noreferrer");
    };

    btnClose = mkBtn("✕", "Close");
    btnClose.onclick = (ev) => {
        ev.stopPropagation();
        hideDetails();
    };

    topControls.appendChild(btnMeta);
    topControls.appendChild(btnOpen);
    topControls.appendChild(btnClose);
    cardEl.appendChild(topControls);

    // side tiles
    leftTile = createSideTile("left");
    rightTile = createSideTile("right");
    modalEl.appendChild(leftTile);
    modalEl.appendChild(rightTile);

    // metadata panel
    metaPanel = document.createElement("div");
    Object.assign(metaPanel.style, {
        position: "absolute",
        top: "0",
        right: "0",
        height: "100%",
        width: "340px",
        padding: "10px",
        display: "none",
        flexDirection: "column",
        background: "rgba(15,15,15,0.92)",
        borderLeft: "1px solid rgba(255,255,255,0.12)",
    });

    metaContent = document.createElement("div");
    Object.assign(metaContent.style, {
        overflow: "auto",
        paddingRight: "6px",
        flex: "1",
        color: "#e5e7eb",
        fontSize: "12px",
    });

    historyContainer = document.createElement("div");
    Object.assign(historyContainer.style, {
        marginTop: "10px",
        paddingTop: "8px",
        borderTop: "1px solid rgba(255,255,255,0.12)",
        display: "none",
        maxHeight: "240px",
        overflowY: "auto",
    });

    metaPanel.appendChild(metaContent);
    metaPanel.appendChild(historyContainer);
    // Attach metadata panel to cardEl so it's positioned relative to the card
    cardEl.appendChild(metaPanel);

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

    // ensure/merge history marker
    const historyKey = await ensureHistoryMarker(imgInfo);

    // MAIN IMAGE: full-res only here (no thumb fallbacks)
    const rel = imgInfo.relpath || imgInfo.filename || "";
    currentImageUrl = imgInfo.url || `${API_ENDPOINTS.IMAGE}?filename=${encodeURIComponent(rel)}`;

    // protect against out-of-order loads when navigating fast
    const loadToken = Symbol("details-load");
    imgEl._loadToken = loadToken;

    imgEl.onload = () => {
        if (imgEl._loadToken !== loadToken) return;
        resizeCardToImage();
        fillMetadata(imgInfo, historyKey);
    };

    imgEl.src = currentImageUrl;

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

    // wipe history strip + observer
    clearHistoryStrip();

    // reset meta panel
    metadataVisible = false;
    if (metaPanel) metaPanel.style.display = "none";

    currentIndex = null;
    currentImageUrl = null;
    currentImageInfo = null;
    
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
        
        // Metadata panel is already positioned absolutely, just ensure it's visible
        if (metaPanel) {
            // Panel is already positioned absolute with right: 0, which is correct
            // Just ensure it's displayed
        }
        
        // if we already have an image open, rebuild metadata (includes history)
        if (currentImageInfo) {
            fillMetadata(currentImageInfo, currentImageInfo.history_key || computeHistoryKey(currentImageInfo));
        }
    } else {
        metaPanel.style.display = "none";
        btnMeta.title = "Show metadata";
        clearHistoryStrip();
        
        // Restore side tiles when metadata is hidden
        if (leftTile) {
            leftTile.style.display = "flex";
        }
        if (rightTile) {
            rightTile.style.display = "flex";
        }
        
        // Restore card position: center
        if (cardEl) {
            Object.assign(cardEl.style, {
                marginRight: "0",
            });
        }
    }
}

async function persistMetadata() {
    if (!currentImageInfo || !currentImageInfo.filename) return;

    try {
        await galleryApi.saveMetadata(currentImageInfo.filename, {
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

async function fillMetadata(imgInfo, historyKey) {
    if (!metaContent) return;

    // if meta panel is hidden, don’t waste time building it
    if (!metadataVisible) {
        clearHistoryStrip();
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

    // File name (editable for admins)
    const fileRow = document.createElement("div");
    Object.assign(fileRow.style, { marginBottom: "8px" });
    
    const fileNameLabel = document.createElement("div");
    Object.assign(fileNameLabel.style, {
        fontSize: "10px",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        color: "rgba(200,200,200,0.7)",
        marginBottom: "2px",
    });
    fileNameLabel.textContent = "File";
    
    const fileNameValue = document.createElement("div");
    Object.assign(fileNameValue.style, {
        fontSize: "12px",
        color: "#f0f0f0",
        wordBreak: "break-word",
    });
    
    if (canEditMeta && currentUser && (currentUser.is_admin === true || (Array.isArray(currentUser.groups) && currentUser.groups.includes("admin")))) {
        // Admin can edit filename
        const fileNameInput = document.createElement("input");
        fileNameInput.type = "text";
        fileNameInput.value = filename || relpath || "";
        Object.assign(fileNameInput.style, {
            width: "100%",
            padding: "4px 6px",
            borderRadius: "6px",
            border: "1px solid rgba(255,255,255,0.18)",
            background: "rgba(0,0,0,0.25)",
            color: "#e5e7eb",
            fontSize: "12px",
            outline: "none",
        });
        fileNameInput.onchange = async () => {
            const newName = fileNameInput.value.trim();
            if (newName && newName !== filename) {
                try {
                    await galleryApi.renameFile(filename, newName);
                    // Update current image info
                    currentImageInfo.filename = newName;
                    currentImageInfo.relpath = newName;
                    // Reload metadata
                    fillMetadata(currentImageInfo, currentImageInfo.history_key || computeHistoryKey(currentImageInfo));
                } catch (err) {
                    console.error("[UsgromanaGallery] Failed to rename file:", err);
                    alert("Failed to rename file: " + (err.message || "Unknown error"));
                    fileNameInput.value = filename || relpath || "";
                }
            }
        };
        fileNameValue.appendChild(fileNameInput);
    } else {
        fileNameValue.textContent = filename || relpath || "—";
    }
    
    fileRow.appendChild(fileNameLabel);
    fileRow.appendChild(fileNameValue);
    metaContent.appendChild(fileRow);
    addRow("Modified", dateStr);
    addRow("Size", sizeStr);
    addRow("Folder", folder || "Unsorted");
    addRow("Workflow", workflow_id || "—");
    addRow("Model", model || model_name || "—");
    addRow("Sampler", sampler || "—");
    addRow("Prompt", (full_prompt || prompt || "—"));
    
    // NSFW indicator - check if image is marked as NSFW
    try {
        const savedMeta = await getSavedMeta(filename);
        if (savedMeta.is_nsfw === true) {
            const nsfwBadge = document.createElement("div");
            Object.assign(nsfwBadge.style, {
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                padding: "2px 8px",
                borderRadius: "4px",
                background: "rgba(220,38,38,0.2)",
                border: "1px solid rgba(220,38,38,0.6)",
                color: "#fca5a5",
                fontSize: "10px",
                fontWeight: "600",
                textTransform: "uppercase",
                marginTop: "4px",
                marginBottom: "8px",
            });
            nsfwBadge.textContent = "⚠️ NSFW";
            metaContent.appendChild(nsfwBadge);
        }
    } catch (err) {
        // Ignore errors checking NSFW status
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
                star.onclick = () => {
                    imgInfo.rating = s;
                    renderStars();
                    persistMetadata();
                };
            }
            starsRow.appendChild(star);
        }
    };
    renderStars();
    editBox.appendChild(starsRow);

    const baseInputStyle = {
        width: "100%",
        padding: "6px 8px",
        borderRadius: "8px",
        border: "1px solid rgba(255,255,255,0.18)",
        background: "rgba(0,0,0,0.25)",
        color: "#e5e7eb",
        marginBottom: "8px",
        outline: "none",
    };

    // Display name
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = display_name || "";
    nameInput.placeholder = "Display name…";
    nameInput.disabled = !canEditMeta;
    Object.assign(nameInput.style, baseInputStyle);
    nameInput.onchange = () => {
        imgInfo.display_name = nameInput.value || null;
        persistMetadata();
    };
    editBox.appendChild(nameInput);

    // Tags
    const tagsInput = document.createElement("input");
    tagsInput.type = "text";
    tagsInput.value = Array.isArray(tags) ? tags.join(", ") : "";
    tagsInput.placeholder = "tags, comma, separated";
    tagsInput.disabled = !canEditMeta;
    Object.assign(tagsInput.style, baseInputStyle);
    tagsInput.onchange = () => {
        const arr = (tagsInput.value || "")
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean);
        imgInfo.tags = arr;
        persistMetadata();
    };
    editBox.appendChild(tagsInput);

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

    // History strip (thumbs ONLY from state registry; never generates)
    await buildHistoryStrip(imgInfo, historyKey);
}

async function buildHistoryStrip(imgInfo, historyKey) {
    if (!historyContainer) return;

    // Only build when meta panel is visible
    if (!metadataVisible) {
        clearHistoryStrip();
        return;
    }

    clearHistoryStrip();

    const key = historyKey || imgInfo.history_key || computeHistoryKey(imgInfo);
    if (!key) return;

    const items = getImages();
    if (!Array.isArray(items) || items.length === 0) return;

    // Candidate pruning: workflow_id first, else stem
    const wf = imgInfo.workflow_id || null;
    const stem = computeStem(imgInfo.relpath || imgInfo.filename || "");

    const candidates = items.filter((it) => {
        if (!it) return false;
        if (wf && it.workflow_id === wf) return true;
        const s2 = computeStem(it.relpath || it.filename || "");
        return stem && s2 === stem;
    });

    // Load meta for candidates (bounded)
    const selected = [];
    for (let i = 0; i < candidates.length && selected.length < PERFORMANCE.HISTORY_MAX; i++) {
        const it = candidates[i];
        const meta = await getSavedMeta(it.filename);
        const itKey = meta.history_key || it.history_key || computeHistoryKey({ ...it, ...meta });
        if (itKey === key) selected.push(it);
    }

    if (selected.length <= 1) return;

    selected.sort((a, b) => (a.mtime || 0) - (b.mtime || 0));

    historyContainer.style.display = "block";
    historyContainer.innerHTML = "";

    const hdr = document.createElement("div");
    hdr.textContent = "History";
    Object.assign(hdr.style, {
        fontSize: "10px",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        color: "rgba(200,200,200,0.7)",
        marginBottom: "8px",
    });
    historyContainer.appendChild(hdr);

    const wrap = document.createElement("div");
    Object.assign(wrap.style, {
        display: "flex",
        gap: "6px",
        flexWrap: "wrap",
    });

    selected.forEach((it) => {
        const thumb = document.createElement("img");
        thumb.loading = "lazy";
        thumb.decoding = "async";

        // THUMBS ONLY: state registry first, then existing thumb_url. No backend generation.
        const itKey = getImageKey(it);
        const thumbUrl = (itKey && getThumbnail(itKey)) || it.thumb_url || null;

        if (!thumbUrl) return; // skip if grid hasn't registered it yet

        thumb.dataset.src = thumbUrl;
        Object.assign(thumb.style, {
            width: "64px",
            height: "64px",
            objectFit: "cover",
            borderRadius: "8px",
            cursor: "pointer",
            border:
                it.filename === imgInfo.filename
                    ? "2px solid rgba(255,216,107,0.9)"
                    : "1px solid rgba(255,255,255,0.12)",
        });

        thumb.onclick = () => {
            const idx = items.findIndex((x) => x && x.filename === it.filename);
            if (idx >= 0) showDetailsForIndex(idx);
        };

        wrap.appendChild(thumb);
    });

    // If nothing was added, hide it
    if (!wrap.childElementCount) {
        historyContainer.style.display = "none";
        historyContainer.innerHTML = "";
        return;
    }

    historyContainer.appendChild(wrap);
    setupHistoryLazyLoading(historyContainer);
}