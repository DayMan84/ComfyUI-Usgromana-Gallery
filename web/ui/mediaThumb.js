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

function videoFrameStyle(wrap, fit) {
    Object.assign(wrap.style, {
        position: "relative",
        width: "100%",
        height: fit === "cover" ? "100%" : "auto",
        minHeight: fit === "cover" ? "100%" : "72px",
        background: "#1e293b",
        aspectRatio: fit === "cover" ? "auto" : "16 / 9",
    });
}

function createPosterImage(thumbUrl, options) {
    const img = document.createElement("img");
    img.alt = options.alt || "";
    img.decoding = "async";
    fitStyle(img, options.fit);
    img.style.minHeight = options.fit === "cover" ? "100%" : "72px";
    img.dataset.usgPoster = "1";
    const useFallback = () => {
        if (img.dataset.usgFallback === "1") return;
        img.dataset.usgFallback = "1";
        img.src = FALLBACK_POSTER;
    };
    img.onerror = useFallback;
    img.dataset.usgThumbUrl = thumbUrl || "";
    return img;
}

function showPoster(img, thumbUrl) {
    img.dataset.usgFallback = "0";
    img.style.display = "block";
    const next = thumbUrl || FALLBACK_POSTER;
    if (img.getAttribute("src") !== next) img.src = next;
}

function createStaticVideoThumb(thumbUrl, mediaUrl, options) {
    const wrap = document.createElement("div");
    wrap.className = "usg-media-thumb usg-media-thumb-static";
    videoFrameStyle(wrap, options.fit);
    const img = createPosterImage(thumbUrl, options);
    wrap.appendChild(img);

    let settled = false;
    const succeed = () => {
        if (settled) return;
        settled = true;
        if (options.onLoad) options.onLoad();
    };
    img.addEventListener("load", succeed);
    whenVisible(wrap, options.lazy, options.onVisible, () => {
        showPoster(img, thumbUrl);
    });
    return wrap;
}

function createHoverVideo(thumbUrl, mediaUrl, options) {
    const wrap = document.createElement("div");
    wrap.className = "usg-media-thumb usg-media-thumb-hover";
    videoFrameStyle(wrap, options.fit);
    const img = createPosterImage(thumbUrl, options);
    const video = document.createElement("video");
    silence(video);
    video.preload = "none";
    video.controls = false;
    video.loop = true;
    video.poster = thumbUrl || FALLBACK_POSTER;
    fitStyle(video, options.fit);
    Object.assign(video.style, {
        position: "absolute",
        inset: "0",
        display: "none",
        pointerEvents: "none",
    });
    wrap.append(img, video);

    let settled = false;
    const succeed = () => {
        if (settled) return;
        settled = true;
        if (options.onLoad) options.onLoad();
    };
    img.addEventListener("load", succeed);

    wrap.addEventListener("mouseenter", () => {
        if (videoThumbnailMode() !== "hover") return;
        video.style.display = "block";
        if (!video.src) video.src = mediaUrl;
        video.addEventListener("playing", () => {
            img.style.visibility = "hidden";
        }, { once: true });
        playMuted(video);
    });
    wrap.addEventListener("mouseleave", () => {
        video.pause();
        try { video.currentTime = 0; } catch (err) { /* not seekable yet */ }
        video.style.display = "none";
        img.style.visibility = "visible";
    });

    whenVisible(wrap, options.lazy, options.onVisible, () => {
        showPoster(img, thumbUrl);
    });
    return wrap;
}

function createAlwaysVideo(thumbUrl, mediaUrl, options) {
    const wrap = document.createElement("div");
    wrap.className = "usg-media-thumb usg-media-thumb-always";
    videoFrameStyle(wrap, options.fit);
    const img = createPosterImage(thumbUrl, options);
    const video = document.createElement("video");
    silence(video);
    video.autoplay = true;
    video.loop = false;
    video.controls = false;
    video.preload = "auto";
    video.poster = thumbUrl || FALLBACK_POSTER;
    video.style.pointerEvents = "none";
    fitStyle(video, options.fit);
    Object.assign(video.style, {
        position: "absolute",
        inset: "0",
        opacity: "0",
    });
    bindTwoSecondLoop(video);
    let settled = false;
    const succeed = () => {
        if (settled) return;
        settled = true;
        if (options.onLoad) options.onLoad();
    };
    img.addEventListener("load", succeed);
    video.addEventListener("playing", () => {
        video.style.opacity = "1";
        succeed();
    });
    video.addEventListener("error", () => {
        video.style.display = "none";
        img.style.visibility = "visible";
        if (img.dataset.usgFallback !== "1" && !img.complete) showPoster(img, FALLBACK_POSTER);
        succeed();
    });
    wrap.append(img, video);
    whenVisible(wrap, options.lazy, options.onVisible, () => {
        showPoster(img, thumbUrl);
        video.src = mediaUrl;
        playMuted(video);
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
