// ComfyUI-Usgromana-Gallery/web/ui/overlay.js

import { initGrid, clearGridThumbnails } from "./grid.js";
import { resetGridHasSetVisibleImagesFlag } from "../core/state.js";
import { initDetails, hideDetails } from "./details.js"; 
import { initExplorer } from "./explorer.js";
import {
    getGallerySettings,
    updateGallerySettings,
    subscribeGallerySettings,
} from "../core/gallerySettings.js";
import { ASSETS } from "../core/constants.js";
import { galleryApi } from "../core/api.js";

let overlayEl = null;
let gridRootEl = null;
let explorerRootEl = null;
let initialized = false;
let settingsModalEl = null;
let currentViewMode = "grid"; // "grid" or "explorer"

// Floating filter panel
let filterPanelEl = null;
let lastInlineDividerStyle = "timeline";
let filterPanelApplyFromSettings = null; // Store reference to apply function

// -------------------------------------------------------------------
// Overlay creation
// -------------------------------------------------------------------

function ensureOverlay() {
    if (initialized && overlayEl) return overlayEl;

    overlayEl = document.createElement("div");
    overlayEl.className = "usg-gallery-overlay";
    Object.assign(overlayEl.style, {
        position: "fixed",
        inset: "0",
        zIndex: "10000",
        background: "rgba(0,0,0,0.20)",
        display: "none",
        justifyContent: "center",
        alignItems: "center",
    });

    const panel = document.createElement("div");
    panel.className = "usg-gallery-panel";
    Object.assign(panel.style, {
        width: "90vw",
        height: "90vh",
        maxWidth: "1200px",
        maxHeight: "800px",
        background: "rgba(3, 7, 18, 0.82)",
        borderRadius: "16px",
        border: "1px solid rgba(148,163,184,0.35)",
        boxShadow: "0 18px 55px rgba(0,0,0,0.65)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        color: "#e5e7eb",
        fontFamily:
            "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    });

    // ---------------------------------------------------------------
    // Header
    // ---------------------------------------------------------------
    const header = document.createElement("div");
    Object.assign(header.style, {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 12px 6px",
        borderBottom: "1px solid rgba(51,65,85,0.7)",
        background: "rgba(15,23,42,0.78)",
        backdropFilter: "blur(6px)",
    });

    const leftHeader = document.createElement("div");
    Object.assign(leftHeader.style, {
        display: "flex",
        alignItems: "center",
        gap: "8px",
    });

    const logoImg = document.createElement("img");
    logoImg.alt = "Usgromana Gallery Pro";
    logoImg.src = ASSETS.DARK_LOGO;
    Object.assign(logoImg.style, {
        height: "18px",
        width: "auto",
        filter: "drop-shadow(0 0 6px rgba(56,189,248,0.55))",
    });

    const titleEl = document.createElement("div");
    titleEl.textContent = "USGROMANA GALLERY PRO";
    Object.assign(titleEl.style, {
        fontSize: "13px",
        fontWeight: "600",
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: "#e5e7eb",
        textShadow: "0 0 4px rgba(15,23,42,0.9)",
    });

    leftHeader.appendChild(logoImg);
    leftHeader.appendChild(titleEl);

    const rightHeader = document.createElement("div");
    Object.assign(rightHeader.style, {
        display: "flex",
        alignItems: "center",
        gap: "6px",
    });

    // Explorer/Viewer toggle button
    const explorerToggleButton = document.createElement("button");
    explorerToggleButton.title = "Toggle between Explorer and Viewer mode";
    let isExplorerMode = false;
    Object.assign(explorerToggleButton.style, {
        borderRadius: "999px",
        border: "1px solid rgba(148,163,184,0.55)",
        padding: "4px 10px",
        fontSize: "11px",
        cursor: "pointer",
        background: "rgba(15,23,42,0.8)",
        color: "#e5e7eb",
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
    });
    explorerToggleButton.textContent = "Explorer";
    explorerToggleButton.onclick = () => {
        isExplorerMode = !isExplorerMode;
        explorerToggleButton.textContent = isExplorerMode ? "Viewer" : "Explorer";
        currentViewMode = isExplorerMode ? "explorer" : "grid";
        toggleViewMode(isExplorerMode);
    };
    rightHeader.appendChild(explorerToggleButton);

    // Settings button
    const settingsButton = document.createElement("button");
    settingsButton.title = "Gallery settings";
    Object.assign(settingsButton.style, {
        borderRadius: "999px",
        border: "1px solid rgba(148,163,184,0.55)",
        padding: "4px 10px",
        fontSize: "11px",
        cursor: "pointer",
        background: "rgba(15,23,42,0.8)",
        color: "#e5e7eb",
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
    });
    settingsButton.innerHTML = `<span>Settings</span><span style="font-size:10px;">▾</span>`;
    settingsButton.onclick = () => openSettingsModal(panel);
    rightHeader.appendChild(settingsButton);

    // Close button
    const closeButton = document.createElement("button");
    closeButton.textContent = "✕";
    Object.assign(closeButton.style, {
        borderRadius: "999px",
        border: "1px solid rgba(148,163,184,0.45)",
        width: "22px",
        height: "22px",
        fontSize: "11px",
        cursor: "pointer",
        background: "rgba(15,23,42,0.85)",
        color: "#e5e7eb",
    });
    
    closeButton.onclick = () => {
        // Hide overlay
        overlayEl.style.display = "none";
        // Close the floating filter panel
        closeFilterPanel();
        // Wipe all grid thumbnails + DOM to free memory
        clearGridThumbnails();
        // Also close the big details overlay if it is open
        hideDetails();
    };

    rightHeader.appendChild(closeButton);

    header.appendChild(leftHeader);
    header.appendChild(rightHeader);

    // ---------------------------------------------------------------
    // Content – grid and explorer views
    // ---------------------------------------------------------------
    const content = document.createElement("div");
    Object.assign(content.style, {
        flex: "1",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative",
    });

    gridRootEl = document.createElement("div");
    Object.assign(gridRootEl.style, {
        padding: "10px",
        display: "flex",
        flexDirection: "column",
        minWidth: "0",
        minHeight: "0",
        width: "100%",
        height: "100%",
    });

    explorerRootEl = document.createElement("div");
    Object.assign(explorerRootEl.style, {
        padding: "10px",
        display: "none",
        flexDirection: "column",
        minWidth: "0",
        minHeight: "0",
        width: "100%",
        height: "100%",
    });

    content.appendChild(gridRootEl);
    content.appendChild(explorerRootEl);

    panel.appendChild(header);
    panel.appendChild(content);
    overlayEl.appendChild(panel);

    document.body.appendChild(overlayEl);
    ensureOverlayStyles();

    // Init grid + explorer + details
    // Reset the gridHasSetVisibleImages flag on first overlay creation
    // This ensures images load properly when gallery is first opened
    if (typeof window !== 'undefined' && !window.__USG_GALLERY_OVERLAY_CREATED__) {
        window.__USG_GALLERY_OVERLAY_CREATED__ = true;
        resetGridHasSetVisibleImagesFlag();
    }
    initGrid(gridRootEl);
    initExplorer(explorerRootEl);
    initDetails(null); // details attaches its own modal

    // Theme/logo + remember last inline divider style
    subscribeGallerySettings((s) => {
        logoImg.src = s.theme === "light" ? ASSETS.LIGHT_LOGO : ASSETS.DARK_LOGO;
        if (s.dividerStyle && s.dividerStyle !== "page") {
            lastInlineDividerStyle = s.dividerStyle;
        }
    });

    initialized = true;
    return overlayEl;
}

// -------------------------------------------------------------------
// Public API (entry.js)
// -------------------------------------------------------------------

export function createOverlay() {
    return ensureOverlay();
}

export function showOverlay() {
    const el = ensureOverlay();
    if (!el) return;
    el.style.display = "flex";
    
    // Reload images when overlay is shown (in case it was closed and reopened)
    // Only reload if grid is initialized and images haven't been loaded recently
    if (typeof window !== 'undefined' && window.__USG_GALLERY_GRID_INIT__) {
        // Small delay to ensure overlay is visible first
        setTimeout(() => {
            if (window.USG_GALLERY_RELOAD_IMAGES) {
                window.USG_GALLERY_RELOAD_IMAGES();
            }
        }, 100);
    }
}

export function openGalleryOverlay() {
    showOverlay();
}

// -------------------------------------------------------------------
// Settings modal  (no group toggle anymore)
// -------------------------------------------------------------------

function openSettingsModal(panel) {
    const current = getGallerySettings();

    if (!settingsModalEl) {
        settingsModalEl = document.createElement("div");
        Object.assign(settingsModalEl.style, {
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            background: "rgba(27, 27, 27, 0.9)",
            borderRadius: "12px",
            border: "1px solid rgba(94, 94, 94, 0.20)",
            boxShadow: "0 18px 40px rgba(0,0,0,0.89)",
            padding: "14px 18px",
            minWidth: "260px",
            maxWidth: "380px",
            color: "#e5e7eb",
            zIndex: "20000",
        });

        const title = document.createElement("div");
        title.textContent = "Gallery Settings";
        Object.assign(title.style, {
            fontSize: "13px",
            fontWeight: "600",
            marginBottom: "4px",
        });
        settingsModalEl.appendChild(title);

        const form = document.createElement("div");
        Object.assign(form.style, {
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            fontSize: "12px",
        });

        const addToggle = (labelText, key) => {
            const row = document.createElement("label");
            Object.assign(row.style, {
                display: "flex",
                alignItems: "center",
                gap: "6px",
            });

            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.checked = Boolean(getGallerySettings()[key]);
            checkbox.onchange = () => {
                updateGallerySettings({ [key]: checkbox.checked });
            };

            const label = document.createElement("span");
            label.textContent = labelText;

            row.appendChild(checkbox);
            row.appendChild(label);
            form.appendChild(row);
        };

        addToggle("Masonry layout", "masonryLayout");
        addToggle("Enable drag & drop", "enableDrag");
        addToggle("Show rating overlay in grid", "showRatingInGrid");
        addToggle("Anchor Gallery pill to top bar", "anchorToManagerBar");
        addToggle("Enable real-time file updates", "enableRealTimeUpdates");
        addToggle("Use polling file observer", "usePollingObserver");
        
        // Initialize checkbox states from current settings
        const toggles = form.querySelectorAll('input[type="checkbox"]');
        toggles.forEach((cb) => {
            const key = Object.keys(current).find(k => {
                const label = cb.parentElement?.querySelector('span')?.textContent;
                return label && (
                    (label.includes("Masonry") && k === "masonryLayout") ||
                    (label.includes("drag") && k === "enableDrag") ||
                    (label.includes("rating") && k === "showRatingInGrid") ||
                    (label.includes("Anchor") && k === "anchorToManagerBar") ||
                    (label.includes("real-time") && k === "enableRealTimeUpdates") ||
                    (label.includes("polling") && k === "usePollingObserver")
                );
            });
            if (key) cb.checked = Boolean(current[key]);
        });

        // Theme
        const themeRow = document.createElement("div");
        Object.assign(themeRow.style, {
            display: "flex",
            alignItems: "center",
            gap: "6px",
        });
        const themeLabel = document.createElement("span");
        themeLabel.textContent = "Theme:";
        const themeSelect = document.createElement("select");
        ["dark", "light"].forEach((opt) => {
            const o = document.createElement("option");
            o.value = opt;
            o.textContent = opt;
            themeSelect.appendChild(o);
        });
        themeSelect.value = current.theme || "dark";
        themeSelect.onchange = () => {
            updateGallerySettings({ theme: themeSelect.value });
        };
        themeRow.appendChild(themeLabel);
        themeRow.appendChild(themeSelect);
        form.appendChild(themeRow);

        // Thumbnail size
        const sizeRow = document.createElement("div");
        Object.assign(sizeRow.style, {
            display: "flex",
            alignItems: "center",
            gap: "6px",
        });
        const sizeLabel = document.createElement("span");
        sizeLabel.textContent = "Thumbnail size:";
        const sizeSelect = document.createElement("select");
        [
            ["sm", "Small"],
            ["md", "Medium"],
            ["lg", "Large"],
        ].forEach(([value, label]) => {
            const o = document.createElement("option");
            o.value = value;
            o.textContent = label;
            sizeSelect.appendChild(o);
        });
        sizeSelect.value = current.thumbSize || "md";
        sizeSelect.onchange = () => {
            updateGallerySettings({ thumbSize: sizeSelect.value });
        };
        sizeRow.appendChild(sizeLabel);
        sizeRow.appendChild(sizeSelect);
        form.appendChild(sizeRow);

        // File extensions
        const extRow = document.createElement("div");
        Object.assign(extRow.style, {
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            marginTop: "4px",
        });
        const extLabel = document.createElement("span");
        extLabel.textContent = "File extensions (comma-separated):";
        const extInput = document.createElement("input");
        extInput.type = "text";
        extInput.value = current.fileExtensions || ".png,.jpg,.jpeg,.webp,.gif,.bmp";
        Object.assign(extInput.style, {
            padding: "4px 8px",
            borderRadius: "6px",
            border: "1px solid rgba(148,163,184,0.35)",
            background: "rgba(15,23,42,0.38)",
            color: "#e5e7eb",
            fontSize: "11px",
            outline: "none",
            width: "100%",
            boxSizing: "border-box",
        });
        extInput.onchange = () => {
            updateGallerySettings({ fileExtensions: extInput.value });
        };
        extRow.appendChild(extLabel);
        extRow.appendChild(extInput);
        form.appendChild(extRow);

        // Root gallery folder
        const rootFolderRow = document.createElement("div");
        Object.assign(rootFolderRow.style, {
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            marginTop: "4px",
        });
        const rootFolderLabel = document.createElement("span");
        rootFolderLabel.textContent = "Root gallery folder (leave empty for default):";
        
        // Container for input and browse button
        const rootFolderInputContainer = document.createElement("div");
        Object.assign(rootFolderInputContainer.style, {
            display: "flex",
            gap: "6px",
            alignItems: "stretch",
        });
        
        const rootFolderInput = document.createElement("input");
        rootFolderInput.type = "text";
        rootFolderInput.value = current.rootGalleryFolder || "";
        rootFolderInput.placeholder = "e.g., C:\\Users\\YourName\\Pictures or leave empty for default";
        Object.assign(rootFolderInput.style, {
            padding: "4px 8px",
            borderRadius: "6px",
            border: "1px solid rgba(148,163,184,0.35)",
            background: "rgba(15,23,42,0.38)",
            color: "#e5e7eb",
            fontSize: "11px",
            outline: "none",
            flex: "1",
            boxSizing: "border-box",
        });
        rootFolderInput.onchange = () => {
            updateGallerySettings({ rootGalleryFolder: rootFolderInput.value.trim() });
        };
        
        // Browse button
        const browseButton = document.createElement("button");
        browseButton.textContent = "Browse";
        browseButton.title = "Browse for folder";
        Object.assign(browseButton.style, {
            padding: "4px 12px",
            borderRadius: "6px",
            border: "1px solid rgba(148,163,184,0.55)",
            background: "rgba(15,23,42,0.85)",
            color: "#e5e7eb",
            fontSize: "11px",
            cursor: "pointer",
            whiteSpace: "nowrap",
            flexShrink: "0",
        });
        browseButton.onclick = async () => {
            try {
                // Use native system folder picker
                if ('showDirectoryPicker' in window) {
                    const directoryHandle = await window.showDirectoryPicker({
                        mode: 'read',
                        startIn: rootFolderInput.value ? 'directory' : 'documents',
                    });
                    
                    // File System Access API doesn't expose full paths for security reasons
                    // We need to prompt the user for the full path
                    const folderName = directoryHandle.name;
                    
                    // Use the current input value as default if it exists and looks like a valid path
                    // Otherwise, try to construct a reasonable default
                    let defaultPath = rootFolderInput.value;
                    
                    // If current value doesn't look like a full path, try to construct one
                    if (!defaultPath || (!defaultPath.includes('\\') && !defaultPath.includes('/'))) {
                        // Try common Windows paths
                        if (navigator.platform.toLowerCase().includes('win')) {
                            // Try to get username from common locations
                            defaultPath = `C:\\Users\\${folderName}`;
                        } else {
                            // Unix/Linux/Mac
                            defaultPath = `/${folderName}`;
                        }
                    }
                    
                    // Prompt user for the full absolute path
                    const fullPath = prompt(
                        `Selected folder: "${folderName}"\n\nPlease enter the full absolute path to this folder:`,
                        defaultPath
                    );
                    
                    if (fullPath && fullPath.trim()) {
                        rootFolderInput.value = fullPath.trim();
                        updateGallerySettings({ rootGalleryFolder: fullPath.trim() });
                    }
                } else {
                    // Fallback: Use custom folder picker if native picker not available
                    openFolderPickerDialog(rootFolderInput);
                }
            } catch (err) {
                // User cancelled or error occurred
                if (err.name === 'AbortError') {
                    // User cancelled, do nothing
                    return;
                }
                
                // Other error - fallback to custom picker
                console.warn("[Gallery] Native folder picker error:", err);
                openFolderPickerDialog(rootFolderInput);
            }
        };
        
        rootFolderInputContainer.appendChild(rootFolderInput);
        rootFolderInputContainer.appendChild(browseButton);
        rootFolderRow.appendChild(rootFolderLabel);
        rootFolderRow.appendChild(rootFolderInputContainer);
        form.appendChild(rootFolderRow);

        settingsModalEl.appendChild(form);

        const footer = document.createElement("div");
        Object.assign(footer.style, {
            marginTop: "10px",
            display: "flex",
            justifyContent: "flex-end",
        });

        const closeBtn = document.createElement("button");
        closeBtn.textContent = "Close";
        Object.assign(closeBtn.style, {
            borderRadius: "999px",
            border: "1px solid rgba(148,163,184,0.55)",
            padding: "3px 10px",
            fontSize: "11px",
            cursor: "pointer",
            background: "rgba(15,23,42,0.85)",
            color: "#e5e7eb",
        });
        closeBtn.onclick = () => {
            settingsModalEl.style.display = "none";
        };
        footer.appendChild(closeBtn);
        settingsModalEl.appendChild(footer);

        panel.appendChild(settingsModalEl);
    }

    settingsModalEl.style.display = "block";
}

// -------------------------------------------------------------------
// View mode toggle (Grid/Explorer)
// -------------------------------------------------------------------

// -------------------------------------------------------------------
// Folder Picker Dialog
// -------------------------------------------------------------------

function openFolderPickerDialog(inputElement) {
    // Create modal overlay
    const pickerModal = document.createElement("div");
    Object.assign(pickerModal.style, {
        position: "fixed",
        inset: "0",
        zIndex: "30000",
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
    });

    // Create dialog
    const dialog = document.createElement("div");
    Object.assign(dialog.style, {
        background: "rgba(27, 27, 27, 0.95)",
        borderRadius: "12px",
        border: "1px solid rgba(94, 94, 94, 0.3)",
        boxShadow: "0 18px 40px rgba(0,0,0,0.89)",
        padding: "16px",
        minWidth: "500px",
        maxWidth: "700px",
        maxHeight: "80vh",
        color: "#e5e7eb",
        display: "flex",
        flexDirection: "column",
    });

    // Title
    const title = document.createElement("div");
    title.textContent = "Select Gallery Folder";
    Object.assign(title.style, {
        fontSize: "14px",
        fontWeight: "600",
        marginBottom: "12px",
    });
    dialog.appendChild(title);

    // Current path display
    const currentPathDisplay = document.createElement("div");
    Object.assign(currentPathDisplay.style, {
        padding: "8px",
        marginBottom: "8px",
        fontSize: "11px",
        background: "rgba(15,23,42,0.4)",
        borderRadius: "6px",
        wordBreak: "break-all",
        color: "#94a3b8",
    });
    dialog.appendChild(currentPathDisplay);

    // Breadcrumb
    const breadcrumb = document.createElement("div");
    Object.assign(breadcrumb.style, {
        display: "flex",
        alignItems: "center",
        gap: "4px",
        padding: "8px",
        marginBottom: "8px",
        fontSize: "11px",
        background: "rgba(15,23,42,0.4)",
        borderRadius: "6px",
        flexWrap: "wrap",
    });
    dialog.appendChild(breadcrumb);

    // Folder list container
    const folderList = document.createElement("div");
    Object.assign(folderList.style, {
        flex: "1",
        overflowY: "auto",
        minHeight: "300px",
        maxHeight: "400px",
        border: "1px solid rgba(148,163,184,0.2)",
        borderRadius: "6px",
        padding: "8px",
        background: "rgba(15,23,42,0.2)",
    });
    dialog.appendChild(folderList);

    // Buttons
    const buttons = document.createElement("div");
    Object.assign(buttons.style, {
        display: "flex",
        justifyContent: "flex-end",
        gap: "8px",
        marginTop: "12px",
    });

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    Object.assign(cancelBtn.style, {
        borderRadius: "6px",
        border: "1px solid rgba(148,163,184,0.55)",
        padding: "6px 16px",
        fontSize: "11px",
        cursor: "pointer",
        background: "rgba(15,23,42,0.85)",
        color: "#e5e7eb",
    });
    cancelBtn.onclick = () => {
        document.body.removeChild(pickerModal);
    };

    const selectBtn = document.createElement("button");
    selectBtn.textContent = "Select Folder";
    Object.assign(selectBtn.style, {
        borderRadius: "6px",
        border: "1px solid rgba(148,163,184,0.55)",
        padding: "6px 16px",
        fontSize: "11px",
        cursor: "pointer",
        background: "rgba(59,130,246,0.8)",
        color: "#e5e7eb",
    });

    buttons.appendChild(cancelBtn);
    buttons.appendChild(selectBtn);
    dialog.appendChild(buttons);

    pickerModal.appendChild(dialog);
    document.body.appendChild(pickerModal);

    // Current selected path
    let currentPath = inputElement.value || "";
    let selectedPath = currentPath;

    // Update breadcrumb and path display
    function updateBreadcrumb() {
        breadcrumb.innerHTML = "";
        currentPathDisplay.textContent = currentPath || "Root (Select a drive)";
        
        if (!currentPath) {
            return; // At root, show drives
        }
        
        const parts = currentPath.split(/[/\\]/).filter(p => p);
        
        const homeBtn = document.createElement("button");
        homeBtn.textContent = "🏠 Root";
        Object.assign(homeBtn.style, {
            borderRadius: "4px",
            border: "1px solid rgba(148,163,184,0.35)",
            padding: "2px 6px",
            fontSize: "10px",
            cursor: "pointer",
            background: "rgba(15,23,42,0.6)",
            color: "#e5e7eb",
        });
        homeBtn.onclick = () => {
            currentPath = "";
            loadFolders("");
        };
        breadcrumb.appendChild(homeBtn);

        let accumulatedPath = "";
        parts.forEach((part, index) => {
            const separator = document.createElement("span");
            separator.textContent = " / ";
            separator.style.color = "rgba(148,163,184,0.6)";
            breadcrumb.appendChild(separator);

            // Build the path up to this point
            if (index === 0 && part.endsWith(":")) {
                // First part is a Windows drive letter (C:, D:, etc.)
                accumulatedPath = part + "\\";
            } else if (accumulatedPath) {
                // Append to existing path
                if (accumulatedPath.endsWith("\\")) {
                    accumulatedPath = accumulatedPath + part;
                } else {
                    accumulatedPath = accumulatedPath + "\\" + part;
                }
            } else {
                // First part (non-drive) - for Unix paths
                accumulatedPath = "/" + part;
            }
            
            // Store the path for this breadcrumb item
            const pathForThisItem = accumulatedPath;
            
            const pathBtn = document.createElement("button");
            pathBtn.textContent = part;
            Object.assign(pathBtn.style, {
                borderRadius: "4px",
                border: "1px solid rgba(148,163,184,0.35)",
                padding: "2px 6px",
                fontSize: "10px",
                cursor: "pointer",
                background: "rgba(15,23,42,0.6)",
                color: "#e5e7eb",
            });
            pathBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                // Navigate to this path
                currentPath = pathForThisItem;
                loadFolders(pathForThisItem);
            };
            breadcrumb.appendChild(pathBtn);
        });
    }

    // Load folders for current path
    async function loadFolders(path) {
        currentPath = path;
        updateBreadcrumb();
        folderList.innerHTML = '<div style="color: #aaa; padding: 20px; text-align: center;">Loading...</div>';
        
        try {
            // Ensure path is properly formatted for Windows
            let apiPath = path;
            if (apiPath && !apiPath.endsWith('\\') && !apiPath.endsWith('/')) {
                // For Windows drives like "C:", ensure it ends with backslash
                if (apiPath.match(/^[A-Z]:$/)) {
                    apiPath = apiPath + '\\';
                }
            }
            
            const data = await galleryApi.browseFolder(apiPath);
            
            if (!data || !data.ok) {
                throw new Error(data?.error || "Failed to load folders");
            }
            
            const folders = data.folders || [];
            
            if (folders.length === 0) {
                folderList.innerHTML = '<div style="color: #aaa; padding: 20px; text-align: center;">No folders found</div>';
                return;
            }

            folderList.innerHTML = "";
            folders.forEach((folder) => {
                const folderItem = document.createElement("div");
                Object.assign(folderItem.style, {
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "8px",
                    borderRadius: "6px",
                    cursor: "pointer",
                    background: "rgba(148,163,184,0.1)",
                    marginBottom: "4px",
                });
                folderItem.onmouseenter = () => {
                    folderItem.style.background = "rgba(148,163,184,0.2)";
                };
                folderItem.onmouseleave = () => {
                    folderItem.style.background = "rgba(148,163,184,0.1)";
                };
                folderItem.onclick = () => {
                    const newPath = folder.path || folder.name;
                    loadFolders(newPath);
                };

                const icon = document.createElement("span");
                icon.textContent = folder.isDrive ? "💾" : "📁";
                icon.style.fontSize = "16px";

                const name = document.createElement("span");
                name.textContent = folder.name || folder.path;
                name.style.flex = "1";

                folderItem.appendChild(icon);
                folderItem.appendChild(name);
                folderList.appendChild(folderItem);
            });
        } catch (err) {
            console.error("[Gallery] Failed to load folders:", err);
            const errorMsg = err.message || "Unknown error";
            folderList.innerHTML = `<div style="color: #f87171; padding: 20px; text-align: center;">
                <div style="margin-bottom: 8px;">Error: ${errorMsg}</div>
                <div style="font-size: 10px; color: #94a3b8;">Path: ${path || '(root)'}</div>
                <div style="font-size: 10px; color: #94a3b8; margin-top: 4px;">Please restart ComfyUI server if this is a 404 error.</div>
            </div>`;
        }
    }

    // Select button handler
    selectBtn.onclick = () => {
        selectedPath = currentPath;
        if (selectedPath) {
            inputElement.value = selectedPath;
            updateGallerySettings({ rootGalleryFolder: selectedPath });
        }
        document.body.removeChild(pickerModal);
    };

    // Close on backdrop click
    pickerModal.onclick = (e) => {
        if (e.target === pickerModal) {
            document.body.removeChild(pickerModal);
        }
    };

    // Load initial folders
    loadFolders(currentPath);
}

function toggleViewMode(isExplorer) {
    if (!gridRootEl || !explorerRootEl) return;
    
    if (isExplorer) {
        gridRootEl.style.display = "none";
        explorerRootEl.style.display = "flex";
        // Reload explorer when switching to it
        if (typeof window !== 'undefined' && window.USG_GALLERY_EXPLORER_RELOAD) {
            window.USG_GALLERY_EXPLORER_RELOAD();
        }
    } else {
        gridRootEl.style.display = "flex";
        explorerRootEl.style.display = "none";
        // Reload grid when switching back
        if (typeof window !== 'undefined' && window.USG_GALLERY_RELOAD_IMAGES) {
            window.USG_GALLERY_RELOAD_IMAGES();
        }
    }
}

// -------------------------------------------------------------------
// Floating Image Group Filter panel
// -------------------------------------------------------------------

function openFilterPanel() {
    const current = getGallerySettings();

    // If panel exists and is visible, toggle it closed
    if (filterPanelEl && filterPanelEl.style.display !== "none") {
        filterPanelEl.style.display = "none";
        return;
    }

    if (!filterPanelEl) {
        filterPanelEl = document.createElement("div");
        Object.assign(        filterPanelEl.style, {
            position: "fixed",
            top: "90px",
            right: "40px",
            width: "280px",
            background: "rgba(15,23,42,0.92)",
            borderRadius: "14px",
            border: "1px solid rgba(148,163,184,0.35)",
            boxShadow: "0 18px 50px rgba(0,0,0,0.85)",
            color: "#e5e7eb",
            zIndex: "20010",
            display: "flex",
            flexDirection: "column",
            backdropFilter: "blur(10px)",
        });

        const header = document.createElement("div");
        Object.assign(header.style, {
            padding: "6px 10px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: "move",
            borderBottom: "1px solid rgba(51,65,85,0.8)",
        });

        const title = document.createElement("span");
        title.textContent = "IMAGE GROUP FILTERS";
        Object.assign(title.style, {
            fontSize: "11px",
            fontWeight: "600",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
        });

        const closeBtn = document.createElement("button");
        closeBtn.textContent = "✕";
        Object.assign(closeBtn.style, {
            borderRadius: "999px",
            border: "1px solid rgba(148,163,184,0.45)",
            width: "20px",
            height: "20px",
            fontSize: "11px",
            cursor: "pointer",
            background: "rgba(15,23,42,0.9)",
            color: "#e5e7eb",
        });
        closeBtn.onclick = () => {
            filterPanelEl.style.display = "none";
        };

        header.appendChild(title);
        header.appendChild(closeBtn);
        filterPanelEl.appendChild(header);

        const body = document.createElement("div");
        Object.assign(body.style, {
            padding: "8px 10px 10px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            fontSize: "11px",
        });

        // Enable dividers toggle
        const enableRow = document.createElement("div");
        Object.assign(enableRow.style, {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "6px",
            marginBottom: "4px",
            paddingBottom: "8px",
            borderBottom: "1px solid rgba(51,65,85,0.5)",
        });
        const enableLabel = document.createElement("span");
        enableLabel.textContent = "Enable filters:";
        const enableCheckbox = document.createElement("input");
        enableCheckbox.type = "checkbox";
        Object.assign(enableCheckbox.style, {
            cursor: "pointer",
            width: "16px",
            height: "16px",
        });
        enableRow.appendChild(enableLabel);
        enableRow.appendChild(enableCheckbox);
        body.appendChild(enableRow);

        // Sort type (dividerMode)
        const sortRow = document.createElement("div");
        Object.assign(sortRow.style, {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "6px",
        });
        const sortLabel = document.createElement("span");
        sortLabel.textContent = "Sort type:";
        const sortSelect = document.createElement("select");
        const sortOptions = [
            ["none", "None"],
            ["alpha", "Alphabetical"],
            ["folder", "Folder"],
            ["day", "Day"],
            ["month", "Month"],
            ["year", "Year"],
        ];
        sortOptions.forEach(([value, label]) => {
            const o = document.createElement("option");
            o.value = value;
            o.textContent = label;
            sortSelect.appendChild(o);
        });
        sortRow.appendChild(sortLabel);
        sortRow.appendChild(sortSelect);
        body.appendChild(sortRow);

        // Arrange (arrangeBy)
        const arrangeRow = document.createElement("div");
        Object.assign(arrangeRow.style, {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "6px",
        });
        const arrangeLabel = document.createElement("span");
        arrangeLabel.textContent = "Arrange:";
        const arrangeSelect = document.createElement("select");
        const arrangeOptions = [
            ["none", "None"],
            ["name", "Name"],
            ["time", "Time"],
            ["size", "File size"],
            ["pixels", "Pixel count"],
        ];
        arrangeOptions.forEach(([value, label]) => {
            const o = document.createElement("option");
            o.value = value;
            o.textContent = label;
            arrangeSelect.appendChild(o);
        });
        arrangeRow.appendChild(arrangeLabel);
        arrangeRow.appendChild(arrangeSelect);
        body.appendChild(arrangeRow);

        // Direction
        const dirRow = document.createElement("div");
        Object.assign(dirRow.style, {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "6px",
        });
        const dirLabel = document.createElement("span");
        dirLabel.textContent = "Direction:";
        const dirSelect = document.createElement("select");
        [
            ["asc", "Ascending"],
            ["desc", "Descending"],
        ].forEach(([value, label]) => {
            const o = document.createElement("option");
            o.value = value;
            o.textContent = label;
            dirSelect.appendChild(o);
        });
        dirRow.appendChild(dirLabel);
        dirRow.appendChild(dirSelect);
        body.appendChild(dirRow);

        // Layout: Split pages vs Inline
        const modeRow = document.createElement("div");
        Object.assign(modeRow.style, {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "6px",
            marginTop: "4px",
        });
        const modeLabel = document.createElement("span");
        modeLabel.textContent = "Layout:";
        const modeButtons = document.createElement("div");
        Object.assign(modeButtons.style, {
            display: "inline-flex",
            gap: "4px",
        });

        const splitBtn = document.createElement("button");
        splitBtn.textContent = "Split pages";
        const inlineBtn = document.createElement("button");
        inlineBtn.textContent = "Inline";

        [splitBtn, inlineBtn].forEach((btn) => {
            Object.assign(btn.style, {
                borderRadius: "999px",
                border: "1px solid rgba(148,163,184,0.55)",
                padding: "2px 8px",
                fontSize: "11px",
                cursor: "pointer",
                background: "rgba(15,23,42,0.8)",
                color: "#e5e7eb",
            });
        });

        modeButtons.appendChild(splitBtn);
        modeButtons.appendChild(inlineBtn);
        modeRow.appendChild(modeLabel);
        modeRow.appendChild(modeButtons);
        body.appendChild(modeRow);

        // Inline divider style
        const styleRow = document.createElement("div");
        Object.assign(styleRow.style, {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "6px",
        });
        const styleLabel = document.createElement("span");
        styleLabel.textContent = "Divider style:";
        const styleSelect = document.createElement("select");
        const styleOptions = [
            ["timeline", "Timeline"],
            ["pill", "Pill"],
            ["label", "Label"],
            ["none", "None"],
        ];
        styleOptions.forEach(([value, label]) => {
            const o = document.createElement("option");
            o.value = value;
            o.textContent = label;
            styleSelect.appendChild(o);
        });
        styleRow.appendChild(styleLabel);
        styleRow.appendChild(styleSelect);
        body.appendChild(styleRow);

        filterPanelEl.appendChild(body);
        document.body.appendChild(filterPanelEl);

        // --- Enable/disable filter controls based on checkbox ---
        const updateControlsState = (enabled) => {
            const disabledStyle = {
                opacity: "0.4",
                cursor: "not-allowed",
            };
            const enabledStyle = {
                opacity: "1",
                cursor: "pointer",
            };

            // Disable/enable selects
            [sortSelect, arrangeSelect, dirSelect, styleSelect].forEach((select) => {
                select.disabled = !enabled;
                Object.assign(select.style, enabled ? enabledStyle : disabledStyle);
            });

            // Disable/enable buttons
            [splitBtn, inlineBtn].forEach((btn) => {
                btn.disabled = !enabled;
                Object.assign(btn.style, enabled ? enabledStyle : disabledStyle);
            });

            // Update label opacity
            [sortLabel, arrangeLabel, dirLabel, modeLabel, styleLabel].forEach((label) => {
                label.style.opacity = enabled ? "1" : "0.4";
            });
        };

        // --- Wiring updates ------------------------------------------
        const applyFromSettings = () => {
            const s = getGallerySettings();

            const enabled = !!s.showDividers;
            enableCheckbox.checked = enabled;
            
            // Update control states
            updateControlsState(enabled);

            sortSelect.value = s.dividerMode || "none";
            arrangeSelect.value = s.arrangeBy || "none";
            dirSelect.value = s.sortAscending === false ? "desc" : "asc";

            const layout = s.dividerLayout || "inline"; // "page" | "inline"

            if (layout === "page") {
                splitBtn.style.background = "rgba(55,65,194,0.9)";
                inlineBtn.style.background = "rgba(15,23,42,0.8)";
            } else {
                splitBtn.style.background = "rgba(15,23,42,0.8)";
                inlineBtn.style.background = "rgba(55,65,194,0.9)";
            }

            styleSelect.value = s.dividerStyle || "timeline";
        };

        enableCheckbox.onchange = () => {
            const enabled = enableCheckbox.checked;
            updateControlsState(enabled);
            updateGallerySettings({ showDividers: enabled });
        };

        sortSelect.onchange = () => {
            if (!sortSelect.disabled) {
                updateGallerySettings({ dividerMode: sortSelect.value });
            }
        };

        arrangeSelect.onchange = () => {
            if (!arrangeSelect.disabled) {
                updateGallerySettings({ arrangeBy: arrangeSelect.value });
            }
        };

        dirSelect.onchange = () => {
            if (!dirSelect.disabled) {
                updateGallerySettings({
                    sortAscending: dirSelect.value === "asc",
                });
            }
        };

        splitBtn.onclick = () => {
            if (!splitBtn.disabled) {
                updateGallerySettings({ dividerLayout: "page" });
            }
        };

        inlineBtn.onclick = () => {
            if (!inlineBtn.disabled) {
                updateGallerySettings({ dividerLayout: "inline" });
            }
        };

        styleSelect.onchange = () => {
            if (!styleSelect.disabled) {
                updateGallerySettings({ dividerStyle: styleSelect.value || "timeline" });
            }
        };

        // Dragging
        makePanelDraggable(filterPanelEl, header);

        // Keep panel synced when settings change elsewhere
        subscribeGallerySettings(() => applyFromSettings());
        applyFromSettings();
        
        // Store reference for later use
        filterPanelApplyFromSettings = applyFromSettings;
    } else {
        filterPanelEl.style.display = "flex";
        // Ensure controls are in correct state when panel is shown again
        if (filterPanelApplyFromSettings) {
            filterPanelApplyFromSettings();
        }
    }
}

function closeFilterPanel() {
    if (filterPanelEl) {
        filterPanelEl.style.display = "none";
    }
}

function makePanelDraggable(panel, handle) {
    let dragState = null;

    handle.addEventListener("mousedown", (ev) => {
        const rect = panel.getBoundingClientRect();
        dragState = {
            offsetX: ev.clientX - rect.left,
            offsetY: ev.clientY - rect.top,
        };
        panel.style.left = rect.left + "px";
        panel.style.top = rect.top + "px";
        panel.style.right = "auto";

        const onMove = (e) => {
            if (!dragState) return;
            panel.style.left = e.clientX - dragState.offsetX + "px";
            panel.style.top = e.clientY - dragState.offsetY + "px";
        };
        const onUp = () => {
            dragState = null;
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
        };

        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
        ev.preventDefault();
    });
}

// -------------------------------------------------------------------

function ensureOverlayStyles() {
    if (document.getElementById("usg-gallery-overlay-style")) return;

    const style = document.createElement("style");
    style.id = "usg-gallery-overlay-style";
    style.textContent = `
        .usg-gallery-overlay {
            animation: usg-fade-in 0.2s ease-out forwards;
            z-index: 10000;
        }
        @keyframes usg-fade-in {
            0% { opacity: 0; }
            100% { opacity: 1; }
        }
        /* Prevents flicker during animation */
        .usg-gallery-panel {
            will-change: transform, opacity;
        }
    `;
    document.head.appendChild(style);
}

// Expose filter panel open/close so grid.js can call them without imports.
if (typeof window !== "undefined") {
    window.USG_GALLERY_OPEN_FILTERS = () => openFilterPanel();
    window.USG_GALLERY_CLOSE_FILTERS = () => closeFilterPanel();
    window.USG_GALLERY_TOGGLE_FILTERS = () => openFilterPanel(); // Toggle function
}