// ComfyUI-Usgromana-Gallery/web/core/api.js

import { logger } from "./logger.js";

const BASE = "/usgromana-gallery";

async function request(path, options = {}) {
    const url = `${BASE}${path}`;
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/6712329c-12ed-47b3-85f9-78457616d544',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api.js:8',message:'API request start',data:{url,method:options.method||'GET'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    const opts = {
        credentials: "same-origin",
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {}),
        },
    };

    const startTime = Date.now();
    const res = await fetch(url, opts);
    const duration = Date.now() - startTime;
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/6712329c-12ed-47b3-85f9-78457616d544',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api.js:22',message:'API response received',data:{url,status:res.status,ok:res.ok,duration},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    if (!res.ok) {
        logger.error(`Request failed: ${url} [${res.status}]`);
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/6712329c-12ed-47b3-85f9-78457616d544',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api.js:26',message:'API request failed',data:{url,status:res.status},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        throw new Error(`Request failed: ${res.status}`);
    }

    const data = await res.json();
    if (data && data.ok === false) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/6712329c-12ed-47b3-85f9-78457616d544',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api.js:32',message:'API returned error',data:{url,error:data.error},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
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