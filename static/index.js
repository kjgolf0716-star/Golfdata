let allPlayers = [];
let allClasses = [];

async function loadAll() {
  const [pRes, cRes] = await Promise.all([
    fetch("/api/players"),
    fetch("/api/classes"),
  ]);
  allPlayers = await pRes.json();
  allClasses = await cRes.json();
  renderClassFilter();
  renderHallOfFame();
  renderPlayers();
}

function renderClassFilter() {
  const select = document.getElementById("classFilterSelect");
  const prevValue = select.value || "all";
  select.innerHTML =
    `<option value="all">All Classes</option>` +
    `<option value="none">No Class</option>` +
    allClasses.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
  const stillExists = [...select.options].some((o) => o.value === prevValue);
  select.value = stillExists ? prevValue : "all";
}

function renderHallOfFame() {
  const container = document.getElementById("hallOfFame");
  const top = [...allPlayers]
    .filter((p) => p.xp > 0)
    .sort((a, b) => b.xp - a.xp)
    .slice(0, 5);

  if (top.length === 0) {
    container.innerHTML = "";
    return;
  }

  const medals = ["\u{1F947}", "\u{1F948}", "\u{1F949}"];
  container.innerHTML = `
    <div class="hof-block">
      <div class="hof-title">\u{1F3C6} Hall of Fame</div>
      <div class="hof-list">
        ${top
          .map(
            (p, i) => `
          <a class="hof-card" href="/players/${p.id}">
            <span class="hof-rank">${medals[i] || `#${i + 1}`}</span>
            <span class="hof-name">${escapeHtml(p.name)}</span>
            ${levelChipHtml(p, "sm")}
            ${p.current_week_streak > 0 ? `<span class="hof-streak">\u{1F525}${p.current_week_streak}</span>` : ""}
          </a>`
          )
          .join("")}
      </div>
    </div>`;
}

function renderPlayers() {
  const container = document.getElementById("playerList");
  const query = document.getElementById("searchInput").value.trim().toLowerCase();
  const classFilter = document.getElementById("classFilterSelect").value || "all";

  let base = allPlayers;
  if (classFilter === "none") base = base.filter((p) => p.class_id == null);
  else if (classFilter !== "all") base = base.filter((p) => String(p.class_id) === classFilter);

  const filtered = base.filter((p) => p.name.toLowerCase().includes(query));

  if (allPlayers.length === 0) {
    container.innerHTML = `<div class="empty-state">No players yet. Click 'Add Player' to get started.</div>`;
    return;
  }
  if (base.length === 0) {
    container.innerHTML = `<div class="empty-state">No players in this class yet.</div>`;
    return;
  }
  if (query && filtered.length === 0) {
    container.innerHTML = `<div class="empty-state">No results found.</div>`;
    return;
  }

  const groups = {};
  for (const p of filtered) {
    const idx = p.level_index ?? 0;
    if (!groups[idx]) groups[idx] = [];
    groups[idx].push(p);
  }

  // Always show every level category, in level order, even when empty -
  // unless the coach is actively searching, in which case only show
  // categories with a match.
  const levelIndexes = LEVELS.map((_, i) => i).filter(
    (idx) => !query || (groups[idx] && groups[idx].length > 0)
  );

  container.innerHTML = levelIndexes
    .map((idx) => {
      const group = groups[idx] || [];
      const [levelName, levelIcon] = LEVELS[idx] ?? ["Unknown", "\u{2753}"];
      const cards = group
        .sort((a, b) => b.xp - a.xp || a.name.localeCompare(b.name))
        .map(
          (p) => `
        <a class="player-card" href="/players/${p.id}">
          <div class="name">${escapeHtml(p.name)}
            ${
              p.quest_progress_pct !== null && p.quest_progress_pct !== undefined
                ? `<span class="name-tooltip">\u{1F3AF} Quest progress: ${p.quest_progress_pct}%</span>`
                : ""
            }
          </div>
          <div class="card-gamify">
            ${streakChipHtml(p)}
          </div>
          <div class="meta">${p.notes ? escapeHtml(truncate(p.notes, 40)) : "View training log &rarr;"}</div>
        </a>`
        )
        .join("");
      return `
        <div class="category-block">
          <div class="category-title">${levelIcon} ${escapeHtml(levelName)} <span class="category-count">${group.length}</span></div>
          ${
            group.length > 0
              ? `<div class="player-grid">${cards}</div>`
              : `<div class="category-empty">No players at this level yet.</div>`
          }
        </div>`;
    })
    .join("");
}

function truncate(s, n) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// Modal handling
const modal = document.getElementById("playerModal");
document.getElementById("addPlayerBtn").addEventListener("click", () => {
  document.getElementById("playerNameInput").value = "";
  document.getElementById("playerCategoryInput").value = "";
  document.getElementById("playerNotesInput").value = "";
  document.getElementById("playerLevelSelect").innerHTML = levelSelectOptionsHtml("");
  document.getElementById("playerClassSelect").innerHTML = classSelectOptionsHtml(allClasses, null);
  modal.classList.remove("hidden");
  document.getElementById("playerNameInput").focus();
});
document.getElementById("cancelPlayerBtn").addEventListener("click", () => {
  modal.classList.add("hidden");
});
modal.addEventListener("click", (e) => {
  if (e.target === modal) modal.classList.add("hidden");
});

document.getElementById("savePlayerBtn").addEventListener("click", async () => {
  const name = document.getElementById("playerNameInput").value.trim();
  if (!name) {
    alert("Please enter a name.");
    return;
  }
  const category = document.getElementById("playerCategoryInput").value.trim();
  const notes = document.getElementById("playerNotesInput").value.trim();
  const levelValue = document.getElementById("playerLevelSelect").value;
  const level_override = levelValue === "" ? null : Number(levelValue);
  const classValue = document.getElementById("playerClassSelect").value;
  const class_id = classValue === "" ? null : Number(classValue);
  const res = await fetch("/api/players", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, category, notes, level_override, class_id }),
  });
  const data = await res.json();
  modal.classList.add("hidden");
  window.location.href = `/players/${data.id}`;
});

document.getElementById("searchInput").addEventListener("input", renderPlayers);
document.getElementById("classFilterSelect").addEventListener("change", renderPlayers);

// ---------- Class manager ----------
const classModal = document.getElementById("classModal");
document.getElementById("manageClassesBtn").addEventListener("click", () => {
  renderClassManager();
  classModal.classList.remove("hidden");
});
document.getElementById("closeClassModalBtn").addEventListener("click", async () => {
  classModal.classList.add("hidden");
  await loadAll();
});
classModal.addEventListener("click", (e) => {
  if (e.target === classModal) classModal.classList.add("hidden");
});

function renderClassManager() {
  const list = document.getElementById("classManagerList");
  list.innerHTML = allClasses
    .map(
      (c) => `
    <div class="class-manager-row" data-id="${c.id}">
      <input type="text" class="class-name-input" value="${escapeHtml(c.name)}" placeholder="Class name" />
      <button class="btn-icon btn-danger" data-class-delete="${c.id}">Delete</button>
    </div>`
    )
    .join("");

  list.querySelectorAll(".class-manager-row").forEach((row) => {
    const id = Number(row.dataset.id);
    const nameInput = row.querySelector(".class-name-input");
    nameInput.addEventListener("change", async () => {
      const name = nameInput.value.trim();
      if (!name) return;
      await fetch(`/api/classes/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const c = allClasses.find((x) => x.id === id);
      if (c) c.name = name;
    });
  });

  list.querySelectorAll("[data-class-delete]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.dataset.classDelete);
      const c = allClasses.find((x) => x.id === id);
      if (!confirm(`Delete the class '${c ? c.name : ""}'? Players in it will become unassigned.`)) return;
      await fetch(`/api/classes/${id}`, { method: "DELETE" });
      allClasses = allClasses.filter((x) => x.id !== id);
      renderClassManager();
    });
  });
}

document.getElementById("addClassBtn").addEventListener("click", async () => {
  const res = await fetch("/api/classes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "New Class" }),
  });
  const data = await res.json();
  allClasses.push({ id: data.id, name: "New Class", sort_order: allClasses.length });
  renderClassManager();
});

loadAll();
