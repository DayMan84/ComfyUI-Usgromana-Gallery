// ComfyUI-Usgromana-Gallery/web/core/api.js

import { logger } from "./logger.js";

const BASE = "/usgromana-gallery";

async function request(path, options = {}) {
    const url = `${BASE}${path}`;
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
        const data = await request("/list");
        // expect { ok: true, images: [...] }
        return data.images || [];
    },

    async getMetadata(filename) {
        if (!filename) return {};
        const data = await request(
            `/meta?filename=${encodeURIComponent(filename)}`
        );
        return data.meta || {};
    },

    async saveMetadata(filename, meta) {
        if (!filename) return;
        return await request("/meta", {
            method: "POST",
            body: JSON.stringify({
                filename,
                meta: meta || {},
            }),
        });
    },
};