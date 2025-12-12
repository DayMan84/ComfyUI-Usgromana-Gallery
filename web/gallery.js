import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

// A simple CSS style for our gallery modal
const style = document.createElement("style");
style.textContent = `
    .usg-gallery-modal {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 80vw;
        height: 80vh;
        background: #222;
        border: 1px solid #444;
        z-index: 10000;
        display: flex;
        flex-direction: column;
        color: #fff;
        box-shadow: 0 0 20px rgba(0,0,0,0.5);
        border-radius: 8px;
    }
    .usg-gallery-header {
        padding: 10px;
        background: #333;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid #444;
    }
    .usg-gallery-content {
        flex: 1;
        overflow-y: auto;
        padding: 10px;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
        gap: 10px;
    }
    .usg-card {
        background: #111;
        border: 1px solid #333;
        border-radius: 4px;
        overflow: hidden;
        position: relative;
        display: flex;
        flex-direction: column;
    }
    .usg-card img {
        width: 100%;
        height: 150px;
        object-fit: cover;
        cursor: pointer;
    }
    .usg-card-actions {
        padding: 5px;
        text-align: right;
        background: #1a1a1a;
    }
    .usg-btn-close {
        background: #d44;
        color: white;
        border: none;
        padding: 5px 10px;
        cursor: pointer;
        border-radius: 4px;
    }
    .usg-btn-delete {
        background: #822;
        color: #ddd;
        border: none;
        padding: 2px 8px;
        cursor: pointer;
        font-size: 12px;
        border-radius: 3px;
    }
    .usg-btn-delete:hover { background: #d22; color: #fff; }
`;
document.head.append(style);

app.registerExtension({
    name: "Usgromana.Gallery",
    setup() {
        // 1. Create the button in the ComfyUI menu
        const menu = document.querySelector(".comfy-menu");
        
        const galleryBtn = document.createElement("button");
        galleryBtn.textContent = "Open Gallery";
        galleryBtn.style.marginTop = "10px";
        galleryBtn.style.background = "linear-gradient(90deg, #232526 0%, #414345 100%)"; // Just for flair
        
        galleryBtn.onclick = () => showGallery();
        
        menu.append(galleryBtn);
    }
});

// --- Main Logic ---

async function showGallery() {
    // create modal
    const modal = document.createElement("div");
    modal.className = "usg-gallery-modal";

    // header
    const header = document.createElement("div");
    header.className = "usg-gallery-header";
    header.innerHTML = `<strong>Usgromana Gallery</strong>`;
    
    const closeBtn = document.createElement("button");
    closeBtn.className = "usg-btn-close";
    closeBtn.textContent = "X";
    closeBtn.onclick = () => modal.remove();
    
    header.append(closeBtn);
    modal.append(header);

    // content container
    const content = document.createElement("div");
    content.className = "usg-gallery-content";
    content.textContent = "Loading...";
    modal.append(content);

    document.body.append(modal);

    // Fetch images from your python server
    try {
        const response = await api.fetchApi("/usgromana/gallery/list");
        const data = await response.json();
        
        content.textContent = ""; // clear loading text

        if (!data.images || data.images.length === 0) {
            content.textContent = "No images found in output folder.";
            return;
        }

        data.images.forEach(imgData => {
            const card = createCard(imgData);
            content.append(card);
        });

    } catch (err) {
        content.textContent = "Error loading images: " + err.message;
        console.error(err);
    }
}

function createCard(imgData) {
    const card = document.createElement("div");
    card.className = "usg-card";

    // Image
    const img = document.createElement("img");
    // Append a timestamp to prevent browser caching if file changed
    img.src = imgData.url + "?t=" + imgData.mtime; 
    
    // Optional: Open full size on click
    img.onclick = () => window.open(img.src, "_blank");

    // Delete Button
    const actions = document.createElement("div");
    actions.className = "usg-card-actions";
    
    const delBtn = document.createElement("button");
    delBtn.className = "usg-btn-delete";
    delBtn.textContent = "Del";
    delBtn.onclick = async () => {
        if(!confirm("Delete this image?")) return;
        
        try {
            await api.fetchApi("/usgromana/gallery/delete", {
                method: "POST",
                body: JSON.stringify({ filename: imgData.filename }),
                headers: { "Content-Type": "application/json" }
            });
            card.remove(); // remove from UI
        } catch(e) {
            alert("Delete failed: " + e);
        }
    };

    actions.append(delBtn);
    card.append(img);
    card.append(actions);

    return card;
}