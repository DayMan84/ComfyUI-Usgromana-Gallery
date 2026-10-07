import assert from "node:assert/strict";
import {
    galleryButtonMetrics,
    galleryButtonVisibility,
    pinwheelMetrics,
} from "../web/core/galleryButton.js";
import {
    knownTags,
    matchesMediaFilter,
    matchesTagFilter,
} from "../web/core/mediaFilters.js";

const photo = { filename: "shot.png", media_type: "image", tags: ["Night", "City"] };
const video = { filename: "clip.mp4", media_type: "video", tags: ["Night"] };
const webm = { filename: "anim.webm", tags: "city, rain" };

assert.equal(matchesMediaFilter(photo, "all"), true);
assert.equal(matchesMediaFilter(video, "all"), true);
assert.equal(matchesMediaFilter(video, "video"), true);
assert.equal(matchesMediaFilter(photo, "video"), false);
assert.equal(matchesMediaFilter(webm, "video"), true);
assert.equal(matchesMediaFilter(photo, "image"), true);

assert.equal(matchesTagFilter(photo, [], ""), true);
assert.equal(matchesTagFilter(photo, ["City"], ""), true);
assert.equal(matchesTagFilter(video, ["City"], ""), false);
assert.equal(matchesTagFilter(photo, ["Night", "Missing"], ""), true);
assert.equal(matchesTagFilter(webm, [], "rai"), true);
assert.equal(matchesTagFilter(photo, [], "rain"), false);
assert.equal(matchesTagFilter(photo, ["Night"], "city"), true);
assert.equal(matchesTagFilter(video, ["Night"], "city"), false);

assert.deepEqual(knownTags([photo, video, webm]), ["City", "Night", "rain"]);

const original = galleryButtonMetrics(1);
assert.equal(original.minWidth, 110);
assert.equal(original.minHeight, 28);
assert.equal(original.fontSize, 12);
assert.equal(original.icon, 14);
assert.equal(galleryButtonMetrics(99).minWidth, 110 * 2.5);
assert.equal(galleryButtonMetrics(0).minWidth, 110 * 0.75);
assert.equal(pinwheelMetrics(1).size, 48);
assert.equal(pinwheelMetrics(1).icon, 32);
assert.equal(pinwheelMetrics(2).size, 96);
assert.equal(pinwheelMetrics(2).icon, 64);
assert.deepEqual(galleryButtonVisibility(false), { showPill: true, showToolbar: false });
assert.deepEqual(galleryButtonVisibility(true), { showPill: false, showToolbar: true });

console.log("media filter and button scale checks passed");
