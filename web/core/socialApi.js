/**
 * Gallery social requests. Components use these helpers instead of calling fetch themselves.
 */

const SOCIAL = "/usgromana-gallery/social";
const ROOT = "/usgromana-gallery";

async function request(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.body && !headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
    }
    const response = await fetch(path, {
        credentials: "include",
        ...options,
        headers,
    });
    let data = {};
    try {
        data = await response.json();
    } catch (err) {
        data = {};
    }
    if (!response.ok || data.ok === false) {
        const error = data.error;
        const message = error && typeof error === "object"
            ? error.message
            : (typeof error === "string" ? error : `Request failed (${response.status})`);
        const failure = new Error(message || "Request failed");
        failure.code = error && typeof error === "object" ? error.code : "";
        failure.status = response.status;
        throw failure;
    }
    return data;
}

export function ensureImage(relpath) {
    return request(`${SOCIAL}/ensure`, {
        method: "POST",
        body: JSON.stringify({ relpath }),
    });
}

export function getSocialSummary(imageId) {
    return request(`${SOCIAL}/images/${encodeURIComponent(imageId)}`);
}

export function getShares(imageId) {
    return request(`${SOCIAL}/images/${encodeURIComponent(imageId)}/shares`);
}

export function updateShares(imageId, userIds) {
    return request(`${SOCIAL}/images/${encodeURIComponent(imageId)}/shares`, {
        method: "PUT",
        body: JSON.stringify({ user_ids: userIds }),
    });
}

export function shareWithAll(imageId) {
    return request(`${SOCIAL}/images/${encodeURIComponent(imageId)}/shares/all`, {
        method: "POST",
        body: JSON.stringify({}),
    });
}

export function revokeAllShares(imageId) {
    return request(`${SOCIAL}/images/${encodeURIComponent(imageId)}/shares`, {
        method: "DELETE",
    });
}

export function getComments(imageId, limit = 50, cursor = null) {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set("cursor", cursor);
    return request(`${SOCIAL}/images/${encodeURIComponent(imageId)}/comments?${params}`);
}

export function createComment(imageId, body) {
    return request(`${SOCIAL}/images/${encodeURIComponent(imageId)}/comments`, {
        method: "POST",
        body: JSON.stringify({ body }),
    });
}

export function updateComment(commentId, body) {
    return request(`${SOCIAL}/comments/${encodeURIComponent(commentId)}`, {
        method: "PATCH",
        body: JSON.stringify({ body }),
    });
}

export function deleteComment(commentId) {
    return request(`${SOCIAL}/comments/${encodeURIComponent(commentId)}`, {
        method: "DELETE",
    });
}

export function getRating(imageId) {
    return request(`${SOCIAL}/images/${encodeURIComponent(imageId)}/rating`);
}

export function setRating(imageId, rating) {
    return request(`${SOCIAL}/images/${encodeURIComponent(imageId)}/rating`, {
        method: "PUT",
        body: JSON.stringify({ rating }),
    });
}

export function removeRating(imageId) {
    return request(`${SOCIAL}/images/${encodeURIComponent(imageId)}/rating`, {
        method: "DELETE",
    });
}

export function getRatingMap() {
    return request(`${SOCIAL}/rating-map`);
}

export function getNotifications({ unread = false, limit = 20, after = null } = {}) {
    const params = new URLSearchParams({ limit: String(limit) });
    if (unread) params.set("unread", "true");
    if (after) params.set("after", after);
    return request(`${ROOT}/notifications?${params}`);
}

export function markNotificationRead(id) {
    return request(`${ROOT}/notifications/${encodeURIComponent(id)}/read`, { method: "POST" });
}

export function markAllNotificationsRead() {
    return request(`${ROOT}/notifications/read-all`, { method: "POST" });
}

export function getNotificationPreferences() {
    return request(`${ROOT}/notification-preferences`);
}

export function setNotificationPreferences(settings) {
    return request(`${ROOT}/notification-preferences`, {
        method: "PUT",
        body: JSON.stringify(settings),
    });
}

export function getAppearance() {
    return request(`${ROOT}/appearance`);
}

export function setAppearance(settings) {
    return request(`${ROOT}/appearance`, {
        method: "PUT",
        body: JSON.stringify(settings),
    });
}
