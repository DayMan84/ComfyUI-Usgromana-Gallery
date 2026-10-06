/**
 * Right-click menu for a gallery image.
 * Share, workflow, and remove apply to that image.
 * Share is offered only when Usgromana accounts are installed and the viewer
 * is signed in to a non-guest account, and only for images they own.
 */

import { galleryApi } from "../core/api.js";
import { ensureImage } from "../core/socialApi.js";
import { hideDetails } from "./details.js";
import { CommentsPanel } from "./commentsPanel.js";
import { createSlideoutMenu } from "./slideoutMenu.js";
import { openShareSlideout } from "./shareSlideout.js";

const SHARE_API = "/usgromana-gallery/shares";
let shareGate = { available: null, enabled: false };
let shareProbeAt = 0;

async function refreshShareGate() {
    if (shareGate.available === false) return shareGate;
    if (shareProbeAt && Date.now() - shareProbeAt < 4000) return shareGate;
    try {
        const response = await fetch(`${SHARE_API}/status`, { credentials: "include" });
        const data = await response.json();
        shareGate = { available: !!data.available, enabled: !!data.enabled };
    } catch (err) {
        shareGate = { available: false, enabled: false };
    }
    shareProbeAt = Date.now();
    return shareGate;
}

async function shareRequest(path, options = {}) {
    const response = await fetch(path, {
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(options.headers || {}) },
        ...options,
    });
    let data = {};
    try {
        data = await response.json();
    } catch (err) {
        data = {};
    }
    if (!response.ok || data.ok === false) {
        throw new Error(data.error || `Request failed (${response.status})`);
    }
    return data;
}

function escapeText(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function escapeAttr(value) {
    return escapeText(value).replace(/"/g, "&quot;");
}

function imageRelpath(image) {
    return String(image.relpath || image.path || image.filename || "");
}

function imageName(image, relpath) {
    return String(image.filename || image.name || relpath.split("/").pop() || "image");
}

function ownedImage(relpath) {
    return !!relpath && !relpath.startsWith("shared/");
}

function closeMenu() {
    document.getElementById("usg-gallery-image-menu")?.remove();
    document.getElementById("usg-gallery-image-menu-backdrop")?.remove();
}

function showMenu(x, y, items) {
    closeMenu();
    const backdrop = document.createElement("div");
    backdrop.id = "usg-gallery-image-menu-backdrop";
    backdrop.style.cssText = "position:fixed;inset:0;z-index:1000000;background:transparent;";
    backdrop.addEventListener("mousedown", closeMenu);
    backdrop.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        closeMenu();
    });

    const menu = document.createElement("div");
    menu.id = "usg-gallery-image-menu";
    menu.setAttribute("role", "menu");
    menu.style.cssText = [
        "position:fixed",
        "z-index:1000001",
        "min-width:168px",
        "background:#0f172a",
        "color:#e5e7eb",
        "border:1px solid rgba(148,163,184,0.45)",
        "border-radius:10px",
        "padding:6px",
        "box-shadow:0 16px 40px rgba(0,0,0,0.45)",
    ].join(";");

    items.forEach((item) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = item.label;
        button.setAttribute("role", "menuitem");
        button.style.cssText = [
            "display:block",
            "width:100%",
            "text-align:left",
            "border:0",
            "background:transparent",
            "color:#e5e7eb",
            "padding:8px 10px",
            "border-radius:8px",
            "cursor:pointer",
            "font-size:13px",
        ].join(";");
        button.onmouseenter = () => {
            button.style.background = "rgba(56,189,248,0.18)";
        };
        button.onmouseleave = () => {
            button.style.background = "transparent";
        };
        button.onclick = (event) => {
            event.stopPropagation();
            const run = item.keepOpen ? item.action(button, menu) : item.action();
            if (!item.keepOpen) closeMenu();
            Promise.resolve(run).catch((err) => {
                openDialog({
                    title: item.label,
                    body: `<p>${escapeText(err.message || err)}</p>`,
                    confirmLabel: "Close",
                    onConfirm: null,
                });
            });
        };
        menu.appendChild(button);
    });

    document.body.appendChild(backdrop);
    document.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    const left = Math.max(8, Math.min(x, window.innerWidth - rect.width - 8));
    const top = Math.max(8, Math.min(y, window.innerHeight - rect.height - 8));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
}

function ensureDialog() {
    let dialog = document.getElementById("usg-gallery-image-dialog");
    if (dialog) return dialog;
    dialog = document.createElement("div");
    dialog.id = "usg-gallery-image-dialog";
    dialog.style.cssText = [
        "position:fixed",
        "inset:0",
        "z-index:1000002",
        "display:none",
        "align-items:center",
        "justify-content:center",
        "background:rgba(0,0,0,0.45)",
    ].join(";");
    dialog.innerHTML = `
        <div style="width:min(440px,92vw);background:#0f172a;color:#e5e7eb;border:1px solid rgba(148,163,184,0.4);border-radius:12px;padding:16px;box-shadow:0 16px 40px rgba(0,0,0,0.45);">
            <div id="usg-gallery-image-dialog-title" style="font-weight:600;margin-bottom:8px;"></div>
            <div id="usg-gallery-image-dialog-body" style="font-size:13px;max-height:320px;overflow:auto;"></div>
            <div id="usg-gallery-image-dialog-error" style="color:#fca5a5;font-size:12px;min-height:16px;margin-top:8px;"></div>
            <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">
                <button type="button" id="usg-gallery-image-dialog-cancel" style="padding:6px 12px;border-radius:8px;border:1px solid #475569;background:transparent;color:#e5e7eb;cursor:pointer;">Close</button>
                <button type="button" id="usg-gallery-image-dialog-confirm" style="padding:6px 12px;border-radius:8px;border:0;background:#0284c7;color:white;cursor:pointer;">Save</button>
            </div>
        </div>`;
    dialog.addEventListener("click", (event) => {
        if (event.target === dialog) dialog.style.display = "none";
    });
    dialog.querySelector("#usg-gallery-image-dialog-cancel").onclick = () => {
        dialog.style.display = "none";
    };
    document.body.appendChild(dialog);
    return dialog;
}

function openDialog({ title, body, confirmLabel, onConfirm, danger }) {
    const dialog = ensureDialog();
    dialog.querySelector("#usg-gallery-image-dialog-title").textContent = title;
    dialog.querySelector("#usg-gallery-image-dialog-body").innerHTML = body;
    dialog.querySelector("#usg-gallery-image-dialog-error").textContent = "";
    const confirm = dialog.querySelector("#usg-gallery-image-dialog-confirm");
    confirm.textContent = confirmLabel;
    confirm.style.display = onConfirm ? "inline-block" : "none";
    confirm.style.background = danger ? "#b91c1c" : "#0284c7";
    confirm.onclick = async () => {
        if (!onConfirm) {
            dialog.style.display = "none";
            return;
        }
        try {
            await onConfirm(dialog);
            dialog.style.display = "none";
        } catch (err) {
            dialog.querySelector("#usg-gallery-image-dialog-error").textContent = err.message || String(err);
        }
    };
    dialog.style.display = "flex";
}

function parseMaybe(value) {
    if (typeof value !== "string") return value;
    try {
        return JSON.parse(value);
    } catch (err) {
        return null;
    }
}

function usableGraph(value) {
    const parsed = parseMaybe(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    if (Array.isArray(parsed.nodes) || parsed.last_node_id != null) return parsed;
    return null;
}

function usablePrompt(value) {
    const parsed = parseMaybe(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const first = Object.values(parsed)[0];
    if (first && typeof first === "object" && (Object.prototype.hasOwnProperty.call(first, "class_type") || Object.prototype.hasOwnProperty.call(first, "inputs"))) {
        return parsed;
    }
    return null;
}

function closeGallery() {
    const overlay = document.querySelector(".usg-gallery-overlay");
    if (overlay) overlay.style.display = "none";
    hideDetails();
}

async function refreshLibrary() {
    if (typeof window.USG_GALLERY_RELOAD_IMAGES === "function") {
        await window.USG_GALLERY_RELOAD_IMAGES();
    }
    window.dispatchEvent(new CustomEvent("usg-gallery-library-changed"));
}

async function openShareDialog(relpath) {
    openDialog({
        title: "Share image",
        body: "<p>Loading accounts…</p>",
        confirmLabel: "Save",
        onConfirm: null,
    });
    const [accounts, visibility] = await Promise.all([
        shareRequest(`${SHARE_API}/accounts`),
        shareRequest(`${SHARE_API}/visibility`, {
            method: "POST",
            body: JSON.stringify({ relpaths: [relpath] }),
        }),
    ]);
    const viewers = new Set((((visibility.images || [])[0] || {}).viewers) || []);
    const names = new Set(accounts.users || []);
    viewers.forEach((name) => names.add(name));
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    if (!sorted.length) {
        openDialog({
            title: "Share image",
            body: "<p>There are no other accounts to share this image with.</p>",
            confirmLabel: "Close",
            onConfirm: null,
        });
        return;
    }
    const checks = sorted
        .map((name) => {
            const checked = viewers.has(name) ? " checked" : "";
            const badge = viewers.has(name)
                ? '<span style="margin-left:8px;font-size:11px;color:#7dd3fc;">Has access</span>'
                : "";
            return `<label style="display:flex;align-items:center;margin:6px 0;"><input type="checkbox" value="${escapeAttr(name)}"${checked}> <span style="margin-left:8px;">${escapeText(name)}</span>${badge}</label>`;
        })
        .join("");
    openDialog({
        title: "Share image",
        body: `<p style="margin-top:0;">Checked accounts can see this image in their gallery. Uncheck an account to remove their access.</p>${checks}`,
        confirmLabel: "Save",
        onConfirm: async (dialog) => {
            const selected = new Set(
                [...dialog.querySelectorAll("input[type=checkbox]:checked")].map((input) => input.value)
            );
            const grant = [...selected].filter((name) => !viewers.has(name));
            const revoke = [...viewers].filter((name) => !selected.has(name));
            if (grant.length) {
                await shareRequest(SHARE_API, {
                    method: "POST",
                    body: JSON.stringify({ relpaths: [relpath], usernames: grant }),
                });
            }
            if (revoke.length) {
                await shareRequest(`${SHARE_API}/revoke`, {
                    method: "POST",
                    body: JSON.stringify({ relpaths: [relpath], usernames: revoke }),
                });
            }
        },
    });
}

async function openWorkflow(relpath, filename) {
    const data = await shareRequest(
        `${SHARE_API}/workflow?filename=${encodeURIComponent(relpath)}`
    );
    const graph = usableGraph(data.workflow);
    const prompt = usablePrompt(data.prompt);
    if (!graph && !prompt) {
        openDialog({
            title: "Workflow",
            body: "<p>This image does not include a workflow.</p>",
            confirmLabel: "Close",
            onConfirm: null,
        });
        return;
    }
    const { app } = await import("../../../scripts/app.js");
    const name = filename.replace(/\.\w+$/, "") || "image";
    closeGallery();
    if (graph && typeof app.loadGraphData === "function") {
        await app.loadGraphData(graph, true, true, name, { openSource: "gallery" });
        return;
    }
    if (prompt && typeof app.loadApiJson === "function") {
        await app.loadApiJson(prompt, name);
        return;
    }
    throw new Error("ComfyUI could not open this workflow");
}

function confirmRemove(relpath, filename) {
    openDialog({
        title: "Remove image",
        body: `<p>Remove <strong>${escapeText(filename)}</strong> from the gallery? The image file and its thumbnail will be deleted.</p>`,
        confirmLabel: "Remove",
        danger: true,
        onConfirm: async () => {
            await galleryApi.deleteFile(relpath);
            await refreshLibrary();
        },
    });
}

async function openImageMenu(x, y, image) {
    const relpath = imageRelpath(image);
    if (!relpath) return;
    const filename = imageName(image, relpath);
    const owned = ownedImage(relpath);
    const gate = owned ? await refreshShareGate() : { enabled: false };
    const items = [];
    if (owned && gate.enabled) {
        items.push({
            label: "Share  ›",
            keepOpen: true,
            action: async (button, menu) => {
                const ensured = await ensureImage(relpath);
                await openShareSlideout(button, menu, ensured.image_id);
            },
        });
    }
    items.push({
        label: "Comments  ›",
        keepOpen: true,
        action: async (button, menu) => {
            const ensured = await ensureImage(relpath);
            const panel = new CommentsPanel({ imageId: ensured.image_id, mode: "slideout" });
            createSlideoutMenu({
                anchor: button,
                parentMenu: menu,
                title: "Comments",
                width: 340,
                maxHeight: 560,
                content: panel.element,
            });
            await panel.load();
        },
    });
    items.push({ label: "Workflow", action: () => openWorkflow(relpath, filename) });
    if (owned) {
        items.push({ label: "Remove", action: () => confirmRemove(relpath, filename) });
    }
    showMenu(x, y, items);
}

export function bindImageContextMenu(element, image) {
    if (!element || element.dataset.usgImageMenu === "1") return;
    element.dataset.usgImageMenu = "1";
    element.addEventListener("contextmenu", (event) => {
        if (!imageRelpath(image)) return;
        event.preventDefault();
        event.stopPropagation();
        openImageMenu(event.clientX, event.clientY, image).catch((err) => {
            openDialog({
                title: "Image",
                body: `<p>${escapeText(err.message || err)}</p>`,
                confirmLabel: "Close",
                onConfirm: null,
            });
        });
    });
}

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
});
