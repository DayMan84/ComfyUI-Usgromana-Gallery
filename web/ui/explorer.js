// ComfyUI-Usgromana-Gallery/web/ui/explorer.js

import { galleryApi } from "../core/api.js";
import { API_BASE, API_ENDPOINTS } from "../core/constants.js";
import { getImages, setSelectedIndex } from "../core/state.js";
import { showDetailsForIndex, setFolderFilter } from "./details.js";

let rootEl = null;
let currentPath = "";
let breadcrumbEl = null;
let fileListEl = null;

// ---------------------------------------------------------------------
// Public init
// ---------------------------------------------------------------------

export function initExplorer(root) {
    rootEl = root;
    buildExplorerUI();
    loadCurrentPath();
}

// ---------------------------------------------------------------------
// UI Building
// ---------------------------------------------------------------------

function buildExplorerUI() {
    if (!rootEl) return;
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
    });

    const createFolderBtn = document.createElement("button");
    createFolderBtn.textContent = "+ New Folder";
    Object.assign(createFolderBtn.style, {
        borderRadius: "6px",
        border: "1px solid rgba(148,163,184,0.35)",
        padding: "4px 10px",
        fontSize: "11px",
        cursor: "pointer",
        background: "rgba(15,23,42,0.6)",
        color: "#e5e7eb",
    });
    createFolderBtn.onclick = () => createNewFolder();
    toolbar.appendChild(createFolderBtn);

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
    Object.assign(fileListEl.style, {
        display: "flex",
        flexDirection: "column",
        gap: "4px",
        minHeight: "100%",
    });
    
    // Make file list a drop zone
    setupDropZone(fileListEl);
    
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
        fileListEl.innerHTML = `<div style="color: #aaa; padding: 20px; text-align: center;">Failed to load folder: ${err.message}</div>`;
    }
}

function updateBreadcrumb() {
    if (!breadcrumbEl) return;
    breadcrumbEl.innerHTML = "";

    const parts = currentPath ? currentPath.split("/").filter(p => p) : [];
    
    // Root/home button
    const homeBtn = document.createElement("button");
    homeBtn.textContent = "🏠 Root";
    Object.assign(homeBtn.style, {
        borderRadius: "6px",
        border: "1px solid rgba(148,163,184,0.35)",
        padding: "4px 8px",
        fontSize: "11px",
        cursor: "pointer",
        background: "rgba(15,23,42,0.6)",
        color: "#e5e7eb",
    });
    homeBtn.onclick = () => loadCurrentPath("");
    breadcrumbEl.appendChild(homeBtn);

    // Path segments
    let accumulatedPath = "";
    parts.forEach((part, index) => {
        const separator = document.createElement("span");
        separator.textContent = " / ";
        separator.style.color = "rgba(148,163,184,0.6)";
        breadcrumbEl.appendChild(separator);

        accumulatedPath += (accumulatedPath ? "/" : "") + part;
        const pathBtn = document.createElement("button");
        pathBtn.textContent = part;
        Object.assign(pathBtn.style, {
            borderRadius: "6px",
            border: "1px solid rgba(148,163,184,0.35)",
            padding: "4px 8px",
            fontSize: "11px",
            cursor: "pointer",
            background: "rgba(15,23,42,0.6)",
            color: "#e5e7eb",
        });
        pathBtn.onclick = () => loadCurrentPath(accumulatedPath);
        breadcrumbEl.appendChild(pathBtn);
    });
}

function renderFileList(folders, files) {
    if (!fileListEl) return;
    fileListEl.innerHTML = "";

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
            color: "#aaa",
            fontSize: "12px",
            textAlign: "center",
            padding: "40px 20px",
        });
        fileListEl.appendChild(empty);
    }
}

function createFolderItem(folder) {
    const item = document.createElement("div");
    item.dataset.type = "folder";
    item.dataset.path = folder.path || folder.name;
    item.dataset.name = folder.name || folder.path;
    
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

    item.addEventListener("mouseenter", () => {
        item.style.background = "rgba(15,23,42,0.7)";
        item.style.borderColor = "rgba(148,163,184,0.4)";
    });

    item.addEventListener("mouseleave", () => {
        item.style.background = "rgba(15,23,42,0.4)";
        item.style.borderColor = "rgba(148,163,184,0.2)";
    });

    const icon = document.createElement("span");
    icon.textContent = "📁";
    icon.style.fontSize = "16px";

    const name = document.createElement("span");
    name.textContent = folder.name || folder.path;
    name.style.flex = "1";
    name.style.fontSize = "12px";
    name.style.color = "#e5e7eb";

    const count = document.createElement("span");
    if (folder.count !== undefined) {
        count.textContent = `${folder.count} items`;
        count.style.fontSize = "10px";
        count.style.color = "rgba(148,163,184,0.7)";
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

    item.appendChild(icon);
    item.appendChild(name);
    if (folder.count !== undefined) {
        item.appendChild(count);
    }
    item.appendChild(actions);

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
    const item = document.createElement("div");
    item.dataset.type = "file";
    item.dataset.path = file.path || file.filename;
    item.dataset.name = file.name || file.filename;
    item.draggable = true;
    
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

    item.addEventListener("mouseenter", () => {
        item.style.background = "rgba(15,23,42,0.6)";
        item.style.borderColor = "rgba(148,163,184,0.3)";
    });

    item.addEventListener("mouseleave", () => {
        item.style.background = "rgba(15,23,42,0.3)";
        item.style.borderColor = "rgba(148,163,184,0.15)";
    });

    const icon = document.createElement("span");
    icon.textContent = "🖼️";
    icon.style.fontSize = "16px";

    const name = document.createElement("span");
    name.textContent = file.name || file.filename;
    name.style.flex = "1";
    name.style.fontSize = "12px";
    name.style.color = "#e5e7eb";

    const size = document.createElement("span");
    if (file.size !== undefined) {
        const sizeStr = formatFileSize(file.size);
        size.textContent = sizeStr;
        size.style.fontSize = "10px";
        size.style.color = "rgba(148,163,184,0.7)";
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

    item.appendChild(icon);
    item.appendChild(name);
    if (file.size !== undefined) {
        item.appendChild(size);
    }
    item.appendChild(actions);

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
    const btn = document.createElement("button");
    btn.textContent = icon;
    btn.title = title;
    Object.assign(btn.style, {
        borderRadius: "4px",
        border: "none",
        padding: "2px 6px",
        fontSize: "12px",
        cursor: "pointer",
        background: "rgba(15,23,42,0.6)",
        color: "#e5e7eb",
        transition: "background 0.2s",
    });
    btn.onmouseenter = () => {
        btn.style.background = "rgba(15,23,42,0.9)";
    };
    btn.onmouseleave = () => {
        btn.style.background = "rgba(15,23,42,0.6)";
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
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        element.style.background = "rgba(56,189,248,0.1)";
    });
    
    element.addEventListener("dragleave", () => {
        element.style.background = "";
    });
    
    element.addEventListener("drop", async (e) => {
        e.preventDefault();
        element.style.background = "";
        
        try {
            const data = JSON.parse(e.dataTransfer.getData("text/plain"));
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
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
        element.style.background = "rgba(56,189,248,0.2)";
        element.style.borderColor = "rgba(56,189,248,0.6)";
    });
    
    element.addEventListener("dragleave", () => {
        element.style.background = "";
        element.style.borderColor = "";
    });
    
    element.addEventListener("drop", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        element.style.background = "";
        element.style.borderColor = "";
        
        try {
            const data = JSON.parse(e.dataTransfer.getData("text/plain"));
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

