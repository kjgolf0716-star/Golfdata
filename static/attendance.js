let allClasses = [];
let monthRows = []; // [{attendance_date, player_id, player_name}]

async function init() {
  const res = await fetch("/api/classes");
  allClasses = await res.json();
  populateClassSelect();
  setDefaultMonth();
  await loadMonth();
}

function populateClassSelect() {
  const select = document.getElementById("attClassSelect");
  select.disabled = false;
  select.innerHTML =
    `<option value="">No class</option>` +
    allClasses.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
}

function setDefaultMonth() {
  const input = document.getElementById("attMonthInput");
  if (!input.value) input.value = new Date().toISOString().slice(0, 7);
}

async function loadMonth() {
  const classId = document.getElementById("attClassSelect").value;
  const month = document.getElementById("attMonthInput").value;
  if (!month) {
    monthRows = [];
    render();
    return;
  }
  const res = await fetch(`/api/attendance/month?class_id=${classId}&month=${month}`);
  monthRows = await res.json();
  render();
}

function render() {
  const container = document.getElementById("attendanceBody");

  const byDate = {};
  for (const row of monthRows) {
    if (!byDate[row.attendance_date]) byDate[row.attendance_date] = [];
    byDate[row.attendance_date].push(row);
  }
  const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

  document.getElementById("attCount").textContent = `${dates.length} session${dates.length === 1 ? "" : "s"} this month`;

  if (dates.length === 0) {
    container.innerHTML = `<div class="empty-state">No attendance recorded for this month yet. Check people in from the Today's Class tab.</div>`;
    return;
  }

  container.innerHTML = dates
    .map((date) => {
      const rows = byDate[date];
      return `
      <div class="month-day-block">
        <div class="month-day-header">${formatMonthDate(date)} <span class="category-count">${rows.length}</span></div>
        <div class="month-day-list">
          ${rows
            .map(
              (r) => `
            <span class="month-attendee-tag">
              ${escapeHtml(r.player_name)}
              <button class="month-attendee-remove" data-date="${date}" data-player-id="${r.player_id}" title="Remove">&times;</button>
            </span>`
            )
            .join("")}
        </div>
      </div>`;
    })
    .join("");

  container.querySelectorAll(".month-attendee-remove").forEach((btn) => {
    btn.addEventListener("click", onRemove);
  });
}

function formatMonthDate(iso) {
  const [y, m, d] = iso.split("-");
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

async function onRemove(e) {
  const date = e.target.dataset.date;
  const playerId = Number(e.target.dataset.playerId);
  const classValue = document.getElementById("attClassSelect").value;
  const classId = classValue === "" ? null : Number(classValue);

  await fetch("/api/attendance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ class_id: classId, attendance_date: date, player_id: playerId, present: false }),
  });

  monthRows = monthRows.filter((r) => !(r.attendance_date === date && r.player_id === playerId));
  render();
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

document.getElementById("attClassSelect").addEventListener("change", loadMonth);
document.getElementById("attMonthInput").addEventListener("change", loadMonth);

init();
