// ComfyUI-Usgromana-Gallery/web/core/entry.js

import { galleryApi } from "./api.js";
import { logger } from "./logger.js";
import { setImages } from "./state.js";

import { showOverlay, createOverlay } from "../ui/overlay.js";
import {
    getGallerySettings,
    subscribeGallerySettings,
} from "./gallerySettings.js";

const GALLERY_ASSETS_BASE = "/usgromana-gallery/assets";
const LIGHT_LOGO = `${GALLERY_ASSETS_BASE}/light_logo_transparent.png`;
const DARK_LOGO  = `${GALLERY_ASSETS_BASE}/dark_logo_transparent.png`;

let initialized = false;
let loading = false;
let loadedOnce = false;

let launchBtn = null;
let hasCustomPosition = false;
let resizeHandlerAttached = false;
let isAnchored = false; 
let anchorWatchStarted = false;

// ---------------------------------------------------------
// Image loading
// ---------------------------------------------------------
async function loadImages(force = false) {
    if (loading) return;
    if (loadedOnce && !force) return;

    loading = true;
    try {
        const images = await galleryApi.listImages();
        setImages(images);
        loadedOnce = true;
        logger.info(`[UsgromanaGallery] Loaded ${images.length} gallery images`);
    } catch (err) {
        logger.error("[UsgromanaGallery] Failed to load gallery images", err);
    } finally {
        loading = false;
    }
}

// ---------------------------------------------------------
// Toolbar anchor helper
// ---------------------------------------------------------
function usgFindToolbarContainer(settings) {
    const cfg = settings || getGallerySettings();

    // 1) Respect user-defined selector first
    const sel = cfg.openButtonBoxQuery && cfg.openButtonBoxQuery.trim();
    if (sel) {
        const explicit = document.querySelector(sel);
        if (explicit) return explicit;
    }

    // 2) Fallbacks for safety
    const fallbackSelectors = [
        ".actionbar-container .comfyui-button-group:nth-of-type(2)",
        ".actionbar-container .comfyui-button-group",
        ".actionbar-container",
        ".queue-button-group",
        ".comfy-menu .comfy-menu-right",
        ".comfy-menu",
        "#comfy-menu",
        ".comfyui-menu",
    ];

    for (const s of fallbackSelectors) {
        const el = document.querySelector(s);
        if (el) return el;
    }

    return null;
}

// ---------------------------------------------------------
// Positioning / anchoring
// ---------------------------------------------------------
function applyButtonPosition(settings) {
    if (!launchBtn) return;

    const cfg = settings || getGallerySettings();
    const anchor = cfg?.anchorToManagerBar;
    const toolbar = usgFindToolbarContainer(cfg);

    if (anchor && toolbar) {
        // Re-parent into the toolbar
        if (launchBtn.parentElement !== toolbar) {
            toolbar.appendChild(launchBtn);
        }

        // Make it look like a native Comfy button
        launchBtn.classList.add("comfyui-button", "comfyui-menu-mobile-collapse", "primary");

        Object.assign(launchBtn.style, {
            position: "relative",
            top: "0",
            left: "0",
            right: "0",
            bottom: "0",
            marginLeft: "6px",
            marginRight: "0",
            transform: "none",
            boxShadow: "none",   // flat in the bar
            // Let Comfy's CSS handle background/border/etc:
            borderRadius: "6px",
            background: "rgba(77, 77, 77, 0.55)",
            border: "1px solid rgba(148,163,184,0.55)",
            borderRadius: "",
            padding: "6px 10px",
        });

        hasCustomPosition = false;
        isAnchored = true;
        return;
    }

    // Floating mode
    if (launchBtn.parentElement !== document.body) {
        document.body.appendChild(launchBtn);
    }

    // When not anchored, remove Comfy classes and restore your pill style
    launchBtn.classList.remove("comfyui-button", "comfyui-menu-mobile-collapse", "primary");

    launchBtn.style.position = "fixed";
    launchBtn.style.transform = "none";

    if (!hasCustomPosition) {
        Object.assign(launchBtn.style, {
            bottom: "16px",
            right: "16px",
            top: "auto",
            left: "auto",
        });
    }

    isAnchored = false;
}

function startAnchorWatch() {
    if (anchorWatchStarted) return;
    anchorWatchStarted = true;

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/6712329c-12ed-47b3-85f9-78457616d544',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'entry.js:147',message:'Anchor watch started',data:{interval:1500},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    setInterval(() => {
        if (!launchBtn) return;

        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/6712329c-12ed-47b3-85f9-78457616d544',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'entry.js:150',message:'Anchor watch tick',data:{timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        const cfg = getGallerySettings();
        const anchor = cfg.anchorToManagerBar;
        const toolbar = usgFindToolbarContainer(cfg);

        // If anchored, make sure we're inside the toolbar
        if (anchor && toolbar) {
            if (!toolbar.contains(launchBtn)) {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/6712329c-12ed-47b3-85f9-78457616d544',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'entry.js:159',message:'Button re-anchored to toolbar',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                // #endregion
                toolbar.appendChild(launchBtn);
                applyButtonPosition(cfg);
            }
        } else {
            // Not anchored → make sure we're back on the body (floating)
            if (launchBtn.parentElement !== document.body) {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/6712329c-12ed-47b3-85f9-78457616d544',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'entry.js:165',message:'Button moved to body',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                // #endregion
                document.body.appendChild(launchBtn);
                applyButtonPosition(cfg);
            }
        }

        // Safety: if somehow removed entirely from DOM, re-attach
        if (!document.body.contains(launchBtn)) {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/6712329c-12ed-47b3-85f9-78457616d544',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'entry.js:172',message:'Button re-attached to DOM',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
            // #endregion
            document.body.appendChild(launchBtn);
            applyButtonPosition(cfg);
        }
    }, 1500);
}

// ---------------------------------------------------------
// Drag behaviour (only in floating mode)
// ---------------------------------------------------------
function makeButtonDraggable(btn) {
    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    btn.addEventListener("pointerdown", (ev) => {
        if (ev.button !== 0) return;

        const settings = getGallerySettings();
        if (settings.anchorToManagerBar) {
            // When inside the toolbar, don't let the user drag it.
            return;
        }

        dragging = true;
        hasCustomPosition = true;
        btn.setPointerCapture(ev.pointerId);

        const rect = btn.getBoundingClientRect();
        offsetX = ev.clientX - rect.left;
        offsetY = ev.clientY - rect.top;

        ev.preventDefault();
    });

    btn.addEventListener("pointermove", (ev) => {
        if (!dragging) return;

        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        let newLeft = ev.clientX - offsetX;
        let newTop = ev.clientY - offsetY;

        const maxLeft = viewportWidth - btn.offsetWidth - 8;
        const maxTop = viewportHeight - btn.offsetHeight - 8;

        newLeft = Math.max(8, Math.min(maxLeft, newLeft));
        newTop = Math.max(8, Math.min(maxTop, newTop));

        Object.assign(btn.style, {
            left: `${newLeft}px`,
            top: `${newTop}px`,
            right: "auto",
            bottom: "auto",
        });
    });

    function endDrag(ev) {
        if (!dragging) return;
        dragging = false;
        try { btn.releasePointerCapture(ev.pointerId); } catch {}
    }

    btn.addEventListener("pointerup", endDrag);
    btn.addEventListener("pointercancel", endDrag);
}

// ---------------------------------------------------------
// Button creation
// ---------------------------------------------------------
function createFloatingButton() {
    if (launchBtn) return launchBtn;

    const btn = document.createElement("button");
    btn.id = "usg-gallery-launch-btn";

    // Icon (light/dark logo)
    const iconImg = document.createElement("img");
    iconImg.id = "usg-gallery-pill-icon";
    iconImg.style.height = "14px";
    iconImg.style.width = "14px";
    iconImg.style.objectFit = "contain";
    iconImg.style.opacity = "0.9";
    iconImg.style.transition = "opacity 0.2s ease";

    const settings = getGallerySettings();
    iconImg.src = settings.theme === "light" ? LIGHT_LOGO : DARK_LOGO;

    const labelSpan = document.createElement("span");
    labelSpan.textContent = "Gallery";

    btn.appendChild(iconImg);
    btn.appendChild(labelSpan);

    // Rectangular comfy-like visual style
    Object.assign(btn.style, {
        zIndex: "9999",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "6px",

        padding: "6px 10px",
        minWidth: "110px",
        minHeight: "28px",

        borderRadius: "6px",
        border: "1px solid rgba(148,163,184,0.55)",

        background: "rgba(77, 77, 77, 0.55)",
        color: "#e5e7eb",
        fontSize: "12px",
        fontWeight: "500",
        fontFamily:
            "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",

        cursor: "pointer",
        boxShadow: "0 8px 22px rgba(15,23,42,0.85)",
        userSelect: "none",
        WebkitUserSelect: "none",
        backdropFilter: "blur(4px)",
    });

    btn.addEventListener("mouseenter", () => {
        if (isAnchored) return;  // no glow when anchored

        btn.style.boxShadow = "0 10px 26px rgba(15,23,42,0.95)";
        btn.style.background = "rgba(15,23,42,0.98)";
        iconImg.style.opacity = "1";
    });

    btn.addEventListener("mouseleave", () => {
        if (isAnchored) return;  // keep flat when anchored

        btn.style.boxShadow = "0 8px 22px rgba(15,23,42,0.85)";
        btn.style.background = "rgba(15,23,42,0.96)";
        iconImg.style.opacity = "0.9";
    });

    btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        showOverlay();
    });

    // Attach, make draggable (for floating mode), and position
    document.body.appendChild(btn);
    launchBtn = btn;

    makeButtonDraggable(btn);
    applyButtonPosition(settings);

    // React to settings changes: theme + anchoring
    subscribeGallerySettings((newSettings) => {
        iconImg.src =
            newSettings.theme === "light" ? LIGHT_LOGO : DARK_LOGO;
        applyButtonPosition(newSettings);
    });

    // Keep alignment sane on resize
    if (!resizeHandlerAttached) {
        resizeHandlerAttached = true;
        window.addEventListener("resize", () => {
            applyButtonPosition(getGallerySettings());
        });
    }

    return btn;
}

// ---------------------------------------------------------
// Public init
// ---------------------------------------------------------
export async function initGalleryExtension() {
    if (initialized) return;
    initialized = true;

    createOverlay();
    createFloatingButton();

    // Keep button alive even if Vue re-renders the actionbar
    startAnchorWatch();

    // Preload images once so the first open is fast
    await loadImages();
}