/**
 * One slide-out panel for share, comments, notification settings, and appearance.
 * It sits beside its parent, flips at the viewport edge, and closes on Escape,
 * outside click, resize, or parent removal.
 */

const STYLE_ID = "usg-slideout-style";

function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
.usg-scrollable { overflow-y: auto; scrollbar-width: none; -ms-overflow-style: none; }
.usg-scrollable::-webkit-scrollbar { width: 0; height: 0; display: none; }
.usg-slideout {
  position: fixed;
  z-index: 1000003;
  display: flex;
  flex-direction: column;
  color: var(--usg-text, #e5e7eb);
  background: var(--usg-panel, rgba(15, 23, 42, 0.96));
  border: 1px solid var(--usg-border, rgba(148, 163, 184, 0.45));
  border-radius: 12px;
  box-shadow: var(--usg-shadow, 0 16px 40px rgba(0, 0, 0, 0.45));
  overflow: hidden;
}
.usg-slideout header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--usg-divider, rgba(148, 163, 184, 0.28));
  font-weight: 600;
}
.usg-slideout header button {
  background: transparent;
  color: inherit;
  border: 0;
  cursor: pointer;
  font-size: 16px;
}
.usg-slideout .usg-slideout-body { padding: 10px 12px; }
.usg-slideout button:focus-visible,
.usg-slideout input:focus-visible,
.usg-slideout select:focus-visible,
.usg-slideout textarea:focus-visible {
  outline: 2px solid var(--usg-accent, #38bdf8);
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .usg-slideout { transition: none !important; }
}
`;
    document.head.appendChild(style);
}

function reducedMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function createSlideoutMenu({
    anchor,
    parentMenu = null,
    title = "",
    width = 280,
    maxHeight = 420,
    content,
    preferredDirection = "right",
    onClose = null,
}) {
    ensureStyles();
    const previous = document.getElementById("usg-slideout-menu");
    if (previous) previous.remove();

    const panel = document.createElement("section");
    panel.id = "usg-slideout-menu";
    panel.className = "usg-slideout";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", title || "Menu");
    panel.style.width = `${width}px`;
    panel.style.maxHeight = `${maxHeight}px`;
    panel.tabIndex = -1;

    const header = document.createElement("header");
    const back = document.createElement("button");
    back.type = "button";
    back.textContent = "‹";
    back.setAttribute("aria-label", "Close");
    const heading = document.createElement("div");
    heading.textContent = title;
    header.appendChild(back);
    header.appendChild(heading);

    const body = document.createElement("div");
    body.className = "usg-slideout-body usg-scrollable";
    body.style.overflowY = "auto";
    body.style.maxHeight = `${maxHeight - 52}px`;
    if (content) body.appendChild(content);

    panel.appendChild(header);
    panel.appendChild(body);
    document.body.appendChild(panel);

    const place = () => {
        const anchorRect = (anchor || parentMenu || panel).getBoundingClientRect();
        const panelRect = panel.getBoundingClientRect();
        const spaceRight = window.innerWidth - anchorRect.right;
        const spaceLeft = anchorRect.left;
        let direction = preferredDirection;
        if (direction === "right" && spaceRight < panelRect.width + 12 && spaceLeft > spaceRight) {
            direction = "left";
        } else if (direction === "left" && spaceLeft < panelRect.width + 12 && spaceRight > spaceLeft) {
            direction = "right";
        }
        let left = direction === "left" ? anchorRect.left - panelRect.width - 8 : anchorRect.right + 8;
        left = Math.max(8, Math.min(left, window.innerWidth - panelRect.width - 8));
        let top = anchorRect.top;
        top = Math.max(8, Math.min(top, window.innerHeight - panelRect.height - 8));
        panel.style.left = `${left}px`;
        panel.style.top = `${top}px`;
        if (!reducedMotion()) {
            panel.style.transition = "transform 140ms ease, opacity 140ms ease";
        }
        panel.style.transform = "translateX(0)";
        panel.style.opacity = "1";
    };

    panel.style.opacity = "0";
    panel.style.transform = preferredDirection === "left" ? "translateX(8px)" : "translateX(-8px)";
    requestAnimationFrame(place);

    const close = () => {
        document.removeEventListener("keydown", onKey);
        document.removeEventListener("mousedown", onDown);
        window.removeEventListener("resize", place);
        observer.disconnect();
        panel.remove();
        if (onClose) onClose();
    };
    const onKey = (event) => {
        if (event.key === "Escape") {
            event.stopPropagation();
            close();
        }
    };
    const onDown = (event) => {
        if (panel.contains(event.target)) return;
        if (anchor && anchor.contains && anchor.contains(event.target)) return;
        if (parentMenu && parentMenu.contains && parentMenu.contains(event.target)) return;
        close();
    };
    const observer = new MutationObserver(() => {
        if (parentMenu && !parentMenu.isConnected) close();
        if (anchor && !anchor.isConnected) close();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    back.onclick = (event) => {
        event.stopPropagation();
        close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("resize", place);
    panel.focus();

    return { close, element: panel, body };
}
