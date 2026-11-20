// Dated coach notes on the player page. Uses globals from player.js
// (playerId, escapeHtml, formatDate, flashSaved) and coach_nav.js (confirmDialog, noticeDialog).
let notes = []; // newest date first
let editingNoteId = null;

function todayIso() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function loadNotes() {
  const res = await fetch(`/api/players/${playerId}/notes`);
  if (!res.ok) return;
  notes = await res.json();
  renderNotes();
}

function noteCardHtml(n) {
  if (n.id === editingNoteId) {
    return `<div class="note-card editing" data-note-id="${n.id}">
      <input type="date" class="note-date-input" value="${escapeHtml(n.note_date)}" data-edit-date />
      <textarea class="note-text-input" rows="4" maxlength="5000" data-edit-text>${escapeHtml(n.content)}</textarea>
      <div class="note-form-actions">
        <button type="button" class="btn-secondary" data-note-cancel>Cancel</button>
        <button type="button" class="btn-primary" data-note-save="${n.id}">Save</button>
      </div>
    </div>`;
  }
  return `<div class="note-card" data-note-id="${n.id}">
    <div class="note-card-top">
      <div class="note-card-date">${escapeHtml(formatDate(n.note_date))}</div>
      <div class="note-card-actions">
        <button type="button" class="btn-icon btn-secondary" data-note-edit="${n.id}">Edit</button>
        <button type="button" class="btn-icon btn-danger" data-note-delete="${n.id}">Delete</button>
      </div>
    </div>
    <div class="note-card-text">${escapeHtml(n.content)}</div>
  </div>`;
}

function renderNotes() {
  const list = document.getElementById("notesList");
  list.innerHTML = notes.length
    ? notes.map(noteCardHtml).join("")
    : `<div class="notes-empty">No notes yet. Use "+ Add note" to record what happened in a session.</div>`;

  list.querySelectorAll("[data-note-edit]").forEach((b) =>
    b.addEventListener("click", () => {
      editingNoteId = Number(b.dataset.noteEdit);
      renderNotes();
    })
  );
  list.querySelectorAll("[data-note-cancel]").forEach((b) =>
    b.addEventListener("click", () => {
      editingNoteId = null;
      renderNotes();
    })
  );
  list.querySelectorAll("[data-note-save]").forEach((b) => b.addEventListener("click", onSaveEditedNote));
  list.querySelectorAll("[data-note-delete]").forEach((b) => b.addEventListener("click", onDeleteNote));
}

function showNoteForm(show) {
  const form = document.getElementById("noteForm");
  form.classList.toggle("hidden", !show);
  if (show) {
    document.getElementById("noteDateInput").value = todayIso();
    document.getElementById("noteTextInput").value = "";
    document.getElementById("noteTextInput").focus();
  }
}

async function onSaveNewNote() {
  const note_date = document.getElementById("noteDateInput").value;
  const content = document.getElementById("noteTextInput").value.trim();
  if (!note_date) return noticeDialog("Please choose a date.");
  if (!content) return noticeDialog("Please write a note first.");
  const res = await fetch(`/api/players/${playerId}/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ note_date, content }),
  });
  if (!res.ok) return noticeDialog("Couldn't save the note. Please try again.");
  const saved = await res.json();
  notes.push(saved);
  sortNotes();
  showNoteForm(false);
  renderNotes();
  flashSaved("Note saved");
}

async function onSaveEditedNote(e) {
  const id = Number(e.currentTarget.dataset.noteSave);
  const card = document.querySelector(`.note-card[data-note-id="${id}"]`);
  const note_date = card.querySelector("[data-edit-date]").value;
  const content = card.querySelector("[data-edit-text]").value.trim();
  if (!note_date) return noticeDialog("Please choose a date.");
  if (!content) return noticeDialog("A note can't be empty. Use Delete to remove it.");
  const res = await fetch(`/api/notes/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ note_date, content }),
  });
  if (!res.ok) return noticeDialog("Couldn't save the note. Please try again.");
  const saved = await res.json();
  notes = notes.map((n) => (n.id === id ? saved : n));
  editingNoteId = null;
  sortNotes();
  renderNotes();
  flashSaved("Note saved");
}

async function onDeleteNote(e) {
  const id = Number(e.currentTarget.dataset.noteDelete);
  const n = notes.find((x) => x.id === id);
  const ok = await confirmDialog(`Delete the note from ${n ? formatDate(n.note_date) : "this date"}?`, {
    confirmLabel: "Delete",
    danger: true,
  });
  if (!ok) return;
  const res = await fetch(`/api/notes/${id}`, { method: "DELETE" });
  if (!res.ok) return noticeDialog("Couldn't delete the note. Please try again.");
  notes = notes.filter((x) => x.id !== id);
  renderNotes();
  flashSaved("Deleted");
}

function sortNotes() {
  notes.sort((a, b) => (a.note_date < b.note_date ? 1 : a.note_date > b.note_date ? -1 : b.id - a.id));
}

document.getElementById("addNoteBtn").addEventListener("click", () => {
  const form = document.getElementById("noteForm");
  showNoteForm(form.classList.contains("hidden"));
});
document.getElementById("cancelNoteBtn").addEventListener("click", () => showNoteForm(false));
document.getElementById("saveNoteBtn").addEventListener("click", onSaveNewNote);

loadNotes();
