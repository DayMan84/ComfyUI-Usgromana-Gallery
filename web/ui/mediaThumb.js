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

function ensureVideoFrameStyles() {
    if (document.getElementById("usg-video-frame-style")) return;
    const style = document.createElement("style");
    style.id = "usg-video-frame-style";
    style.textContent = `
        .usg-video-frame {
            position: relative;
            width: 100%;
            aspect-ratio: 16 / 9;
            overflow: hidden;
            background: #1e293b center / contain no-repeat;
        }
        .usg-video-frame.is-cover {
            height: 100%;
            aspect-ratio: auto;
        }
        .usg-video-frame .usg-video-poster {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            object-fit: contain;
            display: block;
            background: transparent;
        }
        .usg-video-frame.is-cover .usg-video-poster,
        .usg-video-frame.is-cover video {
            object-fit: cover;
        }
        .usg-video-frame video {
            display: none !important;
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
            pointer-events: none;
            background: #000;
        }
        .usg-video-frame.is-playing video {
            display: block !important;
        }
        .usg-video-frame.is-playing .usg-video-poster {
            visibility: hidden;
        }
    `;
    document.head.appendChild(style);
}

function posterSource(thumbUrl) {
    if (!thumbUrl) return FALLBACK_POSTER;
    if (thumbUrl.startsWith("data:")) return thumbUrl;
    if (/[?&]size=thumb(?:&|$)/.test(thumbUrl)) return thumbUrl;
    return `${thumbUrl}${thumbUrl.includes("?") ? "&" : "?"}size=thumb`;
}

function createVideoFrame(thumbUrl, options, className) {
    ensureVideoFrameStyles();
    const wrap = document.createElement("div");
    wrap.className = `usg-media-thumb usg-video-frame ${className}`;
    if (options.fit === "cover") wrap.classList.add("is-cover");
    wrap.style.backgroundImage = `url("${FALLBACK_POSTER}")`;

    const img = document.createElement("img");
    img.className = "usg-video-poster";
    img.alt = options.alt || "";
    img.decoding = "async";
    img.dataset.usgPoster = "1";
    const poster = posterSource(thumbUrl);
    img.addEventListener("error", () => {
        if (img.dataset.usgFallback === "1") return;
        img.dataset.usgFallback = "1";
        img.src = FALLBACK_POSTER;
    });
    let reported = false;
    const reportLoad = () => {
        if (reported) return;
        reported = true;
        if (options.onLoad) options.onLoad();
    };
    img.addEventListener("load", reportLoad);
    wrap.appendChild(img);
    if (options.onVisible) options.onVisible();
    img.src = poster;
    return { wrap, img, poster };
}

function createPlaybackVideo(poster) {
    const video = document.createElement("video");
    silence(video);
    video.preload = "none";
    video.controls = false;
    video.poster = poster;
    video.setAttribute("poster", poster);
    return video;
}

function markPlaying(wrap, playing) {
    wrap.classList.toggle("is-playing", !!playing);
}

function createStaticVideoThumb(thumbUrl, _mediaUrl, options) {
    const { wrap } = createVideoFrame(thumbUrl, options, "usg-media-thumb-static");
    return wrap;
}

function createHoverVideo(thumbUrl, mediaUrl, options) {
    const { wrap, poster } = createVideoFrame(thumbUrl, options, "usg-media-thumb-hover");
    const video = createPlaybackVideo(poster);
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
        markPlaying(wrap, false);
    });
    video.addEventListener("playing", () => {
        if (hovering) markPlaying(wrap, true);
    });
    video.addEventListener("pause", () => markPlaying(wrap, false));
    video.addEventListener("error", () => markPlaying(wrap, false));
    return wrap;
}

function createAlwaysVideo(thumbUrl, mediaUrl, options) {
    const { wrap, poster } = createVideoFrame(thumbUrl, options, "usg-media-thumb-always");
    const video = createPlaybackVideo(poster);
    video.autoplay = true;
    video.preload = "auto";
    video.loop = false;
    bindTwoSecondLoop(video);
    video.addEventListener("playing", () => markPlaying(wrap, true));
    video.addEventListener("pause", () => markPlaying(wrap, false));
    video.addEventListener("ended", () => markPlaying(wrap, false));
    video.addEventListener("error", () => markPlaying(wrap, false));
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
