/**
 * Toasts anchored to the floating Gallery button.
 * Left of the screen they grow right, right of the screen they grow left,
 * and a corner uses the direction with more room.
 */

import { markNotificationRead } from "../core/socialApi.js";
import { showOverlay } from "./overlay.js";
import { showDetailsByImageId } from "./previewSocial.js";

const MAX_VISIBLE = 3;
const LIFE_MS = 7000;
const queue = [];
const visible = [];

function galleryButton() {
    const toolbar = document.getElementById("usg-gallery-toolbar-btn");
    if (toolbar && toolbar.isConnected && toolbar.style.display !== "none") return toolbar;
    const pill = document.getElementById("usg-gallery-launch-btn");
    if (pill && pill.style.display !== "none") return pill;
    return toolbar || pill;
}

function direction(rect) {
    const space = {
        left: rect.left,
        right: window.innerWidth - rect.right,
        top: rect.top,
        bottom: window.innerHeight - rect.bottom,
    };
    const horizontal = space.right >= space.left ? "right" : "left";
    const vertical = space.bottom >= space.top ? "down" : "up";
    const horizontalRoom = Math.max(space.left, space.right);
    const verticalRoom = Math.max(space.top, space.bottom);
    if (Math.min(space.left, space.right) < 220 && verticalRoom > horizontalRoom) return vertical;
    return horizontal;
}

function stackHost() {
    let host = document.getElementById("usg-gallery-toasts");
    if (host) return host;
    host = document.createElement("div");
    host.id = "usg-gallery-toasts";
    host.style.cssText = "position:fixed;z-index:1000005;display:flex;flex-direction:column;gap:8px;pointer-events:none;";
    document.body.appendChild(host);
    return host;
}

function place(host) {
    const button = galleryButton();
    const rect = button ? button.getBoundingClientRect() : { left: 16, right: 80, top: window.innerHeight - 80, bottom: window.innerHeight - 24, width: 64, height: 56 };
    const way = direction(rect);
    host.dataset.direction = way;
    if (way === "right") {
        host.style.left = `${rect.right + 12}px`;
        host.style.right = "auto";
        host.style.top = `${rect.top}px`;
        host.style.bottom = "auto";
        host.style.flexDirection = "column";
    } else if (way === "left") {
        host.style.left = "auto";
        host.style.right = `${window.innerWidth - rect.left + 12}px`;
        host.style.top = `${rect.top}px`;
        host.style.bottom = "auto";
    } else if (way === "down") {
        host.style.left = `${Math.max(8, rect.left)}px`;
        host.style.right = "auto";
        host.style.top = `${rect.bottom + 12}px`;
        host.style.bottom = "auto";
    } else {
        host.style.left = `${Math.max(8, rect.left)}px`;
        host.style.right = "auto";
        host.style.top = "auto";
        host.style.bottom = `${window.innerHeight - rect.top + 12}px`;
        host.style.flexDirection = "column-reverse";
    }
}

function pump() {
    const host = stackHost();
    place(host);
    while (visible.length < MAX_VISIBLE && queue.length) {
        host.appendChild(build(queue.shift()));
    }
}

function build(note) {
    const card = document.createElement("div");
    card.style.cssText = [
        "pointer-events:auto",
        "max-width:min(360px,70vw)",
        "background:var(--usg-panel, rgba(15,23,42,0.96))",
        "color:var(--usg-text, #e5e7eb)",
        "border:1px solid var(--usg-border, rgba(148,163,184,0.4))",
        "border-radius:12px",
        "padding:10px 12px",
        "box-shadow:0 12px 30px rgba(0,0,0,0.35)",
        "cursor:pointer",
        "display:flex",
        "gap:8px",
        "align-items:flex-start",
    ].join(";");
    const text = document.createElement("div");
    text.textContent = note.message || "You have a gallery notification.";
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "×";
    close.setAttribute("aria-label", "Dismiss notification");
    close.style.cssText = "background:transparent;border:0;color:inherit;cursor:pointer;font-size:16px;";
    card.append(text, close);
    visible.push(card);
    let timer = null;
    const remove = () => {
        if (timer) window.clearTimeout(timer);
        card.remove();
        const index = visible.indexOf(card);
        if (index >= 0) visible.splice(index, 1);
        pump();
    };
    const arm = () => {
        timer = window.setTimeout(remove, LIFE_MS);
    };
    card.addEventListener("mouseenter", () => {
        if (timer) window.clearTimeout(timer);
    });
    card.addEventListener("mouseleave", arm);
    close.onclick = (event) => {
        event.stopPropagation();
        remove();
    };
    card.onclick = () => openNote(note, text, remove);
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!motion) {
        card.animate(
            [{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "translateY(0)" }],
            { duration: 180 }
        );
    }
    arm();
    return card;
}

async function openNote(note, text, remove) {
    try {
        await markNotificationRead(note.id);
    } catch (err) {
        /* The notice can still open when marking it read fails. */
    }
    showOverlay();
    try {
        const opened = await showDetailsByImageId(note.image_id, {
            commentsOpen: true,
            focusCommentId: note.type === "comment_added" ? note.comment_id : null,
        });
        if (!opened) text.textContent = "This image is no longer available.";
    } catch (err) {
        text.textContent = err.code === "NOT_AUTHORIZED"
            ? "Image is no longer available."
            : "This image is no longer available.";
    }
    if (text.textContent.indexOf("no longer available") === -1) remove();
}

export function showNotification(note) {
    if (!note || !note.id) return;
    queue.push(note);
    pump();
}
