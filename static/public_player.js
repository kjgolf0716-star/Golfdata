const playerId = Number(window.location.pathname.split("/").pop());

const AVATAR_BG_CHOICES = ["b6e3f4", "c0aede", "d1d4f9", "ffd5dc", "ffdfbf", "c8e6c9", "fff9c4", "b2ebf2"];
const AVATAR_BOY_HAIR = Array.from({ length: 19 }, (_, i) => `short${String(i + 1).padStart(2, "0")}`);
const AVATAR_GIRL_HAIR = Array.from({ length: 26 }, (_, i) => `long${String(i + 1).padStart(2, "0")}`);
const AVATAR_HAIR_COLORS = [
  "ac6511", "cb6820", "ab2a18", "e5d7a3", "b9a05f", "796a45", "6a4e35",
  "562306", "0e0e0e", "afafaf", "3eac2c", "85c2c6", "dba3be", "592454",
];
const AVATAR_SKIN_COLORS = ["f2d3b1", "ecad80", "9e5622", "763900"];

let currentAvatarSeed = "";
let currentAvatarBg = AVATAR_BG_CHOICES[0];
let currentAvatarHair = null;
let currentAvatarHairColor = null;
let currentAvatarSkinColor = null;
let draftAvatarSeed = "";
let draftAvatarBg = AVATAR_BG_CHOICES[0];
let draftAvatarHair = null;
let draftAvatarHairColor = null;
let draftAvatarSkinColor = null;
let draftAvatarGender = null; // "boy" | "girl" | null
let isFirstTimeAvatar = false;

function avatarUrl(seed, bg, hair, hairColor, skinColor) {
  let url = `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(seed)}&backgroundColor=${bg}`;
  if (hair) url += `&hair=${hair}`;
  if (hairColor) url += `&hairColor=${hairColor}`;
  if (skinColor) url += `&skinColor=${skinColor}`;
  return url;
}

function randomSeed() {
  return Math.random().toString(36).slice(2, 10);
}

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function genderOf(hair) {
  if (!hair) return null;
  return AVATAR_BOY_HAIR.includes(hair) ? "boy" : AVATAR_GIRL_HAIR.includes(hair) ? "girl" : null;
}

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

  isFirstTimeAvatar = !player.avatar_seed;
  currentAvatarSeed = player.avatar_seed || player.name;
  currentAvatarBg = AVATAR_BG_CHOICES.includes(player.avatar_bg) ? player.avatar_bg : AVATAR_BG_CHOICES[0];
  currentAvatarHair = AVATAR_BOY_HAIR.includes(player.avatar_hair) || AVATAR_GIRL_HAIR.includes(player.avatar_hair)
    ? player.avatar_hair
    : null;
  currentAvatarHairColor = AVATAR_HAIR_COLORS.includes(player.avatar_hair_color) ? player.avatar_hair_color : null;
  currentAvatarSkinColor = AVATAR_SKIN_COLORS.includes(player.avatar_skin_color) ? player.avatar_skin_color : null;

  card.innerHTML = `
    ${publicAvatarHtml()}

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

  wireAvatarPicker();
  if (isFirstTimeAvatar) openAvatarPicker();
}

function draftAvatarUrl() {
  return avatarUrl(draftAvatarSeed, draftAvatarBg, draftAvatarHair, draftAvatarHairColor, draftAvatarSkinColor);
}

function swatchRowHtml(label, kind, choices) {
  return `
    <div class="public-avatar-swatch-group">
      <div class="public-avatar-swatch-label">${label}</div>
      <div class="public-avatar-swatches">
        ${choices
          .map((c) => `<button type="button" class="public-avatar-swatch" data-kind="${kind}" data-value="${c}" style="background:#${c}"></button>`)
          .join("")}
      </div>
    </div>`;
}

function publicAvatarHtml() {
  return `
    <div class="public-avatar-wrap">
      <img id="avatarImg" class="public-avatar-img" src="${avatarUrl(currentAvatarSeed, currentAvatarBg, currentAvatarHair, currentAvatarHairColor, currentAvatarSkinColor)}" alt="Your avatar" />
      <button type="button" id="customizeAvatarBtn" class="public-avatar-edit-btn">\u{1F3A8} Customize Avatar</button>
    </div>
    <div id="avatarPicker" class="public-avatar-picker hidden">
      <div id="avatarPickerTitle" class="public-avatar-picker-title hidden">\u{1F389} Welcome! Create your avatar</div>
      <img id="avatarPreview" class="public-avatar-preview" src="${avatarUrl(currentAvatarSeed, currentAvatarBg, currentAvatarHair, currentAvatarHairColor, currentAvatarSkinColor)}" alt="Avatar preview" />
      <div class="public-avatar-gender">
        <button type="button" class="public-avatar-gender-btn" data-gender="boy">\u{1F466} Boy</button>
        <button type="button" class="public-avatar-gender-btn" data-gender="girl">\u{1F467} Girl</button>
        <button type="button" id="shuffleHairBtn" class="btn-secondary">\u{1F487} Hairstyle</button>
      </div>
      ${swatchRowHtml("Hair Color", "hairColor", AVATAR_HAIR_COLORS)}
      ${swatchRowHtml("Skin Color", "skinColor", AVATAR_SKIN_COLORS)}
      ${swatchRowHtml("Background", "bg", AVATAR_BG_CHOICES)}
      <div class="public-avatar-actions">
        <button type="button" id="shuffleAvatarBtn" class="btn-secondary">\u{1F3B2} Shuffle Face</button>
        <button type="button" id="saveAvatarBtn" class="btn-primary">Save Avatar</button>
        <button type="button" id="cancelAvatarBtn" class="btn-secondary">Cancel</button>
      </div>
    </div>`;
}

function updateAvatarPickerSelection() {
  document.querySelectorAll(".public-avatar-swatch").forEach((btn) => {
    const draftValue = { bg: draftAvatarBg, hairColor: draftAvatarHairColor, skinColor: draftAvatarSkinColor }[btn.dataset.kind];
    btn.classList.toggle("selected", btn.dataset.value === draftValue);
  });
  document.querySelectorAll(".public-avatar-gender-btn").forEach((btn) => {
    btn.classList.toggle("selected", btn.dataset.gender === draftAvatarGender);
  });
}

function openAvatarPicker() {
  const picker = document.getElementById("avatarPicker");
  const preview = document.getElementById("avatarPreview");
  draftAvatarSeed = currentAvatarSeed;
  draftAvatarBg = currentAvatarBg;
  draftAvatarHair = currentAvatarHair;
  draftAvatarHairColor = currentAvatarHairColor;
  draftAvatarSkinColor = currentAvatarSkinColor;
  draftAvatarGender = genderOf(currentAvatarHair);
  preview.src = draftAvatarUrl();
  updateAvatarPickerSelection();
  document.getElementById("avatarPickerTitle").classList.toggle("hidden", !isFirstTimeAvatar);
  document.getElementById("cancelAvatarBtn").classList.toggle("hidden", isFirstTimeAvatar);
  picker.classList.remove("hidden");
}

function wireAvatarPicker() {
  const picker = document.getElementById("avatarPicker");
  const preview = document.getElementById("avatarPreview");

  document.getElementById("customizeAvatarBtn").addEventListener("click", openAvatarPicker);

  document.getElementById("cancelAvatarBtn").addEventListener("click", () => {
    picker.classList.add("hidden");
  });

  document.getElementById("shuffleAvatarBtn").addEventListener("click", () => {
    draftAvatarSeed = randomSeed();
    preview.src = draftAvatarUrl();
  });

  document.getElementById("shuffleHairBtn").addEventListener("click", () => {
    const pool = draftAvatarGender === "girl" ? AVATAR_GIRL_HAIR : draftAvatarGender === "boy" ? AVATAR_BOY_HAIR : AVATAR_BOY_HAIR.concat(AVATAR_GIRL_HAIR);
    draftAvatarHair = randomFrom(pool);
    draftAvatarGender = genderOf(draftAvatarHair);
    preview.src = draftAvatarUrl();
    updateAvatarPickerSelection();
  });

  document.querySelectorAll(".public-avatar-gender-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      draftAvatarGender = btn.dataset.gender;
      draftAvatarHair = randomFrom(draftAvatarGender === "boy" ? AVATAR_BOY_HAIR : AVATAR_GIRL_HAIR);
      preview.src = draftAvatarUrl();
      updateAvatarPickerSelection();
    });
  });

  document.querySelectorAll(".public-avatar-swatch").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.kind === "bg") draftAvatarBg = btn.dataset.value;
      else if (btn.dataset.kind === "hairColor") draftAvatarHairColor = btn.dataset.value;
      else if (btn.dataset.kind === "skinColor") draftAvatarSkinColor = btn.dataset.value;
      preview.src = draftAvatarUrl();
      updateAvatarPickerSelection();
    });
  });

  document.getElementById("saveAvatarBtn").addEventListener("click", async () => {
    const res = await fetch(`/api/players/${playerId}/avatar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        seed: draftAvatarSeed,
        bg: draftAvatarBg,
        hair: draftAvatarHair,
        hair_color: draftAvatarHairColor,
        skin_color: draftAvatarSkinColor,
      }),
    });
    if (!res.ok) {
      alert("Could not save avatar - try again.");
      return;
    }
    currentAvatarSeed = draftAvatarSeed;
    currentAvatarBg = draftAvatarBg;
    currentAvatarHair = draftAvatarHair;
    currentAvatarHairColor = draftAvatarHairColor;
    currentAvatarSkinColor = draftAvatarSkinColor;
    isFirstTimeAvatar = false;
    document.getElementById("avatarImg").src = avatarUrl(
      currentAvatarSeed, currentAvatarBg, currentAvatarHair, currentAvatarHairColor, currentAvatarSkinColor
    );
    picker.classList.add("hidden");
  });
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
