from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from database import get_conn, init_db

BASE_DIR = Path(__file__).parent


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Junior Golf Tracker", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")


# ---------- Schemas ----------

class PlayerIn(BaseModel):
    name: str
    category: str = ""
    notes: str = ""


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


# ---------- Pages ----------

@app.get("/")
def index_page():
    return FileResponse(BASE_DIR / "templates/index.html")


@app.get("/players/{player_id}")
def player_page(player_id: int):
    return FileResponse(BASE_DIR / "templates/player.html")


# ---------- Players API ----------

@app.get("/api/players")
def list_players():
    conn = get_conn()
    rows = conn.query("SELECT * FROM players ORDER BY category, name COLLATE NOCASE")
    conn.close()
    return rows


@app.get("/api/players/{player_id}")
def get_player(player_id: int):
    conn = get_conn()
    row = conn.query_one("SELECT * FROM players WHERE id=?", (player_id,))
    conn.close()
    if not row:
        raise HTTPException(404, "Player not found")
    return row


@app.post("/api/players")
def create_player(player: PlayerIn):
    conn = get_conn()
    cur = conn.exec(
        "INSERT INTO players (name, category, notes) VALUES (?, ?, ?)",
        (player.name.strip(), player.category.strip(), player.notes.strip()),
    )
    new_id = cur.lastrowid
    conn.close()
    return {"id": new_id}


@app.put("/api/players/{player_id}")
def update_player(player_id: int, player: PlayerIn):
    conn = get_conn()
    conn.exec(
        "UPDATE players SET name=?, category=?, notes=? WHERE id=?",
        (player.name.strip(), player.category.strip(), player.notes.strip(), player_id),
    )
    conn.close()
    return {"ok": True}


@app.delete("/api/players/{player_id}")
def delete_player(player_id: int):
    conn = get_conn()
    conn.exec("DELETE FROM players WHERE id=?", (player_id,))
    conn.close()
    return {"ok": True}


# ---------- Drills API ----------

@app.get("/api/drills")
def list_drills():
    conn = get_conn()
    rows = conn.query("SELECT * FROM drills ORDER BY sort_order, id")
    conn.close()
    return rows


@app.post("/api/drills")
def create_drill(drill: DrillIn):
    conn = get_conn()
    max_order = conn.query_one("SELECT COALESCE(MAX(sort_order), 0) m FROM drills")["m"]
    cur = conn.exec(
        "INSERT INTO drills (name, description, sort_order) VALUES (?, ?, ?)",
        (drill.name.strip(), drill.description.strip(), max_order + 1),
    )
    new_id = cur.lastrowid
    conn.close()
    return {"id": new_id}


@app.put("/api/drills/{drill_id}")
def update_drill(drill_id: int, drill: DrillIn):
    conn = get_conn()
    conn.exec(
        "UPDATE drills SET name=?, description=? WHERE id=?",
        (drill.name.strip(), drill.description.strip(), drill_id),
    )
    conn.close()
    return {"ok": True}


@app.delete("/api/drills/{drill_id}")
def delete_drill(drill_id: int):
    conn = get_conn()
    conn.exec("DELETE FROM drills WHERE id=?", (drill_id,))
    conn.close()
    return {"ok": True}


@app.post("/api/drills/reorder")
def reorder_drills(payload: DrillReorder):
    conn = get_conn()
    for idx, drill_id in enumerate(payload.order):
        conn.exec("UPDATE drills SET sort_order=? WHERE id=?", (idx, drill_id))
    conn.close()
    return {"ok": True}


# ---------- Entries API ----------

@app.get("/api/players/{player_id}/entries")
def get_entries(player_id: int):
    conn = get_conn()
    rows = conn.query(
        "SELECT * FROM entries WHERE player_id=? ORDER BY entry_date", (player_id,)
    )
    conn.close()
    return rows


@app.post("/api/entries")
def upsert_entry(entry: EntryIn):
    conn = get_conn()
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
    conn.close()
    return {"ok": True}


@app.delete("/api/players/{player_id}/dates/{entry_date}")
def delete_date_row(player_id: int, entry_date: str):
    conn = get_conn()
    conn.exec(
        "DELETE FROM entries WHERE player_id=? AND entry_date=?",
        (player_id, entry_date),
    )
    conn.close()
    return {"ok": True}
