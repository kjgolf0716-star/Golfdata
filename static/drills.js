let drills = [];

async function init() {
  const res = await fetch("/api/drills");
  drills = await res.json();
  render();
}

function render() {
  const container = document.getElementById("drillManagerBody");
  container.innerHTML = `
    <div class="quest-manager-list" id="drillManagerList">
      ${
        drills.length > 0
          ? drills.map((d) => drillRowHtml(d)).join("")
          : `<div class="empty-state">No drills yet. Add the first one below.</div>`
      }
    </div>
    <button class="btn-secondary" id="addDrillBtn" style="margin-top:10px;width:100%;">+ Add Drill</button>
  `;

  attachRowListeners();
  setupAutosize();
  document.getElementById("addDrillBtn").addEventListener("click", onAdd);
}

// Grow each box to fit its text so long names/descriptions are fully readable
// without scrolling inside a tiny field (matters most on phones).
function autosize(el) {
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}

function setupAutosize() {
  document.querySelectorAll(".drill-name-input, .drill-desc-input").forEach((el) => {
    el.addEventListener("input", () => autosize(el));
    autosize(el);
  });
  // The name is one line: Enter saves it instead of adding a line break.
  document.querySelectorAll(".drill-name-input").forEach((el) => {
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        el.blur();
      }
    });
  });
  // Fonts/layout settle after first paint; re-measure once.
  requestAnimationFrame(() => {
    document.querySelectorAll(".drill-name-input, .drill-desc-input").forEach(autosize);
  });
}

function drillRowHtml(d) {
  return `
    <div class="quest-manager-row drill-manager-row" data-id="${d.id}">
      <div class="fields">
        <textarea class="drill-name-input" rows="1" placeholder="Drill name">${escapeHtml(d.name)}</textarea>
        <textarea class="drill-desc-input" rows="2" placeholder="Description (measurement method, scoring rules, etc.)">${escapeHtml(d.description || "")}</textarea>
      </div>
      <button class="btn-icon btn-danger" data-drill-delete="${d.id}">Delete</button>
    </div>`;
}

function attachRowListeners() {
  document.querySelectorAll(".quest-manager-row").forEach((row) => {
    const id = Number(row.dataset.id);
    const nameInput = row.querySelector(".drill-name-input");
    const descInput = row.querySelector(".drill-desc-input");
    const save = async () => {
      const name = nameInput.value.trim();
      if (!name) return;
      const description = descInput.value.trim();
      await fetch(`/api/drills/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      const d = drills.find((x) => x.id === id);
      if (d) { d.name = name; d.description = description; }
    };
    nameInput.addEventListener("change", save);
    descInput.addEventListener("change", save);
  });

  document.querySelectorAll("[data-drill-delete]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.dataset.drillDelete);
      const d = drills.find((x) => x.id === id);
      if (!confirm(`Delete the drill '${d ? d.name : ""}'? Its records will be deleted too.`)) return;
      await fetch(`/api/drills/${id}`, { method: "DELETE" });
      drills = drills.filter((x) => x.id !== id);
      render();
    });
  });
}

async function onAdd() {
  const res = await fetch("/api/drills", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "New Drill", description: "" }),
  });
  const data = await res.json();
  drills.push({ id: data.id, name: "New Drill", description: "", sort_order: drills.length });
  render();
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

init();
