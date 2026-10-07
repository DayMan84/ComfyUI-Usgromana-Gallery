// ComfyUI-Usgromana-Gallery/web/core/galleryButton.js
// Size of the floating Gallery pill. 1 matches the original button.

export const GALLERY_BUTTON_SCALE = {
    min: 0.75,
    max: 2.5,
    default: 1,
};

export function clampGalleryButtonScale(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return GALLERY_BUTTON_SCALE.default;
    return Math.min(GALLERY_BUTTON_SCALE.max, Math.max(GALLERY_BUTTON_SCALE.min, n));
}

export function galleryButtonMetrics(scale) {
    const s = clampGalleryButtonScale(scale);
    return {
        icon: 14 * s,
        padY: 6 * s,
        padX: 10 * s,
        minWidth: 110 * s,
        minHeight: 28 * s,
        fontSize: 12 * s,
        gap: 6 * s,
        radius: 6 * s,
    };
}

/** Anchored toolbar control and the floating pill are never shown together. */
export function galleryButtonVisibility(anchorToManagerBar) {
    const anchored = !!anchorToManagerBar;
    return {
        showPill: !anchored,
        showToolbar: anchored,
    };
}
