const logoutBtn = document.getElementById("coachLogoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    await fetch("/api/coach/logout", { method: "POST" });
    window.location.href = "/coach-login";
  });
}

const changePinBtn = document.getElementById("changePinBtn");
if (changePinBtn) {
  const modal = document.getElementById("changePinModal");
  const errorEl = document.getElementById("changePinError");
  const successEl = document.getElementById("changePinSuccess");
  const currentInput = document.getElementById("currentPinInput");
  const newInput = document.getElementById("newPinInput");

  changePinBtn.addEventListener("click", () => {
    errorEl.classList.add("hidden");
    successEl.classList.add("hidden");
    currentInput.value = "";
    newInput.value = "";
    modal.classList.remove("hidden");
  });

  document.getElementById("cancelChangePinBtn").addEventListener("click", () => {
    modal.classList.add("hidden");
  });

  document.getElementById("changePinForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.classList.add("hidden");
    successEl.classList.add("hidden");

    const res = await fetch("/api/coach/change-pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        current_pin: currentInput.value.trim(),
        new_pin: newInput.value.trim(),
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      errorEl.textContent = data.detail || "Could not change PIN.";
      errorEl.classList.remove("hidden");
      return;
    }
    successEl.classList.remove("hidden");
    currentInput.value = "";
    newInput.value = "";
  });
}
