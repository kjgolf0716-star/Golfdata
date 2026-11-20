let drills = [];

async function init() {
  const res = await fetch("/api/drills");
  drills = await res.json();
  render();
}

function sectionHtml(title, hint, list, kind) {
  return `
    <section class="drill-section">
      <div class="drill-section-head">
        <h2>${title}</h2>
        <p>${hint}</p>
      </div>
      <div class="quest-manager-list">
        ${
          list.length > 0
            ? list.map((d) => drillRowHtml(d)).join("")
            : `<div class="empty-state">No ${kind} drills yet.</div>`
        }
      </div>
      <button class="btn-secondary" data-add-drill="${kind}" style="margin-top:10px;width:100%;">+ Add ${kind === "default" ? "Default" : "Regular"} Drill</button>
    </section>`;
}

function render() {
  const container = document.getElementById("drillManagerBody");
  const defaults = drills.filter((d) => d.is_default !== false);
  const regulars = drills.filter((d) => d.is_default === false);
  container.innerHTML =
    sectionHtml(
      "Default drills",
      "The core set. These columns are shown in every player's training log.",
      defaults,
      "default"
    ) +
    sectionHtml(
      "Regular drills",
      "Extras used as needed. These appear in their own table below the default drills in every player's training log.",
      regulars,
      "regular"
    );

  attachRowListeners();
  setupAutosize();
  document.querySelectorAll("[data-add-drill]").forEach((btn) => {
    btn.addEventListener("click", () => onAdd(btn.dataset.addDrill === "default"));
  });
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
      <div class="drill-row-actions">
        <button class="btn-icon btn-secondary" data-drill-move="${d.id}">${d.is_default !== false ? "Make regular" : "Make default"}</button>
        <button class="btn-icon btn-danger" data-drill-delete="${d.id}">Delete</button>
      </div>
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

  document.querySelectorAll("[data-drill-move]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.dataset.drillMove);
      const d = drills.find((x) => x.id === id);
      if (!d) return;
      const makeDefault = d.is_default === false;
      await fetch(`/api/drills/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: d.name, description: d.description || "", is_default: makeDefault }),
      });
      d.is_default = makeDefault;
      render();
    });
  });

  document.querySelectorAll("[data-drill-delete]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.dataset.drillDelete);
      const d = drills.find((x) => x.id === id);
      if (!(await confirmDialog(`Delete the drill '${d ? d.name : ""}'? Its records will be deleted too.`, { confirmLabel: "Delete", danger: true }))) return;
      await fetch(`/api/drills/${id}`, { method: "DELETE" });
      drills = drills.filter((x) => x.id !== id);
      render();
    });
  });
}

async function onAdd(isDefault) {
  const res = await fetch("/api/drills", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "New Drill", description: "", is_default: isDefault }),
  });
  const data = await res.json();
  drills.push({ id: data.id, name: "New Drill", description: "", sort_order: drills.length, is_default: isDefault });
  render();
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

init();
