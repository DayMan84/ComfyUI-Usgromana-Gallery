"""Theme ids stored with appearance settings stay on a theme that exists."""

from backend.notification_http import (
    THEME_REVISION,
    clean_appearance,
    migrate_stored_appearance,
    normalize_theme,
)


def test_light_subtle_becomes_light():
    assert normalize_theme("lightSubtle", 1) == "light"
    assert normalize_theme("lightSubtle", THEME_REVISION) == "light"


def test_removed_themes_fall_back_to_dark():
    assert normalize_theme("light", None) == "dark"
    assert normalize_theme("light", 1) == "dark"
    assert normalize_theme("darkHighContrast", THEME_REVISION) == "dark"
    assert normalize_theme("darkSubtle", 1) == "dark"
    assert normalize_theme("missing", THEME_REVISION) == "dark"


def test_current_light_id_is_kept():
    assert normalize_theme("light", THEME_REVISION) == "light"
    assert normalize_theme("darkBlue", 1) == "darkBlue"
    assert normalize_theme("sand", THEME_REVISION) == "sand"


def test_clean_appearance_maps_saved_ids_and_keeps_opacity():
    cleaned = clean_appearance(
        {
            "theme": "lightSubtle",
            "appearance": {"windowOpacity": 0.4, "colors": {"text": "#112233"}},
        },
        None,
    )
    assert cleaned["theme"] == "light"
    assert cleaned["themeRevision"] == THEME_REVISION
    assert cleaned["appearance"]["windowOpacity"] == 0.4
    assert cleaned["appearance"]["colors"]["text"] == "#112233"
    assert "panelOpacity" not in cleaned["appearance"]


def test_migrate_legacy_light_record():
    migrated = migrate_stored_appearance({"theme": "light", "appearance": {"colors": {}}})
    assert migrated["theme"] == "dark"
    assert migrated["themeRevision"] == THEME_REVISION
