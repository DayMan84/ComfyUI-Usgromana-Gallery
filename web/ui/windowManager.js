// ComfyUI-Usgromana-Gallery/web/ui/windowManager.js
// Handles pin/unpin functionality for the gallery window

import { getCurrentTheme } from "../core/themeManager.js";

let isPinned = true;
let panelEl = null;
let overlayEl = null;
let pinButton = null;
let headerEl = null;

// Drag state
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let panelStartX = 0;
let panelStartY = 0;

// Resize state
let isResizing = false;
let resizeStartX = 0;
let resizeStartY = 0;
let panelStartWidth = 0;
let panelStartHeight = 0;
let resizeHandle = null;

// Storage key for window position/size
const WINDOW_STATE_STORAGE_KEY = "usgromana.gallery.windowState";

// ---------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------

/**
 * Initialize window manager with overlay and panel elements
 */
export function initWindowManager(overlay, panel) {
    overlayEl = overlay;
    panelEl = panel;
    
    // Find header element - it's the first child of the panel
    headerEl = panel.firstElementChild;
    
    // Load saved window state
    const savedState = loadWindowState();
    if (savedState && savedState.isPinned === false) {
        // If was unpinned, restore unpinned state after a short delay to ensure DOM is ready
        setTimeout(() => {
            isPinned = false;
            updatePinState();
        }, 100);
    }
}

/**
 * Create and return pin button element
 */
export function createPinButton() {
    const theme = getCurrentTheme();
    
    pinButton = document.createElement("button");
    pinButton.title = isPinned ? "Unpin window (make movable)" : "Pin window";
    pinButton.innerHTML = isPinned ? "📌" : "📍";
    
    Object.assign(pinButton.style, {
        borderRadius: "999px",
        border: `1px solid ${theme.buttonBorder}`,
        padding: "4px 10px",
        fontSize: "11px",
        cursor: "pointer",
        background: theme.buttonBackground,
        color: theme.buttonText,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: "28px",
        height: "22px",
    });
    
    pinButton.onclick = togglePin;
    
    // Hover effects
    pinButton.onmouseenter = () => {
        pinButton.style.background = theme.buttonBackgroundHover;
    };
    pinButton.onmouseleave = () => {
        pinButton.style.background = theme.buttonBackground;
    };
    
    return pinButton;
}

/**
 * Toggle pin/unpin state
 */
function togglePin() {
    isPinned = !isPinned;
    updatePinState();
    saveWindowState();
}

/**
 * Update UI based on pin state
 */
function updatePinState() {
    if (!overlayEl || !panelEl) return;
    
    const theme = getCurrentTheme();
    
    if (isPinned) {
        // Pinned: restore backdrop, center panel, disable drag/resize
        overlayEl.style.background = theme.overlayBackground;
        overlayEl.style.justifyContent = "center";
        overlayEl.style.alignItems = "center";
        overlayEl.style.pointerEvents = "auto"; // Restore normal pointer events
        
        panelEl.style.position = "relative";
        panelEl.style.left = "auto";
        panelEl.style.top = "auto";
        panelEl.style.transform = "none";
        panelEl.style.margin = "0";
        panelEl.style.pointerEvents = "auto";
        
        // Remove resize handle
        if (resizeHandle) {
            resizeHandle.remove();
            resizeHandle = null;
        }
        
        // Remove drag cursor from header
        if (headerEl) {
            headerEl.style.cursor = "default";
            headerEl.removeEventListener("mousedown", startDrag);
        }
        
        // Update button
        if (pinButton) {
            pinButton.innerHTML = "📌";
            pinButton.title = "Unpin window (make movable)";
        }
    } else {
        // Unpinned: remove backdrop, enable drag/resize, allow click-through
        overlayEl.style.background = "transparent";
        overlayEl.style.justifyContent = "flex-start";
        overlayEl.style.alignItems = "flex-start";
        overlayEl.style.pointerEvents = "none"; // Allow clicks to pass through overlay
        
        // Make panel absolutely positioned and ensure it can receive clicks
        panelEl.style.position = "absolute";
        panelEl.style.margin = "0";
        panelEl.style.pointerEvents = "auto"; // Panel itself should receive clicks
        panelEl.style.maxWidth = "none";
        panelEl.style.maxHeight = "none";
        
        // Restore saved position and size or use current position
        const savedState = loadWindowState();
        if (savedState) {
            if (savedState.x !== undefined && savedState.y !== undefined) {
                panelEl.style.left = `${savedState.x}px`;
                panelEl.style.top = `${savedState.y}px`;
            }
            if (savedState.width !== undefined && savedState.height !== undefined) {
                panelEl.style.width = `${savedState.width}px`;
                panelEl.style.height = `${savedState.height}px`;
            }
        } else {
            // Center on screen initially
            const rect = panelEl.getBoundingClientRect();
            panelEl.style.left = `${(window.innerWidth - rect.width) / 2}px`;
            panelEl.style.top = `${(window.innerHeight - rect.height) / 2}px`;
        }
        
        panelEl.style.transform = "none";
        
        // Add resize handle
        if (!resizeHandle) {
            createResizeHandle();
        }
        
        // Make header draggable (but not buttons)
        if (headerEl) {
            headerEl.style.cursor = "move";
            headerEl.style.pointerEvents = "auto";
            // Remove existing listener if any, then add new one
            headerEl.removeEventListener("mousedown", startDrag);
            headerEl.addEventListener("mousedown", startDrag);
        }
        
        // Update button
        if (pinButton) {
            pinButton.innerHTML = "📍";
            pinButton.title = "Pin window";
        }
    }
}

/**
 * Create resize handle
 */
function createResizeHandle() {
    if (!panelEl || resizeHandle) return;
    
    resizeHandle = document.createElement("div");
    Object.assign(resizeHandle.style, {
        position: "absolute",
        bottom: "0",
        right: "0",
        width: "20px",
        height: "20px",
        cursor: "nwse-resize",
        background: "transparent",
        zIndex: "1000",
        pointerEvents: "auto", // Ensure resize handle can receive clicks
    });
    
    // Visual indicator (optional)
    const indicator = document.createElement("div");
    Object.assign(indicator.style, {
        position: "absolute",
        bottom: "2px",
        right: "2px",
        width: "0",
        height: "0",
        borderStyle: "solid",
        borderWidth: "0 0 12px 12px",
        borderColor: "transparent transparent rgba(148,163,184,0.4) transparent",
        pointerEvents: "none",
    });
    resizeHandle.appendChild(indicator);
    
    resizeHandle.addEventListener("mousedown", startResize);
    panelEl.appendChild(resizeHandle);
}

/**
 * Start dragging
 */
function startDrag(e) {
    if (isPinned) {
        return;
    }
    
    // Don't drag if clicking on buttons or interactive elements
    if (e.target.tagName === "BUTTON" || 
        e.target.closest("button") || 
        e.target.tagName === "INPUT" ||
        e.target.closest("input") ||
        e.target.tagName === "SELECT" ||
        e.target.closest("select")) {
        return;
    }
    
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    
    const rect = panelEl.getBoundingClientRect();
    panelStartX = rect.left;
    panelStartY = rect.top;
    
    document.addEventListener("mousemove", onDrag);
    document.addEventListener("mouseup", stopDrag);
    
    e.preventDefault();
    e.stopPropagation();
}

/**
 * Handle drag
 */
function onDrag(e) {
    if (!isDragging) return;
    
    const deltaX = e.clientX - dragStartX;
    const deltaY = e.clientY - dragStartY;
    
    const newX = panelStartX + deltaX;
    const newY = panelStartY + deltaY;
    
    // Keep panel within viewport bounds
    const maxX = window.innerWidth - panelEl.offsetWidth;
    const maxY = window.innerHeight - panelEl.offsetHeight;
    
    panelEl.style.left = `${Math.max(0, Math.min(newX, maxX))}px`;
    panelEl.style.top = `${Math.max(0, Math.min(newY, maxY))}px`;
}

/**
 * Stop dragging
 */
function stopDrag() {
    isDragging = false;
    document.removeEventListener("mousemove", onDrag);
    document.removeEventListener("mouseup", stopDrag);
    saveWindowState();
}

/**
 * Start resizing
 */
function startResize(e) {
    if (isPinned) return;
    
    isResizing = true;
    resizeStartX = e.clientX;
    resizeStartY = e.clientY;
    
    panelStartWidth = panelEl.offsetWidth;
    panelStartHeight = panelEl.offsetHeight;
    // Size must track the pointer. A width/height transition eases each
    // step and makes the window lag, then snap when the drag stops.
    panelEl.style.maxWidth = "none";
    panelEl.style.maxHeight = "none";
    panelEl.style.transitionProperty = "none";
    
    document.addEventListener("mousemove", onResize);
    document.addEventListener("mouseup", stopResize);
    
    e.preventDefault();
    e.stopPropagation();
}

/**
 * Handle resize
 */
function onResize(e) {
    if (!isResizing) return;
    
    const deltaX = e.clientX - resizeStartX;
    const deltaY = e.clientY - resizeStartY;
    
    const newWidth = panelStartWidth + deltaX;
    const newHeight = panelStartHeight + deltaY;
    
    // Minimum size constraints
    const minWidth = 400;
    const minHeight = 300;
    // Maximum size - allow up to viewport size
    const maxWidth = window.innerWidth;
    const maxHeight = window.innerHeight;
    
    // Get current position
    const currentLeft = parseFloat(panelEl.style.left || 0);
    const currentTop = parseFloat(panelEl.style.top || 0);
    
    // Calculate constrained width/height
    let constrainedWidth = Math.max(minWidth, Math.min(newWidth, maxWidth));
    let constrainedHeight = Math.max(minHeight, Math.min(newHeight, maxHeight));
    
    // If resizing would push panel off screen, adjust position instead
    if (currentLeft + constrainedWidth > window.innerWidth) {
        constrainedWidth = window.innerWidth - currentLeft;
    }
    if (currentTop + constrainedHeight > window.innerHeight) {
        constrainedHeight = window.innerHeight - currentTop;
    }
    
    panelEl.style.width = `${constrainedWidth}px`;
    panelEl.style.height = `${constrainedHeight}px`;
}

/**
 * Stop resizing
 */
function stopResize() {
    isResizing = false;
    document.removeEventListener("mousemove", onResize);
    document.removeEventListener("mouseup", stopResize);
    if (panelEl) panelEl.style.transitionProperty = "";
    saveWindowState();
}

/**
 * Save window state to localStorage
 */
function saveWindowState() {
    if (!panelEl || isPinned || typeof window === "undefined" || !window.localStorage) {
        return;
    }
    
    try {
        const rect = panelEl.getBoundingClientRect();
        const state = {
            x: rect.left,
            y: rect.top,
            width: panelEl.offsetWidth,
            height: panelEl.offsetHeight,
            isPinned: isPinned,
        };
        window.localStorage.setItem(WINDOW_STATE_STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
        console.warn("[USG-Gallery] Failed to save window state:", err);
    }
}

/**
 * Load window state from localStorage
 */
function loadWindowState() {
    if (typeof window === "undefined" || !window.localStorage) {
        return null;
    }
    
    try {
        const saved = window.localStorage.getItem(WINDOW_STATE_STORAGE_KEY);
        if (saved) {
            const state = JSON.parse(saved);
            isPinned = state.isPinned !== false; // Default to pinned if not set
            return state;
        }
    } catch (err) {
        console.warn("[USG-Gallery] Failed to load window state:", err);
    }
    
    return null;
}

/**
 * Get current pin state
 */
export function getPinState() {
    return isPinned;
}

/**
 * Update theme when it changes
 */
export function updateTheme(theme) {
    if (pinButton) {
        pinButton.style.border = `1px solid ${theme.buttonBorder}`;
        pinButton.style.background = theme.buttonBackground;
        pinButton.style.color = theme.buttonText;
    }
}

