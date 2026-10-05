"""Dropped images are stored inside the current gallery library."""

from io import BytesIO

import pytest
from PIL import Image

from backend.uploads import UploadError, save_uploaded_image


def _png() -> bytes:
    buffer = BytesIO()
    Image.new("RGB", (2, 2), (220, 30, 30)).save(buffer, format="PNG")
    return buffer.getvalue()


PNG = _png()


def test_save_uploaded_image_lands_in_the_library(tmp_path):
    saved = save_uploaded_image(str(tmp_path), "My Shot.PNG", PNG)
    assert saved["relpath"] == "My_Shot.png"
    assert (tmp_path / "My_Shot.png").read_bytes() == PNG


def test_duplicate_names_get_a_new_file(tmp_path):
    save_uploaded_image(str(tmp_path), "shot.png", PNG)
    saved = save_uploaded_image(str(tmp_path), "shot.png", PNG)
    assert saved["filename"] == "shot-1.png"
    assert (tmp_path / "shot-1.png").is_file()


def test_folder_drop_stays_inside_the_library(tmp_path):
    saved = save_uploaded_image(str(tmp_path), "shot.png", PNG, folder="album/day")
    assert saved["relpath"] == "album/day/shot.png"
    assert (tmp_path / "album" / "day" / "shot.png").is_file()


def test_folder_escape_is_rejected(tmp_path):
    outside = tmp_path.parent / "outside-library"
    with pytest.raises(UploadError):
        save_uploaded_image(str(tmp_path), "shot.png", PNG, folder="../outside-library")
    assert not outside.exists()


@pytest.mark.parametrize("name,data", [("notes.txt", b"hello"), ("fake.png", b"not an image")])
def test_non_images_are_rejected(tmp_path, name, data):
    with pytest.raises(UploadError):
        save_uploaded_image(str(tmp_path), name, data)
    assert list(tmp_path.iterdir()) == []
