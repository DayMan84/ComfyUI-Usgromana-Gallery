"""Gallery discovery includes generated videos and stored tags."""

import os
import shutil
import subprocess
import sys
import types

import pytest

if "folder_paths" not in sys.modules:
    folder_paths = types.ModuleType("folder_paths")
    folder_paths.get_output_directory = lambda: "/tmp"
    sys.modules["folder_paths"] = folder_paths

from backend.files import (  # noqa: E402
    generate_video_poster,
    list_output_images,
    lookup_stored_tags,
    merge_video_extensions,
    resolve_scan_extensions,
    thumb_cache_name,
    write_thumbnail,
    write_video_placeholder,
)


def test_legacy_extension_setting_still_discovers_videos():
    exts = resolve_scan_extensions(".png,.jpg,.jpeg,.webp,.gif,.bmp")
    assert ".png" in exts
    assert ".mp4" in exts
    assert ".webm" in exts
    assert ".txt" not in exts


def test_merge_video_extensions_appends_without_duplicates():
    assert merge_video_extensions(".png,.jpg") == ".png,.jpg,.mp4,.webm"
    assert merge_video_extensions(".png,.mp4,.webm") == ".png,.mp4,.webm"
    assert merge_video_extensions("") .endswith(".mp4,.webm")


def test_video_thumbnail_name_is_a_png_poster():
    assert thumb_cache_name("clip.mp4") == "clip.png"
    assert thumb_cache_name("album/clip.webm").endswith(".png")
    assert thumb_cache_name("shot.png") == "shot.png"
    assert thumb_cache_name("album/shot.jpg").endswith(".jpg")


def test_list_output_images_includes_videos(tmp_path, monkeypatch):
    (tmp_path / "shot.png").write_bytes(b"png")
    (tmp_path / "clip.mp4").write_bytes(b"mp4")
    (tmp_path / "anim.webm").write_bytes(b"webm")
    (tmp_path / "notes.txt").write_bytes(b"no")
    thumbs = tmp_path / "_thumbs"
    thumbs.mkdir()
    (thumbs / "hidden.png").write_bytes(b"thumb")
    nested = tmp_path / "album"
    nested.mkdir()
    (nested / "take.MP4").write_bytes(b"mp4")

    monkeypatch.setattr("backend.files.get_gallery_root_dir", lambda: str(tmp_path))
    items = list_output_images()
    found = {item.relpath: item.to_dict()["media_type"] for item in items}

    assert found["shot.png"] == "image"
    assert found["clip.mp4"] == "video"
    assert found["anim.webm"] == "video"
    assert found["album/take.MP4"] == "video"
    assert "notes.txt" not in found
    assert "_thumbs/hidden.png" not in found


def test_lookup_stored_tags_uses_metadata_keys():
    meta = {
        "album/clip.mp4": {"tags": ["Night", "night", " City "]},
        "shot.png": {"tags": "portrait, soft light"},
    }
    assert lookup_stored_tags(meta, "album/clip.mp4", "clip.mp4") == ["Night", "City"]
    assert lookup_stored_tags(meta, "missing/shot.png", "shot.png") == ["portrait", "soft light"]
    assert lookup_stored_tags(meta, "other.png", "other.png") == []
    assert lookup_stored_tags({"plain.png": {"tags": []}}, "plain.png", "plain.png") == []


def test_ffmpeg_poster_and_thumbnail(tmp_path):
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        pytest.skip("ffmpeg is not installed")
    src = tmp_path / "clip.mp4"
    subprocess.run(
        [
            ffmpeg, "-y", "-f", "lavfi", "-i", "color=c=blue:s=160x90:d=1",
            "-pix_fmt", "yuv420p", str(src),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    poster = tmp_path / "poster.png"
    assert generate_video_poster(str(src), str(poster))
    assert poster.read_bytes().startswith(b"\x89PNG")

    thumb = tmp_path / "thumb.png"
    write_thumbnail(str(src), str(thumb))
    assert thumb.read_bytes().startswith(b"\x89PNG")


def test_frontend_filter_and_button_rules():
    node = shutil.which("node")
    if not node:
        pytest.skip("node is not installed")
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    subprocess.run(
        [node, "--experimental-default-type=module", "tests/test_media_filters.mjs"],
        cwd=root,
        check=True,
    )


def test_video_placeholder_is_a_png(tmp_path):
    dest = tmp_path / "poster.png"
    write_video_placeholder(str(dest))
    assert dest.is_file()
    assert dest.read_bytes().startswith(b"\x89PNG")


def test_unreadable_video_still_gets_a_png_poster(tmp_path):
    src = tmp_path / "fresh.mp4"
    src.write_bytes(b"not a real video")
    thumb = tmp_path / "fresh.png"
    write_thumbnail(str(src), str(thumb))
    assert thumb.is_file()
    assert thumb.read_bytes().startswith(b"\x89PNG")
    from backend.files import image_file_ok, video_thumbnail_current

    assert image_file_ok(str(thumb))
    assert video_thumbnail_current(str(src), str(thumb))
