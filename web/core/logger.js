// ComfyUI-Usgromana-Gallery/web/core/logger.js

const LOG_ENDPOINT = "/usgromana-gallery/log";

async function sendRemoteLog(level, message, extra) {
    try {
        await fetch(LOG_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ level, message, extra: extra ?? null }),
        });
    } catch {
        // Don't spam errors if logging fails
    }
}

export const logger = {
    info(msg, extra) {
        console.log("[UsgromanaGallery]", msg, extra ?? "");
        // sendRemoteLog("info", msg, extra); // leave disabled unless you want it
    },
    warn(msg, extra) {
        console.warn("[UsgromanaGallery]", msg, extra ?? "");
        // sendRemoteLog("warn", msg, extra);
    },
    error(msg, extra) {
        console.error("[UsgromanaGallery]", msg, extra ?? "");
        // sendRemoteLog("error", msg, extra);
    },
};
