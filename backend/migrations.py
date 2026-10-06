"""SQLite schema migrations for gallery social data.

Versions are stored in PRAGMA user_version and applied in order.
Legacy JSON stores are never modified here.
"""

from __future__ import annotations

SCHEMA_VERSION = 2


def migrate(conn) -> int:
    """Advance the database to SCHEMA_VERSION. Returns the version reached."""
    current = int(conn.execute("PRAGMA user_version").fetchone()[0])
    if current >= SCHEMA_VERSION:
        return current
    if current < 1:
        migrate_v0_to_v1(conn)
        conn.execute("PRAGMA user_version = 1")
        current = 1
        print("[Usgromana-Gallery] Database migration completed: version 1")
    if current < 2:
        migrate_v1_to_v2(conn)
        conn.execute("PRAGMA user_version = 2")
        current = 2
        print("[Usgromana-Gallery] Database migration completed: version 2")
    return current


def migrate_v0_to_v1(conn) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS images (
            image_id TEXT PRIMARY KEY,
            owner_id TEXT NOT NULL,
            owner_username TEXT,
            storage_type TEXT,
            relpath TEXT NOT NULL,
            filename TEXT,
            content_hash TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            last_seen_at TEXT,
            legacy_rating INTEGER,
            deleted_at TEXT
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_images_owner ON images(owner_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_images_relpath ON images(relpath)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_images_hash ON images(content_hash)")
    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_images_owner_relpath ON images(owner_id, relpath)"
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS share_grants (
            image_id TEXT NOT NULL,
            viewer_id TEXT NOT NULL,
            viewer_username TEXT,
            created_at TEXT NOT NULL,
            created_by TEXT NOT NULL,
            PRIMARY KEY (image_id, viewer_id),
            FOREIGN KEY (image_id) REFERENCES images(image_id) ON DELETE CASCADE
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_share_viewer ON share_grants(viewer_id)")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS comments (
            comment_id TEXT PRIMARY KEY,
            image_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            username_snapshot TEXT NOT NULL,
            body TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (image_id) REFERENCES images(image_id) ON DELETE CASCADE
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_comments_image ON comments(image_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_comments_user ON comments(user_id)")
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_comments_created ON comments(image_id, created_at)"
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ratings (
            image_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            username_snapshot TEXT,
            rating INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (image_id, user_id),
            FOREIGN KEY (image_id) REFERENCES images(image_id) ON DELETE CASCADE,
            CHECK (rating >= 1 AND rating <= 5)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS migration_state (
            migration_key TEXT PRIMARY KEY,
            completed_at TEXT NOT NULL
        )
        """
    )


def migrate_v1_to_v2(conn) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS notifications (
            notification_id TEXT PRIMARY KEY,
            recipient_id TEXT NOT NULL,
            actor_id TEXT NOT NULL,
            actor_username TEXT,
            image_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            comment_id TEXT,
            created_at TEXT NOT NULL,
            read_at TEXT,
            FOREIGN KEY (image_id) REFERENCES images(image_id) ON DELETE CASCADE
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_id, created_at)"
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS notification_preferences (
            user_id TEXT PRIMARY KEY,
            enabled INTEGER NOT NULL DEFAULT 1,
            comment_actions INTEGER NOT NULL DEFAULT 1,
            rating_actions INTEGER NOT NULL DEFAULT 1,
            updated_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS appearance_settings (
            user_id TEXT PRIMARY KEY,
            payload TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
