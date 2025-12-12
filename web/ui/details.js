// ComfyUI-Usgromana-Gallery/web/ui/details.js
// Persistent details overlay + 3-image viewer + history via metadata markers

import { getImages } from "../core/state.js";
import { galleryApi } from "../core/api.js";
import { fetchCurrentUser, canEditMetadata } from "../core/user.js";

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

// --- permissions
let currentUser = null;
let canEditMeta = false;

// --- metadata cache (avoid re-fetching constantly)
const metaCache = new Map(); // filename -> meta object

// --------------------------
// History marker computation
// --------------------------
// Your requirement: compute history through metadata markers.
// We store a stable "history_key" in per-image metadata.
// - If image has workflow_id -> history_key = "wf:<workflow_id>"
// - else -> history_key = "stem:<filename-stem>"
function computeStem(filename = "") {
    const base = (filename.split("/").pop() || filename).replace(/\.[^.]+$/, "");
    // strip common version suffixes: _00001, -00001, (1), etc.
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
        metaCache.set(filename, meta);
        return meta;
    } catch {
        const meta = {};
        metaCache.set(filename, meta);
        return meta;
    }
}

async function ensureHistoryMarker(imgInfo) {
    if (!imgInfo || !imgInfo.filename) return null;

    // Merge saved meta into imgInfo (non-destructive)
    const saved = await getSavedMeta(imgInfo.filename);
    if (saved && typeof saved === "object") {
        // copy across common fields if missing
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

    // If marker already exists, done
    if (imgInfo.history_key === key) return key;

    // Persist marker if allowed (or try anyway—harmless if backend rejects)
    imgInfo.history_key = key;
    try {
        await galleryApi.saveMetadata(imgInfo.filename, { history_key: key });
        // update cache
        const merged = { ...(metaCache.get(imgInfo.filename) || {}), history_key: key };
        metaCache.set(imgInfo.filename, merged);
    } catch (err) {
        // We do NOT fail the UI if marker can't be written (guest/no perms)
        console.warn("[UsgromanaGallery] Unable to persist history marker:", err);
    }

    return key;
}

// --------------------------
// History strip (lazy/unload)
// --------------------------
function setupHistoryLazyLoading(container) {
    if (historyObserver) {
        historyObserver.disconnect();
        historyObserver = null;
    }

    if (!("IntersectionObserver" in window)) {
        const imgs = container.querySelectorAll("img[data-src]");
        imgs.forEach((img) => (img.src = img.dataset.src));
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
                    // unload when offscreen (keeps memory down)
                    img.src = "";
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
            img.src = "";
            img.removeAttribute("src");
        });
        historyContainer.innerHTML = "";
        historyContainer.style.display = "none";
    }
}

// --------------------------
// Init persistent overlay
// --------------------------
export function initDetails(_rootIgnored) {
    if (modalEl) return; // persistent: build once

    // --- permissions fetch (async, UI updates later)
    fetchCurrentUser()
        .then((user) => {
            currentUser = user;
            canEditMeta = canEditMetadata(user);
            if (modalEl && modalEl.style.display !== "none" && currentImageInfo) {
                // refresh metadata to reflect edit controls
                fillMetadata(currentImageInfo);
            }
        })
        .catch(() => {
            currentUser = null;
            canEditMeta = false;
        });

    // Overlay backdrop
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

    // Close on clicking backdrop (not on card)
    modalEl.addEventListener("click", (ev) => {
        if (ev.target === modalEl) hideDetails();
    });

    // Card container
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

    // Main image
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

    // Buttons row (top-right)
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

    // Side tiles (prev/next)
    leftTile = createSideTile("left");
    rightTile = createSideTile("right");
    modalEl.appendChild(leftTile);
    modalEl.appendChild(rightTile);

    // Metadata panel (right side, hidden by default)
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

    // History container lives in meta panel (single strip)
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
    modalEl.appendChild(metaPanel);

    // Compose
    modalEl.appendChild(cardEl);
    document.body.appendChild(modalEl);

    // Keyboard nav
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

    if (side === "left") {
        leftTileImg = img;
        tile.onclick = (ev) => {
            ev.stopPropagation();
            navigateRelative(-1);
        };
    } else {
        rightTileImg = img;
        tile.onclick = (ev) => {
            ev.stopPropagation();
            navigateRelative(1);
        };
    }

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

    // load + merge metadata + write history marker if needed
    const historyKey = await ensureHistoryMarker(imgInfo);

    const rel = imgInfo.relpath || imgInfo.filename || "";
    currentImageUrl = imgInfo.url || `/usgromana-gallery/image?filename=${encodeURIComponent(rel)}`;

    imgEl.onload = () => {
        resizeCardToImage();
        if (!metadataVisible) {
            // tiles already fixed-position; nothing needed
        }
        // fill meta (async safe)
        fillMetadata(imgInfo, historyKey);
    };
    imgEl.src = currentImageUrl;

    // prev/next tiles: use thumbs to keep it light
    const prev = items[((currentIndex - 1) % len + len) % len];
    const next = items[(currentIndex + 1) % len];

    const prevRel = prev.relpath || prev.filename || "";
    const nextRel = next.relpath || next.filename || "";

    const prevUrl = prev.thumb_url || `/usgromana-gallery/image?filename=${encodeURIComponent(prevRel)}&size=thumb`;
    const nextUrl = next.thumb_url || `/usgromana-gallery/image?filename=${encodeURIComponent(nextRel)}&size=thumb`;

    if (leftTileImg) leftTileImg.src = prevUrl;
    if (rightTileImg) rightTileImg.src = nextUrl;

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

    // IMPORTANT: persistent overlay. Do NOT remove from DOM. :contentReference[oaicite:4]{index=4}
    modalEl.style.display = "none";
    modalEl.style.backdropFilter = "none";

    // wipe the 3 live images
    if (imgEl) {
        imgEl.src = "";
        imgEl.removeAttribute("src");
    }
    if (leftTileImg) {
        leftTileImg.src = "";
        leftTileImg.removeAttribute("src");
    }
    if (rightTileImg) {
        rightTileImg.src = "";
        rightTileImg.removeAttribute("src");
    }

    // wipe history strip thumbnails + observer
    clearHistoryStrip();

    // reset meta panel state
    metadataVisible = false;
    if (metaPanel) metaPanel.style.display = "none";

    currentIndex = null;
    currentImageUrl = null;
    currentImageInfo = null;
}

// --------------------------
// Metadata panel
// --------------------------
function toggleMetadata() {
    metadataVisible = !metadataVisible;

    if (metadataVisible) {
        metaPanel.style.display = "flex";
        btnMeta.title = "Hide metadata";
    } else {
        metaPanel.style.display = "none";
        btnMeta.title = "Show metadata";

        // when hiding metadata, also unload history thumbs (they’re not visible anyway)
        clearHistoryStrip();
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

        // update cache
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

    // clear meta content first (prevents “history panel disappears” merges)
    metaContent.innerHTML = "";

    const {
        filename,
        size,
        mtime,
        tags = [],
        rating = 0,
        folder,
        workflow_id,
        model,
        model_name,
        prompt,
        full_prompt,
        sampler,
        display_name,
    } = imgInfo;

    const dateStr = mtime ? new Date(mtime * 1000).toLocaleString() : "Unknown";

    let sizeStr = "Unknown";
    if (typeof size === "number") {
        if (size > 1024 * 1024) sizeStr = (size / (1024 * 1024)).toFixed(2) + " MB";
        else if (size > 1024) sizeStr = (size / 1024).toFixed(1) + " KB";
        else sizeStr = size + " B";
    }

    addRow("File", filename || "—");
    addRow("Modified", dateStr);
    addRow("Size", sizeStr);
    addRow("Folder", folder || "Unsorted");
    addRow("Workflow", workflow_id || "—");
    addRow("Model", model || model_name || "—");
    addRow("Sampler", sampler || "—");

    const promptStr = full_prompt || prompt || "—";
    addRow("Prompt", promptStr);

    // --- Rating + Display Name + Tags (editable if allowed)
    // keep it simple: we reuse your metadata persistence approach for now
    // (you want EXIF-native later; that’s backend work)
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

    // Rating stars
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

    // Display name
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = display_name || "";
    nameInput.placeholder = "Display name…";
    nameInput.disabled = !canEditMeta;
    Object.assign(nameInput.style, {
        width: "100%",
        padding: "6px 8px",
        borderRadius: "8px",
        border: "1px solid rgba(255,255,255,0.18)",
        background: "rgba(0,0,0,0.25)",
        color: "#e5e7eb",
        marginBottom: "8px",
        outline: "none",
    });
    nameInput.onchange = () => {
        imgInfo.display_name = nameInput.value || null;
        persistMetadata();
    };
    editBox.appendChild(nameInput);

    // Tags (comma-separated)
    const tagsInput = document.createElement("input");
    tagsInput.type = "text";
    tagsInput.value = Array.isArray(tags) ? tags.join(", ") : "";
    tagsInput.placeholder = "tags, comma, separated";
    tagsInput.disabled = !canEditMeta;
    Object.assign(tagsInput.style, { ...nameInput.style });
    tagsInput.onchange = () => {
        const arr = (tagsInput.value || "")
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean);
        imgInfo.tags = arr;
        persistMetadata();
    };
    editBox.appendChild(tagsInput);

    metaContent.appendChild(editBox);

    // --- History strip (computed via marker)
    await buildHistoryStrip(imgInfo, historyKey);
}

async function buildHistoryStrip(imgInfo, historyKey) {
    if (!historyContainer) return;

    // If metadata panel is hidden, don’t build history (and don’t load thumbs)
    if (!metadataVisible) {
        clearHistoryStrip();
        return;
    }

    clearHistoryStrip();

    const key = historyKey || imgInfo.history_key || computeHistoryKey(imgInfo);
    if (!key) return;

    const items = getImages();
    if (!Array.isArray(items) || items.length === 0) return;

    // Candidate pruning: only consider same workflow_id or same stem
    const wf = imgInfo.workflow_id || null;
    const stem = computeStem(imgInfo.relpath || imgInfo.filename || "");

    const candidates = items.filter((it) => {
        if (!it) return false;
        if (wf && (it.workflow_id === wf)) return true;
        const s2 = computeStem(it.relpath || it.filename || "");
        return stem && s2 === stem;
    });

    // Load meta for candidates (bounded)
    const MAX = 80;
    const selected = [];
    for (let i = 0; i < candidates.length && selected.length < MAX; i++) {
        const it = candidates[i];
        const meta = await getSavedMeta(it.filename);
        const itKey = meta.history_key || it.history_key || computeHistoryKey({ ...it, ...meta });
        if (itKey === key) {
            selected.push(it);
        }
    }

    if (selected.length <= 1) return; // no meaningful history

    // Sort by modified time if present
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

        const rel = it.relpath || it.filename || "";
        const url = it.thumb_url || `/usgromana-gallery/image?filename=${encodeURIComponent(rel)}&size=thumb`;

        thumb.dataset.src = url; // lazy source (loaded by observer)
        Object.assign(thumb.style, {
            width: "64px",
            height: "64px",
            objectFit: "cover",
            borderRadius: "8px",
            cursor: "pointer",
            border: (it.filename === imgInfo.filename) ? "2px solid rgba(255,216,107,0.9)" : "1px solid rgba(255,255,255,0.12)",
        });

        thumb.onclick = () => {
            const idx = items.findIndex((x) => x && x.filename === it.filename);
            if (idx >= 0) showDetailsForIndex(idx);
        };

        wrap.appendChild(thumb);
    });

    historyContainer.appendChild(wrap);
    setupHistoryLazyLoading(historyContainer);
}
