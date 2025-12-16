// ComfyUI-Usgromana-Gallery/web/core/dragDrop.js
// Handles dragging images from gallery into ComfyUI workspace nodes

import { getGallerySettings, subscribeGallerySettings } from "./gallerySettings.js";
import { API_ENDPOINTS } from "./constants.js";

let initialized = false;
let dragEnabled = true;
let dropZones = new Set();

// ---------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------

export function initDragDrop() {
    if (initialized) return;
    initialized = true;

    // Load initial setting
    const settings = getGallerySettings();
    dragEnabled = settings.enableDrag !== false;

    // Subscribe to settings changes
    subscribeGallerySettings((settings) => {
        dragEnabled = settings.enableDrag !== false;
        updateDragDropState();
    });

    // Set up global drop handlers for ComfyUI workspace
    setupWorkspaceDropHandlers();

    // Watch for new nodes being added to the workspace
    observeNodeCreation();
}

// ---------------------------------------------------------------------
// Workspace drop handlers
// ---------------------------------------------------------------------

function setupWorkspaceDropHandlers() {
    // Set up drop handlers on the workspace/graph area
    // ComfyUI typically uses a canvas or graph container
    const workspaceSelectors = [
        "#graph",
        ".litegraph",
        ".litegraph > canvas",
        "[id*='graph']",
        ".comfy-graph",
    ];

    workspaceSelectors.forEach((selector) => {
        const element = document.querySelector(selector);
        if (element) {
            setupDropZone(element);
        }
    });

    // Also set up on document body as fallback
    setupDropZone(document.body);
}

function setupDropZone(element) {
    if (dropZones.has(element)) return;
    dropZones.add(element);

    element.addEventListener("dragover", (e) => {
        if (!dragEnabled) return;
        
        // Check if this is a gallery image drag
        const types = Array.from(e.dataTransfer.types || []);
        if (types.includes("application/json+usgromana-image") || 
            types.includes("application/json")) {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = "copy";
        }
    });

    element.addEventListener("drop", async (e) => {
        if (!dragEnabled) return;

        try {
            // Try to get gallery image data
            let imageData = null;
            
            // Try different data transfer formats
            const jsonData = e.dataTransfer.getData("application/json+usgromana-image") ||
                            e.dataTransfer.getData("application/json") ||
                            e.dataTransfer.getData("text/plain");
            
            if (jsonData) {
                try {
                    const parsed = JSON.parse(jsonData);
                    if (parsed.type === "usgromana-image") {
                        imageData = parsed;
                    }
                } catch (err) {
                    // Not JSON, ignore
                }
            }

            if (!imageData) return; // Not a gallery image

            e.preventDefault();
            e.stopPropagation();

            // Find the closest image input node
            const imageNode = findImageInputNode(e.target);
            
            if (imageNode) {
                // Load image into the node
                await loadImageIntoNode(imageNode, imageData);
            } else {
                // No image node found - could create one or show a message
                console.log("[USG-Gallery] Dropped image but no image input node found");
            }
        } catch (err) {
            console.error("[USG-Gallery] Drop error:", err);
        }
    });
}

// ---------------------------------------------------------------------
// Node finding and image loading
// ---------------------------------------------------------------------

function findImageInputNode(element) {
    // Walk up the DOM tree to find a ComfyUI node
    let current = element;
    let maxDepth = 15;
    let depth = 0;

    while (current && depth < maxDepth) {
        // Check if this is a ComfyUI node
        const isNode = current.classList && (
            current.classList.contains("litegraph-node") ||
            current.classList.contains("comfy-node") ||
            current.classList.contains("node") ||
            current.getAttribute?.("data-node-id")
        );

        if (isNode) {
            // Found a node - look for image input widgets
            const node = current;
            
            // Method 1: Look for file input widgets
            const fileInputs = node.querySelectorAll('input[type="file"]');
            if (fileInputs.length > 0) {
                return { node, widget: fileInputs[0] };
            }

            // Method 2: Look for text inputs that might be image inputs
            // ComfyUI often uses text inputs with specific attributes
            const textInputs = node.querySelectorAll('input[type="text"]');
            for (const input of textInputs) {
                const widgetName = input.getAttribute("widget-name") || 
                                 input.getAttribute("name") || 
                                 input.className || "";
                const lowerName = widgetName.toLowerCase();
                
                // Check if it's an image-related widget
                if (lowerName.includes("image") || 
                    lowerName.includes("img") ||
                    lowerName.includes("file") ||
                    input.placeholder?.toLowerCase().includes("image") ||
                    input.placeholder?.toLowerCase().includes("file")) {
                    return { node, widget: input };
                }
            }

            // Method 3: Look for any input that might accept images
            // Sometimes ComfyUI uses generic inputs
            if (textInputs.length > 0) {
                // Return the first text input as a fallback
                return { node, widget: textInputs[0] };
            }

            // Method 4: Look for ComfyUI widget elements
            const widgetElements = node.querySelectorAll(".widget, [class*='widget'], [class*='input']");
            for (const widgetEl of widgetElements) {
                const input = widgetEl.querySelector("input");
                if (input) {
                    return { node, widget: input };
                }
            }
        }

        // Also check if current contains a node
        if (current.querySelector) {
            const nestedNode = current.querySelector(".litegraph-node, .comfy-node, .node, [data-node-id]");
            if (nestedNode) {
                const result = findImageInputNode(nestedNode);
                if (result) return result;
            }
        }

        current = current.parentElement;
        depth++;
    }

    return null;
}

async function loadImageIntoNode(nodeInfo, imageData) {
    const { node, widget } = nodeInfo;
    
    if (!widget) return;

    try {
        // Get the image URL - use the full image endpoint
        const imageUrl = imageData.url || 
                        `${API_ENDPOINTS.IMAGE}?filename=${encodeURIComponent(imageData.filename || imageData.relpath || "")}`;
        
        // Fetch the image as a blob
        const response = await fetch(imageUrl, { credentials: "same-origin" });
        if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status}`);
        }
        
        const blob = await response.blob();
        const filename = imageData.filename || imageData.relpath || "image.png";
        const file = new File([blob], filename, { type: blob.type || "image/png" });

        // Method 1: Try ComfyUI's standard file input handling
        if (widget.type === "file") {
            // Create a FileList
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            widget.files = dataTransfer.files;
            
            // Trigger change event
            const changeEvent = new Event("change", { bubbles: true, cancelable: true });
            widget.dispatchEvent(changeEvent);
        }

        // Method 2: For text inputs (ComfyUI often uses text inputs for image paths)
        if (widget.type === "text" || widget.tagName === "INPUT") {
            // Set the filename/path
            const imagePath = imageData.filename || imageData.relpath || imageUrl;
            widget.value = imagePath;
            
            // Trigger multiple events to ensure ComfyUI picks it up
            ["input", "change", "blur"].forEach(eventType => {
                const event = new Event(eventType, { bubbles: true, cancelable: true });
                widget.dispatchEvent(event);
            });
        }

        // Method 3: Try to find and use ComfyUI's widget methods
        // ComfyUI widgets often have a value property and onChange callback
        if (widget.value !== undefined) {
            const imagePath = imageData.filename || imageData.relpath || imageUrl;
            widget.value = imagePath;
            
            // Try to call onChange if it exists
            if (widget.onchange && typeof widget.onchange === "function") {
                try {
                    widget.onchange(imagePath);
                } catch (e) {
                    // Some handlers might expect an event
                    widget.onchange(new Event("change"));
                }
            }
            
            // Also try the widget's callback property (ComfyUI pattern)
            if (widget.callback && typeof widget.callback === "function") {
                try {
                    widget.callback(imagePath);
                } catch (e) {
                    widget.callback(widget.value);
                }
            }
        }

        // Method 4: Try ComfyUI app-level handlers
        if (window.app) {
            // Try handleFile method
            if (typeof window.app.handleFile === "function") {
                try {
                    window.app.handleFile(file, widget);
                } catch (e) {
                    console.log("[USG-Gallery] app.handleFile not available or failed");
                }
            }
            
            // Try handleImage method
            if (typeof window.app.handleImage === "function") {
                try {
                    window.app.handleImage(file, widget);
                } catch (e) {
                    console.log("[USG-Gallery] app.handleImage not available or failed");
                }
            }
        }

        // Method 5: Try LiteGraph node methods
        const nodeElement = node;
        if (nodeElement) {
            // Look for the widget in the node's widgets array (LiteGraph pattern)
            if (nodeElement.widgets && Array.isArray(nodeElement.widgets)) {
                const widgetObj = nodeElement.widgets.find(w => 
                    w.inputEl === widget || w.computeValue === widget
                );
                if (widgetObj) {
                    const imagePath = imageData.filename || imageData.relpath || imageUrl;
                    if (widgetObj.value !== undefined) {
                        widgetObj.value = imagePath;
                    }
                    if (widgetObj.callback && typeof widgetObj.callback === "function") {
                        try {
                            widgetObj.callback(imagePath);
                        } catch (e) {
                            widgetObj.callback(widgetObj.value);
                        }
                    }
                }
            }
            
            // Try node-level file handlers
            if (nodeElement.onFileSelected && typeof nodeElement.onFileSelected === "function") {
                try {
                    nodeElement.onFileSelected(file);
                } catch (e) {
                    console.log("[USG-Gallery] node.onFileSelected failed");
                }
            }
            
            // Trigger custom events
            const customEvent = new CustomEvent("comfy-image-loaded", {
                detail: { file, filename: imageData.filename, url: imageUrl, widget },
                bubbles: true,
                cancelable: true,
            });
            nodeElement.dispatchEvent(customEvent);
        }

        // Method 6: Try setting the image directly via data URL (fallback)
        // This creates a data URL from the blob and sets it
        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUrl = e.target.result;
            // Some ComfyUI nodes might accept data URLs
            if (widget.value !== undefined && widget.value === "") {
                widget.value = dataUrl;
                const event = new Event("change", { bubbles: true });
                widget.dispatchEvent(event);
            }
        };
        reader.readAsDataURL(file);

        console.log("[USG-Gallery] Image loaded into node:", filename);
    } catch (err) {
        console.error("[USG-Gallery] Failed to load image into node:", err);
        alert(`Failed to load image: ${err.message}`);
    }
}

// ---------------------------------------------------------------------
// Node observation
// ---------------------------------------------------------------------

function observeNodeCreation() {
    // Watch for new nodes being added to the workspace
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === 1) { // Element node
                    // Check if it's a new node or contains nodes
                    if (node.classList && (
                        node.classList.contains("litegraph-node") ||
                        node.classList.contains("comfy-node")
                    )) {
                        setupNodeDropZone(node);
                    } else {
                        // Check for nodes within
                        const nodes = node.querySelectorAll?.(".litegraph-node, .comfy-node");
                        if (nodes) {
                            nodes.forEach(setupNodeDropZone);
                        }
                    }
                }
            });
        });
    });

    // Observe the graph container
    const graphContainer = document.querySelector("#graph, .litegraph, .comfy-graph") || document.body;
    observer.observe(graphContainer, {
        childList: true,
        subtree: true,
    });
}

function setupNodeDropZone(node) {
    if (dropZones.has(node)) return;
    dropZones.add(node);

    // Set up drop handler specifically for this node
    node.addEventListener("dragover", (e) => {
        if (!dragEnabled) return;
        
        const types = Array.from(e.dataTransfer.types || []);
        if (types.includes("application/json+usgromana-image") || 
            types.includes("application/json")) {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = "copy";
            // Highlight the node
            node.style.outline = "2px solid rgba(56,189,248,0.6)";
        }
    });

    node.addEventListener("dragleave", () => {
        node.style.outline = "";
    });

    node.addEventListener("drop", async (e) => {
        node.style.outline = "";
        
        if (!dragEnabled) return;

        try {
            const jsonData = e.dataTransfer.getData("application/json+usgromana-image") ||
                            e.dataTransfer.getData("application/json") ||
                            e.dataTransfer.getData("text/plain");
            
            if (!jsonData) return;

            const parsed = JSON.parse(jsonData);
            if (parsed.type !== "usgromana-image") return;

            e.preventDefault();
            e.stopPropagation();

            const nodeInfo = findImageInputNode(node);
            if (nodeInfo) {
                await loadImageIntoNode(nodeInfo, parsed);
            }
        } catch (err) {
            console.error("[USG-Gallery] Node drop error:", err);
        }
    });
}

// ---------------------------------------------------------------------
// State management
// ---------------------------------------------------------------------

function updateDragDropState() {
    // Enable/disable drop zones based on setting
    // The actual draggable attribute is set in grid.js based on enableDrag
    // Drop zones are always active, but they check dragEnabled before processing
    console.log(`[USG-Gallery] Drag and drop ${dragEnabled ? 'enabled' : 'disabled'}`);
}

// Export for manual initialization if needed
export function enableDragDrop() {
    dragEnabled = true;
}

export function disableDragDrop() {
    dragEnabled = false;
}

