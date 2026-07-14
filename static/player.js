const playerId = Number(window.location.pathname.split("/").pop());

let player = null;
let drills = [];
let entries = []; // {id, player_id, drill_id, entry_date, value}
let manualDates = new Set(); // dates added via "add date" but with no entries yet

function entryMap() {
  // date -> { drillId: value }
  const map = {};
  for (const e of entries) {
    if (!map[e.entry_date]) map[e.entry_date] = {};
    map[e.entry_date][e.drill_id] = e.value;
  }
  for (const d of manualDates) {
    if (!map[d]) map[d] = {};
  }
  return map;
}

async function loadAll() {
  const [pRes, dRes, eRes] = await Promise.all([
    fetch(`/api/players/${playerId}`),
    fetch(`/api/drills`),
    fetch(`/api/players/${playerId}/entries`),
  ]);
  if (!pRes.ok) {
    document.getElementById("playerName").textContent = "선수를 찾을 수 없어요";
    return;
  }
  player = await pRes.json();
  drills = await dRes.json();
  entries = await eRes.json();
  renderHeader();
  renderTable();
}

function renderHeader() {
  document.getElementById("playerName").textContent = player.name;
  const bits = [];
  if (player.category) bits.push(player.category);
  if (player.notes) bits.push(player.notes);
  document.getElementById("playerMeta").textContent = bits.join(" · ");
  document.title = `${player.name} · Junior Golf Tracker`;
}

function renderTable() {
  const headRow = document.getElementById("tableHeadRow");
  headRow.innerHTML = `<th class="date-col">Date</th>` +
    drills
      .map(
        (d) => `<th>
          <div class="drill-name">${escapeHtml(d.name)}</div>
          <div class="drill-desc">${escapeHtml(d.description || "")}</div>
        </th>`
      )
      .join("") +
    `<th class="actions-col"></th>`;

  const map = entryMap();
  const dates = Object.keys(map).sort();
  const tbody = document.getElementById("tableBody");
  const emptyHint = document.getElementById("emptyHint");

  if (dates.length === 0) {
    tbody.innerHTML = "";
    emptyHint.classList.remove("hidden");
    document.getElementById("logTable").classList.add("hidden");
    return;
  }
  emptyHint.classList.add("hidden");
  document.getElementById("logTable").classList.remove("hidden");

  tbody.innerHTML = dates
    .map((date) => {
      const cells = drills
        .map((d) => {
          const val = map[date][d.id] ?? "";
          return `<td class="value-cell">
            <input type="text" inputmode="decimal" value="${escapeHtml(val)}"
              data-date="${date}" data-drill="${d.id}" />
          </td>`;
        })
        .join("");
      return `<tr>
        <td class="date-cell">${formatDate(date)}</td>
        ${cells}
        <td class="row-actions">
          <button class="btn-icon btn-danger" data-delete-date="${date}" title="이 날짜 기록 삭제">삭제</button>
        </td>
      </tr>`;
    })
    .join("");

  tbody.querySelectorAll("input[data-date]").forEach((input) => {
    input.addEventListener("change", onCellChange);
  });
  tbody.querySelectorAll("[data-delete-date]").forEach((btn) => {
    btn.addEventListener("click", onDeleteDate);
  });

  renderAverages();
}

function renderAverages() {
  const tfoot = document.getElementById("tableFoot");
  const map = entryMap();
  const dates = Object.keys(map);
  if (dates.length === 0) {
    tfoot.innerHTML = "";
    return;
  }

  const sums = {};
  const counts = {};
  for (const date of dates) {
    for (const d of drills) {
      const raw = map[date][d.id];
      const num = parseFloat(raw);
      if (raw !== undefined && raw !== "" && !Number.isNaN(num)) {
        sums[d.id] = (sums[d.id] ?? 0) + num;
        counts[d.id] = (counts[d.id] ?? 0) + 1;
      }
    }
  }

  const cells = drills
    .map((d) => {
      const c = counts[d.id];
      const text = c ? formatAvg(sums[d.id] / c) : "-";
      return `<td class="avg-cell">${text}</td>`;
    })
    .join("");

  tfoot.innerHTML = `<tr class="avg-row"><td class="date-cell">평균</td>${cells}<td></td></tr>`;
}

function formatAvg(n) {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function formatDate(iso) {
  const [y, m, d] = iso.split("-");
  if (!m) return iso;
  return `${y}-${m}-${d}`;
}

async function onCellChange(e) {
  const input = e.target;
  const date = input.dataset.date;
  const drillId = Number(input.dataset.drill);
  const value = input.value.trim();

  await fetch("/api/entries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ player_id: playerId, drill_id: drillId, entry_date: date, value }),
  });

  const existing = entries.find((x) => x.entry_date === date && x.drill_id === drillId);
  if (value === "") {
    entries = entries.filter((x) => !(x.entry_date === date && x.drill_id === drillId));
  } else if (existing) {
    existing.value = value;
  } else {
    entries.push({ player_id: playerId, drill_id: drillId, entry_date: date, value });
  }
  manualDates.delete(date);
  renderAverages();
  flashSaved();
}

async function onDeleteDate(e) {
  const date = e.target.dataset.deleteDate;
  if (!confirm(`${date} 기록을 삭제할까요?`)) return;
  await fetch(`/api/players/${playerId}/dates/${date}`, { method: "DELETE" });
  entries = entries.filter((x) => x.entry_date !== date);
  manualDates.delete(date);
  renderTable();
  flashSaved("삭제됨");
}

function flashSaved(msg = "저장됨") {
  const flash = document.getElementById("saveFlash");
  flash.textContent = msg;
  flash.classList.add("show");
  clearTimeout(flashSaved._t);
  flashSaved._t = setTimeout(() => flash.classList.remove("show"), 1200);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// ---------- Add date ----------
const dateModal = document.getElementById("dateModal");
document.getElementById("addDateBtn").addEventListener("click", () => {
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById("newDateInput").value = today;
  dateModal.classList.remove("hidden");
});
document.getElementById("cancelDateBtn").addEventListener("click", () => dateModal.classList.add("hidden"));
dateModal.addEventListener("click", (e) => { if (e.target === dateModal) dateModal.classList.add("hidden"); });

document.getElementById("confirmDateBtn").addEventListener("click", () => {
  const date = document.getElementById("newDateInput").value;
  if (!date) return;
  manualDates.add(date);
  dateModal.classList.add("hidden");
  renderTable();
});

// ---------- Edit player ----------
const editModal = document.getElementById("editPlayerModal");
document.getElementById("editPlayerBtn").addEventListener("click", () => {
  document.getElementById("editNameInput").value = player.name;
  document.getElementById("editCategoryInput").value = player.category || "";
  document.getElementById("editNotesInput").value = player.notes || "";
  editModal.classList.remove("hidden");
});
document.getElementById("cancelEditPlayerBtn").addEventListener("click", () => editModal.classList.add("hidden"));
editModal.addEventListener("click", (e) => { if (e.target === editModal) editModal.classList.add("hidden"); });

document.getElementById("saveEditPlayerBtn").addEventListener("click", async () => {
  const name = document.getElementById("editNameInput").value.trim();
  if (!name) { alert("이름을 입력해주세요."); return; }
  const category = document.getElementById("editCategoryInput").value.trim();
  const notes = document.getElementById("editNotesInput").value.trim();
  await fetch(`/api/players/${playerId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, category, notes }),
  });
  player = { ...player, name, category, notes };
  renderHeader();
  editModal.classList.add("hidden");
  flashSaved();
});

document.getElementById("deletePlayerBtn").addEventListener("click", async () => {
  if (!confirm(`${player.name} 선수를 삭제할까요? 모든 기록이 함께 삭제됩니다.`)) return;
  await fetch(`/api/players/${playerId}`, { method: "DELETE" });
  window.location.href = "/";
});

// ---------- Drill manager ----------
const drillModal = document.getElementById("drillModal");
document.getElementById("manageDrillsBtn").addEventListener("click", () => {
  renderDrillManager();
  drillModal.classList.remove("hidden");
});
document.getElementById("closeDrillModalBtn").addEventListener("click", async () => {
  drillModal.classList.add("hidden");
  await loadAll();
});
drillModal.addEventListener("click", (e) => { if (e.target === drillModal) drillModal.classList.add("hidden"); });

function renderDrillManager() {
  const list = document.getElementById("drillManagerList");
  list.innerHTML = drills
    .map(
      (d) => `
    <div class="drill-row" data-id="${d.id}">
      <div class="fields">
        <input type="text" class="drill-name-input" value="${escapeHtml(d.name)}" placeholder="드릴 이름" />
        <textarea class="drill-desc-input" placeholder="설명 (측정 방법, 점수 규칙 등)">${escapeHtml(d.description || "")}</textarea>
      </div>
      <button class="btn-icon btn-danger" data-drill-delete="${d.id}">삭제</button>
    </div>`
    )
    .join("");

  list.querySelectorAll(".drill-row").forEach((row) => {
    const id = Number(row.dataset.id);
    const nameInput = row.querySelector(".drill-name-input");
    const descInput = row.querySelector(".drill-desc-input");
    const save = async () => {
      const name = nameInput.value.trim();
      if (!name) return;
      await fetch(`/api/drills/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: descInput.value.trim() }),
      });
      const d = drills.find((x) => x.id === id);
      if (d) { d.name = name; d.description = descInput.value.trim(); }
      renderTable();
      flashSaved();
    };
    nameInput.addEventListener("change", save);
    descInput.addEventListener("change", save);
  });

  list.querySelectorAll("[data-drill-delete]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.dataset.drillDelete);
      const d = drills.find((x) => x.id === id);
      if (!confirm(`'${d ? d.name : ""}' 드릴을 삭제할까요? 관련 기록도 함께 삭제됩니다.`)) return;
      await fetch(`/api/drills/${id}`, { method: "DELETE" });
      drills = drills.filter((x) => x.id !== id);
      entries = entries.filter((x) => x.drill_id !== id);
      renderDrillManager();
      renderTable();
    });
  });
}

document.getElementById("addDrillBtn").addEventListener("click", async () => {
  const res = await fetch("/api/drills", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "새 드릴", description: "" }),
  });
  const data = await res.json();
  drills.push({ id: data.id, name: "새 드릴", description: "", sort_order: drills.length });
  renderDrillManager();
  renderTable();
});

loadAll();
