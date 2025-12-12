// ComfyUI-Usgromana-Gallery/web/core/entry.js

import { galleryApi } from "./api.js";
import { logger } from "./logger.js";
import { setImages } from "./state.js";
import { ASSETS, PERFORMANCE } from "./constants.js";
import { createManagedInterval } from "./utils.js";

import { showOverlay, createOverlay } from "../ui/overlay.js";
import {
    getGallerySettings,
    subscribeGallerySettings,
    updateGallerySettings,
} from "./gallerySettings.js";

let initialized = false;
let loading = false;
let loadedOnce = false;

let launchBtn = null;
let hasCustomPosition = false;
let resizeHandlerAttached = false;
let isAnchored = false; 
let anchorWatchInterval = null;

// ---------------------------------------------------------
// Image loading
// ---------------------------------------------------------
async function loadImages(force = false) {
    if (loading) return;
    if (loadedOnce && !force) return;

    loading = true;
    
    // Show loading indicator if grid is initialized
    if (typeof window !== 'undefined' && window.USG_GALLERY_SHOW_LOADING) {
        window.USG_GALLERY_SHOW_LOADING();
    }
    
    try {
        const images = await galleryApi.listImages();
        // Only reset visibleImages on initial load (force=true) or first load
        setImages(images, force || !loadedOnce);
        loadedOnce = true;
        logger.info(`[UsgromanaGallery] Loaded ${images.length} gallery images`);
    } catch (err) {
        logger.error("[UsgromanaGallery] Failed to load gallery images", err);
    } finally {
        loading = false;
        
        // Hide loading indicator
        if (typeof window !== 'undefined' && window.USG_GALLERY_HIDE_LOADING) {
            window.USG_GALLERY_HIDE_LOADING();
        }
    }
}

// ---------------------------------------------------------
// Real-time file monitoring (polling-based)
// ---------------------------------------------------------
let fileWatchInterval = null;
let lastImageCount = 0;

function startFileWatching() {
    if (fileWatchInterval) return;
    
    const settings = getGallerySettings();
    if (!settings.enableRealTimeUpdates) {
        return; // User disabled real-time updates
    }
    
    // Poll for file changes periodically
    const managed = createManagedInterval(async () => {
        try {
            const currentSettings = getGallerySettings();
            if (!currentSettings.enableRealTimeUpdates) {
                stopFileWatching();
                return;
            }
            
            const monitoring = await galleryApi.checkWatchStatus();
            if (monitoring) {
                // If monitoring is active, reload images to catch changes
                // This is a simple polling approach; could be upgraded to WebSocket
                const images = await galleryApi.listImages();
                if (images.length !== lastImageCount) {
                    lastImageCount = images.length;
                    // Don't reset visibleImages - preserve grid's current filter/sort order
                    setImages(images, false);
                    // Grid will auto-update via state subscription
                }
            }
        } catch (err) {
            // Silently fail - monitoring might not be available
        }
    }, PERFORMANCE.FILE_WATCH_POLL_INTERVAL);
    
    managed.start();
    fileWatchInterval = managed;
}

function stopFileWatching() {
    if (fileWatchInterval) {
        fileWatchInterval.stop();
        fileWatchInterval = null;
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

    // 2) Try to find the Manager button's group first (most specific)
    const managerButton = document.querySelector('button[aria-label="ComfyUI Manager"], button[title="ComfyUI Manager"]');
    if (managerButton) {
        const managerGroup = managerButton.closest('.comfyui-button-group');
        if (managerGroup) return managerGroup;
    }

    // 3) Fallbacks for safety - prioritize groups that contain Manager-like buttons
    const allGroups = Array.from(document.querySelectorAll('.actionbar-container .comfyui-button-group'));
    // Find group containing Manager button by searching for button with "Manager" text
    for (const group of allGroups) {
        const buttons = group.querySelectorAll('button');
        for (const btn of buttons) {
            const text = btn.textContent || btn.innerText || '';
            const ariaLabel = btn.getAttribute('aria-label') || '';
            const title = btn.getAttribute('title') || '';
            if (text.includes('Manager') || ariaLabel.includes('Manager') || title.includes('Manager')) {
                return group;
            }
        }
    }

    // If no Manager group found, try to find the last non-empty group
    for (let i = allGroups.length - 1; i >= 0; i--) {
        if (allGroups[i].children.length > 0) {
            return allGroups[i];
        }
    }

    const fallbackSelectors = [
        ".actionbar-container .comfyui-button-group:last-child",
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
        // Re-parent into the toolbar, placing after Manager button if it exists
        if (launchBtn.parentElement !== toolbar) {
            const managerButton = toolbar.querySelector('button[aria-label="ComfyUI Manager"], button[title="ComfyUI Manager"]');
            if (managerButton && managerButton.nextSibling) {
                // Insert after Manager button
                toolbar.insertBefore(launchBtn, managerButton.nextSibling);
            } else if (managerButton) {
                // Manager button exists but has no next sibling, append after it
                managerButton.parentNode.insertBefore(launchBtn, managerButton.nextSibling);
            } else {
                // No Manager button found, just append to group
                toolbar.appendChild(launchBtn);
            }
        }

        // Make it look like a native Comfy button
        launchBtn.classList.add("comfyui-button", "comfyui-menu-mobile-collapse", "primary");

        Object.assign(launchBtn.style, {
            position: "relative",
            top: "0",
            left: "0",
            right: "0",
            bottom: "0",
            marginLeft: "0px",
            marginRight: "0",
            transform: "none",
            boxShadow: "none",   // flat in the bar
            // Let Comfy's CSS handle background/border/etc:
            borderRadius: "",
            background: "",
            border: "",
            padding: "",
            minWidth: "",
            minHeight: "",
            width: "",
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
    if (anchorWatchInterval) return;

    anchorWatchInterval = createManagedInterval(() => {
        if (!launchBtn) return;

        const cfg = getGallerySettings();
        const anchor = cfg.anchorToManagerBar;
        const toolbar = usgFindToolbarContainer(cfg);

        // If anchored, make sure we're inside the toolbar
        if (anchor && toolbar) {
            if (!toolbar.contains(launchBtn)) {
                toolbar.appendChild(launchBtn);
                applyButtonPosition(cfg);
            }
        } else {
            // Not anchored → make sure we're back on the body (floating)
            if (launchBtn.parentElement !== document.body) {
                document.body.appendChild(launchBtn);
                applyButtonPosition(cfg);
            }
        }

        // Safety: if somehow removed entirely from DOM, re-attach
        if (!document.body.contains(launchBtn)) {
            document.body.appendChild(launchBtn);
            applyButtonPosition(cfg);
        }
    }, PERFORMANCE.ANCHOR_WATCH_INTERVAL);

    anchorWatchInterval.start();
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
    iconImg.src = settings.theme === "light" ? ASSETS.LIGHT_LOGO : ASSETS.DARK_LOGO;

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
    const unsubscribeSettings = subscribeGallerySettings((newSettings) => {
        iconImg.src =
            newSettings.theme === "light" ? ASSETS.LIGHT_LOGO : ASSETS.DARK_LOGO;
        applyButtonPosition(newSettings);
    });

    // Cleanup on button removal (if needed)
    if (btn.parentElement) {
        const observer = new MutationObserver(() => {
            if (!document.body.contains(btn) && anchorWatchInterval) {
                anchorWatchInterval.stop();
                unsubscribeSettings();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

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

    // Preload images once so the first open is fast (non-blocking via backend)
    await loadImages();
    
    // Start file watching for real-time updates (if enabled)
    startFileWatching();
    
    // React to settings changes for file watching
    subscribeGallerySettings((settings) => {
        if (settings.enableRealTimeUpdates) {
            if (!fileWatchInterval) startFileWatching();
        } else {
            stopFileWatching();
        }
    });
}