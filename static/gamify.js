// Shared rendering + celebration helpers for the gamification layer.
// Stats objects come from /api/players (list) or /api/players/{id}/stats
// (detail) - see gamify.py on the server for how xp/level/streak/badges
// are computed.

// Mirrors gamify.py's LEVELS (name + icon only - thresholds live server-side).
// Used to build the "set level manually" picker.
const LEVELS = [
  ["Tee Starter", "\u{1F331}"],
  ["Fairway Finder", "\u{1F9ED}"],
  ["Bunker Buster", "\u{1F4A5}"],
  ["Green Reader", "\u{1F50D}"],
  ["Par Chaser", "\u{1F3C3}"],
  ["Birdie Hunter", "\u{1F426}"],
  ["Eagle Seeker", "\u{1F985}"],
  ["Course Master", "\u{1F393}"],
  ["Tour Ready", "\u{1F680}"],
  ["DB Elite", "\u{1F451}"],
];

function levelSelectOptionsHtml(selectedValue) {
  const isAuto = selectedValue === "" || selectedValue === null || selectedValue === undefined;
  let html = `<option value="" ${isAuto ? "selected" : ""}>Auto (based on XP)</option>`;
  LEVELS.forEach(([name, icon], i) => {
    const sel = !isAuto && String(selectedValue) === String(i) ? "selected" : "";
    html += `<option value="${i}" ${sel}>${icon} ${escapeHtmlG(name)}</option>`;
  });
  return html;
}

// classes: [{id, name}]. selectedId: number|null.
function classSelectOptionsHtml(classes, selectedId) {
  const isNone = selectedId === null || selectedId === undefined || selectedId === "";
  let html = `<option value="" ${isNone ? "selected" : ""}>No class</option>`;
  classes.forEach((c) => {
    const sel = !isNone && String(selectedId) === String(c.id) ? "selected" : "";
    html += `<option value="${c.id}" ${sel}>${escapeHtmlG(c.name)}</option>`;
  });
  return html;
}

function levelChipHtml(stats, size = "md") {
  return `<span class="level-chip level-chip-${size}" title="${escapeHtmlG(stats.level_name)}">
    <span class="level-icon">${stats.level_icon}</span>
    <span class="level-name">${escapeHtmlG(stats.level_name)}</span>
  </span>`;
}

function streakChipHtml(stats) {
  const n = stats.current_week_streak || 0;
  const cls = n > 0 ? "streak-chip active" : "streak-chip";
  const label = n > 0 ? `${n} wk streak` : "no streak yet";
  return `<span class="${cls}" title="Longest: ${stats.longest_week_streak || 0} weeks">
    <span class="streak-flame">${n > 0 ? "\u{1F525}" : "\u{2744}\u{FE0F}"}</span> ${label}
  </span>`;
}

function xpBarHtml(stats) {
  const pct = Math.max(0, Math.min(100, stats.level_progress_pct ?? 0));
  const nextText = stats.is_max_level
    ? "Max level reached!"
    : `${stats.xp_into_level} / ${stats.xp_for_next_level} XP to next level`;
  return `
    <div class="xp-bar-outer">
      <div class="xp-bar-inner" style="width:${pct}%"></div>
    </div>
    <div class="xp-bar-label">${stats.xp} XP total &middot; ${nextText}</div>
  `;
}

function badgeGridHtml(badges) {
  return `
    <div class="achievements-title">\u{1F3C5} Achievements</div>
    <div class="badge-grid">${badges
      .map(
        (b) => `
        <div class="badge ${b.earned ? "earned" : "locked"}" title="${escapeHtmlG(b.desc)}">
          <div class="badge-icon">${b.icon}</div>
          <div class="badge-name">${escapeHtmlG(b.name)}</div>
        </div>`
      )
      .join("")}</div>`;
}

// quests: [{id, name, icon, description, target, current, scope_label}] - any
// player can be signed up for any quest, regardless of class enrollment.
// scope_label is the quest's class name or level name, just for context.
function questProgressListHtml(quests) {
  if (quests.length === 0) {
    return `
      <div class="quest-section">
        <div class="quest-title">\u{1F3AF} Quests</div>
        <div class="quest-complete">No quests yet — create some on the Quests tab.</div>
      </div>`;
  }
  return `
    <div class="quest-section">
      <div class="quest-title">\u{1F3AF} Quests</div>
      <div class="quest-list">
        ${quests
          .map((q) => {
            const pct = q.target > 0 ? Math.min(100, (100 * q.current) / q.target) : 100;
            const complete = q.current >= q.target;
            const isSide = q.quest_type === "side";
            return `
          <div class="quest-row custom-quest-row ${complete ? "complete" : ""}" title="${escapeHtmlG(q.description)}">
            <div class="quest-icon">${q.icon}</div>
            <div class="quest-body">
              <div class="quest-name">${escapeHtmlG(q.name)}
                <span class="quest-type-tag ${isSide ? "side" : "main"}">${isSide ? "\u{2795} Side" : "\u{2B50} Main"}</span>
                ${
                  q.scope_label ? `<span class="quest-class-tag">${escapeHtmlG(q.scope_label)}</span>` : ""
                }</div>
              <div class="quest-bar-outer"><div class="quest-bar-inner" style="width:${pct}%"></div></div>
            </div>
            <input type="number" class="quest-progress-input" min="0" max="${q.target}"
              value="${q.current}" data-quest-id="${q.id}" />
            <span class="quest-target">/ ${q.target}</span>
          </div>`;
          })
          .join("")}
      </div>
    </div>`;
}

function escapeHtmlG(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// ---------- Celebrations ----------

function confettiBurst() {
  const colors = ["#2f9e56", "#f4c542", "#e0603b", "#3d8bfd", "#ffffff"];
  const layer = document.createElement("div");
  layer.className = "confetti-layer";
  document.body.appendChild(layer);

  for (let i = 0; i < 60; i++) {
    const piece = document.createElement("div");
    piece.className = "confetti-piece";
    piece.style.left = `${Math.random() * 100}vw`;
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDelay = `${Math.random() * 0.4}s`;
    piece.style.animationDuration = `${1.6 + Math.random() * 1.2}s`;
    piece.style.transform = `rotate(${Math.random() * 360}deg)`;
    layer.appendChild(piece);
  }

  setTimeout(() => layer.remove(), 3200);
}

function showCelebrateToast(title, subtitle) {
  const toast = document.createElement("div");
  toast.className = "celebrate-toast";
  toast.innerHTML = `<div class="celebrate-title">${title}</div><div class="celebrate-sub">${escapeHtmlG(
    subtitle
  )}</div>`;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}

function celebrateLevelUp(stats) {
  confettiBurst();
  showCelebrateToast(
    `${stats.level_icon} Level Up!`,
    `You're now ${stats.level_name}!`
  );
}

function celebrateBadge(badge) {
  confettiBurst();
  showCelebrateToast(`${badge.icon} Badge Unlocked!`, badge.name);
}

// Compares two stats snapshots and fires the right celebration(s).
// Returns nothing - side effects only.
function celebrateStatsChange(prevStats, nextStats) {
  if (!prevStats || !nextStats) return;
  if (nextStats.level_index > prevStats.level_index) {
    celebrateLevelUp(nextStats);
    return;
  }
  const prevEarned = new Set(
    (prevStats.badges || []).filter((b) => b.earned).map((b) => b.id)
  );
  const newlyEarned = (nextStats.badges || []).filter(
    (b) => b.earned && !prevEarned.has(b.id)
  );
  if (newlyEarned.length > 0) {
    celebrateBadge(newlyEarned[0]);
  }
}
