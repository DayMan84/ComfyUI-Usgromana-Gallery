"""SQLite store for gallery image identity, shares, comments, and ratings.

Each call opens a short connection. SQL is parameterized. The JSON share
and rating files stay in place; this store is authoritative after a record
has been migrated.
"""

from __future__ import annotations

import os
import sqlite3
import threading
import uuid
from datetime import datetime, timezone

from .migrations import SCHEMA_VERSION, migrate

_LOCK = threading.Lock()
_DB_PATH: str | None = None

COMMENT_MAX_LENGTH = 4000
LOCAL_OWNER = "local"


def configure(path: str | None) -> None:
    """Point the store at a database file. Tests use a temporary path."""
    global _DB_PATH
    _DB_PATH = path


def db_path() -> str:
    if _DB_PATH:
        return _DB_PATH
    data_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
    return os.path.join(data_dir, "gallery_social.db")


def utcnow() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def connect() -> sqlite3.Connection:
    path = db_path()
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    conn = sqlite3.connect(path, timeout=15, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    migrate(conn)
    return conn


def schema_version() -> int:
    conn = connect()
    try:
        return int(conn.execute("PRAGMA user_version").fetchone()[0])
    finally:
        conn.close()


def _row(row) -> dict | None:
    return dict(row) if row is not None else None


def _rows(rows) -> list[dict]:
    return [dict(row) for row in rows]


def migration_done(key: str) -> bool:
    conn = connect()
    try:
        found = conn.execute(
            "SELECT 1 FROM migration_state WHERE migration_key = ?",
            (key,),
        ).fetchone()
        return found is not None
    finally:
        conn.close()


def mark_migration(key: str) -> None:
    with _LOCK:
        conn = connect()
        try:
            conn.execute(
                """
                INSERT INTO migration_state (migration_key, completed_at)
                VALUES (?, ?)
                ON CONFLICT(migration_key) DO NOTHING
                """,
                (key, utcnow()),
            )
        finally:
            conn.close()


def share_migration_key(image_id: str) -> str:
    return f"shares_json:{image_id}"


def rating_migration_key(image_id: str) -> str:
    return f"ratings_json:{image_id}"


def get_image(image_id: str) -> dict | None:
    conn = connect()
    try:
        return _row(conn.execute("SELECT * FROM images WHERE image_id = ?", (image_id,)).fetchone())
    finally:
        conn.close()


def get_image_by_path(owner_id: str, relpath: str) -> dict | None:
    conn = connect()
    try:
        return _row(
            conn.execute(
                "SELECT * FROM images WHERE owner_id = ? AND relpath = ?",
                (owner_id, relpath),
            ).fetchone()
        )
    finally:
        conn.close()


def images_by_hash(content_hash: str, owner_id: str) -> list[dict]:
    if not content_hash:
        return []
    conn = connect()
    try:
        return _rows(
            conn.execute(
                """
                SELECT * FROM images
                WHERE content_hash = ? AND owner_id = ? AND deleted_at IS NULL
                """,
                (content_hash, owner_id),
            ).fetchall()
        )
    finally:
        conn.close()


def register_image(
    image_id: str,
    owner_id: str,
    relpath: str,
    filename: str | None = None,
    owner_username: str | None = None,
    storage_type: str | None = None,
    content_hash: str | None = None,
) -> dict:
    now = utcnow()
    with _LOCK:
        conn = connect()
        try:
            conn.execute("BEGIN")
            existing = conn.execute(
                "SELECT image_id FROM images WHERE image_id = ?",
                (image_id,),
            ).fetchone()
            _release_relpath(conn, owner_id, relpath, image_id)
            if existing:
                conn.execute(
                    """
                    UPDATE images
                    SET owner_id = ?,
                        owner_username = COALESCE(?, owner_username),
                        storage_type = COALESCE(?, storage_type),
                        relpath = ?,
                        filename = ?,
                        content_hash = COALESCE(?, content_hash),
                        updated_at = ?,
                        last_seen_at = ?,
                        deleted_at = NULL
                    WHERE image_id = ?
                    """,
                    (
                        owner_id,
                        owner_username,
                        storage_type,
                        relpath,
                        filename,
                        content_hash,
                        now,
                        now,
                        image_id,
                    ),
                )
            else:
                conn.execute(
                    """
                    INSERT INTO images (
                        image_id, owner_id, owner_username, storage_type, relpath,
                        filename, content_hash, created_at, updated_at, last_seen_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        image_id,
                        owner_id,
                        owner_username,
                        storage_type,
                        relpath,
                        filename,
                        content_hash,
                        now,
                        now,
                        now,
                    ),
                )
            conn.execute("COMMIT")
        except Exception:
            conn.execute("ROLLBACK")
            raise
        finally:
            conn.close()
    return get_image(image_id)


def _release_relpath(conn, owner_id: str, relpath: str, keep_image_id: str) -> None:
    """Move a different image off this path so the unique owner/path index holds."""
    rows = conn.execute(
        """
        SELECT image_id FROM images
        WHERE owner_id = ? AND relpath = ? AND image_id != ?
        """,
        (owner_id, relpath, keep_image_id),
    ).fetchall()
    now = utcnow()
    for row in rows:
        parked = f"{relpath}#replaced-{row['image_id']}"
        conn.execute(
            "UPDATE images SET relpath = ?, updated_at = ? WHERE image_id = ?",
            (parked, now, row["image_id"]),
        )


def update_image_path(image_id: str, relpath: str, filename: str | None) -> bool:
    now = utcnow()
    with _LOCK:
        conn = connect()
        try:
            row = conn.execute(
                "SELECT owner_id FROM images WHERE image_id = ?",
                (image_id,),
            ).fetchone()
            if row is None:
                return False
            conn.execute("BEGIN")
            _release_relpath(conn, row["owner_id"], relpath, image_id)
            conn.execute(
                """
                UPDATE images
                SET relpath = ?, filename = ?, updated_at = ?
                WHERE image_id = ?
                """,
                (relpath, filename, now, image_id),
            )
            conn.execute("COMMIT")
            return True
        except Exception:
            conn.execute("ROLLBACK")
            raise
        finally:
            conn.close()


def rewrite_relpath_prefix(owner_id: str, old_prefix: str, new_prefix: str) -> int:
    old_prefix = old_prefix.strip("/")
    new_prefix = new_prefix.strip("/")
    if not old_prefix:
        return 0
    now = utcnow()
    changed = 0
    with _LOCK:
        conn = connect()
        try:
            rows = conn.execute(
                "SELECT image_id, relpath FROM images WHERE owner_id = ?",
                (owner_id,),
            ).fetchall()
            matches = []
            for row in rows:
                rel = row["relpath"]
                if rel == old_prefix or rel.startswith(old_prefix + "/"):
                    suffix = rel[len(old_prefix) :].lstrip("/")
                    updated = new_prefix if not suffix else f"{new_prefix}/{suffix}"
                    matches.append((row["image_id"], updated, os.path.basename(updated)))
            if not matches:
                return 0
            conn.execute("BEGIN")
            for image_id, _updated, _filename in matches:
                conn.execute(
                    "UPDATE images SET relpath = ?, updated_at = ? WHERE image_id = ?",
                    (f"__moving__/{image_id}", now, image_id),
                )
            for image_id, updated, filename in matches:
                conn.execute(
                    """
                    UPDATE images
                    SET relpath = ?, filename = ?, updated_at = ?
                    WHERE image_id = ?
                    """,
                    (updated, filename, now, image_id),
                )
                changed += 1
            conn.execute("COMMIT")
        except Exception:
            conn.execute("ROLLBACK")
            raise
        finally:
            conn.close()
    return changed


def delete_image(image_id: str) -> None:
    with _LOCK:
        conn = connect()
        try:
            conn.execute("DELETE FROM images WHERE image_id = ?", (image_id,))
        finally:
            conn.close()


def delete_image_by_path(owner_id: str, relpath: str) -> str | None:
    row = get_image_by_path(owner_id, relpath)
    if row is None:
        return None
    delete_image(row["image_id"])
    return row["image_id"]


def delete_images_under_prefix(owner_id: str, prefix: str) -> int:
    prefix = prefix.strip("/")
    if not prefix:
        return 0
    conn = connect()
    try:
        rows = conn.execute(
            "SELECT image_id, relpath FROM images WHERE owner_id = ?",
            (owner_id,),
        ).fetchall()
    finally:
        conn.close()
    removed = 0
    for row in rows:
        rel = row["relpath"]
        if rel == prefix or rel.startswith(prefix + "/"):
            delete_image(row["image_id"])
            removed += 1
    return removed


def set_legacy_rating(image_id: str, rating: int | None) -> None:
    with _LOCK:
        conn = connect()
        try:
            conn.execute(
                "UPDATE images SET legacy_rating = ?, updated_at = ? WHERE image_id = ?",
                (rating, utcnow(), image_id),
            )
        finally:
            conn.close()


def has_share(image_id: str, viewer_id: str | None) -> bool:
    if not viewer_id:
        return False
    conn = connect()
    try:
        found = conn.execute(
            "SELECT 1 FROM share_grants WHERE image_id = ? AND viewer_id = ?",
            (image_id, viewer_id),
        ).fetchone()
        return found is not None
    finally:
        conn.close()


def get_shares(image_id: str) -> list[dict]:
    conn = connect()
    try:
        return _rows(
            conn.execute(
                """
                SELECT * FROM share_grants
                WHERE image_id = ?
                ORDER BY viewer_username COLLATE NOCASE, viewer_id
                """,
                (image_id,),
            ).fetchall()
        )
    finally:
        conn.close()


def set_shares(image_id: str, viewers: list[tuple[str, str | None]], created_by: str) -> list[dict]:
    """Replace grants with viewers of (user_id, username). Owner access is not a grant."""
    now = utcnow()
    cleaned = []
    seen = set()
    for viewer_id, username in viewers:
        if not viewer_id or viewer_id in seen or viewer_id == created_by:
            continue
        seen.add(viewer_id)
        cleaned.append((viewer_id, username))
    with _LOCK:
        conn = connect()
        try:
            conn.execute("BEGIN")
            existing = {
                row["viewer_id"]
                for row in conn.execute(
                    "SELECT viewer_id FROM share_grants WHERE image_id = ?",
                    (image_id,),
                ).fetchall()
            }
            wanted = {viewer_id for viewer_id, _name in cleaned}
            for viewer_id in existing - wanted:
                conn.execute(
                    "DELETE FROM share_grants WHERE image_id = ? AND viewer_id = ?",
                    (image_id, viewer_id),
                )
            for viewer_id, username in cleaned:
                if viewer_id in existing:
                    conn.execute(
                        """
                        UPDATE share_grants
                        SET viewer_username = ?
                        WHERE image_id = ? AND viewer_id = ?
                        """,
                        (username, image_id, viewer_id),
                    )
                else:
                    conn.execute(
                        """
                        INSERT INTO share_grants (
                            image_id, viewer_id, viewer_username, created_at, created_by
                        ) VALUES (?, ?, ?, ?, ?)
                        """,
                        (image_id, viewer_id, username, now, created_by),
                    )
            conn.execute("COMMIT")
        except Exception:
            conn.execute("ROLLBACK")
            raise
        finally:
            conn.close()
    return get_shares(image_id)


def share_with_user(image_id: str, viewer_id: str, viewer_username: str | None, created_by: str) -> None:
    current = get_shares(image_id)
    viewers = [(row["viewer_id"], row["viewer_username"]) for row in current]
    viewers.append((viewer_id, viewer_username))
    set_shares(image_id, viewers, created_by)


def revoke_share(image_id: str, viewer_id: str, created_by: str) -> None:
    current = [
        (row["viewer_id"], row["viewer_username"])
        for row in get_shares(image_id)
        if row["viewer_id"] != viewer_id
    ]
    set_shares(image_id, current, created_by)


def revoke_all_shares(image_id: str) -> None:
    with _LOCK:
        conn = connect()
        try:
            conn.execute("DELETE FROM share_grants WHERE image_id = ?", (image_id,))
        finally:
            conn.close()


def shared_images_for_viewer(viewer_id: str) -> list[dict]:
    conn = connect()
    try:
        return _rows(
            conn.execute(
                """
                SELECT images.*, share_grants.viewer_id
                FROM images
                JOIN share_grants ON images.image_id = share_grants.image_id
                WHERE share_grants.viewer_id = ? AND images.deleted_at IS NULL
                """,
                (viewer_id,),
            ).fetchall()
        )
    finally:
        conn.close()


def permissions_for(user_id: str | None, image: dict) -> dict:
    is_owner = bool(user_id) and image.get("owner_id") == user_id
    shared = False if is_owner or not user_id else has_share(image["image_id"], user_id)
    can_view = is_owner or shared
    return {
        "is_owner": is_owner,
        "can_view": can_view,
        "can_comment": can_view,
        "can_rate": can_view,
        "can_manage_sharing": is_owner,
    }


def can_edit_comment(user_id: str | None, perms: dict, comment: dict) -> bool:
    return bool(perms.get("can_view") and user_id and comment.get("user_id") == user_id)


def can_delete_comment(user_id: str | None, perms: dict, comment: dict) -> bool:
    if perms.get("is_owner"):
        return True
    return bool(perms.get("can_view") and user_id and comment.get("user_id") == user_id)


def get_comments(image_id: str, limit: int = 50, cursor: str | None = None) -> tuple[list[dict], str | None]:
    limit = max(1, min(int(limit or 50), 100))
    params: list = [image_id]
    where = "c.image_id = ?"
    if cursor:
        created_at, _, comment_id = cursor.partition("|")
        where += " AND (c.created_at > ? OR (c.created_at = ? AND c.comment_id > ?))"
        params.extend([created_at, created_at, comment_id])
    params.append(limit + 1)
    conn = connect()
    try:
        rows = _rows(
            conn.execute(
                f"""
                SELECT c.*, r.rating AS user_rating
                FROM comments c
                LEFT JOIN ratings r
                    ON r.image_id = c.image_id AND r.user_id = c.user_id
                WHERE {where}
                ORDER BY c.created_at ASC, c.comment_id ASC
                LIMIT ?
                """,
                params,
            ).fetchall()
        )
    finally:
        conn.close()
    next_cursor = None
    if len(rows) > limit:
        last = rows[limit - 1]
        next_cursor = f"{last['created_at']}|{last['comment_id']}"
        rows = rows[:limit]
    return rows, next_cursor


def comment_count(image_id: str) -> int:
    conn = connect()
    try:
        return int(
            conn.execute(
                "SELECT COUNT(*) FROM comments WHERE image_id = ?",
                (image_id,),
            ).fetchone()[0]
        )
    finally:
        conn.close()


def get_comment(comment_id: str) -> dict | None:
    conn = connect()
    try:
        return _row(
            conn.execute("SELECT * FROM comments WHERE comment_id = ?", (comment_id,)).fetchone()
        )
    finally:
        conn.close()


def create_comment(image_id: str, user_id: str, username: str, body: str) -> dict:
    now = utcnow()
    comment_id = str(uuid.uuid4())
    with _LOCK:
        conn = connect()
        try:
            conn.execute(
                """
                INSERT INTO comments (
                    comment_id, image_id, user_id, username_snapshot, body, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (comment_id, image_id, user_id, username or "User", body, now, now),
            )
        finally:
            conn.close()
    return get_comment(comment_id)


def update_comment(comment_id: str, body: str) -> dict | None:
    now = utcnow()
    with _LOCK:
        conn = connect()
        try:
            conn.execute(
                "UPDATE comments SET body = ?, updated_at = ? WHERE comment_id = ?",
                (body, now, comment_id),
            )
        finally:
            conn.close()
    return get_comment(comment_id)


def delete_comment(comment_id: str) -> None:
    with _LOCK:
        conn = connect()
        try:
            conn.execute("DELETE FROM comments WHERE comment_id = ?", (comment_id,))
        finally:
            conn.close()


def get_rating(image_id: str, user_id: str) -> dict | None:
    conn = connect()
    try:
        return _row(
            conn.execute(
                "SELECT * FROM ratings WHERE image_id = ? AND user_id = ?",
                (image_id, user_id),
            ).fetchone()
        )
    finally:
        conn.close()


def set_rating(image_id: str, user_id: str, username: str | None, rating: int) -> bool:
    """Upsert one user's rating. Returns True when this is the first rating from that user."""
    now = utcnow()
    with _LOCK:
        conn = connect()
        try:
            existing = conn.execute(
                "SELECT rating FROM ratings WHERE image_id = ? AND user_id = ?",
                (image_id, user_id),
            ).fetchone()
            conn.execute(
                """
                INSERT INTO ratings (
                    image_id, user_id, username_snapshot, rating, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(image_id, user_id) DO UPDATE SET
                    rating = excluded.rating,
                    username_snapshot = excluded.username_snapshot,
                    updated_at = excluded.updated_at
                """,
                (image_id, user_id, username, int(rating), now, now),
            )
            return existing is None
        finally:
            conn.close()


def remove_rating(image_id: str, user_id: str) -> None:
    with _LOCK:
        conn = connect()
        try:
            conn.execute(
                "DELETE FROM ratings WHERE image_id = ? AND user_id = ?",
                (image_id, user_id),
            )
        finally:
            conn.close()


def rating_aggregate(image_id: str) -> tuple[float | None, int]:
    conn = connect()
    try:
        row = conn.execute(
            """
            SELECT AVG(rating) AS average_rating, COUNT(*) AS rating_count
            FROM ratings
            WHERE image_id = ?
            """,
            (image_id,),
        ).fetchone()
    finally:
        conn.close()
    count = int(row["rating_count"] or 0)
    average = float(row["average_rating"]) if count else None
    return average, count


def get_rating_summary(image_id: str, user_id: str | None = None) -> dict:
    average, count = rating_aggregate(image_id)
    image = get_image(image_id)
    legacy = image.get("legacy_rating") if image else None
    mine = None
    if user_id:
        row = get_rating(image_id, user_id)
        if row:
            mine = int(row["rating"])
    if count == 0 and isinstance(legacy, int):
        return {
            "average": float(legacy),
            "count": 0,
            "legacy": legacy,
            "mine": mine,
        }
    return {
        "average": average,
        "count": count,
        "legacy": legacy if count == 0 else None,
        "mine": mine,
    }


def rating_map_for_paths(pairs: list[tuple[str, str]]) -> dict:
    """Map relpath to community aggregate for the supplied (owner_id, relpath) pairs."""
    if not pairs:
        return {}
    conn = connect()
    try:
        result = {}
        for owner_id, relpath in pairs:
            image = conn.execute(
                "SELECT image_id, legacy_rating FROM images WHERE owner_id = ? AND relpath = ?",
                (owner_id, relpath),
            ).fetchone()
            if image is None:
                continue
            row = conn.execute(
                """
                SELECT AVG(rating) AS average_rating, COUNT(*) AS rating_count
                FROM ratings WHERE image_id = ?
                """,
                (image["image_id"],),
            ).fetchone()
            count = int(row["rating_count"] or 0)
            average = float(row["average_rating"]) if count else None
            result[relpath] = {
                "image_id": image["image_id"],
                "average": average,
                "count": count,
                "legacy": image["legacy_rating"] if count == 0 else None,
            }
        return result
    finally:
        conn.close()


def community_ratings_for_owner(owner_id: str) -> dict:
    conn = connect()
    try:
        images = conn.execute(
            "SELECT image_id, relpath, legacy_rating FROM images WHERE owner_id = ?",
            (owner_id,),
        ).fetchall()
        result = {}
        for image in images:
            row = conn.execute(
                "SELECT AVG(rating) AS average_rating, COUNT(*) AS rating_count FROM ratings WHERE image_id = ?",
                (image["image_id"],),
            ).fetchone()
            count = int(row["rating_count"] or 0)
            result[image["relpath"]] = {
                "image_id": image["image_id"],
                "average": float(row["average_rating"]) if count else None,
                "count": count,
                "legacy": image["legacy_rating"] if count == 0 else None,
            }
        return result
    finally:
        conn.close()


def get_appearance(user_id: str) -> dict | None:
    import json

    conn = connect()
    try:
        row = conn.execute(
            "SELECT payload FROM appearance_settings WHERE user_id = ?",
            (user_id,),
        ).fetchone()
    finally:
        conn.close()
    if row is None:
        return None
    try:
        payload = json.loads(row["payload"])
    except (TypeError, json.JSONDecodeError):
        return None
    return payload if isinstance(payload, dict) else None


def set_appearance(user_id: str, payload: dict) -> dict:
    import json

    with _LOCK:
        conn = connect()
        try:
            conn.execute(
                """
                INSERT INTO appearance_settings (user_id, payload, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET
                    payload = excluded.payload,
                    updated_at = excluded.updated_at
                """,
                (user_id, json.dumps(payload), utcnow()),
            )
        finally:
            conn.close()
    return payload


def assert_schema() -> None:
    if schema_version() != SCHEMA_VERSION:
        raise RuntimeError("Gallery social database is not at the current schema")
