/**
 * Share slide-out. Checkbox changes stay local until Share is pressed.
 * Share with all asks the server for the account list. Revoke all asks first.
 */

import { getShares, revokeAllShares, shareWithAll, updateShares } from "../core/socialApi.js";
import { createSlideoutMenu } from "./slideoutMenu.js";

function confirmRevoke() {
    return new Promise((resolve) => {
        const backdrop = document.createElement("div");
        backdrop.style.cssText = "position:fixed;inset:0;z-index:1000004;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.45);";
        const box = document.createElement("div");
        box.style.cssText = "width:min(380px,92vw);background:var(--usg-panel,#0f172a);color:var(--usg-text,#e5e7eb);border:1px solid var(--usg-border,rgba(148,163,184,0.4));border-radius:12px;padding:16px;";
        const text = document.createElement("p");
        text.textContent = "Revoke access from all shared users?";
        const row = document.createElement("div");
        row.style.cssText = "display:flex;justify-content:flex-end;gap:8px;";
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.textContent = "Cancel";
        const confirm = document.createElement("button");
        confirm.type = "button";
        confirm.textContent = "Revoke All";
        confirm.style.cssText = "background:var(--usg-danger,#b91c1c);color:white;border:0;border-radius:8px;padding:6px 12px;cursor:pointer;";
        cancel.style.cssText = "background:transparent;color:inherit;border:1px solid var(--usg-border,#475569);border-radius:8px;padding:6px 12px;cursor:pointer;";
        const finish = (value) => {
            backdrop.remove();
            resolve(value);
        };
        cancel.onclick = () => finish(false);
        confirm.onclick = () => finish(true);
        row.append(cancel, confirm);
        box.append(text, row);
        backdrop.appendChild(box);
        document.body.appendChild(backdrop);
        cancel.focus();
    });
}

export async function openShareSlideout(anchor, parentMenu, imageId) {
    const content = document.createElement("div");
    content.textContent = "Loading accounts…";
    const menu = createSlideoutMenu({
        anchor,
        parentMenu,
        title: "Share",
        width: 300,
        maxHeight: 460,
        content,
    });
    let state;
    try {
        state = await getShares(imageId);
    } catch (err) {
        content.textContent = err.message || "Sharing is unavailable.";
        return menu;
    }
    const users = state.users || [];
    const selected = new Set(users.filter((user) => user.shared).map((user) => user.id));
    content.replaceChildren();

    const allLabel = document.createElement("label");
    allLabel.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:8px;";
    const allBox = document.createElement("input");
    allBox.type = "checkbox";
    allBox.checked = !!state.shared_with_all && users.length > 0;
    const allText = document.createElement("span");
    allText.textContent = "Share with all users";
    allLabel.append(allBox, allText);

    const list = document.createElement("div");
    list.className = "usg-scrollable";
    list.style.cssText = "max-height:240px;overflow:auto;display:flex;flex-direction:column;gap:6px;";
    const boxes = [];
    users.forEach((user) => {
        const label = document.createElement("label");
        label.style.cssText = "display:flex;align-items:center;gap:8px;";
        const box = document.createElement("input");
        box.type = "checkbox";
        box.checked = selected.has(user.id);
        box.dataset.userId = user.id;
        const name = document.createElement("span");
        name.textContent = user.username;
        box.onchange = () => {
            if (box.checked) selected.add(user.id);
            else selected.delete(user.id);
            allBox.checked = users.length > 0 && users.every((item) => selected.has(item.id));
        };
        boxes.push(box);
        label.append(box, name);
        list.appendChild(label);
    });
    if (!users.length) {
        const empty = document.createElement("div");
        empty.textContent = "There are no other accounts to share with.";
        list.appendChild(empty);
    }
    allBox.onchange = () => {
        users.forEach((user) => {
            if (allBox.checked) selected.add(user.id);
            else selected.delete(user.id);
        });
        boxes.forEach((box) => {
            box.checked = selected.has(box.dataset.userId);
        });
    };

    const error = document.createElement("div");
    error.style.cssText = "color:var(--usg-danger,#fca5a5);font-size:12px;min-height:16px;margin-top:8px;";
    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;justify-content:space-between;gap:8px;margin-top:10px;";
    const share = document.createElement("button");
    share.type = "button";
    share.textContent = "Share";
    share.style.cssText = "border:0;border-radius:8px;padding:6px 12px;cursor:pointer;background:var(--usg-accent,#0284c7);color:white;";
    const revoke = document.createElement("button");
    revoke.type = "button";
    revoke.textContent = "Revoke All";
    revoke.style.cssText = "border:0;border-radius:8px;padding:6px 12px;cursor:pointer;background:transparent;color:var(--usg-text,#e5e7eb);";
    share.onclick = async () => {
        share.disabled = true;
        try {
            if (allBox.checked && users.length) {
                await shareWithAll(imageId);
            } else {
                await updateShares(imageId, [...selected]);
            }
            menu.close();
        } catch (err) {
            error.textContent = err.message || "Could not update sharing.";
            share.disabled = false;
        }
    };
    revoke.onclick = async () => {
        const yes = await confirmRevoke();
        if (!yes) return;
        try {
            await revokeAllShares(imageId);
            menu.close();
        } catch (err) {
            error.textContent = err.message || "Could not revoke sharing.";
        }
    };
    actions.append(share, revoke);
    content.append(allLabel, list, error, actions);
    return menu;
}
