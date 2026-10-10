import assert from "node:assert/strict";
import {
    THEME_ORDER,
    THEME_REVISION,
    contrastRatio,
    getTheme,
    getThemeNames,
    normalizeThemeId,
    parseCssColor,
    themeChoices,
    themeContrastReport,
    themeUsesLightLogo,
    themes,
} from "../web/core/themes.js";

assert.deepEqual(getThemeNames(), THEME_ORDER);
assert.deepEqual(
    themeChoices().map((choice) => choice.label),
    ["Dark", "Dark Blue", "Light", "Midnight", "Ocean", "Forest", "Rose", "Sand"]
);

assert.equal(normalizeThemeId("lightSubtle", 1), "light");
assert.equal(normalizeThemeId("lightSubtle", THEME_REVISION), "light");
assert.equal(normalizeThemeId("light", 1), "dark");
assert.equal(normalizeThemeId("light", THEME_REVISION), "light");
assert.equal(normalizeThemeId("darkHighContrast", THEME_REVISION), "dark");
assert.equal(normalizeThemeId("darkSubtle", 1), "dark");
assert.equal(normalizeThemeId("no-such-theme", THEME_REVISION), "dark");
assert.equal(normalizeThemeId("darkBlue", 1), "darkBlue");
assert.equal(normalizeThemeId("sand", THEME_REVISION), "sand");

assert.equal(getTheme("lightSubtle").name, "light");
assert.equal(getTheme("lightSubtle").panelBackground, "rgba(255, 255, 255, 0.75)");
assert.equal(getTheme("darkHighContrast").name, "dark");
assert.equal(themes.light.lightSurface, true);
assert.equal(themeUsesLightLogo("light"), true);
assert.equal(themeUsesLightLogo("sand"), true);
assert.equal(themeUsesLightLogo("midnight"), false);
assert.equal(themes.darkHighContrast, undefined);
assert.equal(themes.darkSubtle, undefined);
assert.equal(themes.lightSubtle, undefined);

function composite(color, backdrop) {
    const fg = parseCssColor(color);
    const bg = parseCssColor(backdrop);
    const alpha = fg.a;
    return {
        r: fg.r * alpha + bg.r * (1 - alpha),
        g: fg.g * alpha + bg.g * (1 - alpha),
        b: fg.b * alpha + bg.b * (1 - alpha),
        a: 1,
    };
}

for (const id of THEME_ORDER) {
    const theme = themes[id];
    const report = themeContrastReport(theme);
    for (const pair of report) {
        assert.equal(pair.ok, true, `${id} ${pair.name} contrast ${pair.ratio.toFixed(2)} < ${pair.minimum}`);
    }
    if (id !== "light") {
        const backdrop = theme.lightSurface ? "#f8fafc" : "#0b0f14";
        const accent = contrastRatio("#ffffff", composite(theme.primaryBackground, backdrop));
        assert.ok(accent >= 4.5, `${id} accent contrast ${accent.toFixed(2)}`);
    }
}
