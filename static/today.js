let allPlayers = [];
let allClasses = [];
let allDrills = [];
let selectedIds = new Set();
let selectedDrillIds = new Set();

function todayDateStr() {
  return new Date().toISOString().slice(0, 10);
}

async function loadDrillSelection() {
  const res = await fetch(`/api/daily-drills?drill_date=${todayDateStr()}`);
  const ids = await res.json();
  return new Set(ids);
}

async function toggleDrillSelection(drillId, selected) {
  await fetch("/api/daily-drills", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ drill_date: todayDateStr(), drill_id: drillId, selected }),
  });
}

async function init() {
  const [pRes, cRes, dRes] = await Promise.all([
    fetch("/api/players"),
    fetch("/api/classes"),
    fetch("/api/drills"),
  ]);
  allPlayers = await pRes.json();
  allClasses = await cRes.json();
  allDrills = await dRes.json();
  selectedDrillIds = await loadDrillSelection();
  populateClassSelect();
  setDefaultDate();
  renderDrills();
  await loadSessionAttendance();
}

function populateClassSelect() {
  const select = document.getElementById("todayClassSelect");
  select.disabled = false;
  select.innerHTML =
    `<option value="">No class</option>` +
    allClasses.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
}

function setDefaultDate() {
  const input = document.getElementById("todayDateInput");
  if (!input.value) input.value = todayDateStr();
}

// Multiple classes can run on the same day, so which roster is "current" is
// keyed by class + date + time. Switching any of those reloads whatever was
// already saved for that exact session from the server.
async function loadSessionAttendance() {
  const classValue = document.getElementById("todayClassSelect").value;
  const date = document.getElementById("todayDateInput").value;
  const time = document.getElementById("todayTimeInput").value;

  if (!date) {
    selectedIds = new Set();
    render();
    return;
  }

  const params = new URLSearchParams({ attendance_date: date, attendance_time: time });
  if (classValue !== "") params.set("class_id", classValue);
  const res = await fetch(`/api/attendance?${params.toString()}`);
  const ids = await res.json();
  selectedIds = new Set(ids);
  render();
}

function render() {
  const container = document.getElementById("todayBody");
  const showOnlySelected = document.getElementById("todayShowOnlyToggle").checked;

  document.getElementById("todayCount").textContent = `${selectedIds.size} / ${allPlayers.length} selected`;

  if (allPlayers.length === 0) {
    container.innerHTML = `<div class="empty-state">No players yet. Add players from the Players tab first.</div>`;
    return;
  }

  const roster = [...allPlayers].sort((a, b) => a.name.localeCompare(b.name));
  const visible = showOnlySelected ? roster.filter((p) => selectedIds.has(p.id)) : roster;

  if (visible.length === 0) {
    container.innerHTML = `<div class="empty-state">No juniors selected yet. Turn off "Show only selected" to pick some.</div>`;
    return;
  }

  container.innerHTML = `<div class="attendance-grid">${visible
    .map((p) => {
      const selected = selectedIds.has(p.id);
      return `
    <div class="attendance-card ${selected ? "present" : ""}">
      <label class="attendance-check">
        <input type="checkbox" ${selected ? "checked" : ""} data-toggle-player="${p.id}" />
        <span class="attendance-name">${escapeHtml(p.name)}</span>
      </label>
      ${levelChipHtml(p, "sm")}
      <a class="attendance-log-link" href="/players/${p.id}">Log training &rarr;</a>
    </div>`;
    })
    .join("")}</div>`;

  container.querySelectorAll("[data-toggle-player]").forEach((cb) => {
    cb.addEventListener("change", onToggle);
  });
}

function renderDrills() {
  const container = document.getElementById("todayDrillsList");
  document.getElementById("todayDrillsCount").textContent = `${selectedDrillIds.size} / ${allDrills.length} selected`;

  if (allDrills.length === 0) {
    container.innerHTML = `<div class="empty-state">No drills yet. Add one below, or from the Drills tab.</div>`;
    return;
  }

  container.innerHTML = allDrills
    .map((d) => {
      const selected = selectedDrillIds.has(d.id);
      return `
    <label class="today-drill-tag ${selected ? "selected" : ""}">
      <input type="checkbox" ${selected ? "checked" : ""} data-toggle-drill="${d.id}" />
      ${escapeHtml(d.name)}
    </label>`;
    })
    .join("");

  container.querySelectorAll("[data-toggle-drill]").forEach((cb) => {
    cb.addEventListener("change", onToggleDrill);
  });
}

function onToggle(e) {
  const playerId = Number(e.target.dataset.togglePlayer);
  if (e.target.checked) selectedIds.add(playerId);
  else selectedIds.delete(playerId);
  render();
}

async function onToggleDrill(e) {
  const drillId = Number(e.target.dataset.toggleDrill);
  const selected = e.target.checked;
  if (selected) selectedDrillIds.add(drillId);
  else selectedDrillIds.delete(drillId);
  renderDrills();
  await toggleDrillSelection(drillId, selected);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

document.getElementById("todayShowOnlyToggle").addEventListener("change", render);
document.getElementById("todayClassSelect").addEventListener("change", loadSessionAttendance);
document.getElementById("todayDateInput").addEventListener("change", loadSessionAttendance);
document.getElementById("todayTimeInput").addEventListener("change", loadSessionAttendance);

document.getElementById("todayClearBtn").addEventListener("click", () => {
  if (selectedIds.size === 0) return;
  if (!confirm("Clear the current selection? (Click Save Attendance after to make it permanent.)")) return;
  selectedIds = new Set();
  render();
});

document.getElementById("addTodayDrillBtn").addEventListener("click", async () => {
  const input = document.getElementById("newDrillNameInput");
  const name = input.value.trim();
  if (!name) return;

  const res = await fetch("/api/drills", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, description: "" }),
  });
  const data = await res.json();
  allDrills.push({ id: data.id, name, description: "", sort_order: allDrills.length });
  selectedDrillIds.add(data.id);
  input.value = "";
  renderDrills();
  await toggleDrillSelection(data.id, true);
});

document.getElementById("newDrillNameInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("addTodayDrillBtn").click();
});

document.getElementById("todaySaveBtn").addEventListener("click", async () => {
  const classValue = document.getElementById("todayClassSelect").value;
  const classId = classValue === "" ? null : Number(classValue);
  const date = document.getElementById("todayDateInput").value;
  const time = document.getElementById("todayTimeInput").value;

  if (!date) {
    alert("Please choose a date.");
    return;
  }
  if (selectedIds.size === 0) {
    alert("Select at least one junior first.");
    return;
  }

  await Promise.all(
    [...selectedIds].map((playerId) =>
      fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          class_id: classId,
          attendance_date: date,
          attendance_time: time,
          player_id: playerId,
          present: true,
        }),
      })
    )
  );

  document.getElementById("todayShowOnlyToggle").checked = true;
  render();

  const flash = document.getElementById("todaySavedFlash");
  flash.classList.remove("hidden");
  clearTimeout(flash._t);
  flash._t = setTimeout(() => flash.classList.add("hidden"), 2500);
});

init();
