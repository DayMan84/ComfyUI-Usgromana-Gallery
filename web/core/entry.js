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
import { initDragDrop } from "./dragDrop.js";
import { initThemeSystem } from "./themeManager.js";
import { startNotificationPolling } from "./notifications.js";
import { loadAppearance } from "./appearance.js";
import {
    galleryButtonMetrics,
    galleryButtonVisibility,
} from "./galleryButton.js";

let initialized = false;
let loading = false;
let loadedOnce = false;

let launchBtn = null;
let toolbarBtn = null;
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
function applyPillMetrics(btn, settings) {
    const metrics = galleryButtonMetrics(settings && settings.galleryButtonScale);
    const icon = btn.querySelector("img");
    if (icon) {
        icon.style.height = `${metrics.icon}px`;
        icon.style.width = `${metrics.icon}px`;
    }
    btn.style.padding = `${metrics.padY}px ${metrics.padX}px`;
    btn.style.minWidth = `${metrics.minWidth}px`;
    btn.style.minHeight = `${metrics.minHeight}px`;
    btn.style.fontSize = `${metrics.fontSize}px`;
    btn.style.gap = `${metrics.gap}px`;
    btn.style.borderRadius = `${metrics.radius}px`;
}

function hideFloatingPill() {
    if (!launchBtn) return;
    if (launchBtn.parentElement !== document.body) {
        document.body.appendChild(launchBtn);
    }
    launchBtn.style.display = "none";
    launchBtn.setAttribute("aria-hidden", "true");
    launchBtn.classList.remove("comfyui-button", "comfyui-menu-mobile-collapse", "primary");
}

function showFloatingPill(settings) {
    if (!launchBtn) return;
    if (launchBtn.parentElement !== document.body) {
        document.body.appendChild(launchBtn);
    }
    launchBtn.classList.remove("comfyui-button", "comfyui-menu-mobile-collapse", "primary");
    launchBtn.style.display = "inline-flex";
    launchBtn.removeAttribute("aria-hidden");
    launchBtn.style.position = "fixed";
    launchBtn.style.transform = "none";
    applyPillMetrics(launchBtn, settings);
    if (!hasCustomPosition) {
        Object.assign(launchBtn.style, {
            bottom: "16px",
            right: "16px",
            top: "auto",
            left: "auto",
        });
    }
}

function ensureToolbarButton(toolbar, settings) {
    if (!toolbarBtn) {
        const btn = document.createElement("button");
        btn.id = "usg-gallery-toolbar-btn";
        btn.type = "button";
        btn.title = "Gallery";
        btn.classList.add("comfyui-button", "comfyui-menu-mobile-collapse", "primary");
        const icon = document.createElement("img");
        icon.alt = "";
        icon.style.height = "14px";
        icon.style.width = "14px";
        icon.style.objectFit = "contain";
        const label = document.createElement("span");
        label.textContent = "Gallery";
        btn.append(icon, label);
        btn.addEventListener("click", (ev) => {
            ev.stopPropagation();
            showOverlay();
        });
        toolbarBtn = btn;
    }
    const icon = toolbarBtn.querySelector("img");
    if (icon) {
        const theme = (settings || getGallerySettings()).theme;
        icon.src = theme === "light" ? ASSETS.LIGHT_LOGO : ASSETS.DARK_LOGO;
    }
    if (toolbarBtn.parentElement !== toolbar) {
        const managerButton = toolbar.querySelector('button[aria-label="ComfyUI Manager"], button[title="ComfyUI Manager"]');
        if (managerButton && managerButton.parentNode) {
            managerButton.parentNode.insertBefore(toolbarBtn, managerButton.nextSibling);
        } else {
            toolbar.appendChild(toolbarBtn);
        }
    }
    toolbarBtn.style.display = "";
    toolbarBtn.removeAttribute("aria-hidden");
}

function removeToolbarButton() {
    if (!toolbarBtn) return;
    toolbarBtn.remove();
    toolbarBtn = null;
}

function applyButtonPosition(settings) {
    const cfg = settings || getGallerySettings();
    const visibility = galleryButtonVisibility(cfg.anchorToManagerBar);
    const toolbar = usgFindToolbarContainer(cfg);

    document.querySelectorAll("#usg-gallery-launch-btn").forEach((el) => {
        if (el !== launchBtn) el.remove();
    });

    if (visibility.showToolbar && toolbar) {
        hideFloatingPill();
        ensureToolbarButton(toolbar, cfg);
        toolbar.querySelectorAll("#usg-gallery-launch-btn").forEach((el) => el.remove());
        isAnchored = true;
        return;
    }

    removeToolbarButton();
    showFloatingPill(cfg);
    isAnchored = false;
}

function startAnchorWatch() {
    if (anchorWatchInterval) return;

    anchorWatchInterval = createManagedInterval(() => {
        if (!launchBtn) return;

        const cfg = getGallerySettings();
        const visibility = galleryButtonVisibility(cfg.anchorToManagerBar);
        const toolbar = usgFindToolbarContainer(cfg);

        if (visibility.showToolbar && toolbar) {
            if (!toolbarBtn || !toolbar.contains(toolbarBtn) || launchBtn.style.display !== "none") {
                applyButtonPosition(cfg);
            }
        } else if (!launchBtn || launchBtn.style.display === "none" || launchBtn.parentElement !== document.body) {
            applyButtonPosition(cfg);
        }

        if (launchBtn && !document.body.contains(launchBtn)) {
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

    const metrics = galleryButtonMetrics(settings.galleryButtonScale);
    // Rectangular comfy-like visual style. Metrics at scale 1 match the original pill.
    Object.assign(btn.style, {
        zIndex: "9999",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: `${metrics.gap}px`,

        padding: `${metrics.padY}px ${metrics.padX}px`,
        minWidth: `${metrics.minWidth}px`,
        minHeight: `${metrics.minHeight}px`,

        borderRadius: `${metrics.radius}px`,
        border: "1px solid rgba(148,163,184,0.55)",

        background: "rgba(77, 77, 77, 0.55)",
        color: "#e5e7eb",
        fontSize: `${metrics.fontSize}px`,
        fontWeight: "500",
        fontFamily:
            "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",

        cursor: "pointer",
        boxShadow: "0 8px 22px rgba(15,23,42,0.85)",
        userSelect: "none",
        WebkitUserSelect: "none",
        backdropFilter: "blur(4px)",
    });
    iconImg.style.height = `${metrics.icon}px`;
    iconImg.style.width = `${metrics.icon}px`;

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
// Usgromana radial menu
// The wheel belongs to Usgromana. Register only when that API exists.
// ---------------------------------------------------------
function registerUsgromanaRadialButton() {
    const api = window.UsgromanaRadialMenu;
    if (!api || typeof api.register !== "function") return false;
    if (typeof api.getAll === "function" && api.getAll().some((button) => button.id === "gallery")) {
        return true;
    }
    return api.register({
        id: "gallery",
        label: "Gallery",
        icon: "🖼️",
        order: 10,
        onClick: () => showOverlay(),
    }) !== false;
}

function watchUsgromanaRadialButton() {
    if (registerUsgromanaRadialButton()) return;
    let tries = 0;
    const timer = setInterval(() => {
        tries += 1;
        if (registerUsgromanaRadialButton() || tries >= 40) clearInterval(timer);
    }, 250);
}

// ---------------------------------------------------------
// Public init
// ---------------------------------------------------------
export async function initGalleryExtension() {
    if (initialized) return;
    initialized = true;
    watchUsgromanaRadialButton();

    // Initialize theme system first
    initThemeSystem();
    
    createOverlay();
    createFloatingButton();
    
    // Initialize drag and drop functionality
    initDragDrop();
    startNotificationPolling();
    loadAppearance();

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