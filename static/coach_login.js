document.getElementById("pinForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("pinInput");
  const errorEl = document.getElementById("pinError");
  const pin = input.value.trim();
  if (!pin) return;

  errorEl.classList.add("hidden");
  const res = await fetch("/api/coach/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin }),
  });
  if (!res.ok) {
    errorEl.classList.remove("hidden");
    input.value = "";
    input.focus();
    return;
  }
  const params = new URLSearchParams(window.location.search);
  window.location.href = params.get("next") || "/";
});
