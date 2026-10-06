/**
 * Comments and ratings for one image.
 * The right-click menu, the preview drawer, and notification links all use this panel.
 * Comment text is assigned with textContent.
 */

import {
    createComment,
    deleteComment,
    getComments,
    setRating,
    updateComment,
} from "../core/socialApi.js";

function stars(value) {
    const rounded = Math.round(Number(value) || 0);
    return "★★★★★☆☆☆☆☆".slice(5 - Math.min(5, Math.max(0, rounded)), 10 - Math.min(5, Math.max(0, rounded)));
}

function when(iso) {
    const then = Date.parse(iso);
    if (!then) return "";
    const minutes = Math.max(0, (Date.now() - then) / 60000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${Math.floor(minutes)} minutes ago`;
    const hours = minutes / 60;
    if (hours < 24) return `${Math.floor(hours)} hours ago`;
    return new Date(then).toLocaleString();
}

function buttonStyle() {
    return [
        "background:transparent",
        "color:var(--usg-text-secondary, #94a3b8)",
        "border:0",
        "cursor:pointer",
        "font-size:12px",
        "padding:0 4px",
    ].join(";");
}

export class CommentsPanel {
    constructor({ imageId, mode = "slideout", onRatingChanged = null, onCommentChanged = null, focusCommentId = null }) {
        this.imageId = imageId;
        this.mode = mode;
        this.onRatingChanged = onRatingChanged;
        this.onCommentChanged = onCommentChanged;
        this.focusCommentId = focusCommentId;
        this.data = null;
        this.pendingRating = null;
        this.element = document.createElement("div");
        this.element.className = "usg-comments-panel";
        this.element.style.cssText = "display:flex;flex-direction:column;gap:10px;min-width:240px;color:var(--usg-text, #e5e7eb);";
        this.status = document.createElement("div");
        this.status.style.cssText = "font-size:12px;color:var(--usg-text-secondary, #94a3b8);";
        this.status.textContent = "Loading comments…";
        this.element.appendChild(this.status);
    }

    async load() {
        try {
            this.data = await getComments(this.imageId);
            this.render();
            if (this.focusCommentId) this.focusComment(this.focusCommentId);
        } catch (err) {
            this.status.textContent = err.message || "Comments are unavailable.";
        }
    }

    focusComment(commentId) {
        const node = this.element.querySelector(`[data-comment-id="${CSS.escape(commentId)}"]`);
        if (!node) return;
        node.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
        const previous = node.style.background;
        node.style.background = "var(--usg-accent-hover, rgba(56, 189, 248, 0.28))";
        window.setTimeout(() => {
            node.style.background = previous;
        }, 900);
    }

    render() {
        const data = this.data || {};
        this.element.replaceChildren();
        const summary = document.createElement("div");
        const average = typeof data.average_rating === "number" ? data.average_rating : null;
        const count = data.rating_count || 0;
        const community = document.createElement("div");
        community.textContent = "Community Rating";
        community.style.fontSize = "12px";
        const score = document.createElement("div");
        score.textContent = count
            ? `${stars(average)} ${average.toFixed(1)} · ${count} ratings`
            : "No community ratings yet";
        score.style.color = "var(--usg-star, #ffd86b)";
        const yours = document.createElement("div");
        yours.textContent = "Your Rating";
        yours.style.cssText = "margin-top:8px;font-size:12px;";
        const starRow = document.createElement("div");
        starRow.setAttribute("role", "group");
        starRow.setAttribute("aria-label", "Your rating");
        const mine = this.pendingRating != null ? this.pendingRating : data.my_rating;
        for (let value = 1; value <= 5; value += 1) {
            const star = document.createElement("button");
            star.type = "button";
            star.textContent = value <= (mine || 0) ? "★" : "☆";
            star.setAttribute("aria-label", value === 1 ? "Rate 1 star" : `Rate ${value} stars`);
            star.style.cssText = "background:transparent;border:0;cursor:pointer;color:var(--usg-star, #ffd86b);font-size:18px;padding:0 2px;";
            star.onclick = () => this.rate(value);
            starRow.appendChild(star);
        }
        summary.append(community, score, yours, starRow);
        this.element.appendChild(summary);

        const list = document.createElement("div");
        list.className = "usg-scrollable";
        list.style.cssText = "display:flex;flex-direction:column;gap:10px;max-height:280px;overflow:auto;";
        (data.comments || []).forEach((comment) => list.appendChild(this.commentNode(comment)));
        if (!(data.comments || []).length) {
            const empty = document.createElement("div");
            empty.textContent = "No comments yet.";
            empty.style.cssText = "font-size:12px;color:var(--usg-text-secondary, #94a3b8);";
            list.appendChild(empty);
        }
        this.element.appendChild(list);

        const form = document.createElement("form");
        const field = document.createElement("textarea");
        field.placeholder = "Add a comment...";
        field.maxLength = 4000;
        field.rows = 3;
        field.style.cssText = "width:100%;box-sizing:border-box;resize:vertical;border-radius:8px;border:1px solid var(--usg-border, #455363);background:transparent;color:inherit;padding:8px;";
        const row = document.createElement("div");
        row.style.cssText = "display:flex;justify-content:flex-end;margin-top:6px;";
        const submit = document.createElement("button");
        submit.type = "submit";
        submit.textContent = "Submit";
        submit.style.cssText = "border:0;border-radius:8px;padding:6px 12px;cursor:pointer;background:var(--usg-button-bg, #263747);color:var(--usg-text, white);";
        row.appendChild(submit);
        form.append(field, row);
        form.onsubmit = async (event) => {
            event.preventDefault();
            const body = field.value.trim();
            if (!body) return;
            submit.disabled = true;
            try {
                await createComment(this.imageId, body);
                field.value = "";
                await this.load();
                if (this.onCommentChanged) this.onCommentChanged();
            } catch (err) {
                this.showError(err.message);
            } finally {
                submit.disabled = false;
            }
        };
        this.element.appendChild(form);
        this.error = document.createElement("div");
        this.error.style.cssText = "color:var(--usg-danger, #fca5a5);font-size:12px;min-height:16px;";
        this.element.appendChild(this.error);
    }

    commentNode(comment) {
        const block = document.createElement("article");
        block.dataset.commentId = comment.comment_id;
        block.style.cssText = "border-radius:8px;padding:6px;";
        const head = document.createElement("div");
        head.style.cssText = "display:flex;justify-content:space-between;gap:8px;font-size:13px;";
        const name = document.createElement("strong");
        name.textContent = comment.username || "User";
        const rating = document.createElement("span");
        rating.textContent = comment.rating ? stars(comment.rating) : "";
        rating.style.color = "var(--usg-star, #ffd86b)";
        head.append(name, rating);
        const body = document.createElement("div");
        body.textContent = comment.body || "";
        body.style.cssText = "white-space:pre-wrap;font-size:13px;margin:4px 0;";
        const meta = document.createElement("div");
        meta.style.cssText = "font-size:11px;color:var(--usg-text-secondary, #94a3b8);display:flex;gap:8px;align-items:center;";
        const time = document.createElement("span");
        const edited = comment.edited ? " · Edited" : "";
        time.textContent = `${when(comment.created_at)}${edited}`;
        meta.appendChild(time);
        if (comment.can_edit) {
            const edit = document.createElement("button");
            edit.type = "button";
            edit.textContent = "Edit";
            edit.style.cssText = buttonStyle();
            edit.onclick = () => this.edit(comment, body);
            meta.appendChild(edit);
        }
        if (comment.can_delete) {
            const remove = document.createElement("button");
            remove.type = "button";
            remove.textContent = "Delete";
            remove.style.cssText = buttonStyle();
            remove.onclick = () => this.remove(comment.comment_id);
            meta.appendChild(remove);
        }
        block.append(head, body, meta);
        return block;
    }

    async edit(comment, bodyNode) {
        const field = document.createElement("textarea");
        field.value = comment.body;
        field.style.cssText = "width:100%;box-sizing:border-box;border-radius:8px;border:1px solid var(--usg-border, #455363);background:transparent;color:inherit;padding:6px;";
        bodyNode.replaceWith(field);
        field.focus();
        const save = async () => {
            try {
                await updateComment(comment.comment_id, field.value.trim());
                await this.load();
                if (this.onCommentChanged) this.onCommentChanged();
            } catch (err) {
                this.showError(err.message);
            }
        };
        field.addEventListener("keydown", (event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) save();
            if (event.key === "Escape") this.render();
        });
        field.addEventListener("blur", save);
    }

    async remove(commentId) {
        try {
            await deleteComment(commentId);
            await this.load();
            if (this.onCommentChanged) this.onCommentChanged();
        } catch (err) {
            this.showError(err.message);
        }
    }

    async rate(value) {
        const previous = this.data ? this.data.my_rating : null;
        this.pendingRating = value;
        this.render();
        try {
            const result = await setRating(this.imageId, value);
            if (this.data && result.rating) {
                this.data.my_rating = result.rating.mine;
                this.data.average_rating = result.rating.average;
                this.data.rating_count = result.rating.count;
            }
            this.pendingRating = null;
            await this.load();
            if (this.onRatingChanged) this.onRatingChanged(result.rating);
        } catch (err) {
            this.pendingRating = previous;
            this.showError(err.message);
            this.render();
        }
    }

    showError(message) {
        if (this.error) this.error.textContent = message || "";
    }
}
