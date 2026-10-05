// ComfyUI-Usgromana-Gallery/web/ui/explorer.js

import { galleryApi } from "../core/api.js";
import { importDroppedImages, isExternalFileDrag } from "../core/dragDrop.js";
import { API_BASE, API_ENDPOINTS } from "../core/constants.js";
import { getImages, setSelectedIndex } from "../core/state.js";
import { showDetailsForIndex, setFolderFilter } from "./details.js";
import { getCurrentTheme, subscribeTheme } from "../core/themeManager.js";

let rootEl = null;
let currentPath = "";
let breadcrumbEl = null;
let fileListEl = null;
let currentViewMode = "details"; // "details" | "smallIcons" | "mediumIcons" | "largeIcons" | "tiles"

// View mode storage key
const VIEW_MODE_STORAGE_KEY = "usgromana.gallery.explorer.viewMode";

// ---------------------------------------------------------------------
// Public init
// ---------------------------------------------------------------------

export function initExplorer(root) {
    rootEl = root;
    // Load saved view mode preference
    if (typeof window !== "undefined" && window.localStorage) {
        const saved = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
        if (saved && ["details", "smallIcons", "mediumIcons", "largeIcons", "tiles"].includes(saved)) {
            currentViewMode = saved;
        }
    }
    buildExplorerUI();
    loadCurrentPath();
    
    // Subscribe to theme changes to update colors dynamically
    subscribeTheme(() => {
        if (rootEl) {
            // Rebuild UI to apply new theme colors
            buildExplorerUI();
            // Reload current path to re-render with new theme
            loadCurrentPath(currentPath);
        }
    });
}

// ---------------------------------------------------------------------
// UI Building
// ---------------------------------------------------------------------

function buildExplorerUI() {
    if (!rootEl) return;
    const theme = getCurrentTheme();
    rootEl.innerHTML = "";

    // Toolbar with actions
    const toolbar = document.createElement("div");
    Object.assign(toolbar.style, {
        display: "flex",
        alignItems: "center",
        gap: "6px",
        padding: "8px 0",
        marginBottom: "8px",
        borderBottom: "1px solid rgba(148,163,184,0.2)",
        flexWrap: "wrap",
    });

    const createFolderBtn = document.createElement("button");
    createFolderBtn.textContent = "+ New Folder";
    Object.assign(createFolderBtn.style, {
        borderRadius: "6px",
        border: `1px solid ${theme.buttonBorder}`,
        padding: "4px 10px",
        fontSize: "11px",
        cursor: "pointer",
        background: theme.buttonBackground,
        color: theme.buttonText,
    });
    createFolderBtn.onclick = () => createNewFolder();
    toolbar.appendChild(createFolderBtn);

    // View mode selector
    const viewModeContainer = document.createElement("div");
    Object.assign(viewModeContainer.style, {
        display: "flex",
        alignItems: "center",
        gap: "4px",
        marginLeft: "auto",
    });

    const viewModeLabel = document.createElement("span");
    viewModeLabel.textContent = "View:";
    viewModeLabel.style.fontSize = "11px";
    viewModeLabel.style.color = theme.textSecondary;
    viewModeLabel.style.marginRight = "4px";
    viewModeContainer.appendChild(viewModeLabel);

    const viewModes = [
        { id: "details", label: "Details", icon: "☰" },
        { id: "smallIcons", label: "Small Icons", icon: "⊞" },
        { id: "mediumIcons", label: "Medium Icons", icon: "⊞" },
        { id: "largeIcons", label: "Large Icons", icon: "⊞" },
        { id: "tiles", label: "Tiles", icon: "⊟" },
    ];

    viewModes.forEach((mode) => {
        const btn = document.createElement("button");
        btn.textContent = `${mode.icon} ${mode.label}`;
        btn.title = mode.label;
        Object.assign(btn.style, {
            borderRadius: "4px",
            border: "1px solid rgba(148,163,184,0.35)",
            padding: "3px 8px",
            fontSize: "10px",
            cursor: "pointer",
            background: currentViewMode === mode.id 
                ? theme.buttonActiveBackground 
                : theme.buttonBackground,
            color: currentViewMode === mode.id 
                ? theme.textPrimary 
                : theme.buttonText,
            transition: "all 0.2s",
        });
        btn.onclick = () => {
            currentViewMode = mode.id;
            // Save preference
            if (typeof window !== "undefined" && window.localStorage) {
                window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode.id);
            }
            // Rebuild UI to update button states
            buildExplorerUI();
            // Reload current path to re-render with new view mode
            loadCurrentPath(currentPath);
        };
        btn.onmouseenter = () => {
            if (currentViewMode !== mode.id) {
                btn.style.background = theme.buttonBackgroundHover;
            }
        };
        btn.onmouseleave = () => {
            if (currentViewMode !== mode.id) {
                btn.style.background = theme.buttonBackground;
            }
        };
        viewModeContainer.appendChild(btn);
    });

    toolbar.appendChild(viewModeContainer);
    rootEl.appendChild(toolbar);

    // Breadcrumb navigation
    breadcrumbEl = document.createElement("div");
    Object.assign(breadcrumbEl.style, {
        display: "flex",
        alignItems: "center",
        gap: "4px",
        padding: "8px 0",
        marginBottom: "8px",
        fontSize: "12px",
        flexWrap: "wrap",
    });
    rootEl.appendChild(breadcrumbEl);

    // File list container (with drop zone support)
    const scrollContainer = document.createElement("div");
    Object.assign(scrollContainer.style, {
        flex: "1",
        overflowY: "auto",
        width: "100%",
        paddingRight: "5px",
        position: "relative",
    });

    fileListEl = document.createElement("div");
    // Style will be set based on view mode in renderFileList
    Object.assign(fileListEl.style, {
        minHeight: "100%",
    });
    
    // Make file list a drop zone
    setupDropZone(fileListEl);
    if (!window.__usgGalleryLibraryListener) {
        window.__usgGalleryLibraryListener = true;
        window.addEventListener("usg-gallery-library-changed", () => {
            if (fileListEl) loadCurrentPath(currentPath);
        });
    }
    
    scrollContainer.appendChild(fileListEl);
    rootEl.appendChild(scrollContainer);
}

// ---------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------

async function loadCurrentPath(path = "") {
    currentPath = path;
    updateBreadcrumb();
    
    try {
        const data = await galleryApi.listFolder(path);
        renderFileList(data.folders || [], data.files || []);
    } catch (err) {
        console.error("[USG-Gallery] Failed to load folder:", err);
        const theme = getCurrentTheme();
        fileListEl.innerHTML = `<div style="color: ${theme.textSecondary}; padding: 20px; text-align: center;">Failed to load folder: ${err.message}</div>`;
    }
}

function updateBreadcrumb() {
    if (!breadcrumbEl) return;
    const theme = getCurrentTheme();
    breadcrumbEl.innerHTML = "";

    const parts = currentPath ? currentPath.split("/").filter(p => p) : [];
    
    // Root/home button
    const homeBtn = document.createElement("button");
    homeBtn.type = "button"; // Prevent form submission if inside a form
    homeBtn.textContent = "🏠 Root";
    Object.assign(homeBtn.style, {
        borderRadius: "6px",
        border: `1px solid ${theme.buttonBorder}`,
        padding: "4px 8px",
        fontSize: "11px",
        cursor: "pointer",
        background: theme.buttonBackground,
        color: theme.buttonText,
        pointerEvents: "auto",
        userSelect: "none",
    });
    homeBtn.addEventListener("click", function(e) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        loadCurrentPath("");
    }, true); // Use capture phase to ensure we get the event first
    breadcrumbEl.appendChild(homeBtn);

    // Path segments
    let accumulatedPath = "";
    parts.forEach((part, index) => {
        const separator = document.createElement("span");
        separator.textContent = " / ";
        separator.style.color = theme.textSecondary;
        breadcrumbEl.appendChild(separator);

        accumulatedPath += (accumulatedPath ? "/" : "") + part;
        const pathBtn = document.createElement("button");
        pathBtn.textContent = part;
        pathBtn.type = "button"; // Prevent form submission if inside a form
        pathBtn.dataset.path = accumulatedPath; // Store path in data attribute
        Object.assign(pathBtn.style, {
            borderRadius: "6px",
            border: `1px solid ${theme.buttonBorder}`,
            padding: "4px 8px",
            fontSize: "11px",
            cursor: "pointer",
            background: theme.buttonBackground,
            color: theme.buttonText,
            pointerEvents: "auto",
            userSelect: "none",
        });
        pathBtn.addEventListener("click", function(e) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            const targetPath = this.dataset.path;
            if (targetPath) {
                loadCurrentPath(targetPath);
            }
        }, true); // Use capture phase to ensure we get the event first
        breadcrumbEl.appendChild(pathBtn);
    });
}

function renderFileList(folders, files) {
    if (!fileListEl) return;
    const theme = getCurrentTheme();
    fileListEl.innerHTML = "";

    // Set container style based on view mode
    if (currentViewMode === "details") {
        Object.assign(fileListEl.style, {
            display: "flex",
            flexDirection: "column",
            gap: "4px",
        });
    } else {
        // Grid layout for icon/tile views - Windows Explorer style
        Object.assign(fileListEl.style, {
            display: "grid",
            gap: currentViewMode === "smallIcons" ? "12px 20px" : 
                 currentViewMode === "mediumIcons" ? "16px 24px" : 
                 currentViewMode === "largeIcons" ? "20px 28px" : 
                 "16px 20px", // tiles
            padding: "12px 16px",
            alignContent: "start",
        });
        
        // Fixed column widths like Windows Explorer
        if (currentViewMode === "smallIcons") {
            fileListEl.style.gridTemplateColumns = "repeat(auto-fill, 74px)";
        } else if (currentViewMode === "mediumIcons") {
            fileListEl.style.gridTemplateColumns = "repeat(auto-fill, 100px)";
        } else if (currentViewMode === "largeIcons") {
            fileListEl.style.gridTemplateColumns = "repeat(auto-fill, 150px)";
        } else if (currentViewMode === "tiles") {
            fileListEl.style.gridTemplateColumns = "repeat(auto-fill, 200px)";
        }
    }

    // Render folders first
    folders.forEach((folder) => {
        const item = createFolderItem(folder);
        fileListEl.appendChild(item);
    });

    // Then render files
    files.forEach((file) => {
        const item = createFileItem(file);
        fileListEl.appendChild(item);
    });

    if (folders.length === 0 && files.length === 0) {
        const empty = document.createElement("div");
        empty.textContent = "This folder is empty.";
        Object.assign(empty.style, {
            color: theme.textSecondary,
            fontSize: "12px",
            textAlign: "center",
            padding: "40px 20px",
            gridColumn: currentViewMode !== "details" ? "1 / -1" : "auto",
        });
        fileListEl.appendChild(empty);
    }
}

function createFolderItem(folder) {
    const theme = getCurrentTheme();
    const item = document.createElement("div");
    item.dataset.type = "folder";
    item.dataset.path = folder.path || folder.name;
    item.dataset.name = folder.name || folder.path;
    
    // Different styles based on view mode
    if (currentViewMode === "details") {
        Object.assign(item.style, {
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "8px 12px",
            borderRadius: "6px",
            background: "rgba(15,23,42,0.4)",
            border: "1px solid rgba(148,163,184,0.2)",
            cursor: "pointer",
            transition: "all 0.15s ease",
            position: "relative",
        });
    } else {
        // Icon/tile views - Windows Explorer style (minimal, clean)
        Object.assign(item.style, {
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "flex-start",
            gap: "4px",
            padding: "4px",
            borderRadius: "2px",
            background: "transparent",
            border: "1px solid transparent",
            cursor: "pointer",
            transition: "background-color 0.1s ease, border-color 0.1s ease",
            position: "relative",
            textAlign: "center",
            width: "100%",
            minHeight: "auto",
        });
    }

    item.addEventListener("mouseenter", () => {
        if (currentViewMode === "details") {
            item.style.background = "rgba(15,23,42,0.7)";
            item.style.borderColor = "rgba(148,163,184,0.4)";
        } else {
            // Windows Explorer style hover - subtle highlight
            item.style.background = "rgba(56,189,248,0.15)";
            item.style.borderColor = "rgba(56,189,248,0.3)";
        }
    });

    item.addEventListener("mouseleave", () => {
        if (currentViewMode === "details") {
            item.style.background = "rgba(15,23,42,0.4)";
            item.style.borderColor = "rgba(148,163,184,0.2)";
        } else {
            item.style.background = "transparent";
            item.style.borderColor = "transparent";
        }
    });

    const icon = document.createElement("span");
    icon.textContent = "📁";
    if (currentViewMode === "details") {
        icon.style.fontSize = "16px";
    } else {
        // Windows Explorer icon sizes
        const iconSize = currentViewMode === "smallIcons" ? "16px" : 
                        currentViewMode === "mediumIcons" ? "32px" : 
                        currentViewMode === "largeIcons" ? "48px" : "32px";
        icon.style.fontSize = iconSize;
        icon.style.display = "flex";
        icon.style.alignItems = "center";
        icon.style.justifyContent = "center";
        icon.style.width = currentViewMode === "smallIcons" ? "16px" : 
                          currentViewMode === "mediumIcons" ? "32px" : 
                          currentViewMode === "largeIcons" ? "48px" : "32px";
        icon.style.height = icon.style.width;
    }

    const name = document.createElement("span");
    name.textContent = folder.name || folder.path;
    if (currentViewMode === "details") {
        name.style.flex = "1";
        name.style.fontSize = "12px";
    } else {
        // Windows Explorer text styling
        name.style.fontSize = "11px";
        name.style.width = "100%";
        name.style.maxWidth = "100%";
        name.style.overflow = "hidden";
        name.style.textOverflow = "ellipsis";
        name.style.whiteSpace = "normal";
        name.style.wordBreak = "break-word";
        name.style.wordWrap = "break-word";
        name.style.lineHeight = "1.3";
        name.style.display = "-webkit-box";
        name.style.webkitLineClamp = currentViewMode === "smallIcons" ? "2" : "3";
        name.style.webkitBoxOrient = "vertical";
        name.style.textAlign = "center";
        name.style.marginTop = "2px";
    }
    name.style.color = theme.textPrimary;

    const count = document.createElement("span");
    if (folder.count !== undefined) {
        count.textContent = `${folder.count} items`;
        if (currentViewMode === "details") {
            count.style.fontSize = "10px";
        } else {
            count.style.fontSize = currentViewMode === "smallIcons" ? "8px" : "9px";
        }
        count.style.color = theme.textSecondary;
    }

    // Action buttons
    const actions = document.createElement("div");
    Object.assign(actions.style, {
        display: "flex",
        gap: "4px",
        opacity: "0",
        transition: "opacity 0.2s",
    });

    const renameBtn = createActionButton("✏️", "Rename", (e) => {
        e.stopPropagation();
        renameFolder(folder.path || folder.name, folder.name || folder.path);
    });
    const deleteBtn = createActionButton("🗑️", "Delete", (e) => {
        e.stopPropagation();
        deleteFolder(folder.path || folder.name, folder.name || folder.path);
    });

    actions.appendChild(renameBtn);
    actions.appendChild(deleteBtn);

    item.addEventListener("mouseenter", () => {
        actions.style.opacity = "1";
    });
    item.addEventListener("mouseleave", () => {
        actions.style.opacity = "0";
    });

    // Reorder elements based on view mode
    if (currentViewMode === "details") {
        item.appendChild(icon);
        item.appendChild(name);
        if (folder.count !== undefined) {
            item.appendChild(count);
        }
        item.appendChild(actions);
    } else {
        item.appendChild(icon);
        item.appendChild(name);
        if (folder.count !== undefined && currentViewMode === "tiles") {
            item.appendChild(count);
        }
        // Actions positioned absolutely for icon views
        if (currentViewMode !== "details") {
            Object.assign(actions.style, {
                position: "absolute",
                top: "4px",
                right: "4px",
            });
        }
        item.appendChild(actions);
    }

    // Double-click to open, single click to select
    let clickTimer = null;
    item.onclick = (e) => {
        if (e.target.closest("button")) return; // Don't navigate if clicking action button
        
        if (clickTimer) {
            clearTimeout(clickTimer);
            clickTimer = null;
            // Double click
            const newPath = folder.path || folder.name;
            loadCurrentPath(newPath);
        } else {
            clickTimer = setTimeout(() => {
                clickTimer = null;
            }, 300);
        }
    };

    // Make folder a drop target
    setupDropTarget(item, folder.path || folder.name);
    
    // Make folder draggable (for moving folders)
    item.draggable = true;
    item.addEventListener("dragstart", (e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", JSON.stringify({
            type: "folder",
            path: folder.path || folder.name,
            name: folder.name || folder.path,
        }));
        item.style.opacity = "0.5";
    });
    
    item.addEventListener("dragend", () => {
        item.style.opacity = "1";
    });

    return item;
}

function createFileItem(file) {
    const theme = getCurrentTheme();
    const item = document.createElement("div");
    item.dataset.type = "file";
    item.dataset.path = file.path || file.filename;
    item.dataset.name = file.name || file.filename;
    item.draggable = true;
    
    // Check if file is an image
    const fileName = file.name || file.filename || "";
    const isImage = /\.(png|jpg|jpeg|webp|gif|bmp)$/i.test(fileName);
    const filePath = file.path || file.filename;
    
    // Different styles based on view mode
    if (currentViewMode === "details") {
        Object.assign(item.style, {
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "8px 12px",
            borderRadius: "6px",
            background: "rgba(15,23,42,0.3)",
            border: "1px solid rgba(148,163,184,0.15)",
            cursor: "pointer",
            transition: "all 0.15s ease",
            position: "relative",
        });
    } else {
        // Icon/tile views - Windows Explorer style (minimal, clean)
        Object.assign(item.style, {
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "flex-start",
            gap: "4px",
            padding: "4px",
            borderRadius: "2px",
            background: "transparent",
            border: "1px solid transparent",
            cursor: "pointer",
            transition: "background-color 0.1s ease, border-color 0.1s ease",
            position: "relative",
            textAlign: "center",
            width: "100%",
        });
    }

    item.addEventListener("mouseenter", () => {
        if (currentViewMode === "details") {
            item.style.background = "rgba(15,23,42,0.6)";
            item.style.borderColor = "rgba(148,163,184,0.3)";
        } else {
            // Windows Explorer style hover - subtle highlight
            item.style.background = "rgba(56,189,248,0.15)";
            item.style.borderColor = "rgba(56,189,248,0.3)";
        }
    });

    item.addEventListener("mouseleave", () => {
        if (currentViewMode === "details") {
            item.style.background = "rgba(15,23,42,0.3)";
            item.style.borderColor = "rgba(148,163,184,0.15)";
        } else {
            item.style.background = "transparent";
            item.style.borderColor = "transparent";
        }
    });

    // Create icon or thumbnail
    let iconElement;
    if (currentViewMode === "details") {
        // Details view: use emoji icon
        iconElement = document.createElement("span");
        iconElement.textContent = "🖼️";
        iconElement.style.fontSize = "16px";
    } else if (isImage && filePath) {
        // Icon/tile views: use thumbnail for images - Windows Explorer style
        // Thumbnail sizes (larger than icons for better preview)
        const thumbSize = currentViewMode === "smallIcons" ? "48px" : 
                         currentViewMode === "mediumIcons" ? "80px" : 
                         currentViewMode === "largeIcons" ? "128px" : "96px";
        
        // Create container for thumbnail with fallback
        const iconContainer = document.createElement("div");
        iconContainer.style.position = "relative";
        iconContainer.style.width = thumbSize;
        iconContainer.style.height = thumbSize;
        iconContainer.style.minWidth = thumbSize;
        iconContainer.style.minHeight = thumbSize;
        iconContainer.style.display = "flex";
        iconContainer.style.alignItems = "center";
        iconContainer.style.justifyContent = "center";
        iconContainer.style.backgroundColor = "transparent";
        iconContainer.style.borderRadius = "2px";
        iconContainer.style.overflow = "hidden";
        
        // Create thumbnail image
        const thumbImg = document.createElement("img");
        const thumbUrl = `${API_ENDPOINTS.IMAGE}?filename=${encodeURIComponent(filePath)}&size=thumb`;
        thumbImg.src = thumbUrl;
        thumbImg.alt = fileName;
        thumbImg.style.objectFit = "cover";
        thumbImg.style.width = "100%";
        thumbImg.style.height = "100%";
        thumbImg.style.display = "block";
        
        // Create fallback emoji (hidden by default)
        const fallback = document.createElement("span");
        fallback.textContent = "🖼️";
        fallback.style.fontSize = thumbSize;
        fallback.style.display = "none";
        fallback.style.position = "absolute";
        fallback.style.width = "100%";
        fallback.style.height = "100%";
        fallback.style.alignItems = "center";
        fallback.style.justifyContent = "center";
        
        // Handle image load errors
        thumbImg.onerror = () => {
            thumbImg.style.display = "none";
            fallback.style.display = "flex";
        };
        
        iconContainer.appendChild(thumbImg);
        iconContainer.appendChild(fallback);
        iconElement = iconContainer;
    } else {
        // Non-image file: use emoji icon - Windows Explorer style
        iconElement = document.createElement("span");
        iconElement.textContent = "📄";
        const iconSize = currentViewMode === "smallIcons" ? "16px" : 
                        currentViewMode === "mediumIcons" ? "32px" : 
                        currentViewMode === "largeIcons" ? "48px" : "32px";
        iconElement.style.fontSize = iconSize;
        iconElement.style.display = "flex";
        iconElement.style.alignItems = "center";
        iconElement.style.justifyContent = "center";
        iconElement.style.width = iconSize;
        iconElement.style.height = iconSize;
    }

    const name = document.createElement("span");
    name.textContent = fileName;
    if (currentViewMode === "details") {
        name.style.flex = "1";
        name.style.fontSize = "12px";
    } else {
        // Windows Explorer text styling
        name.style.fontSize = "11px";
        name.style.width = "100%";
        name.style.maxWidth = "100%";
        name.style.overflow = "hidden";
        name.style.textOverflow = "ellipsis";
        name.style.whiteSpace = "normal";
        name.style.wordBreak = "break-word";
        name.style.wordWrap = "break-word";
        name.style.lineHeight = "1.3";
        name.style.display = "-webkit-box";
        name.style.webkitLineClamp = currentViewMode === "smallIcons" ? "2" : "3";
        name.style.webkitBoxOrient = "vertical";
        name.style.textAlign = "center";
        name.style.marginTop = "2px";
    }
    name.style.color = theme.textPrimary;

    const size = document.createElement("span");
    if (file.size !== undefined) {
        const sizeStr = formatFileSize(file.size);
        size.textContent = sizeStr;
        if (currentViewMode === "details") {
            size.style.fontSize = "10px";
            size.style.color = theme.textSecondary;
        } else {
            size.style.fontSize = "10px";
            size.style.width = "100%";
            size.style.textAlign = "center";
            size.style.marginTop = "2px";
            size.style.color = theme.textSecondary;
        }
    }

    // Action buttons
    const actions = document.createElement("div");
    Object.assign(actions.style, {
        display: "flex",
        gap: "4px",
        opacity: "0",
        transition: "opacity 0.2s",
    });

    const renameBtn = createActionButton("✏️", "Rename", (e) => {
        e.stopPropagation();
        renameFile(file.path || file.filename, file.name || file.filename);
    });
    const deleteBtn = createActionButton("🗑️", "Delete", (e) => {
        e.stopPropagation();
        deleteFile(file.path || file.filename, file.name || file.filename);
    });

    actions.appendChild(renameBtn);
    actions.appendChild(deleteBtn);

    item.addEventListener("mouseenter", () => {
        actions.style.opacity = "1";
    });
    item.addEventListener("mouseleave", () => {
        actions.style.opacity = "0";
    });

    // Reorder elements based on view mode
    if (currentViewMode === "details") {
        item.appendChild(iconElement);
        item.appendChild(name);
        if (file.size !== undefined) {
            item.appendChild(size);
        }
        item.appendChild(actions);
    } else {
        item.appendChild(iconElement);
        item.appendChild(name);
        if (file.size !== undefined && (currentViewMode === "tiles" || currentViewMode === "largeIcons")) {
            item.appendChild(size);
        }
        // Actions positioned absolutely for icon views
        Object.assign(actions.style, {
            position: "absolute",
            top: "4px",
            right: "4px",
        });
        item.appendChild(actions);
    }

    // Drag and drop setup
    item.addEventListener("dragstart", (e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", JSON.stringify({
            type: "file",
            path: file.path || file.filename,
            name: file.name || file.filename,
        }));
        item.style.opacity = "0.5";
    });

    item.addEventListener("dragend", () => {
        item.style.opacity = "1";
    });

    // Double-click to open file in details view
    let clickTimer = null;
    item.onclick = (e) => {
        if (e.target.closest("button")) return;
        
        if (clickTimer) {
            clearTimeout(clickTimer);
            clickTimer = null;
            // Double click - open in details view
            openFileInDetails(file);
        } else {
            clickTimer = setTimeout(() => {
                clickTimer = null;
            }, 300);
        }
    };

    return item;
}

function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------
// Action buttons
// ---------------------------------------------------------------------

function createActionButton(icon, title, onClick) {
    const theme = getCurrentTheme();
    const btn = document.createElement("button");
    btn.textContent = icon;
    btn.title = title;
    const isIconView = currentViewMode !== "details";
    Object.assign(btn.style, {
        borderRadius: "4px",
        border: "none",
        padding: isIconView ? "4px 6px" : "2px 6px",
        fontSize: isIconView ? "14px" : "12px",
        cursor: "pointer",
        background: isIconView ? "rgba(0,0,0,0.7)" : theme.buttonBackground,
        color: theme.buttonText,
        transition: "background 0.2s",
        backdropFilter: isIconView ? "blur(4px)" : "none",
    });
    btn.onmouseenter = () => {
        btn.style.background = isIconView ? "rgba(0,0,0,0.9)" : theme.buttonBackgroundHover;
    };
    btn.onmouseleave = () => {
        btn.style.background = isIconView ? "rgba(0,0,0,0.7)" : theme.buttonBackground;
    };
    btn.onclick = onClick;
    return btn;
}

// ---------------------------------------------------------------------
// Folder operations
// ---------------------------------------------------------------------

async function createNewFolder() {
    const name = prompt("Enter folder name:");
    if (!name || !name.trim()) return;
    
    const sanitizedName = name.trim().replace(/[<>:"|?*\\/]/g, "_");
    if (!sanitizedName) {
        alert("Invalid folder name");
        return;
    }
    
    try {
        await galleryApi.createFolder(currentPath, sanitizedName);
        loadCurrentPath(currentPath); // Reload
    } catch (err) {
        alert(`Failed to create folder: ${err.message}`);
    }
}

async function renameFolder(path, currentName) {
    const newName = prompt("Enter new folder name:", currentName);
    if (!newName || !newName.trim() || newName === currentName) return;
    
    const sanitizedName = newName.trim().replace(/[<>:"|?*\\/]/g, "_");
    if (!sanitizedName) {
        alert("Invalid folder name");
        return;
    }
    
    try {
        await galleryApi.renameFolder(path, sanitizedName);
        loadCurrentPath(currentPath); // Reload
    } catch (err) {
        alert(`Failed to rename folder: ${err.message}`);
    }
}

async function deleteFolder(path, name) {
    if (!confirm(`Delete folder "${name}" and all its contents?`)) return;
    
    try {
        await galleryApi.deleteFolder(path);
        loadCurrentPath(currentPath); // Reload
    } catch (err) {
        alert(`Failed to delete folder: ${err.message}`);
    }
}

// ---------------------------------------------------------------------
// File operations
// ---------------------------------------------------------------------

async function renameFile(path, currentName) {
    const newName = prompt("Enter new file name:", currentName);
    if (!newName || !newName.trim() || newName === currentName) return;
    
    const sanitizedName = newName.trim().replace(/[<>:"|?*\\/]/g, "_");
    if (!sanitizedName) {
        alert("Invalid file name");
        return;
    }
    
    try {
        // Use the existing rename endpoint (expects old_filename and new_filename)
        await galleryApi.renameFile(path, sanitizedName);
        loadCurrentPath(currentPath); // Reload
    } catch (err) {
        alert(`Failed to rename file: ${err.message}`);
    }
}

async function deleteFile(path, name) {
    if (!confirm(`Delete file "${name}"?`)) return;
    
    try {
        await galleryApi.deleteFile(path);
        loadCurrentPath(currentPath); // Reload
    } catch (err) {
        alert(`Failed to delete file: ${err.message}`);
    }
}

// ---------------------------------------------------------------------
// Drag and drop
// ---------------------------------------------------------------------

function setupDropZone(element) {
    element.addEventListener("dragover", (e) => {
        const external = isExternalFileDrag(e);
        e.preventDefault();
        e.dataTransfer.dropEffect = external ? "copy" : "move";
        element.style.background = "rgba(56,189,248,0.1)";
    });
    
    element.addEventListener("dragleave", () => {
        element.style.background = "";
    });
    
    element.addEventListener("drop", async (e) => {
        element.style.background = "";
        if (await importDroppedImages(e, () => currentPath)) return;
        e.preventDefault();
        
        try {
            const raw = e.dataTransfer.getData("text/plain");
            if (!raw) return;
            const data = JSON.parse(raw);
            if (data.type === "file") {
                // Move file to current directory
                await galleryApi.moveFile(data.path, currentPath);
                loadCurrentPath(currentPath); // Reload
            } else if (data.type === "folder") {
                // Move folder to current directory
                await galleryApi.moveFolder(data.path, currentPath);
                loadCurrentPath(currentPath); // Reload
            }
        } catch (err) {
            console.error("[USG-Gallery] Drop error:", err);
            alert(`Failed to move: ${err.message}`);
        }
    });
}

function setupDropTarget(element, targetPath) {
    element.addEventListener("dragover", (e) => {
        const external = isExternalFileDrag(e);
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = external ? "copy" : "move";
        element.style.background = "rgba(56,189,248,0.2)";
        element.style.borderColor = "rgba(56,189,248,0.6)";
    });
    
    element.addEventListener("dragleave", () => {
        element.style.background = "";
        element.style.borderColor = "";
    });
    
    element.addEventListener("drop", async (e) => {
        element.style.background = "";
        element.style.borderColor = "";
        if (await importDroppedImages(e, targetPath)) return;
        e.preventDefault();
        e.stopPropagation();
        
        try {
            const raw = e.dataTransfer.getData("text/plain");
            if (!raw) return;
            const data = JSON.parse(raw);
            if (data.type === "file") {
                // Move file to target folder
                await galleryApi.moveFile(data.path, targetPath);
                loadCurrentPath(currentPath); // Reload
            } else if (data.type === "folder") {
                // Move folder to target folder
                await galleryApi.moveFolder(data.path, targetPath);
                loadCurrentPath(currentPath); // Reload
            }
        } catch (err) {
            console.error("[USG-Gallery] Drop error:", err);
            alert(`Failed to move: ${err.message}`);
        }
    });
}

// ---------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------

function getCurrentFolderFromPath(filePath) {
    // Extract folder from path (everything except the filename)
    if (!filePath) return "";
    const parts = filePath.split("/").filter(p => p);
    if (parts.length <= 1) {
        return ""; // Root folder
    }
    // Return folder path (all parts except the last one which is the filename)
    return parts.slice(0, -1).join("/");
}

// ---------------------------------------------------------------------
// Open file in details view
// ---------------------------------------------------------------------

function openFileInDetails(file) {
    // Find the image in the state by its path
    // Use getImages() since that's what showDetailsForIndex uses
    const images = getImages();
    const filePath = file.path || file.filename;
    const fileName = file.name || file.filename;
    
    // Try to find the image by relpath or filename
    let imageIndex = -1;
    for (let i = 0; i < images.length; i++) {
        const img = images[i];
        // Match by relpath (most reliable) or filename
        if (img.relpath === filePath || img.filename === filePath || 
            img.relpath === fileName || img.filename === fileName) {
            imageIndex = i;
            break;
        }
    }
    
    if (imageIndex >= 0) {
        // Image found in state, open it
        // Set folder filter to limit navigation to current folder
        const currentFolder = getCurrentFolderFromPath(filePath);
        setFolderFilter(currentFolder);
        
        setSelectedIndex(imageIndex);
        showDetailsForIndex(imageIndex);
    } else {
        // Image not in state - might need to reload images or it's not an image file
        // Check if it's actually an image file
        const ext = (fileName || "").toLowerCase();
        const imageExts = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"];
        const isImage = imageExts.some(e => ext.endsWith(e));
        
        if (isImage) {
            // Try reloading images and then opening
            if (typeof window !== "undefined" && window.USG_GALLERY_RELOAD_IMAGES) {
                window.USG_GALLERY_RELOAD_IMAGES().then(() => {
                    // Try again after reload
                    setTimeout(() => {
                        const reloadedImages = getImages();
                        for (let i = 0; i < reloadedImages.length; i++) {
                            const img = reloadedImages[i];
                            if (img.relpath === filePath || img.filename === filePath ||
                                img.relpath === fileName || img.filename === fileName) {
                                // Set folder filter to limit navigation to current folder
                                const currentFolder = getCurrentFolderFromPath(filePath);
                                setFolderFilter(currentFolder);
                                
                                setSelectedIndex(i);
                                showDetailsForIndex(i);
                                return;
                            }
                        }
                        console.warn("[USG-Gallery] Image still not found after reload:", filePath);
                    }, 500);
                }).catch(err => {
                    console.error("[USG-Gallery] Failed to reload images:", err);
                });
            } else {
                console.warn("[USG-Gallery] Cannot reload images, image not in state:", filePath);
            }
        } else {
            console.log("[USG-Gallery] File is not an image file:", fileName);
        }
    }
}

// Expose reload function for overlay.js
if (typeof window !== "undefined") {
    window.USG_GALLERY_EXPLORER_RELOAD = () => {
        if (rootEl) {
            loadCurrentPath(currentPath);
        }
    };
}

