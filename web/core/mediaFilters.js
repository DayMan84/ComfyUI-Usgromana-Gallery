// ComfyUI-Usgromana-Gallery/web/core/mediaFilters.js
// Shared media-type and tag matching used by the grid filters.

import { VIDEO_EXTENSIONS } from "./constants.js";

export function mediaKind(item) {
    if (!item) return "image";
    if (item.media_type === "video" || item.media_type === "image") return item.media_type;
    const name = item.relpath || item.filename || item.path || item.name || "";
    const dot = name.lastIndexOf(".");
    const ext = dot >= 0 ? name.slice(dot).toLowerCase() : "";
    return VIDEO_EXTENSIONS.includes(ext) ? "video" : "image";
}

export function itemTags(item) {
    const raw = item && item.tags;
    if (Array.isArray(raw)) {
        return raw.map((tag) => String(tag).trim()).filter(Boolean);
    }
    if (typeof raw === "string") {
        return raw.split(",").map((tag) => tag.trim()).filter(Boolean);
    }
    return [];
}

export function matchesMediaFilter(item, filter) {
    if (!filter || filter === "all") return true;
    return mediaKind(item) === filter;
}

/**
 * Empty selection and empty query mean no tag restriction.
 * Selected tags match if the item has any of them.
 * A typed query also requires one of the item's tags to contain that text.
 * Both active means both conditions apply.
 */
export function matchesTagFilter(item, selectedTags, query) {
    const selected = (selectedTags || [])
        .map((tag) => String(tag).trim().toLowerCase())
        .filter(Boolean);
    const typed = String(query || "").trim().toLowerCase();
    if (!selected.length && !typed) return true;
    const tags = itemTags(item).map((tag) => tag.toLowerCase());
    if (selected.length && !selected.some((tag) => tags.includes(tag))) return false;
    if (typed && !tags.some((tag) => tag.includes(typed))) return false;
    return true;
}

export function knownTags(items) {
    const map = new Map();
    for (const item of items || []) {
        for (const tag of itemTags(item)) {
            const key = tag.toLowerCase();
            if (!map.has(key)) map.set(key, tag);
        }
    }
    return Array.from(map.values()).sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base" })
    );
}
