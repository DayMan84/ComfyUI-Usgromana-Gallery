/**
 * Notification transport. The toast UI is separate so this can later
 * switch from polling to a socket without changing how notices look.
 */

import { getNotifications } from "./socialApi.js";
import { showNotification } from "../ui/notificationToast.js";

const INTERVAL_MS = 20000;
let timer = null;
let seen = new Set();
let primed = false;

async function fetchNewNotifications() {
    if (document.hidden) return;
    let data;
    try {
        data = await getNotifications({ limit: 20 });
    } catch (err) {
        return;
    }
    const arrived = [];
    for (const note of data.notifications || []) {
        if (seen.has(note.id)) continue;
        seen.add(note.id);
        if (primed && !note.read) arrived.push(note);
    }
    primed = true;
    arrived.reverse().forEach((note) => showNotification(note));
}

export function startNotificationPolling() {
    if (timer) return;
    fetchNewNotifications();
    timer = window.setInterval(fetchNewNotifications, INTERVAL_MS);
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) fetchNewNotifications();
    });
}
