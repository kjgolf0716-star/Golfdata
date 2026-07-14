let allPlayers = [];

async function fetchPlayers() {
  const res = await fetch("/api/players");
  allPlayers = await res.json();
  renderPlayers();
}

function renderPlayers() {
  const container = document.getElementById("playerList");
  const query = document.getElementById("searchInput").value.trim().toLowerCase();
  const filtered = allPlayers.filter((p) => p.name.toLowerCase().includes(query));

  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty-state">${
      allPlayers.length === 0
        ? "아직 등록된 선수가 없어요. '선수 추가' 버튼을 눌러 시작하세요."
        : "검색 결과가 없어요."
    }</div>`;
    return;
  }

  const groups = {};
  for (const p of filtered) {
    const key = p.category && p.category.trim() ? p.category.trim() : "미분류";
    if (!groups[key]) groups[key] = [];
    groups[key].push(p);
  }

  const sortedKeys = Object.keys(groups).sort((a, b) => {
    if (a === "미분류") return 1;
    if (b === "미분류") return -1;
    return a.localeCompare(b);
  });

  container.innerHTML = sortedKeys
    .map((key) => {
      const cards = groups[key]
        .map(
          (p) => `
        <a class="player-card" href="/players/${p.id}">
          <div class="name">${escapeHtml(p.name)}</div>
          <div class="meta">${p.notes ? escapeHtml(truncate(p.notes, 40)) : "훈련 기록 보기 &rarr;"}</div>
        </a>`
        )
        .join("");
      return `
        <div class="category-block">
          <div class="category-title">${escapeHtml(key)}</div>
          <div class="player-grid">${cards}</div>
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
    alert("이름을 입력해주세요.");
    return;
  }
  const category = document.getElementById("playerCategoryInput").value.trim();
  const notes = document.getElementById("playerNotesInput").value.trim();
  const res = await fetch("/api/players", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, category, notes }),
  });
  const data = await res.json();
  modal.classList.add("hidden");
  window.location.href = `/players/${data.id}`;
});

document.getElementById("searchInput").addEventListener("input", renderPlayers);

fetchPlayers();
