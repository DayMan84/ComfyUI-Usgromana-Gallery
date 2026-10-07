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

// Usgromana radial-menu launcher. These match floating_button.js at scale 1.
export const PINWHEEL_BASE = {
    size: 48,
    icon: 32,
    item: 24,
    itemIcon: 16,
    radius: 50,
    padding: 20,
};

export function pinwheelMetrics(scale) {
    const s = clampGalleryButtonScale(scale);
    return {
        size: PINWHEEL_BASE.size * s,
        icon: PINWHEEL_BASE.icon * s,
        item: PINWHEEL_BASE.item * s,
        itemIcon: PINWHEEL_BASE.itemIcon * s,
        radius: PINWHEEL_BASE.radius * s,
    };
}

/**
 * Same quadrant fan as Usgromana's radial menu.
 * 0 = right, π/2 = down, π = left, 3π/2 = up.
 * Top-left opens right then down, into the canvas.
 */
export function pinwheelFanLayout({
    scale = 1,
    left = 0,
    top = 0,
    width,
    height,
    viewportWidth,
    viewportHeight,
    count = 0,
}) {
    const metrics = pinwheelMetrics(scale);
    const boxW = width == null ? metrics.size : width;
    const boxH = height == null ? metrics.size : height;
    const centerX = left + boxW / 2;
    const centerY = top + boxH / 2;
    const w = viewportWidth;
    const h = viewportHeight;
    const pad = PINWHEEL_BASE.padding;
    const buttonSize = metrics.item;
    const midX1 = w * 0.33;
    const midX2 = w * 0.67;
    const midY1 = h * 0.33;
    const midY2 = h * 0.67;
    const inMiddle = centerX >= midX1 && centerX <= midX2 && centerY >= midY1 && centerY <= midY2;
    const isLeft = centerX < w / 2;
    const isTop = centerY < h / 2;

    let arcStart = -Math.PI / 2;
    let arcEnd = arcStart + 2 * Math.PI;
    let maxRadius;
    if (inMiddle) {
        arcStart = -Math.PI / 2;
        arcEnd = arcStart + 2 * Math.PI;
        maxRadius = Math.min(
            Math.min(centerX - pad, w - centerX - pad),
            Math.min(centerY - pad, h - centerY - pad)
        ) - buttonSize / 2;
    } else if (isTop && isLeft) {
        arcStart = 0;
        arcEnd = Math.PI / 2;
        maxRadius = Math.min(w - centerX - pad, h - centerY - pad) - buttonSize / 2;
    } else if (isTop && !isLeft) {
        arcStart = Math.PI / 2;
        arcEnd = Math.PI;
        maxRadius = Math.min(centerX - pad, h - centerY - pad) - buttonSize / 2;
    } else if (!isTop && !isLeft) {
        arcStart = Math.PI;
        arcEnd = (3 * Math.PI) / 2;
        maxRadius = Math.min(centerX - pad, centerY - pad) - buttonSize / 2;
    } else {
        arcStart = (3 * Math.PI) / 2;
        arcEnd = 2 * Math.PI;
        maxRadius = Math.min(w - centerX - pad, centerY - pad) - buttonSize / 2;
    }

    const radius = Math.min(metrics.radius, Math.max(0, maxRadius));
    const span = arcEnd - arcStart;
    const angles = [];
    if (count === 1) angles.push(arcStart + span / 2);
    else if (count > 1) {
        const step = span / (count - 1);
        for (let i = 0; i < count; i += 1) angles.push(arcStart + i * step);
    }

    const items = angles.map((angle) => {
        let dx = Math.cos(angle) * radius;
        let dy = Math.sin(angle) * radius;
        const half = buttonSize / 2;
        const finalX = centerX + dx;
        const finalY = centerY + dy;
        if (finalX - half < pad) dx = pad + half - centerX;
        else if (finalX + half > w - pad) dx = (w - pad - half) - centerX;
        if (finalY - half < pad) dy = pad + half - centerY;
        else if (finalY + half > h - pad) dy = (h - pad - half) - centerY;
        return { dx, dy };
    });

    return {
        centerX,
        centerY,
        hub: metrics.size,
        hubIcon: metrics.icon,
        item: metrics.item,
        icon: metrics.itemIcon,
        radius,
        items,
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

function px(value) {
    return `${Math.round(value * 100) / 100}px`;
}

/** Resize the Usgromana pinwheel hub. Its stylesheet locks 48px with !important. */
export function applyPinwheelHub(scale, root) {
    const scope = root || (typeof document !== "undefined" ? document : null);
    if (!scope || typeof scope.querySelectorAll !== "function") return;
    const metrics = pinwheelMetrics(scale);
    const size = px(metrics.size);
    const iconPx = px(metrics.icon);
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

/** Resize the fanned menu and recompute its arc from the scaled hub. */
export function applyPinwheelFan(scale, root) {
    const scope = root || (typeof document !== "undefined" ? document : null);
    if (!scope || typeof scope.querySelector !== "function" || typeof window === "undefined") return;
    const hub = scope.querySelector(".usgromana-floating-button");
    const menu = scope.querySelector(".usgromana-radial-menu");
    if (!hub || !menu) return;
    const rect = hub.getBoundingClientRect();
    const buttons = Array.from(menu.querySelectorAll(".usgromana-radial-menu-button"));
    const layout = pinwheelFanLayout({
        scale,
        left: rect.left,
        top: rect.top,
        width: rect.width || pinwheelMetrics(scale).size,
        height: rect.height || pinwheelMetrics(scale).size,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        count: buttons.length,
    });
    const originX = px(layout.centerX);
    const originY = px(layout.centerY);
    const itemPx = px(layout.item);
    const iconPx = px(layout.icon);
    const open = menu.classList.contains("active");
    let dirty = menu.style.getPropertyValue("left") !== originX
        || menu.style.getPropertyValue("top") !== originY;
    buttons.forEach((btn, index) => {
        const item = layout.items[index];
        if (!item) return;
        const dx = px(item.dx);
        const dy = px(item.dy);
        if (btn.style.getPropertyValue("--dx") !== dx) dirty = true;
        if (btn.style.getPropertyValue("--dy") !== dy) dirty = true;
        if (btn.style.getPropertyValue("width") !== itemPx) dirty = true;
        if (btn.style.getPropertyValue("height") !== itemPx) dirty = true;
        const icon = btn.querySelector(".usgromana-radial-menu-button-icon");
        if (icon && icon.style.getPropertyValue("font-size") !== iconPx) dirty = true;
        if (open) {
            const placed = `translate(-50%, -50%) translate(${dx}, ${dy}) scale(1)`;
            if (btn.style.getPropertyValue("transform") !== placed) dirty = true;
        }
    });
    if (!dirty) return;
    setImportant(menu, "left", originX);
    setImportant(menu, "top", originY);
    setImportant(menu, "position", "fixed");
    buttons.forEach((btn, index) => {
        const item = layout.items[index];
        if (!item) return;
        const dx = px(item.dx);
        const dy = px(item.dy);
        ["width", "height", "min-width", "min-height", "max-width", "max-height"].forEach((prop) => {
            setImportant(btn, prop, itemPx);
        });
        btn.style.setProperty("--dx", dx);
        btn.style.setProperty("--dy", dy);
        const icon = btn.querySelector(".usgromana-radial-menu-button-icon");
        if (icon) setImportant(icon, "font-size", iconPx);
        // Usgromana places an open item with this transform. Rewrite it when the
        // captured offset still belongs to the unscaled 48px hub, and skip the
        // transition so it does not animate out of the old clipped position.
        if (open || btn.classList.contains("animate-in")) {
            const placed = `translate(-50%, -50%) translate(${dx}, ${dy}) scale(1)`;
            if (btn.style.getPropertyValue("transform") !== placed) {
                setImportant(btn, "transition", "none");
                setImportant(btn, "transform", placed);
                void btn.offsetWidth;
                btn.style.removeProperty("transition");
            }
        }
    });
}

/** Resize the Usgromana pinwheel hub and its fanned menu together. */
export function applyPinwheelScale(scale, root) {
    applyPinwheelHub(scale, root);
    applyPinwheelFan(scale, root);
}

/** Anchored toolbar control and the floating pill are never shown together. */
export function galleryButtonVisibility(anchorToManagerBar) {
    const anchored = !!anchorToManagerBar;
    return {
        showPill: !anchored,
        showToolbar: anchored,
    };
}
