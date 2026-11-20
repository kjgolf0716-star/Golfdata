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

  // A bookmark or shared link can open a player from a different club than the
  // one selected in the nav. Switch to that player's club (once) so the header,
  // drills and classes all match the player instead of showing a mix.
  if (player.club_id) {
    try {
      const clubInfo = await (await fetch("/api/clubs")).json();
      if (clubInfo.current !== player.club_id) {
        await fetch("/api/coach/club", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ club_id: player.club_id }),
        });
        window.location.reload();
        return;
      }
    } catch {
      // not fatal - fall through and render what we have
    }
  }

  drills = await dRes.json();
  entries = await eRes.json();
  stats = await sRes.json();
  customQuests = await qRes.json();
  allClasses = await clsRes.json();
  questProgress = {};
  for (const row of await qpRes.json()) questProgress[row.quest_id] = row.current;
  renderHeader();
  renderTable();
  if (isBasicClubPlayer()) {
    // Basic-tracking clubs (e.g. Sembawang): drill results only, no levels/XP/quests.
    document.getElementById("gamifyPanel").classList.add("hidden");
    const levelSelect = document.getElementById("editLevelSelect");
    levelSelect.classList.add("hidden");
    levelSelect.previousElementSibling.classList.add("hidden");
  } else {
    renderGamifyPanel();
  }
}

function isBasicClubPlayer() {
  return player && player.gamified === false;
}

async function refreshStats({ celebrate } = { celebrate: false }) {
  if (isBasicClubPlayer()) return;
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

// The Clipboard API is blocked in some browsers/contexts, so fall back to the
// old execCommand route instead of silently failing.
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

document.getElementById("accessCodeChip").addEventListener("click", async () => {
  if (!player || !player.access_code) return;
  const ok = await copyText(player.access_code);
  const copied = document.getElementById("accessCodeCopied");
  copied.textContent = ok ? "Copied!" : "Couldn't copy - select the code and copy it manually";
  copied.classList.remove("hidden");
  clearTimeout(copied._t);
  copied._t = setTimeout(() => copied.classList.add("hidden"), ok ? 1500 : 4000);
});

document.getElementById("regenerateCodeBtn").addEventListener("click", async () => {
  if (!(await confirmDialog("Generate a new code for this player? Their old code will stop working.", { confirmLabel: "Generate", danger: true }))) return;
  const res = await fetch(`/api/players/${playerId}/regenerate-code`, { method: "POST" });
  const data = await res.json();
  player.access_code = data.access_code;
  document.getElementById("accessCodeChip").textContent = player.access_code;
  flashSaved();
});

// The log is two independent parts: the default-drills table, and underneath a
// Regular drills section with its own dates. Deleting in one never touches the
// other: the default table's Delete clears only default drill results, and the
// regular section's buttons clear only regular drill results.
const LOG_TABLES = [
  {
    wrapId: "defaultTableWrap",
    headRowId: "tableHeadRow",
    bodyId: "tableBody",
    footId: "tableFoot",
    withDelete: true,
    pick: (d) => d.is_default !== false,
  },
];

// Regular drills added to a date but not given a value yet (a record only
// exists once it has a value): date -> Set of drill ids. Kept in the page only.
const pendingRegular = {};
// Dates the coach opened in the Regular drills section, so the card shows even
// before it has a result. Kept in the page only.
const regularDatesPending = new Set();

function regularDrillList() {
  return drills.filter((d) => d.is_default === false);
}

function defaultDrillIds() {
  return new Set(drills.filter((d) => d.is_default !== false).map((d) => d.id));
}

function hasValueFor(map, date, idSet) {
  if (!map[date]) return false;
  for (const id of idSet) {
    if (map[date][id] !== undefined && map[date][id] !== "") return true;
  }
  return false;
}

// Default table rows: dates with a default drill result, or added with "+ Add Date".
function defaultDateList(map) {
  const ids = defaultDrillIds();
  return Object.keys(map)
    .filter((date) => manualDates.has(date) || hasValueFor(map, date, ids))
    .sort();
}

// Regular section cards: dates with a regular drill result, or opened with "+ Add date".
function regularDateList(map) {
  const ids = new Set(regularDrillList().map((d) => d.id));
  const set = new Set(Object.keys(map).filter((date) => hasValueFor(map, date, ids)));
  regularDatesPending.forEach((d) => set.add(d));
  Object.keys(pendingRegular).forEach((d) => {
    if (pendingRegular[d] && pendingRegular[d].size) set.add(d);
  });
  return [...set].sort();
}

function regularIdsForDate(date, map) {
  const ids = new Set();
  for (const d of regularDrillList()) {
    if (map[date] && map[date][d.id] !== undefined) ids.add(d.id);
  }
  (pendingRegular[date] || new Set()).forEach((id) => ids.add(id));
  return ids;
}

function renderRegularSection() {
  const section = document.getElementById("regularSection");
  const regular = regularDrillList();
  if (regular.length === 0) {
    section.classList.add("hidden");
    return;
  }
  section.classList.remove("hidden");

  const map = entryMap();
  const dates = regularDateList(map);
  const list = document.getElementById("regularList");
  if (dates.length === 0) {
    list.innerHTML = `<div class="empty-state">No regular drills logged yet. Use "+ Add date" to start.</div>`;
    return;
  }

  list.innerHTML = dates
    .map((date) => {
      const used = regularIdsForDate(date, map);
      const items = regular
        .filter((d) => used.has(d.id))
        .map((d) => {
          const val = map[date] && map[date][d.id] !== undefined ? map[date][d.id] : "";
          return `<div class="regular-item">
            <div class="regular-item-name">${escapeHtml(d.name)}</div>
            <input type="text" inputmode="decimal" value="${escapeHtml(val)}"
              data-date="${date}" data-drill="${d.id}" placeholder="Result" />
            <button type="button" class="regular-remove" title="Remove this drill from this date"
              data-remove-regular data-date="${date}" data-drill="${d.id}">&times;</button>
          </div>`;
        })
        .join("");
      const available = regular.filter((d) => !used.has(d.id));
      const picker = available.length
        ? `<select class="regular-add-select" data-add-regular="${date}">
            <option value="">+ Add regular drill\u2026</option>
            ${available.map((d) => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join("")}
          </select>`
        : "";
      return `<div class="regular-day">
        <div class="regular-day-top">
          <div class="regular-day-head">${formatDate(date)}</div>
          <button type="button" class="btn-icon btn-danger" data-clear-regular="${date}"
            title="Remove this date from the regular drills. Default drills are not affected.">Remove date</button>
        </div>
        ${items ? `<div class="regular-items">${items}</div>` : ""}
        ${picker}
      </div>`;
    })
    .join("");

  list.querySelectorAll("input[data-date]").forEach((input) => {
    input.addEventListener("change", onCellChange);
  });
  list.querySelectorAll("[data-add-regular]").forEach((sel) => {
    sel.addEventListener("change", () => {
      if (!sel.value) return;
      const date = sel.dataset.addRegular;
      const id = Number(sel.value);
      (pendingRegular[date] = pendingRegular[date] || new Set()).add(id);
      regularDatesPending.add(date);
      renderRegularSection();
      const input = document.querySelector(`#regularList input[data-date="${date}"][data-drill="${id}"]`);
      if (input) input.focus();
    });
  });
  list.querySelectorAll("[data-remove-regular]").forEach((btn) => {
    btn.addEventListener("click", onRemoveRegular);
  });
  list.querySelectorAll("[data-clear-regular]").forEach((btn) => {
    btn.addEventListener("click", onClearRegularDay);
  });
}

async function postEntry(drillId, date, value) {
  await fetch("/api/entries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ player_id: playerId, drill_id: drillId, entry_date: date, value }),
  });
}

// Removes this date from the regular drills section: only regular drill
// results go. The default table and its results are left alone.
async function onClearRegularDay(e) {
  const date = e.currentTarget.dataset.clearRegular;
  const regularIds = new Set(regularDrillList().map((d) => d.id));
  const recorded = entries.filter((x) => x.entry_date === date && regularIds.has(x.drill_id));
  if (recorded.length > 0) {
    const ok = await confirmDialog(
      `Remove ${date} from the regular drills? Its regular drill results will be deleted. Default drills are not affected.`,
      { confirmLabel: "Remove", danger: true }
    );
    if (!ok) return;
    await Promise.all(recorded.map((x) => postEntry(x.drill_id, date, "")));
    entries = entries.filter((x) => !(x.entry_date === date && regularIds.has(x.drill_id)));
  }
  delete pendingRegular[date];
  regularDatesPending.delete(date);
  renderTable();
  if (recorded.length > 0) {
    flashSaved("Removed");
    await refreshStats();
  }
}

async function onRemoveRegular(e) {
  const date = e.currentTarget.dataset.date;
  const drillId = Number(e.currentTarget.dataset.drill);
  const had = entries.some((x) => x.entry_date === date && x.drill_id === drillId);
  if (had) {
    const d = drills.find((x) => x.id === drillId);
    const ok = await confirmDialog(`Remove ${d ? d.name : "this drill"} from ${date}? Its result will be deleted.`, {
      confirmLabel: "Remove",
      danger: true,
    });
    if (!ok) return;
    await postEntry(drillId, date, "");
    entries = entries.filter((x) => !(x.entry_date === date && x.drill_id === drillId));
  }
  if (pendingRegular[date]) pendingRegular[date].delete(drillId);
  regularDatesPending.add(date); // keep the card so the date can be removed on purpose
  renderTable();
  if (had) {
    flashSaved("Removed");
    await refreshStats();
  }
}

function renderLogTable(cfg, list, dates, map) {
  const wrap = document.getElementById(cfg.wrapId);
  if (list.length === 0) {
    wrap.classList.add("hidden");
    return;
  }
  wrap.classList.remove("hidden");

  const headRow = document.getElementById(cfg.headRowId);
  headRow.innerHTML = `<th class="date-col">Date</th>` +
    list
      .map(
        (d) => `<th>
          <div class="drill-name">${escapeHtml(d.name)}</div>
          <div class="drill-desc">${escapeHtml(d.description || "")}</div>
        </th>`
      )
      .join("") +
    (cfg.withDelete ? `<th class="actions-col"></th>` : "");
  // Long descriptions are clamped to a few lines; tap one to read it in full.
  headRow.querySelectorAll(".drill-desc").forEach((el) => {
    if (el.textContent.trim()) el.addEventListener("click", () => el.classList.toggle("expanded"));
  });

  const tbody = document.getElementById(cfg.bodyId);
  tbody.innerHTML = dates
    .map((date) => {
      const cells = list
        .map((d) => {
          const val = map[date][d.id] ?? "";
          return `<td class="value-cell">
            <input type="text" inputmode="decimal" value="${escapeHtml(val)}"
              data-date="${date}" data-drill="${d.id}" />
          </td>`;
        })
        .join("");
      const actions = cfg.withDelete
        ? `<td class="row-actions">
          <button class="btn-icon btn-danger" data-delete-date="${date}" title="Delete this date's record">Delete</button>
        </td>`
        : "";
      return `<tr>
        <td class="date-cell">${formatDate(date)}</td>
        ${cells}
        ${actions}
      </tr>`;
    })
    .join("");

  tbody.querySelectorAll("input[data-date]").forEach((input) => {
    input.addEventListener("change", onCellChange);
  });
  tbody.querySelectorAll("[data-delete-date]").forEach((btn) => {
    btn.addEventListener("click", onDeleteDate);
  });
}

function renderTable() {
  const map = entryMap();
  const defaultDates = defaultDateList(map);
  const regularDates = regularDateList(map);
  const emptyHint = document.getElementById("emptyHint");

  if (defaultDates.length === 0) {
    LOG_TABLES.forEach((cfg) => {
      document.getElementById(cfg.bodyId).innerHTML = "";
      document.getElementById(cfg.footId).innerHTML = "";
      document.getElementById(cfg.wrapId).classList.add("hidden");
    });
  } else {
    LOG_TABLES.forEach((cfg) => renderLogTable(cfg, drills.filter(cfg.pick), defaultDates, map));
  }
  emptyHint.classList.toggle("hidden", defaultDates.length > 0 || regularDates.length > 0);

  renderRegularSection();
  renderAverages();
}

function renderAverages() {
  const map = entryMap();
  const dates = Object.keys(map);

  LOG_TABLES.forEach((cfg) => {
    const tfoot = document.getElementById(cfg.footId);
    const list = drills.filter(cfg.pick);
    if (dates.length === 0 || list.length === 0) {
      tfoot.innerHTML = "";
      return;
    }

    const sums = {};
    const counts = {};
    for (const date of dates) {
      for (const d of list) {
        const raw = map[date][d.id];
        const num = parseFloat(raw);
        if (raw !== undefined && raw !== "" && !Number.isNaN(num)) {
          sums[d.id] = (sums[d.id] ?? 0) + num;
          counts[d.id] = (counts[d.id] ?? 0) + 1;
        }
      }
    }

    const cells = list
      .map((d) => {
        const c = counts[d.id];
        const text = c ? formatAvg(sums[d.id] / c) : "-";
        return `<td class="avg-cell">${text}</td>`;
      })
      .join("");

    tfoot.innerHTML = `<tr class="avg-row"><td class="date-cell">Average</td>${cells}${cfg.withDelete ? "<td></td>" : ""}</tr>`;
  });
  renderRegularAverages(map, dates);
}

function renderRegularAverages(map, dates) {
  const box = document.getElementById("regularAverages");
  const rows = [];
  for (const d of regularDrillList()) {
    let sum = 0;
    let n = 0;
    for (const date of dates) {
      const raw = map[date] ? map[date][d.id] : undefined;
      const num = parseFloat(raw);
      if (raw !== undefined && raw !== "" && !Number.isNaN(num)) {
        sum += num;
        n += 1;
      }
    }
    if (n > 0) {
      rows.push(`<div class="regular-avg-row"><span>${escapeHtml(d.name)}</span><span><strong>${formatAvg(sum / n)}</strong> <em>avg of ${n}</em></span></div>`);
    }
  }
  box.innerHTML = rows.length ? `<div class="regular-avg-title">Averages</div>${rows.join("")}` : "";
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
  const changedDrill = drills.find((x) => x.id === drillId);
  const isRegular = !!changedDrill && changedDrill.is_default === false;
  if (!isRegular) manualDates.delete(date);
  if (isRegular && value === "") {
    // keep the row visible after clearing its result
    (pendingRegular[date] = pendingRegular[date] || new Set()).add(drillId);
    regularDatesPending.add(date);
  }
  renderAverages();
  flashSaved();
  await refreshStats({ celebrate: value !== "" });
}

// Deletes this date from the default table: only default drill results go.
// Regular drill results on the same date are not affected.
async function onDeleteDate(e) {
  const date = e.target.dataset.deleteDate;
  const defIds = defaultDrillIds();
  const ok = await confirmDialog(
    `Delete ${date} from the default drills? Regular drill results on this date are not affected.`,
    { confirmLabel: "Delete", danger: true }
  );
  if (!ok) return;
  const recorded = entries.filter((x) => x.entry_date === date && defIds.has(x.drill_id));
  await Promise.all(recorded.map((x) => postEntry(x.drill_id, date, "")));
  entries = entries.filter((x) => !(x.entry_date === date && defIds.has(x.drill_id)));
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
// One date picker serves both "+ Add Date" (default table) and the regular
// drills section's own "+ Add date".
const dateModal = document.getElementById("dateModal");
let dateModalTarget = "default";

function openDateModal(target) {
  dateModalTarget = target;
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById("newDateInput").value = today;
  dateModal.classList.remove("hidden");
}

document.getElementById("addDateBtn").addEventListener("click", () => openDateModal("default"));
document.getElementById("addRegularDateBtn").addEventListener("click", () => openDateModal("regular"));
document.getElementById("cancelDateBtn").addEventListener("click", () => dateModal.classList.add("hidden"));
dateModal.addEventListener("click", (e) => { if (e.target === dateModal) dateModal.classList.add("hidden"); });

document.getElementById("confirmDateBtn").addEventListener("click", () => {
  const date = document.getElementById("newDateInput").value;
  if (!date) return;
  if (dateModalTarget === "regular") regularDatesPending.add(date);
  else manualDates.add(date);
  dateModal.classList.add("hidden");
  renderTable();
});

// ---------- Edit player ----------
const editModal = document.getElementById("editPlayerModal");
document.getElementById("editPlayerBtn").addEventListener("click", () => {
  if (!player) {
    noticeDialog("Still loading player data - try again in a moment.");
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
  if (!name) { noticeDialog("Please enter a name."); return; }
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
  if (!(await confirmDialog(`Delete player ${player.name}? All of their records will be deleted too.`, { confirmLabel: "Delete", danger: true }))) return;
  await fetch(`/api/players/${playerId}`, { method: "DELETE" });
  window.location.href = "/";
});

loadAll();
