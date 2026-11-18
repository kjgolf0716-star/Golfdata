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

// Club switcher: lets one coach login manage several clubs. The selected club
// is remembered server-side (session), so every page just shows that club's data.
(async function initClubSwitcher() {
  const nav = document.querySelector(".topnav");
  if (!nav) return;
  let data;
  try {
    const res = await fetch("/api/clubs");
    if (!res.ok) return;
    data = await res.json();
  } catch (e) {
    return;
  }
  const { clubs, current } = data;
  if (!clubs || clubs.length < 2) return;

  const select = document.createElement("select");
  select.className = "club-select";
  select.setAttribute("aria-label", "Club");
  clubs.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.name;
    if (c.id === current) opt.selected = true;
    select.appendChild(opt);
  });
  select.addEventListener("change", async () => {
    await fetch("/api/coach/club", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ club_id: Number(select.value) }),
    });
    window.location.href = "/";
  });
  nav.insertBefore(select, nav.firstChild);

  // The logo is D3's; other clubs get their name in its place.
  const club = clubs.find((c) => c.id === current);
  const brand = document.querySelector("header.topbar .brand");
  if (club && club.id !== 1 && brand) {
    brand.textContent = club.name;
  }
})();
