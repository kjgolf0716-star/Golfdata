const playerId = Number(window.location.pathname.split("/").pop());

function todayDateStr() {
  return new Date().toISOString().slice(0, 10);
}

async function init() {
  const card = document.getElementById("publicCard");
  const [pRes, sRes, qRes, qpRes, dRes, eRes, ddRes] = await Promise.all([
    fetch(`/api/players/${playerId}`),
    fetch(`/api/players/${playerId}/stats`),
    fetch(`/api/quests`),
    fetch(`/api/players/${playerId}/quest-progress`),
    fetch(`/api/drills`),
    fetch(`/api/players/${playerId}/entries`),
    fetch(`/api/daily-drills?drill_date=${todayDateStr()}`),
  ]);

  if (!pRes.ok) {
    card.innerHTML = `<div class="public-loading">Player not found.</div>`;
    return;
  }

  const player = await pRes.json();
  const stats = await sRes.json();
  const allQuests = await qRes.json();
  const progressRows = await qpRes.json();
  const allDrills = await dRes.json();
  const entries = await eRes.json();
  const todayDrillIds = new Set(await ddRes.json());

  const progressByQuest = {};
  for (const row of progressRows) progressByQuest[row.quest_id] = row.current;

  const levelQuests = allQuests
    .filter((q) => q.level_index === stats.level_index)
    .map((q) => ({ ...q, current: progressByQuest[q.id] ?? 0 }));

  const todayDrills = allDrills.filter((d) => todayDrillIds.has(d.id));
  const training = computeTrainingSummary(entries, allDrills);

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

    ${todayDrills.length > 0 ? publicTodayDrillsHtml(todayDrills) : ""}

    ${training ? publicTrainingHtml(training) : ""}

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

function computeTrainingSummary(entries, drills) {
  if (entries.length === 0) return null;

  const dates = [...new Set(entries.map((e) => e.entry_date))].sort();
  const lastDate = dates[dates.length - 1];
  const lastValues = {};
  for (const e of entries) {
    if (e.entry_date === lastDate && e.value !== "") lastValues[e.drill_id] = e.value;
  }

  const sums = {};
  const counts = {};
  for (const e of entries) {
    const num = parseFloat(e.value);
    if (e.value !== "" && !Number.isNaN(num)) {
      sums[e.drill_id] = (sums[e.drill_id] ?? 0) + num;
      counts[e.drill_id] = (counts[e.drill_id] ?? 0) + 1;
    }
  }

  const rows = drills
    .filter((d) => lastValues[d.id] !== undefined || counts[d.id])
    .map((d) => ({
      name: d.name,
      last: lastValues[d.id] ?? "-",
      avg: counts[d.id] ? formatAvg(sums[d.id] / counts[d.id]) : "-",
    }));

  if (rows.length === 0) return null;
  return { lastDate, rows };
}

function formatAvg(n) {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function formatDate(iso) {
  const [y, m, d] = iso.split("-");
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function publicTodayDrillsHtml(drills) {
  return `
    <div class="public-section">
      <div class="public-section-title">\u{1F3CC} Today's Drills</div>
      <div class="public-today-drills">
        ${drills.map((d) => `<span class="public-today-drill-tag">${escapeHtml(d.name)}</span>`).join("")}
      </div>
    </div>`;
}

function publicTrainingHtml(training) {
  return `
    <div class="public-section">
      <div class="public-section-title">\u{1F4CA} Recent Training <span class="public-training-date">(${formatDate(training.lastDate)})</span></div>
      <div class="public-training-list">
        ${training.rows
          .map(
            (r) => `
          <div class="public-training-row">
            <div class="public-training-name">${escapeHtml(r.name)}</div>
            <div class="public-training-values">
              <span>Last: <strong>${escapeHtml(String(r.last))}</strong></span>
              <span>Avg: <strong>${escapeHtml(String(r.avg))}</strong></span>
            </div>
          </div>`
          )
          .join("")}
      </div>
    </div>`;
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

document.getElementById("switchAccountBtn").addEventListener("click", () => {
  localStorage.removeItem("golf_access_code");
  window.location.href = "/my";
});

init();
