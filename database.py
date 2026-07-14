import os
from pathlib import Path

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
            created_at TEXT DEFAULT (datetime('now'))
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
