let allQuests = [];

async function init() {
  const res = await fetch("/api/quests");
  allQuests = await res.json();
  populateLevelSelect();
  renderQuestList();
}

function populateLevelSelect() {
  const select = document.getElementById("questLevelSelect");
  select.innerHTML = LEVELS.map(([name, icon], i) => `<option value="${i}">${icon} ${escapeHtml(name)}</option>`).join("");
}

function currentLevelIndex() {
  const v = document.getElementById("questLevelSelect").value;
  return v === "" ? null : Number(v);
}

function renderQuestList() {
  const levelIndex = currentLevelIndex();
  const quests = allQuests.filter((q) => q.level_index === levelIndex);
  const container = document.getElementById("questManagerBody");

  container.innerHTML = `
    <div class="quest-manager-list" id="questManagerList">
      ${
        quests.length > 0
          ? quests.map((q) => questRowHtml(q)).join("")
          : `<div class="empty-state">No quests yet for this level.</div>`
      }
    </div>
    <button class="btn-secondary" id="addQuestBtn" style="margin-top:10px;width:100%;">+ Add Quest</button>
  `;

  attachRowListeners();
  document.getElementById("addQuestBtn").addEventListener("click", onAddQuest);
}

function questRowHtml(q) {
  const isSide = q.quest_type === "side";
  return `
    <div class="quest-manager-row" data-id="${q.id}">
      <input type="text" class="quest-icon-input" value="${escapeHtml(q.icon)}" maxlength="4" title="Icon (emoji)" />
      <div class="fields">
        <input type="text" class="quest-name-input" value="${escapeHtml(q.name)}" placeholder="Quest name" />
        <textarea class="quest-desc-input" placeholder="Description (how to complete it)">${escapeHtml(q.description || "")}</textarea>
        <div class="quest-row-meta">
          <label class="quest-target-label">Target
            <input type="number" class="quest-target-input" min="1" value="${q.target}" />
          </label>
          <label class="quest-target-label">Type
            <select class="quest-type-input">
              <option value="main" ${!isSide ? "selected" : ""}>\u{2B50} Main Quest</option>
              <option value="side" ${isSide ? "selected" : ""}>\u{2795} Side Quest</option>
            </select>
          </label>
        </div>
      </div>
      <button class="btn-icon btn-danger" data-quest-delete="${q.id}">Delete</button>
    </div>`;
}

function attachRowListeners() {
  document.querySelectorAll(".quest-manager-row").forEach((row) => {
    const id = Number(row.dataset.id);
    const iconInput = row.querySelector(".quest-icon-input");
    const nameInput = row.querySelector(".quest-name-input");
    const descInput = row.querySelector(".quest-desc-input");
    const targetInput = row.querySelector(".quest-target-input");
    const typeInput = row.querySelector(".quest-type-input");
    const save = async () => {
      const name = nameInput.value.trim();
      if (!name) return;
      const icon = iconInput.value.trim() || "🎯";
      const description = descInput.value.trim();
      const target = Math.max(1, Math.round(Number(targetInput.value)) || 1);
      const quest_type = typeInput.value;
      const q = allQuests.find((x) => x.id === id);
      if (!q) return;
      await fetch(`/api/quests/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, icon, description, target, level_index: q.level_index, quest_type }),
      });
      q.name = name;
      q.icon = icon;
      q.description = description;
      q.target = target;
      q.quest_type = quest_type;
    };
    iconInput.addEventListener("change", save);
    nameInput.addEventListener("change", save);
    descInput.addEventListener("change", save);
    targetInput.addEventListener("change", save);
    typeInput.addEventListener("change", save);
  });

  document.querySelectorAll("[data-quest-delete]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.dataset.questDelete);
      const q = allQuests.find((x) => x.id === id);
      if (!confirm(`Delete the quest '${q ? q.name : ""}'? Every player's progress on it will be deleted too.`)) return;
      await fetch(`/api/quests/${id}`, { method: "DELETE" });
      allQuests = allQuests.filter((x) => x.id !== id);
      renderQuestList();
    });
  });
}

async function onAddQuest() {
  const level_index = currentLevelIndex();
  const res = await fetch("/api/quests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "New Quest", icon: "🎯", description: "", target: 5, level_index, quest_type: "main" }),
  });
  const data = await res.json();
  allQuests.push({
    id: data.id,
    name: "New Quest",
    icon: "🎯",
    description: "",
    target: 5,
    class_id: null,
    level_index,
    quest_type: "main",
    sort_order: allQuests.length,
  });
  renderQuestList();
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

document.getElementById("questLevelSelect").addEventListener("change", renderQuestList);

init();
