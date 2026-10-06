"""Identity, sharing, comments, ratings, and notifications."""

import json
import os
import uuid
from io import BytesIO

import pytest
from PIL import Image
from PIL.PngImagePlugin import PngInfo

from backend import image_identity, notification_store, social_store
from backend.social_http import (
    SocialError,
    add_comment,
    apply_rating,
    comments_payload,
    edit_comment,
    remove_comment,
    revoke_all,
    share_all,
    summary_for,
    update_shares,
)

OWNER = "3280e518-3699-4445-9845-61d75f332d28"
ALEX = "9f4f8927-c2ee-420c-805e-7eda419a9c31"
SARAH = "11111111-1111-4111-8111-111111111111"
ACCOUNTS = [
    {"id": ALEX, "username": "Alex"},
    {"id": SARAH, "username": "Sarah"},
    {"id": OWNER, "username": "Owner"},
]


def _png(path, color=(20, 20, 20), workflow=None):
    image = Image.new("RGB", (8, 8), color)
    info = PngInfo()
    if workflow:
        info.add_text("workflow", workflow)
    image.save(path, format="PNG", pnginfo=info)
    return path


@pytest.fixture
def library(tmp_path):
    db = tmp_path / "gallery_social.db"
    shares = tmp_path / "image_shares.json"
    ratings = tmp_path / "ratings.json"
    shares.write_text(json.dumps({"shares": []}), encoding="utf-8")
    ratings.write_text("{}", encoding="utf-8")
    social_store.configure(str(db))
    image_identity.configure_legacy(str(shares), str(ratings), lambda: ACCOUNTS)
    yield {
        "root": tmp_path / "images",
        "db": db,
        "shares": shares,
        "ratings": ratings,
    }
    social_store.configure(None)
    image_identity.configure_legacy(None, None, None)


def _ensure(library, name="cat.png", color=(20, 20, 20), workflow=None, relpath=None):
    root = library["root"]
    root.mkdir(parents=True, exist_ok=True)
    relpath = relpath or name
    path = root / relpath
    path.parent.mkdir(parents=True, exist_ok=True)
    _png(path, color=color, workflow=workflow)
    image_id = image_identity.ensure_image_identity(
        str(path),
        OWNER,
        owner_username="Owner",
        storage_type="library",
        relpath=relpath,
        owner_root=str(root),
    )
    return image_id, path, relpath


def test_upload_identity_is_embedded_and_stored(library):
    image_id, path, relpath = _ensure(library, workflow='{"nodes":[]}')
    assert social_store.schema_version() == 2
    row = social_store.get_image(image_id)
    assert row["relpath"] == relpath
    assert row["content_hash"]
    assert image_identity.read_image_id(str(path)) == image_id
    with Image.open(path) as image:
        assert image.info.get("workflow") == '{"nodes":[]}'
        assert image.info.get("UsgromanaGallerySchemaVersion") == "1"


def test_rename_keeps_the_same_image_id(library):
    image_id, path, relpath = _ensure(library, name="cat.png")
    renamed = path.with_name("black_cat.png")
    os.rename(path, renamed)
    assert image_identity.note_path_changed(OWNER, relpath, "black_cat.png") == image_id
    row = social_store.get_image(image_id)
    assert row["relpath"] == "black_cat.png"
    assert row["filename"] == "black_cat.png"
    social_store.configure(str(library["db"]))
    assert social_store.get_image(image_id)["relpath"] == "black_cat.png"


def test_image_without_uuid_receives_one(library):
    image_id, path, _relpath = _ensure(library)
    assert uuid.UUID(image_id)
    assert image_identity.read_image_id(str(path)) == image_id


def test_identical_copies_stay_separate(library):
    first, _path, _rel = _ensure(library, name="one.png", color=(10, 20, 30))
    root = library["root"]
    second_path = root / "two.png"
    Image.open(root / "one.png").save(second_path)
    # Strip the copied identity so resolution has to use the hash.
    raw = Image.open(second_path)
    raw.save(second_path, format="PNG")
    raw.close()
    second = image_identity.ensure_image_identity(
        str(second_path),
        OWNER,
        relpath="two.png",
        owner_root=str(root),
    )
    assert second != first
    assert social_store.get_image(first)["relpath"] == "one.png"
    assert social_store.get_image(second)["relpath"] == "two.png"


def test_missing_file_is_recovered_by_hash(library):
    image_id, path, _relpath = _ensure(library, name="cat.png", color=(4, 5, 6))
    moved = library["root"] / "album"
    moved.mkdir()
    destination = moved / "cat.png"
    os.rename(path, destination)
    # Drop embedded id so recovery uses the hash.
    raw = Image.open(destination)
    raw.save(destination, format="PNG")
    raw.close()
    recovered = image_identity.ensure_image_identity(
        str(destination),
        OWNER,
        relpath="album/cat.png",
        owner_root=str(library["root"]),
    )
    assert recovered == image_id
    assert social_store.get_image(image_id)["relpath"] == "album/cat.png"


def test_legacy_share_and_rating_import_once(library):
    library["shares"].write_text(
        json.dumps(
            {
                "shares": [
                    {"owner_id": OWNER, "relpath": "cat.png", "viewers": ["Sarah", "guest"]}
                ]
            }
        ),
        encoding="utf-8",
    )
    library["ratings"].write_text(json.dumps({"cat.png": 4}), encoding="utf-8")
    image_id, _path, _rel = _ensure(library)
    grants = social_store.get_shares(image_id)
    assert [row["viewer_id"] for row in grants] == [SARAH]
    assert social_store.get_rating_summary(image_id)["average"] == 4
    assert social_store.get_rating_summary(image_id)["count"] == 0
    image_identity.ensure_image_identity(
        str(library["root"] / "cat.png"),
        OWNER,
        relpath="cat.png",
        owner_root=str(library["root"]),
    )
    assert len(social_store.get_shares(image_id)) == 1
    assert "Sarah" in library["shares"].read_text(encoding="utf-8")
    assert '"cat.png": 4' in library["ratings"].read_text(encoding="utf-8") or '"cat.png":4' in library["ratings"].read_text(encoding="utf-8").replace(" ", "")


def test_share_permissions_all_and_revoke(library):
    image_id, _path, _rel = _ensure(library)
    assert social_store.permissions_for(ALEX, social_store.get_image(image_id))["can_view"] is False
    update_shares(OWNER, image_id, [ALEX])
    assert social_store.permissions_for(ALEX, social_store.get_image(image_id))["can_view"] is True
    assert social_store.permissions_for(SARAH, social_store.get_image(image_id))["can_view"] is False
    share_all(OWNER, image_id)
    assert social_store.permissions_for(SARAH, social_store.get_image(image_id))["can_view"] is True
    assert social_store.permissions_for(OWNER, social_store.get_image(image_id))["can_manage_sharing"] is True
    revoke_all(OWNER, image_id)
    assert social_store.get_shares(image_id) == []
    assert social_store.permissions_for(OWNER, social_store.get_image(image_id))["can_view"] is True
    with pytest.raises(SocialError) as denied:
        update_shares(ALEX, image_id, [SARAH])
    assert denied.value.code == "SHARE_NOT_ALLOWED"


def test_rename_keeps_shares_comments_and_ratings(library):
    image_id, path, relpath = _ensure(library)
    update_shares(OWNER, image_id, [ALEX, SARAH])
    add_comment(ALEX, "Alex", image_id, "Lighting looks excellent.")
    apply_rating(ALEX, "Alex", image_id, 5)
    apply_rating(SARAH, "Sarah", image_id, 3)
    os.rename(path, path.with_name("black_cat.png"))
    image_identity.note_path_changed(OWNER, relpath, "black_cat.png")
    summary = summary_for(OWNER, image_id)
    assert summary["comment_count"] == 1
    assert summary["share_count"] == 2
    assert summary["rating"]["average"] == 4
    assert summary["rating"]["count"] == 2
    assert social_store.get_image(image_id)["relpath"] == "black_cat.png"


def test_comment_permissions(library):
    image_id, _path, _rel = _ensure(library)
    update_shares(OWNER, image_id, [ALEX])
    owner_comment = add_comment(OWNER, "Owner", image_id, "Mine.")
    alex_comment = add_comment(ALEX, "Alex", image_id, "Shared.")
    assert owner_comment["can_delete"] is True
    assert alex_comment["can_edit"] is True
    edited = edit_comment(ALEX, alex_comment["comment_id"], "Shared, updated.")
    assert edited["edited"] is True
    assert edited["body"] == "Shared, updated."
    with pytest.raises(SocialError):
        edit_comment(OWNER, alex_comment["comment_id"], "Rewritten")
    with pytest.raises(SocialError):
        remove_comment(ALEX, owner_comment["comment_id"])
    remove_comment(OWNER, alex_comment["comment_id"])
    assert social_store.get_comment(alex_comment["comment_id"]) is None
    with pytest.raises(SocialError) as denied:
        comments_payload(SARAH, image_id)
    assert denied.value.code == "NOT_AUTHORIZED"
    with pytest.raises(SocialError):
        add_comment(ALEX, "Alex", image_id, "   ")
    with pytest.raises(SocialError):
        add_comment(ALEX, "Alex", image_id, "x" * 4001)


def test_rating_average_updates_in_place(library):
    image_id, _path, _rel = _ensure(library)
    update_shares(OWNER, image_id, [ALEX, SARAH])
    apply_rating(ALEX, "Alex", image_id, 5)
    first = apply_rating(SARAH, "Sarah", image_id, 3)
    assert first["rating"]["average"] == 4
    assert first["rating"]["count"] == 2
    second = apply_rating(SARAH, "Sarah", image_id, 4)
    assert second["rating"]["average"] == 4.5
    assert second["rating"]["count"] == 2
    assert second["rating"]["mine"] == 4
    with pytest.raises(SocialError) as invalid:
        apply_rating(ALEX, "Alex", image_id, 9)
    assert invalid.value.code == "INVALID_RATING"


def test_revoke_keeps_social_history(library):
    image_id, _path, _rel = _ensure(library)
    update_shares(OWNER, image_id, [ALEX])
    add_comment(ALEX, "Alex", image_id, "Still here later.")
    apply_rating(ALEX, "Alex", image_id, 5)
    revoke_all(OWNER, image_id)
    assert social_store.permissions_for(ALEX, social_store.get_image(image_id))["can_view"] is False
    assert social_store.get_comment(social_store.get_comments(image_id)[0][0]["comment_id"])["body"] == "Still here later."
    assert social_store.get_rating(image_id, ALEX)["rating"] == 5
    update_shares(OWNER, image_id, [ALEX])
    payload = comments_payload(ALEX, image_id)
    assert payload["comments"][0]["body"] == "Still here later."
    assert payload["my_rating"] == 5
    assert payload["comments"][0]["rating"] == 5


def test_notifications_once_and_not_for_self(library):
    image_id, _path, _rel = _ensure(library)
    update_shares(OWNER, image_id, [ALEX])
    add_comment(OWNER, "Owner", image_id, "My own note.")
    assert notification_store.unread_count(OWNER) == 0
    comment = add_comment(ALEX, "Alex", image_id, "Hello.")
    notes = notification_store.list_notifications(OWNER)
    assert len(notes) == 1
    assert notes[0]["type"] == "comment_added"
    assert notes[0]["message"] == "Alex commented on your image."
    assert notes[0]["comment_id"] == comment["comment_id"]
    assert image_id not in notes[0]["message"]
    apply_rating(ALEX, "Alex", image_id, 3)
    apply_rating(ALEX, "Alex", image_id, 5)
    rating_notes = [item for item in notification_store.list_notifications(OWNER) if item["type"] == "rating_added"]
    assert len(rating_notes) == 1
    assert rating_notes[0]["message"] == "Alex rated your image."
    notification_store.set_preferences(OWNER, False, True, True)
    add_comment(ALEX, "Alex", image_id, "Quiet.")
    assert notification_store.unread_count(OWNER) == 2


def test_delete_removes_social_rows(library):
    image_id, _path, _rel = _ensure(library, relpath="album/cat.png")
    update_shares(OWNER, image_id, [ALEX])
    add_comment(ALEX, "Alex", image_id, "Gone with the file.")
    assert image_identity.note_image_removed(OWNER, "album/cat.png") == image_id
    assert social_store.get_image(image_id) is None
    assert social_store.get_shares(image_id) == []
    assert social_store.get_comments(image_id)[0] == []


def test_bad_image_id_is_rejected(library):
    _ensure(library)
    with pytest.raises(SocialError) as missing:
        summary_for(OWNER, "not-a-uuid")
    assert missing.value.code == "IMAGE_NOT_FOUND"
