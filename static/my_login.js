document.getElementById("codeForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("codeInput");
  const errorEl = document.getElementById("codeError");
  const code = input.value.trim().toUpperCase();
  if (!code) return;

  errorEl.classList.add("hidden");
  const res = await fetch(`/api/players/code/${encodeURIComponent(code)}`);
  if (!res.ok) {
    errorEl.classList.remove("hidden");
    return;
  }
  const player = await res.json();
  window.location.href = `/p/${player.id}`;
});

document.getElementById("codeInput").addEventListener("input", (e) => {
  e.target.value = e.target.value.toUpperCase();
});
