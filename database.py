import os
import secrets
from pathlib import Path

CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # no O/0, I/1, L - easy to type


def generate_access_code(length=6):
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(length))

TURSO_URL = os.environ.get("TURSO_DATABASE_URL")
TURSO_TOKEN = os.environ.get("TURSO_AUTH_TOKEN")

if TURSO_URL:
    import libsql as _dbapi

    def _raw_connect():
        conn = _dbapi.connect(database=TURSO_URL, auth_token=TURSO_TOKEN)
        conn.execute("PRAGMA foreign_keys = ON")
        return conn
else:
    import sqlite3 as _dbapi

    DB_PATH = Path(__file__).parent / "golf.db"

    def _raw_connect():
        conn = _dbapi.connect(DB_PATH)
        conn.execute("PRAGMA foreign_keys = ON")
        return conn


class Conn:
    """sqlite3/libsql-agnostic wrapper that returns rows as plain dicts."""

    def __init__(self, raw):
        self.raw = raw

    def query(self, sql, params=()):
        cur = self.raw.execute(sql, params)
        cols = [d[0] for d in cur.description] if cur.description else []
        return [dict(zip(cols, row)) for row in cur.fetchall()]

    def query_one(self, sql, params=()):
        rows = self.query(sql, params)
        return rows[0] if rows else None

    def exec(self, sql, params=()):
        cur = self.raw.execute(sql, params)
        self.raw.commit()
        return cur

    def close(self):
        self.raw.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        self.close()
        return False


def get_conn():
    return Conn(_raw_connect())


def init_db():
    conn = get_conn()
    conn.exec(
        """
        CREATE TABLE IF NOT EXISTS players (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            category TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            level_override INTEGER,
            class_id INTEGER,
            created_at TEXT DEFAULT (datetime('now'))
        )
        """
    )
    player_cols = {row["name"] for row in conn.query("PRAGMA table_info(players)")}
    if "level_override" not in player_cols:
        conn.exec("ALTER TABLE players ADD COLUMN level_override INTEGER")
    if "class_id" not in player_cols:
        conn.exec("ALTER TABLE players ADD COLUMN class_id INTEGER")
    if "access_code" not in player_cols:
        conn.exec("ALTER TABLE players ADD COLUMN access_code TEXT")
    conn.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_players_access_code ON players(access_code)")

    existing_codes = {
        row["access_code"] for row in conn.query("SELECT access_code FROM players") if row["access_code"]
    }
    needs_code = conn.query("SELECT id FROM players WHERE access_code IS NULL OR access_code = ''")
    for row in needs_code:
        code = generate_access_code()
        while code in existing_codes:
            code = generate_access_code()
        existing_codes.add(code)
        conn.exec("UPDATE players SET access_code=? WHERE id=?", (code, row["id"]))

    conn.exec(
        """
        CREATE TABLE IF NOT EXISTS classes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            sort_order INTEGER DEFAULT 0
        )
        """
    )

    conn.exec(
        """
        CREATE TABLE IF NOT EXISTS drills (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            sort_order INTEGER DEFAULT 0
        )
        """
    )
    conn.exec(
        """
        CREATE TABLE IF NOT EXISTS entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
            drill_id INTEGER NOT NULL REFERENCES drills(id) ON DELETE CASCADE,
            entry_date TEXT NOT NULL,
            value TEXT DEFAULT '',
            UNIQUE(player_id, drill_id, entry_date)
        )
        """
    )

    conn.exec(
        """
        CREATE TABLE IF NOT EXISTS quests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            icon TEXT DEFAULT '🎯',
            description TEXT DEFAULT '',
            target INTEGER NOT NULL DEFAULT 1,
            level_index INTEGER NOT NULL DEFAULT 0,
            class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
            quest_type TEXT NOT NULL DEFAULT 'main',
            sort_order INTEGER DEFAULT 0
        )
        """
    )
    quest_cols = {row["name"] for row in conn.query("PRAGMA table_info(quests)")}
    if "level_index" not in quest_cols:
        conn.exec("ALTER TABLE quests ADD COLUMN level_index INTEGER NOT NULL DEFAULT 0")
    if "class_id" not in quest_cols:
        conn.exec("ALTER TABLE quests ADD COLUMN class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE")
    if "quest_type" not in quest_cols:
        conn.exec("ALTER TABLE quests ADD COLUMN quest_type TEXT NOT NULL DEFAULT 'main'")

    conn.exec(
        """
        CREATE TABLE IF NOT EXISTS quest_progress (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
            quest_id INTEGER NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
            current INTEGER NOT NULL DEFAULT 0,
            UNIQUE(player_id, quest_id)
        )
        """
    )

    conn.exec(
        """
        CREATE TABLE IF NOT EXISTS attendance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
            attendance_date TEXT NOT NULL,
            attendance_time TEXT NOT NULL DEFAULT '',
            player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
            UNIQUE(class_id, attendance_date, attendance_time, player_id)
        )
        """
    )
    attendance_cols_info = conn.query("PRAGMA table_info(attendance)")
    attendance_cols = {c["name"] for c in attendance_cols_info}
    class_id_notnull = any(
        c["name"] == "class_id" and c["notnull"] == 1 for c in attendance_cols_info
    )
    if "attendance_time" not in attendance_cols or class_id_notnull:
        # Older installs: class_id was NOT NULL and/or there was no time
        # column (one session per day per class). Rebuild so a coach can run
        # multiple timed sessions for the same class on the same day.
        conn.exec("ALTER TABLE attendance RENAME TO attendance_old")
        conn.exec(
            """
            CREATE TABLE attendance (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
                attendance_date TEXT NOT NULL,
                attendance_time TEXT NOT NULL DEFAULT '',
                player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
                UNIQUE(class_id, attendance_date, attendance_time, player_id)
            )
            """
        )
        if "attendance_time" in attendance_cols:
            conn.exec(
                "INSERT INTO attendance (id, class_id, attendance_date, attendance_time, player_id) "
                "SELECT id, class_id, attendance_date, attendance_time, player_id FROM attendance_old"
            )
        else:
            conn.exec(
                "INSERT INTO attendance (id, class_id, attendance_date, attendance_time, player_id) "
                "SELECT id, class_id, attendance_date, '', player_id FROM attendance_old"
            )
        conn.exec("DROP TABLE attendance_old")

    count = conn.query_one("SELECT COUNT(*) c FROM drills")["c"]
    if count == 0:
        default_drills = [
            ("1m Putts", "24 putts", 1),
            ("2m Putts", "24 putts", 2),
            ("Get Close to the Line Tape", "3 putts from 3m, 4m, 5 & 6m. Measure distance from the tape line", 3),
            ("9holes (Long putts)", "1putt +3pts, 2putts +1pt, 3putts -3", 4),
            ("Climb up & down the ladder", "Using one ball, go up and down the ladder and count how many putts it takes to complete it. The ladder consists of 6 steps, each 45cm wide.", 5),
            ("Super Speed", "Best speed with green stick", 6),
            ("Driver Carry", "Best out of 8", 7),
            ("7-iron Carry", "6 Avg out of 8", 8),
        ]
        for name, desc, order in default_drills:
            conn.exec(
                "INSERT INTO drills (name, description, sort_order) VALUES (?, ?, ?)",
                (name, desc, order),
            )
    conn.close()
