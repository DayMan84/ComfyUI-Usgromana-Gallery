/**
 * Preview comments drawer and adaptive control colors.
 * Comments slide in from the left. Information stays on the right.
 */

import { getImages } from "../core/state.js";
import { ensureImage, getSocialSummary } from "../core/socialApi.js";
import { CommentsPanel } from "./commentsPanel.js";

let host = null;
let commentsOpen = false;
let drawer = null;
let commentsButton = null;
let panel = null;
let sampleQueued = false;
let pendingFocus = null;

export function registerPreviewHost(next) {
    host = next;
    window.addEventListener("resize", scheduleAdaptive);
}

export function attachPreviewControls() {
    if (!host) return;
    const { topControls } = host.getElements();
    if (!topControls || commentsButton) return;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "💬";
    button.title = "Comments";
    button.setAttribute("aria-label", "Comments");
    const sample = topControls.querySelector("button");
    if (sample) button.style.cssText = sample.style.cssText;
    button.onclick = (event) => {
        event.stopPropagation();
        setCommentsOpen(!commentsOpen);
    };
    topControls.appendChild(button);
    commentsButton = button;
}

export function onPreviewImage() {
    attachPreviewControls();
    if (commentsOpen) showComments(pendingFocus);
    scheduleAdaptive();
}

export function onPreviewHide() {
    commentsOpen = false;
    pendingFocus = null;
    if (drawer) drawer.style.display = "none";
}

export function onPreviewLayout() {
    scheduleAdaptive();
}

export function setCommentsOpen(open, focusCommentId = null) {
    commentsOpen = !!open;
    pendingFocus = focusCommentId;
    if (commentsOpen) showComments(focusCommentId);
    else if (drawer) drawer.style.display = "none";
    scheduleAdaptive();
}

function ensureDrawer() {
    if (drawer) return drawer;
    const { modalEl } = host.getElements();
    drawer = document.createElement("aside");
    drawer.className = "usg-scrollable";
    drawer.setAttribute("aria-label", "Comments");
    Object.assign(drawer.style, {
        position: "fixed",
        top: "50%",
        left: "0",
        transform: "translateY(-50%)",
        height: "90vh",
        maxHeight: "85vh",
        width: "320px",
        padding: "12px",
        display: "none",
        flexDirection: "column",
        background: "var(--usg-panel, rgba(15,15,15,0.92))",
        borderRight: "1px solid var(--usg-border, rgba(255,255,255,0.12))",
        zIndex: "20001",
        overflow: "auto",
        boxSizing: "border-box",
    });
    (modalEl || document.body).appendChild(drawer);
    return drawer;
}

async function showComments(focusCommentId) {
    if (!host) return;
    const info = host.getImageInfo();
    if (!info) return;
    const pane = ensureDrawer();
    pane.style.display = "flex";
    const relpath = info.relpath || info.path || info.filename;
    let imageId = info.image_id;
    if (!imageId) {
        const ensured = await ensureImage(relpath);
        imageId = ensured.image_id;
        info.image_id = imageId;
    }
    panel = new CommentsPanel({
        imageId,
        mode: "preview",
        focusCommentId,
        onRatingChanged: () => {
            if (typeof window.USG_GALLERY_RELOAD_IMAGES === "function") {
                window.USG_GALLERY_RELOAD_IMAGES();
            }
        },
    });
    pane.replaceChildren(panel.element);
    await panel.load();
}

export async function showDetailsByImageId(imageId, options = {}) {
    if (!host) return false;
    let summary;
    try {
        summary = await getSocialSummary(imageId);
    } catch (err) {
        if (err.code === "NOT_AUTHORIZED" || err.code === "IMAGE_NOT_FOUND" || err.status === 404 || err.status === 403) {
            return false;
        }
        throw err;
    }
    const images = host.getImages ? host.getImages() : getImages();
    const relpath = summary.relpath;
    let index = images.findIndex((img) => img.image_id === imageId);
    if (index < 0) {
        index = images.findIndex((img) => img.relpath === relpath || img.filename === summary.filename);
    }
    if (index < 0) {
        index = images.findIndex((img) => String(img.relpath || "").endsWith(`/${relpath}`));
    }
    if (index < 0) return false;
    const image = images[index];
    image.image_id = imageId;
    await host.showIndex(index);
    if (options.commentsOpen) {
        commentsOpen = true;
        await showComments(options.focusCommentId || null);
    }
    scheduleAdaptive();
    return true;
}

function linearize(value) {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
}

export function scheduleAdaptive() {
    if (sampleQueued) return;
    sampleQueued = true;
    requestAnimationFrame(() => {
        sampleQueued = false;
        paintControls();
    });
}

function paintControls() {
    if (!host) return;
    const { imgEl, topControls } = host.getElements();
    if (!imgEl || !topControls || !imgEl.naturalWidth) return;
    const buttons = [...topControls.querySelectorAll("button")];
    if (!buttons.length) return;
    try {
        const maxDim = 256;
        const scale = Math.min(1, maxDim / Math.max(imgEl.naturalWidth, imgEl.naturalHeight));
        const canvas = paintControls.canvas || document.createElement("canvas");
        paintControls.canvas = canvas;
        canvas.width = Math.max(1, Math.round(imgEl.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(imgEl.naturalHeight * scale));
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.drawImage(imgEl, 0, 0, canvas.width, canvas.height);
        const rect = imgEl.getBoundingClientRect();
        buttons.forEach((button) => {
            const box = button.getBoundingClientRect();
            const u = rect.width ? (box.left + box.width / 2 - rect.left) / rect.width : 1;
            const v = rect.height ? (box.top + box.height / 2 - rect.top) / rect.height : 0;
            const x = Math.round(Math.min(1, Math.max(0, u)) * (canvas.width - 1));
            const y = Math.round(Math.min(1, Math.max(0, v)) * (canvas.height - 1));
            const size = 16;
            const sx = Math.max(0, Math.min(canvas.width - 1, x - size / 2));
            const sy = Math.max(0, Math.min(canvas.height - 1, y - size / 2));
            const sw = Math.max(1, Math.min(size, canvas.width - sx));
            const sh = Math.max(1, Math.min(size, canvas.height - sy));
            const pixels = context.getImageData(sx, sy, sw, sh).data;
            let total = 0;
            let count = 0;
            for (let index = 0; index < pixels.length; index += 4) {
                const alpha = pixels[index + 3] / 255;
                if (alpha < 0.05) continue;
                total += 0.2126 * linearize(pixels[index]) + 0.7152 * linearize(pixels[index + 1]) + 0.0722 * linearize(pixels[index + 2]);
                count += 1;
            }
            const luminance = count ? total / count : 0;
            const lightBackground = luminance > 0.5;
            button.style.color = lightBackground ? "#000000" : "#ffffff";
            button.style.background = lightBackground ? "rgba(255,255,255,0.62)" : "rgba(0,0,0,0.5)";
            button.style.filter = lightBackground
                ? "drop-shadow(0 1px 1px rgba(255,255,255,0.9))"
                : "drop-shadow(0 1px 2px rgba(0,0,0,0.9))";
        });
    } catch (err) {
        /* A tainted canvas leaves the existing control colors in place. */
    }
}
