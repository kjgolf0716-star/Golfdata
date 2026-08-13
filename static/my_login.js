const SAVED_CODE_KEY = "golf_access_code";

async function lookupCode(code) {
  const res = await fetch(`/api/players/code/${encodeURIComponent(code)}`);
  if (!res.ok) return null;
  return res.json();
}

async function tryAutoLogin() {
  const saved = localStorage.getItem(SAVED_CODE_KEY);
  if (!saved) return;

  const card = document.querySelector(".public-login-card");
  card.classList.add("hidden");
  document.getElementById("autoLoginLoading").classList.remove("hidden");

  const player = await lookupCode(saved);
  if (player) {
    window.location.href = `/p/${player.id}`;
    return;
  }

  localStorage.removeItem(SAVED_CODE_KEY);
  document.getElementById("autoLoginLoading").classList.add("hidden");
  card.classList.remove("hidden");
}

document.getElementById("codeForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("codeInput");
  const errorEl = document.getElementById("codeError");
  const code = input.value.trim();
  if (!code) return;

  errorEl.classList.add("hidden");
  const player = await lookupCode(code);
  if (!player) {
    errorEl.classList.remove("hidden");
    return;
  }
  localStorage.setItem(SAVED_CODE_KEY, code);
  window.location.href = `/p/${player.id}`;
});

tryAutoLogin();
