// ComfyUI-Usgromana-Gallery/web/ui/mediaThumb.js
// Grid and explorer thumbnails. Videos follow the video thumbnail setting.

import { API_ENDPOINTS } from "../core/constants.js";
import { getGallerySettings } from "../core/gallerySettings.js";
import { mediaKind } from "../core/mediaFilters.js";

const LOOP_SECONDS = 2;

// Shown immediately if the generated poster cannot be loaded, so a video cell
// is never a blank or broken image.
const FALLBACK_POSTER =
    "data:image/svg+xml," +
    encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="144" viewBox="0 0 256 144">' +
        '<rect width="256" height="144" fill="#1e293b"/>' +
        '<polygon points="108,52 108,92 156,72" fill="#e2e8f0"/>' +
        "</svg>"
    );

export function mediaUrls(item) {
    const rel = (item && (item.relpath || item.path || item.filename || item.name)) || "";
    const encoded = rel ? encodeURIComponent(rel) : "";
    const mediaUrl = (item && item.url) || (encoded ? `${API_ENDPOINTS.IMAGE}?filename=${encoded}` : "");
    const thumbUrl = (item && item.thumb_url) || (encoded ? `${API_ENDPOINTS.IMAGE}?filename=${encoded}&size=thumb` : mediaUrl);
    return { rel, mediaUrl, thumbUrl };
}

function videoThumbnailMode() {
    const mode = getGallerySettings().videoThumbnailMode;
    if (mode === "always" || mode === "static" || mode === "hover") return mode;
    return "hover";
}

function fitStyle(el, fit) {
    el.style.width = "100%";
    el.style.height = fit === "cover" ? "100%" : "auto";
    el.style.objectFit = fit === "cover" ? "cover" : "contain";
    el.style.display = "block";
    el.style.background = "#0f172a";
}

function silence(video) {
    video.muted = true;
    video.defaultMuted = true;
    video.volume = 0;
    video.setAttribute("muted", "");
    video.playsInline = true;
    video.setAttribute("playsinline", "");
}

function playMuted(video) {
    silence(video);
    const pending = video.play();
    if (pending && typeof pending.catch === "function") pending.catch(() => {});
}

function bindTwoSecondLoop(video) {
    const restart = () => {
        try {
            video.currentTime = 0;
        } catch (err) {
            // Ignore seek errors before metadata is ready.
        }
        playMuted(video);
    };
    video.addEventListener("timeupdate", () => {
        if (video.currentTime >= LOOP_SECONDS) restart();
    });
    video.addEventListener("ended", restart);
}

function whenVisible(element, lazy, onVisible, load) {
    const start = () => {
        if (element.dataset.usgLoaded === "1") return;
        element.dataset.usgLoaded = "1";
        if (onVisible) onVisible();
        load();
    };
    if (lazy && typeof IntersectionObserver !== "undefined") {
        const observer = new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) {
                start();
                observer.disconnect();
            }
        }, { rootMargin: "50px" });
        observer.observe(element);
        element._intersectionObserver = observer;
        return;
    }
    start();
}

function createImageThumb(thumbUrl, options) {
    const img = document.createElement("img");
    img.className = "usg-media-thumb";
    img.alt = options.alt || "";
    img.decoding = "async";
    fitStyle(img, options.fit);
    img.style.opacity = "0";
    img.style.transition = "opacity 0.2s ease";
    if (options.large) img.style.willChange = "contents";
    img.onload = () => {
        img.style.opacity = "1";
        if (img.style.willChange === "contents") img.style.willChange = "auto";
        if (options.onLoad) options.onLoad();
    };
    img.onerror = () => {
        if (options.onError) options.onError();
    };
    whenVisible(img, options.lazy, options.onVisible, () => {
        img.src = thumbUrl;
        setTimeout(() => {
            if (img.complete && img.naturalWidth > 0 && img.onload) img.onload();
        }, 10);
    });
    return img;
}

function posterSource(thumbUrl) {
    if (!thumbUrl) return "";
    if (thumbUrl.startsWith("data:")) return thumbUrl;
    if (/[?&]size=thumb(?:&|$)/.test(thumbUrl)) return thumbUrl;
    return `${thumbUrl}${thumbUrl.includes("?") ? "&" : "?"}size=thumb`;
}

const frameCaptureQueue = [];
let frameCapturesActive = 0;

function captureVideoFrame(mediaUrl) {
    return new Promise((resolve, reject) => {
        const video = document.createElement("video");
        silence(video);
        video.preload = "auto";
        video.src = mediaUrl;
        let settled = false;
        const finish = (err, url) => {
            if (settled) return;
            settled = true;
            video.pause();
            video.removeAttribute("src");
            try { video.load(); } catch (loadErr) { /* already detached */ }
            if (err) reject(err);
            else resolve(url);
        };
        video.addEventListener("error", () => finish(new Error("frame")), { once: true });
        const draw = () => {
            const width = video.videoWidth;
            const height = video.videoHeight;
            if (!width || !height) {
                finish(new Error("frame"));
                return;
            }
            const scale = Math.min(1, 512 / Math.max(width, height));
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(width * scale));
            canvas.height = Math.max(1, Math.round(height * scale));
            const context = canvas.getContext("2d");
            if (!context) {
                finish(new Error("frame"));
                return;
            }
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            try {
                finish(null, canvas.toDataURL("image/jpeg", 0.86));
            } catch (err) {
                finish(err);
            }
        };
        video.addEventListener("loadeddata", () => {
            const duration = video.duration;
            const target = Number.isFinite(duration) && duration > 0 ? Math.min(0.2, duration * 0.1) : 0;
            if (target > 0.01) {
                video.addEventListener("seeked", draw, { once: true });
                try {
                    video.currentTime = target;
                } catch (err) {
                    draw();
                }
            } else {
                draw();
            }
        }, { once: true });
    });
}

function enqueueFrameCapture(mediaUrl, onFrame) {
    if (!mediaUrl) return;
    frameCaptureQueue.push({ mediaUrl, onFrame });
    const pump = () => {
        while (frameCapturesActive < 2 && frameCaptureQueue.length) {
            const job = frameCaptureQueue.shift();
            frameCapturesActive += 1;
            captureVideoFrame(job.mediaUrl).then(job.onFrame).catch(() => {}).finally(() => {
                frameCapturesActive -= 1;
                pump();
            });
        }
    };
    pump();
}

function createVideoFrame(thumbUrl, mediaUrl, options, className) {
    const wrap = document.createElement("div");
    wrap.className = `usg-media-thumb usg-video-frame ${className}`;
    wrap.style.width = "100%";
    if (options.fit === "cover") {
        wrap.style.height = "100%";
    }

    const img = document.createElement("img");
    img.className = "usg-video-poster";
    img.alt = options.alt || "";
    img.decoding = "async";
    fitStyle(img, options.fit);
    let reported = false;
    const reportLoad = () => {
        if (reported) return;
        reported = true;
        if (options.onLoad) options.onLoad();
    };
    img.addEventListener("load", reportLoad);
    img.addEventListener("error", () => {
        if (img.dataset.usgFrame === "1" || img.dataset.usgFallback === "1") return;
        img.dataset.usgFallback = "1";
        img.src = FALLBACK_POSTER;
    });
    wrap.appendChild(img);
    if (options.onVisible) options.onVisible();

    const serverPoster = posterSource(thumbUrl);
    if (serverPoster) img.src = serverPoster;
    else img.src = FALLBACK_POSTER;

    enqueueFrameCapture(mediaUrl, (dataUrl) => {
        if (!img.isConnected) return;
        img.dataset.usgFrame = "1";
        img.dataset.usgFallback = "0";
        img.src = dataUrl;
    });
    return { wrap, img };
}

/**
 * Poster for a preview side button. Same sources as a grid video cell:
 * the generated thumb, then a captured frame, then the play-icon fallback.
 * The caller keeps the button's blur filter on this image.
 */
export function attachVideoSidePoster(img, item, stillCurrent) {
    if (!img) return;
    const current = () => (typeof stillCurrent !== "function" || stillCurrent()) && img.isConnected;
    const { mediaUrl, thumbUrl } = mediaUrls(item);
    const poster = posterSource(thumbUrl);
    const useFallback = () => {
        if (!current() || img.dataset.usgFallback === "1") return;
        img.dataset.usgFallback = "1";
        img.src = FALLBACK_POSTER;
    };
    img.onerror = () => useFallback();
    img.dataset.usgFrame = "0";
    img.dataset.usgFallback = "1";
    img.src = FALLBACK_POSTER;
    if (poster) {
        const probe = new Image();
        probe.onload = () => {
            if (!current() || img.dataset.usgFrame === "1") return;
            img.dataset.usgFallback = "0";
            img.src = poster;
        };
        probe.src = poster;
    }
    enqueueFrameCapture(mediaUrl, (dataUrl) => {
        if (!current()) return;
        img.dataset.usgFrame = "1";
        img.dataset.usgFallback = "0";
        img.src = dataUrl;
    });
}

function createPlaybackVideo(fit) {
    const video = document.createElement("video");
    silence(video);
    video.preload = "none";
    video.controls = false;
    video.playsInline = true;
    fitStyle(video, fit);
    video.style.display = "none";
    video.style.pointerEvents = "none";
    return video;
}

function showStill(img, video) {
    img.style.display = "block";
    if (video) video.style.display = "none";
}

function showPlayback(img, video) {
    video.style.display = "block";
    img.style.display = "none";
}

function createStaticVideoThumb(thumbUrl, mediaUrl, options) {
    const { wrap } = createVideoFrame(thumbUrl, mediaUrl, options, "usg-media-thumb-static");
    return wrap;
}

function createHoverVideo(thumbUrl, mediaUrl, options) {
    const { wrap, img } = createVideoFrame(thumbUrl, mediaUrl, options, "usg-media-thumb-hover");
    const video = createPlaybackVideo(options.fit);
    video.loop = true;
    wrap.appendChild(video);

    let hovering = false;
    wrap.addEventListener("mouseenter", () => {
        if (videoThumbnailMode() !== "hover") return;
        hovering = true;
        if (!video.getAttribute("src")) video.src = mediaUrl;
        playMuted(video);
    });
    wrap.addEventListener("mouseleave", () => {
        hovering = false;
        video.pause();
        try { video.currentTime = 0; } catch (err) { /* not seekable yet */ }
        showStill(img, video);
    });
    video.addEventListener("playing", () => {
        if (hovering) showPlayback(img, video);
    });
    video.addEventListener("pause", () => showStill(img, video));
    video.addEventListener("error", () => showStill(img, video));
    return wrap;
}

function createAlwaysVideo(thumbUrl, mediaUrl, options) {
    const { wrap, img } = createVideoFrame(thumbUrl, mediaUrl, options, "usg-media-thumb-always");
    const video = createPlaybackVideo(options.fit);
    video.autoplay = true;
    video.preload = "auto";
    video.loop = false;
    bindTwoSecondLoop(video);
    video.addEventListener("playing", () => showPlayback(img, video));
    video.addEventListener("pause", () => showStill(img, video));
    video.addEventListener("ended", () => showStill(img, video));
    video.addEventListener("error", () => showStill(img, video));
    wrap.appendChild(video);
    video.src = mediaUrl;
    playMuted(video);
    return wrap;
}

/**
 * Thumbnail element for a gallery image or video.
 * Video modes: hover (default), always (2s loop), static.
 */
export function createMediaThumb(item, options = {}) {
    const fit = options.fit === "cover" ? "cover" : "contain";
    const size = item && (item.file_size || item.size || item.bytes || 0);
    const settings = {
        fit,
        lazy: !!options.lazy,
        alt: options.alt || (item && (item.filename || item.name)) || "",
        large: size > 10 * 1024 * 1024,
        onLoad: options.onLoad,
        onError: options.onError,
        onVisible: options.onVisible,
    };
    if (mediaKind(item) !== "video") {
        const { thumbUrl } = mediaUrls(item);
        return createImageThumb(thumbUrl, settings);
    }
    const { mediaUrl, thumbUrl } = mediaUrls(item);
    const mode = videoThumbnailMode();
    if (mode === "static") return createStaticVideoThumb(thumbUrl, mediaUrl, settings);
    if (mode === "always") return createAlwaysVideo(thumbUrl, mediaUrl, settings);
    return createHoverVideo(thumbUrl, mediaUrl, settings);
}
