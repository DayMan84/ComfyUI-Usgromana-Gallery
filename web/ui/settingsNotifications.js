import { getNotificationPreferences, setNotificationPreferences } from "../core/socialApi.js";
import { createSlideoutMenu } from "./slideoutMenu.js";

export async function openNotificationSettings(anchor) {
    const content = document.createElement("div");
    content.textContent = "Loading notification settings…";
    const menu = createSlideoutMenu({
        anchor,
        title: "Notifications",
        width: 300,
        maxHeight: 360,
        content,
    });
    let prefs;
    try {
        prefs = await getNotificationPreferences();
    } catch (err) {
        content.textContent = err.message || "Notification settings are unavailable.";
        return menu;
    }
    content.replaceChildren();
    const masterRow = document.createElement("label");
    masterRow.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;";
    const masterText = document.createElement("span");
    masterText.textContent = "Notifications";
    const master = document.createElement("input");
    master.type = "checkbox";
    master.checked = !!prefs.enabled;
    master.setAttribute("aria-label", "Notifications");
    masterRow.append(masterText, master);

    const about = document.createElement("div");
    about.textContent = "Notify me about";
    about.style.cssText = "font-size:12px;margin-bottom:8px;color:var(--usg-text-secondary,#94a3b8);";

    const commentBox = document.createElement("input");
    const ratingBox = document.createElement("input");
    const make = (box, label) => {
        const row = document.createElement("label");
        row.style.cssText = "display:flex;align-items:center;gap:8px;margin:6px 0;";
        box.type = "checkbox";
        box.checked = label === "Comments" ? !!prefs.comment_actions : !!prefs.rating_actions;
        const text = document.createElement("span");
        text.textContent = label;
        row.append(box, text);
        return row;
    };
    const commentRow = make(commentBox, "Comments");
    const ratingRow = make(ratingBox, "Ratings");
    const error = document.createElement("div");
    error.style.cssText = "color:var(--usg-danger,#fca5a5);font-size:12px;min-height:16px;";

    const syncDisabled = () => {
        commentBox.disabled = !master.checked;
        ratingBox.disabled = !master.checked;
        commentRow.style.opacity = master.checked ? "1" : "0.45";
        ratingRow.style.opacity = master.checked ? "1" : "0.45";
    };
    const save = async () => {
        try {
            await setNotificationPreferences({
                enabled: master.checked,
                comment_actions: commentBox.checked,
                rating_actions: ratingBox.checked,
            });
            error.textContent = "";
        } catch (err) {
            error.textContent = err.message || "Could not save notification settings.";
        }
    };
    master.onchange = () => {
        syncDisabled();
        save();
    };
    commentBox.onchange = save;
    ratingBox.onchange = save;
    syncDisabled();
    content.append(masterRow, about, commentRow, ratingRow, error);
    return menu;
}
