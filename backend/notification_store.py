"""Notification records and per-user preferences.

A new comment or a first rating can notify the image owner. Changing a
rating does not create another notification. The owner is not notified
about their own actions. Disabled categories create nothing.
"""

from __future__ import annotations

import uuid

from .social_store import _LOCK, connect, utcnow

EVENT_COMMENT = "comment_added"
EVENT_RATING = "rating_added"


def default_preferences() -> dict:
    return {"enabled": True, "comment_actions": True, "rating_actions": True}


def get_preferences(user_id: str) -> dict:
    conn = connect()
    try:
        row = conn.execute(
            "SELECT * FROM notification_preferences WHERE user_id = ?",
            (user_id,),
        ).fetchone()
    finally:
        conn.close()
    if row is None:
        return default_preferences()
    return {
        "enabled": bool(row["enabled"]),
        "comment_actions": bool(row["comment_actions"]),
        "rating_actions": bool(row["rating_actions"]),
    }


def set_preferences(user_id: str, enabled: bool, comment_actions: bool, rating_actions: bool) -> dict:
    with _LOCK:
        conn = connect()
        try:
            conn.execute(
                """
                INSERT INTO notification_preferences (
                    user_id, enabled, comment_actions, rating_actions, updated_at
                ) VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET
                    enabled = excluded.enabled,
                    comment_actions = excluded.comment_actions,
                    rating_actions = excluded.rating_actions,
                    updated_at = excluded.updated_at
                """,
                (user_id, int(bool(enabled)), int(bool(comment_actions)), int(bool(rating_actions)), utcnow()),
            )
        finally:
            conn.close()
    return get_preferences(user_id)


def _allows(recipient_id: str, event_type: str) -> bool:
    prefs = get_preferences(recipient_id)
    if not prefs["enabled"]:
        return False
    if event_type == EVENT_COMMENT:
        return prefs["comment_actions"]
    if event_type == EVENT_RATING:
        return prefs["rating_actions"]
    return False


def create_notification(
    recipient_id: str,
    actor_id: str,
    actor_username: str | None,
    image_id: str,
    event_type: str,
    comment_id: str | None = None,
) -> str | None:
    if not recipient_id or not actor_id or recipient_id == actor_id:
        return None
    if event_type not in {EVENT_COMMENT, EVENT_RATING}:
        return None
    if not _allows(recipient_id, event_type):
        return None
    notification_id = str(uuid.uuid4())
    try:
        with _LOCK:
            conn = connect()
            try:
                conn.execute(
                    """
                    INSERT INTO notifications (
                        notification_id, recipient_id, actor_id, actor_username,
                        image_id, event_type, comment_id, created_at, read_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
                    """,
                    (
                        notification_id,
                        recipient_id,
                        actor_id,
                        actor_username,
                        image_id,
                        event_type,
                        comment_id,
                        utcnow(),
                    ),
                )
            finally:
                conn.close()
    except Exception as exc:
        print(f"[Usgromana-Gallery] Notification creation failure: {exc}")
        return None
    return notification_id


def list_notifications(recipient_id: str, unread_only: bool = False, limit: int = 20, after: str | None = None) -> list[dict]:
    limit = max(1, min(int(limit or 20), 50))
    clauses = ["recipient_id = ?"]
    params: list = [recipient_id]
    if unread_only:
        clauses.append("read_at IS NULL")
    if after:
        clauses.append("created_at > ?")
        params.append(after)
    params.append(limit)
    conn = connect()
    try:
        rows = conn.execute(
            f"""
            SELECT * FROM notifications
            WHERE {' AND '.join(clauses)}
            ORDER BY created_at DESC
            LIMIT ?
            """,
            params,
        ).fetchall()
    finally:
        conn.close()
    return [_public(row) for row in rows]


def unread_count(recipient_id: str) -> int:
    conn = connect()
    try:
        return int(
            conn.execute(
                "SELECT COUNT(*) FROM notifications WHERE recipient_id = ? AND read_at IS NULL",
                (recipient_id,),
            ).fetchone()[0]
        )
    finally:
        conn.close()


def mark_read(recipient_id: str, notification_id: str) -> bool:
    with _LOCK:
        conn = connect()
        try:
            cursor = conn.execute(
                """
                UPDATE notifications
                SET read_at = ?
                WHERE notification_id = ? AND recipient_id = ? AND read_at IS NULL
                """,
                (utcnow(), notification_id, recipient_id),
            )
            if cursor.rowcount:
                return True
            found = conn.execute(
                "SELECT 1 FROM notifications WHERE notification_id = ? AND recipient_id = ?",
                (notification_id, recipient_id),
            ).fetchone()
            return found is not None
        finally:
            conn.close()


def mark_all_read(recipient_id: str) -> None:
    with _LOCK:
        conn = connect()
        try:
            conn.execute(
                """
                UPDATE notifications
                SET read_at = ?
                WHERE recipient_id = ? AND read_at IS NULL
                """,
                (utcnow(), recipient_id),
            )
        finally:
            conn.close()


def get_notification(notification_id: str) -> dict | None:
    conn = connect()
    try:
        row = conn.execute(
            "SELECT * FROM notifications WHERE notification_id = ?",
            (notification_id,),
        ).fetchone()
    finally:
        conn.close()
    return _public(row) if row else None


def message_for(event_type: str, username: str | None) -> str:
    name = username or "Someone"
    if event_type == EVENT_COMMENT:
        return f"{name} commented on your image."
    if event_type == EVENT_RATING:
        return f"{name} rated your image."
    return f"{name} updated your image."


def _public(row) -> dict:
    username = row["actor_username"]
    event_type = row["event_type"]
    return {
        "id": row["notification_id"],
        "type": event_type,
        "actor": {"id": row["actor_id"], "username": username},
        "image_id": row["image_id"],
        "comment_id": row["comment_id"],
        "message": message_for(event_type, username),
        "created_at": row["created_at"],
        "read": row["read_at"] is not None,
    }
