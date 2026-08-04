let allPlayers = [];
let allClasses = [];
let selectedIds = new Set();

function todayKey() {
  return `todaysClass_${new Date().toISOString().slice(0, 10)}`;
}

function loadSelection() {
  try {
    const raw = localStorage.getItem(todayKey());
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveSelection() {
  localStorage.setItem(todayKey(), JSON.stringify([...selectedIds]));
}

async function init() {
  const [pRes, cRes] = await Promise.all([fetch("/api/players"), fetch("/api/classes")]);
  allPlayers = await pRes.json();
  allClasses = await cRes.json();
  selectedIds = loadSelection();
  populateClassSelect();
  setDefaultDate();
  render();
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
  if (!input.value) input.value = new Date().toISOString().slice(0, 10);
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

function onToggle(e) {
  const playerId = Number(e.target.dataset.togglePlayer);
  if (e.target.checked) selectedIds.add(playerId);
  else selectedIds.delete(playerId);
  saveSelection();
  render();
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

document.getElementById("todayShowOnlyToggle").addEventListener("change", render);
document.getElementById("todayClearBtn").addEventListener("click", () => {
  if (selectedIds.size === 0) return;
  if (!confirm("Clear today's selection?")) return;
  selectedIds = new Set();
  saveSelection();
  render();
});

document.getElementById("todaySaveBtn").addEventListener("click", async () => {
  const classValue = document.getElementById("todayClassSelect").value;
  const classId = classValue === "" ? null : Number(classValue);
  const date = document.getElementById("todayDateInput").value;

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
