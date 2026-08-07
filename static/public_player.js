const playerId = Number(window.location.pathname.split("/").pop());

async function init() {
  const card = document.getElementById("publicCard");
  const [pRes, sRes, qRes, qpRes] = await Promise.all([
    fetch(`/api/players/${playerId}`),
    fetch(`/api/players/${playerId}/stats`),
    fetch(`/api/quests`),
    fetch(`/api/players/${playerId}/quest-progress`),
  ]);

  if (!pRes.ok) {
    card.innerHTML = `<div class="public-loading">Player not found.</div>`;
    return;
  }

  const player = await pRes.json();
  const stats = await sRes.json();
  const allQuests = await qRes.json();
  const progressRows = await qpRes.json();
  const progressByQuest = {};
  for (const row of progressRows) progressByQuest[row.quest_id] = row.current;

  const levelQuests = allQuests
    .filter((q) => q.level_index === stats.level_index)
    .map((q) => ({ ...q, current: progressByQuest[q.id] ?? 0 }));

  document.title = `${player.name}'s Golf Journey · D3 Golf Center`;

  card.innerHTML = `
    <div class="public-name">${escapeHtml(player.name)}</div>
    <div class="public-level-badge">
      <div class="public-level-icon">${stats.level_icon}</div>
      <div class="public-level-name">${escapeHtml(stats.level_name)}</div>
    </div>

    ${publicXpBarHtml(stats)}

    <div class="public-streak">
      ${streakChipHtml(stats)}
    </div>

    <div class="public-section">
      <div class="public-section-title">\u{1F3AF} My Quests</div>
      ${publicQuestListHtml(levelQuests)}
    </div>

    <div class="public-section">
      <div class="public-section-title">\u{1F3C5} My Achievements</div>
      ${publicBadgeGridHtml(stats.badges)}
    </div>
  `;
}

function publicXpBarHtml(stats) {
  const pct = Math.max(0, Math.min(100, stats.level_progress_pct ?? 0));
  const nextText = stats.is_max_level
    ? "You've reached the top level! \u{1F451}"
    : `${stats.xp_into_level} / ${stats.xp_for_next_level} XP to next level`;
  return `
    <div class="public-xp-outer">
      <div class="public-xp-inner" style="width:${pct}%"></div>
    </div>
    <div class="public-xp-label">\u{2B50} ${stats.xp} XP total &middot; ${nextText}</div>
  `;
}

function publicQuestListHtml(quests) {
  if (quests.length === 0) {
    return `<div class="public-empty">No quests yet for your level — check back soon!</div>`;
  }
  return `<div class="public-quest-list">${quests
    .map((q) => {
      const pct = q.target > 0 ? Math.min(100, (100 * q.current) / q.target) : 100;
      const complete = q.current >= q.target;
      const isSide = q.quest_type === "side";
      return `
      <div class="public-quest-row ${complete ? "complete" : ""}">
        <div class="public-quest-icon">${q.icon}</div>
        <div class="public-quest-body">
          <div class="public-quest-name">
            ${escapeHtml(q.name)}
            <span class="quest-type-tag ${isSide ? "side" : "main"}">${isSide ? "\u{2795} Side" : "\u{2B50} Main"}</span>
          </div>
          <div class="public-quest-bar-outer"><div class="public-quest-bar-inner" style="width:${pct}%"></div></div>
          <div class="public-quest-progress">${q.current} / ${q.target}${complete ? " \u{2705}" : ""}</div>
        </div>
      </div>`;
    })
    .join("")}</div>`;
}

function publicBadgeGridHtml(badges) {
  return `<div class="badge-grid">${badges
    .map(
      (b) => `
      <div class="badge ${b.earned ? "earned" : "locked"}" title="${escapeHtmlG(b.desc)}">
        <div class="badge-icon">${b.icon}</div>
        <div class="badge-name">${escapeHtmlG(b.name)}</div>
      </div>`
    )
    .join("")}</div>`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

init();
