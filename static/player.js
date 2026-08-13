const playerId = Number(window.location.pathname.split("/").pop());

let player = null;
let drills = [];
let entries = []; // {id, player_id, drill_id, entry_date, value}
let manualDates = new Set(); // dates added via "add date" but with no entries yet
let stats = null; // gamification stats, see gamify.py
let customQuests = []; // [{id, name, icon, description, target, sort_order}]
let questProgress = {}; // quest_id -> current
let allClasses = []; // [{id, name, sort_order}]

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
  const [pRes, dRes, eRes, sRes, qRes, qpRes, clsRes] = await Promise.all([
    fetch(`/api/players/${playerId}`),
    fetch(`/api/drills`),
    fetch(`/api/players/${playerId}/entries`),
    fetch(`/api/players/${playerId}/stats`),
    fetch(`/api/quests`),
    fetch(`/api/players/${playerId}/quest-progress`),
    fetch(`/api/classes`),
  ]);
  if (!pRes.ok) {
    document.getElementById("playerName").textContent = "Player not found";
    return;
  }
  player = await pRes.json();
  drills = await dRes.json();
  entries = await eRes.json();
  stats = await sRes.json();
  customQuests = await qRes.json();
  allClasses = await clsRes.json();
  questProgress = {};
  for (const row of await qpRes.json()) questProgress[row.quest_id] = row.current;
  renderHeader();
  renderTable();
  renderGamifyPanel();
}

async function refreshStats({ celebrate } = { celebrate: false }) {
  const prevStats = stats;
  const res = await fetch(`/api/players/${playerId}/stats`);
  stats = await res.json();
  renderGamifyPanel();
  if (celebrate) celebrateStatsChange(prevStats, stats);
}

function renderGamifyPanel() {
  const panel = document.getElementById("gamifyPanel");
  if (!stats) {
    panel.innerHTML = "";
    return;
  }
  const allQuestsWithProgress = customQuests.map((q) => {
    let scopeLabel = null;
    if (q.class_id !== null) {
      const cls = allClasses.find((c) => c.id === q.class_id);
      scopeLabel = cls ? cls.name : null;
    } else if (LEVELS[q.level_index]) {
      scopeLabel = `${LEVELS[q.level_index][1]} ${LEVELS[q.level_index][0]}`;
    }
    return { ...q, current: questProgress[q.id] ?? 0, scope_label: scopeLabel };
  });
  const currentLevelQuests = allQuestsWithProgress.filter((q) => q.level_index === stats.level_index);

  panel.innerHTML = `
    <div class="gamify-top">
      ${levelChipHtml(stats, "lg")}
      ${stats.level_is_manual ? `<span class="manual-tag">\u{270F}\u{FE0F} set by coach</span>` : ""}
      ${streakChipHtml(stats)}
    </div>
    ${xpBarHtml(stats)}
    ${questProgressListHtml(currentLevelQuests)}
  `;

  panel.querySelectorAll(".quest-progress-input").forEach((input) => {
    input.addEventListener("change", onQuestProgressChange);
  });
}

async function onQuestProgressChange(e) {
  const input = e.target;
  const questId = Number(input.dataset.questId);
  const quest = customQuests.find((q) => q.id === questId);
  if (!quest) return;

  const prevCurrent = questProgress[questId] ?? 0;
  let value = Math.round(Number(input.value));
  if (Number.isNaN(value)) value = 0;
  value = Math.max(0, Math.min(value, quest.target));

  const res = await fetch("/api/quest-progress", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ player_id: playerId, quest_id: questId, current: value }),
  });
  const data = await res.json();
  questProgress[questId] = data.current;
  renderGamifyPanel();
  flashSaved();

  if (data.current >= quest.target && prevCurrent < quest.target) {
    celebrateBadge({ icon: quest.icon, name: quest.name });
  }
}

function renderHeader() {
  document.getElementById("playerName").textContent = player.name;
  const bits = [];
  if (player.category) bits.push(player.category);
  if (player.notes) bits.push(player.notes);
  document.getElementById("playerMeta").textContent = bits.join(" · ");
  document.title = `${player.name} · Junior Golf Tracker`;
  document.getElementById("publicProfileLink").href = `/p/${playerId}`;
  document.getElementById("myLoginUrl").textContent = `${window.location.origin}/my`;
  document.getElementById("accessCodeChip").textContent = player.access_code || "------";
}

document.getElementById("accessCodeChip").addEventListener("click", async () => {
  if (!player || !player.access_code) return;
  try {
    await navigator.clipboard.writeText(player.access_code);
  } catch {
    // clipboard API unavailable - selection still visible on the chip
  }
  const copied = document.getElementById("accessCodeCopied");
  copied.classList.remove("hidden");
  clearTimeout(copied._t);
  copied._t = setTimeout(() => copied.classList.add("hidden"), 1500);
});

document.getElementById("regenerateCodeBtn").addEventListener("click", async () => {
  if (!confirm("Generate a new code for this player? Their old code will stop working.")) return;
  const res = await fetch(`/api/players/${playerId}/regenerate-code`, { method: "POST" });
  const data = await res.json();
  player.access_code = data.access_code;
  document.getElementById("accessCodeChip").textContent = player.access_code;
  flashSaved();
});

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
          <button class="btn-icon btn-danger" data-delete-date="${date}" title="Delete this date's record">Delete</button>
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

  tfoot.innerHTML = `<tr class="avg-row"><td class="date-cell">Average</td>${cells}<td></td></tr>`;
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
  await refreshStats({ celebrate: value !== "" });
}

async function onDeleteDate(e) {
  const date = e.target.dataset.deleteDate;
  if (!confirm(`Delete the record for ${date}?`)) return;
  await fetch(`/api/players/${playerId}/dates/${date}`, { method: "DELETE" });
  entries = entries.filter((x) => x.entry_date !== date);
  manualDates.delete(date);
  renderTable();
  flashSaved("Deleted");
  await refreshStats({ celebrate: false });
}

function flashSaved(msg = "Saved") {
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
  if (!player) {
    alert("Still loading player data - try again in a moment.");
    return;
  }
  document.getElementById("editNameInput").value = player.name;
  document.getElementById("editCategoryInput").value = player.category || "";
  document.getElementById("editNotesInput").value = player.notes || "";
  document.getElementById("editLevelSelect").innerHTML = levelSelectOptionsHtml(player.level_override);
  document.getElementById("editClassSelect").innerHTML = classSelectOptionsHtml(allClasses, player.class_id);
  editModal.classList.remove("hidden");
});
document.getElementById("cancelEditPlayerBtn").addEventListener("click", () => editModal.classList.add("hidden"));
editModal.addEventListener("click", (e) => { if (e.target === editModal) editModal.classList.add("hidden"); });

document.getElementById("saveEditPlayerBtn").addEventListener("click", async () => {
  const name = document.getElementById("editNameInput").value.trim();
  if (!name) { alert("Please enter a name."); return; }
  const category = document.getElementById("editCategoryInput").value.trim();
  const notes = document.getElementById("editNotesInput").value.trim();
  const levelValue = document.getElementById("editLevelSelect").value;
  const level_override = levelValue === "" ? null : Number(levelValue);
  const classValue = document.getElementById("editClassSelect").value;
  const class_id = classValue === "" ? null : Number(classValue);
  await fetch(`/api/players/${playerId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, category, notes, level_override, class_id }),
  });
  player = { ...player, name, category, notes, level_override, class_id };
  renderHeader();
  editModal.classList.add("hidden");
  flashSaved();
  await refreshStats({ celebrate: true });
});

document.getElementById("deletePlayerBtn").addEventListener("click", async () => {
  if (!confirm(`Delete player ${player.name}? All of their records will be deleted too.`)) return;
  await fetch(`/api/players/${playerId}`, { method: "DELETE" });
  window.location.href = "/";
});

loadAll();
