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

// Usgromana radial-menu launcher. 48px / 32px is its unscaled size.
export const PINWHEEL_BASE = { size: 48, icon: 32 };

export function pinwheelMetrics(scale) {
    const s = clampGalleryButtonScale(scale);
    return {
        size: PINWHEEL_BASE.size * s,
        icon: PINWHEEL_BASE.icon * s,
    };
}

function setImportant(el, prop, value) {
    el.style.setProperty(prop, value, "important");
}

/** Resize the floating Gallery pill and the pinwheel logo inside it. */
export function applyGalleryButtonScale(button, scale) {
    if (!button) return;
    const metrics = galleryButtonMetrics(scale);
    setImportant(button, "box-sizing", "content-box");
    setImportant(button, "padding", `${metrics.padY}px ${metrics.padX}px`);
    setImportant(button, "min-width", `${metrics.minWidth}px`);
    setImportant(button, "width", "auto");
    setImportant(button, "max-width", "none");
    setImportant(button, "min-height", `${metrics.minHeight}px`);
    setImportant(button, "height", "auto");
    setImportant(button, "font-size", `${metrics.fontSize}px`);
    setImportant(button, "gap", `${metrics.gap}px`);
    setImportant(button, "border-radius", `${metrics.radius}px`);
    const iconPx = `${metrics.icon}px`;
    button.querySelectorAll("img").forEach((icon) => {
        ["width", "height", "min-width", "min-height", "max-width", "max-height"].forEach((prop) => {
            setImportant(icon, prop, iconPx);
        });
    });
}

/** Resize the Usgromana pinwheel. Its own stylesheet locks 48px with !important. */
export function applyPinwheelScale(scale, root) {
    const scope = root || (typeof document !== "undefined" ? document : null);
    if (!scope || typeof scope.querySelectorAll !== "function") return;
    const metrics = pinwheelMetrics(scale);
    const size = `${metrics.size}px`;
    const iconPx = `${metrics.icon}px`;
    scope.querySelectorAll(".usgromana-floating-button").forEach((btn) => {
        if (btn.dataset.usgScaleLock === "1") return;
        const icon = btn.querySelector("img, .usgromana-floating-button-icon");
        const sized = btn.style.getPropertyValue("width") === size
            && (!icon || icon.style.getPropertyValue("width") === iconPx);
        if (sized) return;
        btn.dataset.usgScaleLock = "1";
        ["width", "height", "min-width", "min-height", "max-width", "max-height"].forEach((prop) => {
            setImportant(btn, prop, size);
        });
        btn.querySelectorAll("img, .usgromana-floating-button-icon").forEach((node) => {
            ["width", "height", "min-width", "min-height", "max-width", "max-height"].forEach((prop) => {
                setImportant(node, prop, iconPx);
            });
        });
        btn.dataset.usgScaleLock = "0";
    });
}

/** Anchored toolbar control and the floating pill are never shown together. */
export function galleryButtonVisibility(anchorToManagerBar) {
    const anchored = !!anchorToManagerBar;
    return {
        showPill: !anchored,
        showToolbar: anchored,
    };
}
