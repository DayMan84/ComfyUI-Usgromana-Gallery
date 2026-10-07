// ComfyUI-Usgromana-Gallery/web/ui/mediaThumb.js
// Grid and explorer thumbnails. Videos follow the video thumbnail setting.

import { API_ENDPOINTS } from "../core/constants.js";
import { getGallerySettings } from "../core/gallerySettings.js";
import { mediaKind } from "../core/mediaFilters.js";

const LOOP_SECONDS = 2;

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

function createStaticVideoThumb(thumbUrl, mediaUrl, options) {
    const wrap = document.createElement("div");
    wrap.className = "usg-media-thumb usg-media-thumb-static";
    Object.assign(wrap.style, {
        position: "relative",
        width: "100%",
        height: options.fit === "cover" ? "100%" : "auto",
    });
    const img = document.createElement("img");
    img.alt = options.alt || "";
    img.decoding = "async";
    fitStyle(img, options.fit);
    const video = document.createElement("video");
    silence(video);
    video.preload = "metadata";
    video.controls = false;
    video.autoplay = false;
    video.loop = false;
    fitStyle(video, options.fit);
    video.style.display = "none";
    video.style.pointerEvents = "none";
    wrap.append(img, video);

    let settled = false;
    const succeed = () => {
        if (settled) return;
        settled = true;
        if (options.onLoad) options.onLoad();
    };
    const fail = () => {
        if (settled) return;
        settled = true;
        if (options.onError) options.onError();
    };
    img.onload = succeed;
    img.onerror = () => {
        img.style.display = "none";
        video.style.display = "block";
        video.src = mediaUrl;
        video.addEventListener("loadeddata", succeed, { once: true });
        video.addEventListener("error", fail, { once: true });
    };
    whenVisible(wrap, options.lazy, options.onVisible, () => {
        img.src = thumbUrl;
    });
    return wrap;
}

function createHoverVideo(thumbUrl, mediaUrl, options) {
    const wrap = document.createElement("div");
    wrap.className = "usg-media-thumb usg-media-thumb-hover";
    Object.assign(wrap.style, {
        position: "relative",
        width: "100%",
        height: options.fit === "cover" ? "100%" : "auto",
    });
    const img = document.createElement("img");
    img.alt = options.alt || "";
    img.decoding = "async";
    fitStyle(img, options.fit);
    const video = document.createElement("video");
    silence(video);
    video.preload = "none";
    video.controls = false;
    video.loop = true;
    video.poster = thumbUrl;
    fitStyle(video, options.fit);
    video.style.display = "none";
    video.style.pointerEvents = "none";
    wrap.append(img, video);

    let settled = false;
    const succeed = () => {
        if (settled) return;
        settled = true;
        if (options.onLoad) options.onLoad();
    };
    img.onload = succeed;
    img.onerror = () => {
        img.style.display = "none";
        video.style.display = "block";
        video.preload = "metadata";
        video.src = mediaUrl;
        video.addEventListener("loadeddata", () => {
            video.pause();
            succeed();
        }, { once: true });
        video.addEventListener("error", () => {
            if (!settled && options.onError) options.onError();
            settled = true;
        }, { once: true });
    };

    wrap.addEventListener("mouseenter", () => {
        if (videoThumbnailMode() !== "hover") return;
        img.style.display = "none";
        video.style.display = "block";
        if (!video.src) video.src = mediaUrl;
        playMuted(video);
    });
    wrap.addEventListener("mouseleave", () => {
        video.pause();
        try { video.currentTime = 0; } catch (err) { /* not seekable yet */ }
        if (img.naturalWidth > 0) {
            video.style.display = "none";
            img.style.display = "block";
        }
    });

    whenVisible(wrap, options.lazy, options.onVisible, () => {
        img.src = thumbUrl;
    });
    return wrap;
}

function createAlwaysVideo(thumbUrl, mediaUrl, options) {
    const wrap = document.createElement("div");
    wrap.className = "usg-media-thumb usg-media-thumb-always";
    Object.assign(wrap.style, {
        position: "relative",
        width: "100%",
        height: options.fit === "cover" ? "100%" : "auto",
    });
    const video = document.createElement("video");
    silence(video);
    video.autoplay = true;
    video.loop = false;
    video.controls = false;
    video.preload = "auto";
    video.poster = thumbUrl;
    video.style.pointerEvents = "none";
    fitStyle(video, options.fit);
    bindTwoSecondLoop(video);
    video.addEventListener("loadeddata", () => {
        playMuted(video);
        if (options.onLoad) options.onLoad();
    }, { once: true });
    video.addEventListener("error", () => {
        if (options.onError) options.onError();
    }, { once: true });
    wrap.appendChild(video);
    whenVisible(wrap, options.lazy, options.onVisible, () => {
        video.src = mediaUrl;
    });
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
