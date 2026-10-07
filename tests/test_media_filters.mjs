import assert from "node:assert/strict";
import {
    galleryButtonMetrics,
    galleryButtonVisibility,
    pinwheelFanLayout,
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
assert.equal(pinwheelMetrics(1).item, 24);
assert.equal(pinwheelMetrics(1).itemIcon, 16);
assert.equal(pinwheelMetrics(1).radius, 50);
assert.equal(pinwheelMetrics(2).size, 96);
assert.equal(pinwheelMetrics(2).icon, 64);
assert.equal(pinwheelMetrics(2).item, 48);
assert.equal(pinwheelMetrics(2).itemIcon, 32);
assert.equal(pinwheelMetrics(2).radius, 100);

function assertFan(layout, { minDx, minDy, maxDx, maxDy }) {
    assert.ok(layout.items.length >= 2);
    const slack = 0.01;
    for (const item of layout.items) {
        assert.ok(item.dx >= minDx - slack, `dx ${item.dx} < ${minDx}`);
        assert.ok(item.dy >= minDy - slack, `dy ${item.dy} < ${minDy}`);
        assert.ok(item.dx <= maxDx + slack, `dx ${item.dx} > ${maxDx}`);
        assert.ok(item.dy <= maxDy + slack, `dy ${item.dy} > ${maxDy}`);
        const left = layout.centerX + item.dx - layout.item / 2;
        const top = layout.centerY + item.dy - layout.item / 2;
        const right = left + layout.item;
        const bottom = top + layout.item;
        assert.ok(left >= 0, `item clipped left (${left})`);
        assert.ok(top >= 0, `item clipped top (${top})`);
        assert.ok(right <= 1280, `item clipped right (${right})`);
        assert.ok(bottom <= 800, `item clipped bottom (${bottom})`);
    }
}

const topLeft = {
    left: 0,
    top: 0,
    viewportWidth: 1280,
    viewportHeight: 800,
    count: 4,
};
const at100 = pinwheelFanLayout({ ...topLeft, scale: 1, width: 48, height: 48 });
assert.equal(at100.hub, 48);
assert.equal(at100.item, 24);
assert.equal(at100.icon, 16);
assert.equal(at100.radius, 50);
assert.equal(at100.centerX, 24);
assert.equal(at100.centerY, 24);
assertFan(at100, { minDx: 0, minDy: 0, maxDx: 50, maxDy: 50 });
assert.ok(at100.items.some((item) => item.dx > 20));
assert.ok(at100.items.some((item) => item.dy > 20));

const at200 = pinwheelFanLayout({ ...topLeft, scale: 2, width: 96, height: 96 });
assert.equal(at200.hub, 96);
assert.equal(at200.item, 48);
assert.equal(at200.icon, 32);
assert.equal(at200.radius, 100);
assert.equal(at200.centerX, 48);
assert.equal(at200.centerY, 48);
assertFan(at200, { minDx: 0, minDy: 0, maxDx: 100, maxDy: 100 });
assert.ok(at200.items.some((item) => item.dx >= 50));
assert.ok(at200.items.some((item) => item.dy >= 50));
assert.ok(at200.radius > at100.radius);
assert.ok(at200.item > at100.item);

const bottomRight = pinwheelFanLayout({
    scale: 2,
    left: 1100,
    top: 680,
    width: 96,
    height: 96,
    viewportWidth: 1280,
    viewportHeight: 800,
    count: 3,
});
assertFan(bottomRight, { minDx: -100, minDy: -100, maxDx: 0, maxDy: 0 });
assert.ok(bottomRight.items.some((item) => item.dx < -20));
assert.ok(bottomRight.items.some((item) => item.dy < -20));
assert.deepEqual(galleryButtonVisibility(false), { showPill: true, showToolbar: false });
assert.deepEqual(galleryButtonVisibility(true), { showPill: false, showToolbar: true });

console.log("media filter and button scale checks passed");
