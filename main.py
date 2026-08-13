import hashlib
import os
import secrets
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.middleware.sessions import SessionMiddleware

import gamify
from database import generate_access_code, get_conn, get_or_create_setting, init_db, set_setting

BASE_DIR = Path(__file__).parent


def _hash_pin(pin: str) -> str:
    return hashlib.sha256(pin.strip().encode()).hexdigest()


# The session secret and coach PIN live in the DB (not an env var) since we
# don't have dashboard access to set env vars on the hosting platform - the
# coach can change the PIN from within the app instead. Default PIN is 1234;
# change it via "Change PIN" right after first deploy.
with get_conn() as _conn:
    _SESSION_SECRET = get_or_create_setting(_conn, "session_secret", lambda: secrets.token_urlsafe(32))
    get_or_create_setting(_conn, "coach_pin_hash", lambda: _hash_pin("1234"))


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Junior Golf Tracker", lifespan=lifespan)
app.add_middleware(
    SessionMiddleware,
    secret_key=_SESSION_SECRET,
    same_site="lax",
    https_only=bool(os.environ.get("TURSO_DATABASE_URL")),
)
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")


@app.middleware("http")
async def no_cache_static(request: Request, call_next):
    # Static JS/CSS have bitten us before with browsers/PWA holding onto a
    # stale cached copy after a deploy. Force revalidation (still cheap via
    # ETag/304) instead of trusting heuristic freshness.
    response = await call_next(request)
    if request.url.path.startswith("/static/"):
        response.headers["Cache-Control"] = "no-cache"
    return response


def require_coach(request: Request):
    if not request.session.get("coach"):
        raise HTTPException(401, "Not authenticated")


def _require_coach_page(request: Request):
    """For page routes: bounce to the PIN screen instead of a bare 401."""
    if not request.session.get("coach"):
        return RedirectResponse(f"/coach-login?next={request.url.path}")
    return None


def _clean_level_override(value):
    if value is None or not (0 <= value < len(gamify.LEVELS)):
        return None
    return value


# ---------- Schemas ----------

class PlayerIn(BaseModel):
    name: str
    category: str = ""
    notes: str = ""
    level_override: int | None = None
    class_id: int | None = None


class ClassIn(BaseModel):
    name: str


class DrillIn(BaseModel):
    name: str
    description: str = ""


class DrillReorder(BaseModel):
    order: list[int]


class EntryIn(BaseModel):
    player_id: int
    drill_id: int
    entry_date: str
    value: str = ""


class DailyDrillIn(BaseModel):
    drill_date: str
    drill_id: int
    selected: bool = True


class QuestIn(BaseModel):
    name: str
    icon: str = "🎯"
    description: str = ""
    target: int = 1
    class_id: int | None = None
    level_index: int | None = None
    quest_type: str = "main"


class QuestProgressIn(BaseModel):
    player_id: int
    quest_id: int
    current: int = 0


class AvatarIn(BaseModel):
    seed: str
    bg: str
    hair: str | None = None
    hair_color: str | None = None
    skin_color: str | None = None


class AttendanceIn(BaseModel):
    class_id: int | None = None
    attendance_date: str
    attendance_time: str = ""
    player_id: int
    present: bool = True


# ---------- Pages ----------

@app.get("/coach-login")
def coach_login_page(request: Request):
    if request.session.get("coach"):
        return RedirectResponse("/")
    return FileResponse(BASE_DIR / "templates/coach_login.html")


@app.get("/")
def index_page(request: Request):
    return _require_coach_page(request) or FileResponse(BASE_DIR / "templates/index.html")


@app.get("/players/{player_id}")
def player_page(player_id: int, request: Request):
    return _require_coach_page(request) or FileResponse(BASE_DIR / "templates/player.html")


@app.get("/p/{player_id}")
def public_player_page(player_id: int):
    return FileResponse(BASE_DIR / "templates/public_player.html")


@app.get("/my")
def my_login_page():
    return FileResponse(BASE_DIR / "templates/my.html")


@app.get("/attendance")
def attendance_page(request: Request):
    return _require_coach_page(request) or FileResponse(BASE_DIR / "templates/attendance.html")


@app.get("/quests")
def quests_page(request: Request):
    return _require_coach_page(request) or FileResponse(BASE_DIR / "templates/quests.html")


@app.get("/drills")
def drills_page(request: Request):
    return _require_coach_page(request) or FileResponse(BASE_DIR / "templates/drills.html")


@app.get("/today")
def today_page(request: Request):
    return _require_coach_page(request) or FileResponse(BASE_DIR / "templates/today.html")


@app.get("/sw.js")
def service_worker():
    # Served from the root (not /static/) so its scope covers the whole app.
    return FileResponse(BASE_DIR / "static/sw.js", media_type="application/javascript")


# ---------- Coach auth API ----------

class CoachLoginIn(BaseModel):
    pin: str


class CoachChangePinIn(BaseModel):
    current_pin: str
    new_pin: str


@app.post("/api/coach/login")
def coach_login(payload: CoachLoginIn, request: Request):
    with get_conn() as conn:
        stored_hash = get_or_create_setting(conn, "coach_pin_hash", lambda: _hash_pin("1234"))
    if _hash_pin(payload.pin) != stored_hash:
        raise HTTPException(401, "Incorrect PIN")
    request.session["coach"] = True
    return {"ok": True}


@app.post("/api/coach/logout")
def coach_logout(request: Request):
    request.session.clear()
    return {"ok": True}


@app.get("/api/coach/session")
def coach_session_status(request: Request):
    return {"authenticated": bool(request.session.get("coach"))}


@app.post("/api/coach/change-pin")
def coach_change_pin(payload: CoachChangePinIn, _=Depends(require_coach)):
    with get_conn() as conn:
        stored_hash = get_or_create_setting(conn, "coach_pin_hash", lambda: _hash_pin("1234"))
        if _hash_pin(payload.current_pin) != stored_hash:
            raise HTTPException(401, "Current PIN is incorrect")
        new_pin = payload.new_pin.strip()
        if len(new_pin) < 4:
            raise HTTPException(400, "New PIN must be at least 4 characters")
        set_setting(conn, "coach_pin_hash", _hash_pin(new_pin))
    return {"ok": True}


# ---------- Players API ----------

@app.get("/api/players")
def list_players(_=Depends(require_coach)):
    with get_conn() as conn:
        rows = conn.query("SELECT * FROM players ORDER BY category, name COLLATE NOCASE")
        all_entries = conn.query("SELECT player_id, entry_date, drill_id, value FROM entries")
        num_drills = conn.query_one("SELECT COUNT(*) c FROM drills")["c"]
        all_quests = conn.query("SELECT id, target, level_index FROM quests")
        all_progress = conn.query("SELECT player_id, quest_id, current FROM quest_progress")

    by_player = {}
    for e in all_entries:
        by_player.setdefault(e["player_id"], []).append(e)

    quests_by_level = {}
    for q in all_quests:
        quests_by_level.setdefault(q["level_index"], []).append(q)

    progress_by_player = {}
    for p in all_progress:
        progress_by_player.setdefault(p["player_id"], {})[p["quest_id"]] = p["current"]

    for row in rows:
        stats = gamify.compute_player_stats(
            by_player.get(row["id"], []), num_drills, row.get("level_override")
        )
        row["xp"] = stats["xp"]
        row["level_index"] = stats["level_index"]
        row["level_name"] = stats["level_name"]
        row["level_icon"] = stats["level_icon"]
        row["level_is_manual"] = stats["level_is_manual"]
        row["current_week_streak"] = stats["current_week_streak"]
        row["longest_week_streak"] = stats["longest_week_streak"]

        level_quests = quests_by_level.get(stats["level_index"], [])
        if level_quests:
            player_progress = progress_by_player.get(row["id"], {})
            fractions = [
                min(player_progress.get(q["id"], 0), q["target"]) / q["target"]
                for q in level_quests
                if q["target"] > 0
            ]
            row["quest_progress_pct"] = round(100 * sum(fractions) / len(fractions)) if fractions else None
        else:
            row["quest_progress_pct"] = None
        row.pop("access_code", None)
    return rows


@app.get("/api/players/{player_id}")
def get_player(player_id: int):
    with get_conn() as conn:
        row = conn.query_one("SELECT * FROM players WHERE id=?", (player_id,))
    if not row:
        raise HTTPException(404, "Player not found")
    return row


@app.get("/api/players/{player_id}/stats")
def get_player_stats(player_id: int):
    with get_conn() as conn:
        player_row = conn.query_one("SELECT level_override FROM players WHERE id=?", (player_id,))
        entries = conn.query(
            "SELECT entry_date, drill_id, value FROM entries WHERE player_id=?", (player_id,)
        )
        num_drills = conn.query_one("SELECT COUNT(*) c FROM drills")["c"]
    level_override = player_row["level_override"] if player_row else None
    return gamify.compute_player_stats(entries, num_drills, level_override)


AVATAR_BG_CHOICES = {
    "b6e3f4", "c0aede", "d1d4f9", "ffd5dc", "ffdfbf", "c8e6c9", "fff9c4", "b2ebf2",
}
# DiceBear's "adventurer" style has no gender field, but its short-hair vs
# long-hair sets double as a boy/girl toggle well enough for this purpose.
AVATAR_BOY_HAIR = {f"short{i:02d}" for i in range(1, 20)}
AVATAR_GIRL_HAIR = {f"long{i:02d}" for i in range(1, 27)}
AVATAR_HAIR_CHOICES = AVATAR_BOY_HAIR | AVATAR_GIRL_HAIR
# DiceBear "adventurer" style defaults - see https://api.dicebear.com/9.x/adventurer/schema.json
AVATAR_HAIR_COLOR_CHOICES = {
    "ac6511", "cb6820", "ab2a18", "e5d7a3", "b9a05f", "796a45", "6a4e35",
    "562306", "0e0e0e", "afafaf", "3eac2c", "85c2c6", "dba3be", "592454",
}
AVATAR_SKIN_COLOR_CHOICES = {"f2d3b1", "ecad80", "9e5622", "763900"}


@app.post("/api/players/{player_id}/avatar")
def set_avatar(player_id: int, avatar: AvatarIn):
    # No coach auth: this is the one thing juniors can write themselves, from
    # their own read-only /p/{id} page. Low stakes (cosmetic only), so it's
    # deliberately left open like the rest of the public profile endpoints.
    bg = avatar.bg.strip().lower()
    if bg not in AVATAR_BG_CHOICES:
        raise HTTPException(400, "Invalid background color")
    seed = avatar.seed.strip()[:60]
    if not seed:
        raise HTTPException(400, "Missing seed")
    hair = avatar.hair.strip() if avatar.hair else None
    if hair and hair not in AVATAR_HAIR_CHOICES:
        raise HTTPException(400, "Invalid hair style")
    hair_color = avatar.hair_color.strip().lower() if avatar.hair_color else None
    if hair_color and hair_color not in AVATAR_HAIR_COLOR_CHOICES:
        raise HTTPException(400, "Invalid hair color")
    skin_color = avatar.skin_color.strip().lower() if avatar.skin_color else None
    if skin_color and skin_color not in AVATAR_SKIN_COLOR_CHOICES:
        raise HTTPException(400, "Invalid skin color")
    with get_conn() as conn:
        player = conn.query_one("SELECT id FROM players WHERE id=?", (player_id,))
        if not player:
            raise HTTPException(404, "Player not found")
        conn.exec(
            "UPDATE players SET avatar_seed=?, avatar_bg=?, avatar_hair=?, avatar_hair_color=?, avatar_skin_color=? WHERE id=?",
            (seed, bg, hair, hair_color, skin_color, player_id),
        )
    return {"ok": True, "seed": seed, "bg": bg, "hair": hair, "hair_color": hair_color, "skin_color": skin_color}


def _unique_access_code(conn, name):
    existing_lower = {
        r["access_code"].lower() for r in conn.query("SELECT access_code FROM players") if r["access_code"]
    }
    return generate_access_code(name, existing_lower)


@app.post("/api/players")
def create_player(player: PlayerIn, _=Depends(require_coach)):
    with get_conn() as conn:
        code = _unique_access_code(conn, player.name.strip())
        cur = conn.exec(
            "INSERT INTO players (name, category, notes, level_override, class_id, access_code) VALUES (?, ?, ?, ?, ?, ?)",
            (player.name.strip(), player.category.strip(), player.notes.strip(),
             _clean_level_override(player.level_override), player.class_id, code),
        )
        new_id = cur.lastrowid
    return {"id": new_id}


@app.put("/api/players/{player_id}")
def update_player(player_id: int, player: PlayerIn, _=Depends(require_coach)):
    with get_conn() as conn:
        conn.exec(
            "UPDATE players SET name=?, category=?, notes=?, level_override=?, class_id=? WHERE id=?",
            (player.name.strip(), player.category.strip(), player.notes.strip(),
             _clean_level_override(player.level_override), player.class_id, player_id),
        )
    return {"ok": True}


@app.get("/api/players/code/{code}")
def get_player_by_code(code: str):
    with get_conn() as conn:
        row = conn.query_one(
            "SELECT id, name FROM players WHERE access_code = ? COLLATE NOCASE", (code.strip(),)
        )
    if not row:
        raise HTTPException(404, "Code not found")
    return row


@app.post("/api/players/{player_id}/regenerate-code")
def regenerate_access_code(player_id: int, _=Depends(require_coach)):
    with get_conn() as conn:
        player = conn.query_one("SELECT id, name FROM players WHERE id=?", (player_id,))
        if not player:
            raise HTTPException(404, "Player not found")
        code = _unique_access_code(conn, player["name"])
        conn.exec("UPDATE players SET access_code=? WHERE id=?", (code, player_id))
    return {"access_code": code}


@app.delete("/api/players/{player_id}")
def delete_player(player_id: int, _=Depends(require_coach)):
    with get_conn() as conn:
        conn.exec("DELETE FROM players WHERE id=?", (player_id,))
    return {"ok": True}


# ---------- Classes API ----------

@app.get("/api/classes")
def list_classes(_=Depends(require_coach)):
    with get_conn() as conn:
        rows = conn.query("SELECT * FROM classes ORDER BY sort_order, id")
    return rows


@app.post("/api/classes")
def create_class(cls: ClassIn, _=Depends(require_coach)):
    with get_conn() as conn:
        max_order = conn.query_one("SELECT COALESCE(MAX(sort_order), 0) m FROM classes")["m"]
        cur = conn.exec(
            "INSERT INTO classes (name, sort_order) VALUES (?, ?)",
            (cls.name.strip(), max_order + 1),
        )
        new_id = cur.lastrowid
    return {"id": new_id}


@app.put("/api/classes/{class_id}")
def update_class(class_id: int, cls: ClassIn, _=Depends(require_coach)):
    with get_conn() as conn:
        conn.exec("UPDATE classes SET name=? WHERE id=?", (cls.name.strip(), class_id))
    return {"ok": True}


@app.delete("/api/classes/{class_id}")
def delete_class(class_id: int, _=Depends(require_coach)):
    with get_conn() as conn:
        conn.exec("UPDATE players SET class_id=NULL WHERE class_id=?", (class_id,))
        conn.exec("DELETE FROM classes WHERE id=?", (class_id,))
    return {"ok": True}


# ---------- Drills API ----------

@app.get("/api/drills")
def list_drills():
    with get_conn() as conn:
        rows = conn.query("SELECT * FROM drills ORDER BY sort_order, id")
    return rows


@app.post("/api/drills")
def create_drill(drill: DrillIn, _=Depends(require_coach)):
    with get_conn() as conn:
        max_order = conn.query_one("SELECT COALESCE(MAX(sort_order), 0) m FROM drills")["m"]
        cur = conn.exec(
            "INSERT INTO drills (name, description, sort_order) VALUES (?, ?, ?)",
            (drill.name.strip(), drill.description.strip(), max_order + 1),
        )
        new_id = cur.lastrowid
    return {"id": new_id}


@app.put("/api/drills/{drill_id}")
def update_drill(drill_id: int, drill: DrillIn, _=Depends(require_coach)):
    with get_conn() as conn:
        conn.exec(
            "UPDATE drills SET name=?, description=? WHERE id=?",
            (drill.name.strip(), drill.description.strip(), drill_id),
        )
    return {"ok": True}


@app.delete("/api/drills/{drill_id}")
def delete_drill(drill_id: int, _=Depends(require_coach)):
    with get_conn() as conn:
        conn.exec("DELETE FROM drills WHERE id=?", (drill_id,))
    return {"ok": True}


@app.post("/api/drills/reorder")
def reorder_drills(payload: DrillReorder, _=Depends(require_coach)):
    with get_conn() as conn:
        for idx, drill_id in enumerate(payload.order):
            conn.exec("UPDATE drills SET sort_order=? WHERE id=?", (idx, drill_id))
    return {"ok": True}


@app.get("/api/daily-drills")
def get_daily_drills(drill_date: str):
    with get_conn() as conn:
        rows = conn.query("SELECT drill_id FROM daily_drills WHERE drill_date=?", (drill_date,))
    return [r["drill_id"] for r in rows]


@app.post("/api/daily-drills")
def set_daily_drill(entry: DailyDrillIn, _=Depends(require_coach)):
    with get_conn() as conn:
        drill = conn.query_one("SELECT id FROM drills WHERE id=?", (entry.drill_id,))
        if not drill:
            raise HTTPException(404, "Drill not found")
        if entry.selected:
            conn.exec(
                """
                INSERT INTO daily_drills (drill_date, drill_id)
                VALUES (?, ?)
                ON CONFLICT(drill_date, drill_id) DO NOTHING
                """,
                (entry.drill_date, entry.drill_id),
            )
        else:
            conn.exec(
                "DELETE FROM daily_drills WHERE drill_date=? AND drill_id=?",
                (entry.drill_date, entry.drill_id),
            )
    return {"ok": True}


# ---------- Entries API ----------

@app.get("/api/players/{player_id}/entries")
def get_entries(player_id: int):
    with get_conn() as conn:
        rows = conn.query(
            "SELECT * FROM entries WHERE player_id=? ORDER BY entry_date", (player_id,)
        )
    return rows


@app.post("/api/entries")
def upsert_entry(entry: EntryIn, _=Depends(require_coach)):
    with get_conn() as conn:
        if entry.value.strip() == "":
            conn.exec(
                "DELETE FROM entries WHERE player_id=? AND drill_id=? AND entry_date=?",
                (entry.player_id, entry.drill_id, entry.entry_date),
            )
        else:
            conn.exec(
                """
                INSERT INTO entries (player_id, drill_id, entry_date, value)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(player_id, drill_id, entry_date)
                DO UPDATE SET value=excluded.value
                """,
                (entry.player_id, entry.drill_id, entry.entry_date, entry.value.strip()),
            )
    return {"ok": True}


@app.delete("/api/players/{player_id}/dates/{entry_date}")
def delete_date_row(player_id: int, entry_date: str, _=Depends(require_coach)):
    with get_conn() as conn:
        conn.exec(
            "DELETE FROM entries WHERE player_id=? AND entry_date=?",
            (player_id, entry_date),
        )
    return {"ok": True}


# ---------- Custom Quests API ----------

@app.get("/api/quests")
def list_quests():
    with get_conn() as conn:
        rows = conn.query("SELECT * FROM quests ORDER BY sort_order, id")
    return rows


def _resolve_quest_scope(conn, quest: QuestIn):
    """A quest is scoped to exactly one of: a class, or a level.
    Returns (class_id, level_index) ready to store."""
    if quest.class_id is not None:
        cls = conn.query_one("SELECT id FROM classes WHERE id=?", (quest.class_id,))
        if not cls:
            raise HTTPException(404, "Class not found")
        return quest.class_id, 0
    if quest.level_index is not None:
        if not (0 <= quest.level_index < len(gamify.LEVELS)):
            raise HTTPException(400, "Invalid level")
        return None, quest.level_index
    raise HTTPException(400, "Quest must be scoped to a class or a level")


def _clean_quest_type(value):
    return value if value in ("main", "side") else "main"


@app.post("/api/quests")
def create_quest(quest: QuestIn, _=Depends(require_coach)):
    with get_conn() as conn:
        class_id, level_index = _resolve_quest_scope(conn, quest)
        max_order = conn.query_one("SELECT COALESCE(MAX(sort_order), 0) m FROM quests")["m"]
        cur = conn.exec(
            "INSERT INTO quests (name, icon, description, target, class_id, level_index, quest_type, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (quest.name.strip(), quest.icon.strip() or "🎯", quest.description.strip(),
             max(1, quest.target), class_id, level_index, _clean_quest_type(quest.quest_type), max_order + 1),
        )
        new_id = cur.lastrowid
    return {"id": new_id}


@app.put("/api/quests/{quest_id}")
def update_quest(quest_id: int, quest: QuestIn, _=Depends(require_coach)):
    with get_conn() as conn:
        class_id, level_index = _resolve_quest_scope(conn, quest)
        conn.exec(
            "UPDATE quests SET name=?, icon=?, description=?, target=?, class_id=?, level_index=?, quest_type=? WHERE id=?",
            (quest.name.strip(), quest.icon.strip() or "🎯", quest.description.strip(),
             max(1, quest.target), class_id, level_index, _clean_quest_type(quest.quest_type), quest_id),
        )
    return {"ok": True}


@app.delete("/api/quests/{quest_id}")
def delete_quest(quest_id: int, _=Depends(require_coach)):
    with get_conn() as conn:
        conn.exec("DELETE FROM quests WHERE id=?", (quest_id,))
    return {"ok": True}


@app.get("/api/players/{player_id}/quest-progress")
def get_quest_progress(player_id: int):
    with get_conn() as conn:
        rows = conn.query(
            "SELECT quest_id, current FROM quest_progress WHERE player_id=?", (player_id,)
        )
    return rows


@app.post("/api/quest-progress")
def upsert_quest_progress(progress: QuestProgressIn, _=Depends(require_coach)):
    with get_conn() as conn:
        quest = conn.query_one("SELECT target FROM quests WHERE id=?", (progress.quest_id,))
        if not quest:
            raise HTTPException(404, "Quest not found")
        clamped = max(0, min(progress.current, quest["target"]))
        conn.exec(
            """
            INSERT INTO quest_progress (player_id, quest_id, current)
            VALUES (?, ?, ?)
            ON CONFLICT(player_id, quest_id)
            DO UPDATE SET current=excluded.current
            """,
            (progress.player_id, progress.quest_id, clamped),
        )
    return {"ok": True, "current": clamped}


# ---------- Attendance API ----------

def _parse_class_id(class_id: str | None):
    """Query params arrive as strings; "" or absent means 'no class'."""
    return int(class_id) if class_id not in (None, "") else None


@app.get("/api/attendance")
def get_attendance(
    attendance_date: str, class_id: str | None = None, attendance_time: str = "", _=Depends(require_coach)
):
    cid = _parse_class_id(class_id)
    with get_conn() as conn:
        rows = conn.query(
            "SELECT player_id FROM attendance WHERE class_id IS ? AND attendance_date=? AND attendance_time=?",
            (cid, attendance_date, attendance_time),
        )
    return [r["player_id"] for r in rows]


@app.get("/api/attendance/month")
def get_attendance_month(month: str, class_id: str | None = None, _=Depends(require_coach)):
    cid = _parse_class_id(class_id)
    with get_conn() as conn:
        rows = conn.query(
            """
            SELECT a.attendance_date, a.attendance_time, a.player_id, p.name AS player_name
            FROM attendance a
            JOIN players p ON p.id = a.player_id
            WHERE a.class_id IS ? AND a.attendance_date LIKE ?
            ORDER BY a.attendance_date, a.attendance_time, p.name COLLATE NOCASE
            """,
            (cid, f"{month}%"),
        )
    return rows


@app.post("/api/attendance")
def set_attendance(entry: AttendanceIn, _=Depends(require_coach)):
    with get_conn() as conn:
        if entry.class_id is not None:
            cls = conn.query_one("SELECT id FROM classes WHERE id=?", (entry.class_id,))
            if not cls:
                raise HTTPException(404, "Class not found")
        player = conn.query_one("SELECT id FROM players WHERE id=?", (entry.player_id,))
        if not player:
            raise HTTPException(404, "Player not found")

        conn.exec(
            "DELETE FROM attendance WHERE class_id IS ? AND attendance_date=? AND attendance_time=? AND player_id=?",
            (entry.class_id, entry.attendance_date, entry.attendance_time, entry.player_id),
        )
        if entry.present:
            conn.exec(
                "INSERT INTO attendance (class_id, attendance_date, attendance_time, player_id) VALUES (?, ?, ?, ?)",
                (entry.class_id, entry.attendance_date, entry.attendance_time, entry.player_id),
            )
    return {"ok": True}
