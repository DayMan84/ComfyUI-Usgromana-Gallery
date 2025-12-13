// ComfyUI-Usgromana-Gallery/web/core/api.js

import { logger } from "./logger.js";
import { API_BASE, API_ENDPOINTS } from "./constants.js";

async function request(path, options = {}) {
    const url = `${API_BASE}${path}`;
    const opts = {
        credentials: "same-origin",
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {}),
        },
    };

    const res = await fetch(url, opts);
    if (!res.ok) {
        logger.error(`Request failed: ${url} [${res.status}]`);
        throw new Error(`Request failed: ${res.status}`);
    }

    const data = await res.json();
    if (data && data.ok === false) {
        throw new Error(data.error || "Unknown error");
    }
    return data;
}

export const galleryApi = {
    async listImages() {
        const data = await request(API_ENDPOINTS.LIST.replace(API_BASE, ""));
        // expect { ok: true, images: [...] }
        return data.images || [];
    },

    async getMetadata(filename) {
        if (!filename) return {};
        const data = await request(
            `${API_ENDPOINTS.META.replace(API_BASE, "")}?filename=${encodeURIComponent(filename)}`
        );
        return data.meta || {};
    },

    async saveMetadata(filename, meta) {
        if (!filename) return;
        try {
            const result = await request(API_ENDPOINTS.META.replace(API_BASE, ""), {
                method: "POST",
                body: JSON.stringify({
                    filename,
                    meta: meta || {},
                }),
            });
            return result;
        } catch (err) {
            throw err;
        }
    },

    async getServerSettings() {
        const data = await request(API_ENDPOINTS.SETTINGS.replace(API_BASE, ""));
        return data.settings || {};
    },

    async saveServerSettings(settings) {
        return await request(API_ENDPOINTS.SETTINGS.replace(API_BASE, ""), {
            method: "POST",
            body: JSON.stringify({ settings }),
        });
    },

    async checkWatchStatus() {
        const data = await request(API_ENDPOINTS.WATCH.replace(API_BASE, ""));
        return data.monitoring || false;
    },

    async batchDelete(filenames) {
        return await request("/batch/delete", {
            method: "POST",
            body: JSON.stringify({ filenames }),
        });
    },

    async batchDownload(filenames) {
        // Download as blob
        const url = `${API_BASE}/batch/download?filenames=${encodeURIComponent(filenames.join(","))}`;
        const res = await fetch(url, { credentials: "same-origin" });
        if (!res.ok) throw new Error(`Download failed: ${res.status}`);
        return await res.blob();
    },

    async markAsNSFW(filename) {
        return await request("/mark-nsfw", {
            method: "POST",
            body: JSON.stringify({ filename }),
        });
    },

    async renameFile(oldFilename, newFilename) {
        // request() already prepends API_BASE, so just use "/rename"
        return await request("/rename", {
            method: "POST",
            body: JSON.stringify({ old_filename: oldFilename, new_filename: newFilename }),
        });
    },
};