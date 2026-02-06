import React, { useEffect, useMemo, useState } from "react";
import "./App.css";
import { createNote, deleteNote, listNotes, updateNote } from "./api/notesApi";

/**
 * @typedef {{id:string,title:string,content:string,updatedAt?:string,createdAt?:string}} Note
 */

const EMPTY_DRAFT = { title: "", content: "" };

/**
 * Sort notes with most recently updated first (best effort).
 * @param {Note[]} notes
 * @returns {Note[]}
 */
function sortNotes(notes) {
  const toTs = n => {
    const v = n.updatedAt || n.createdAt;
    const ts = v ? Date.parse(String(v)) : NaN;
    return Number.isFinite(ts) ? ts : 0;
  };
  return [...notes].sort((a, b) => toTs(b) - toTs(a));
}

// PUBLIC_INTERFACE
function App() {
  /** Notes app root. Handles data fetching and orchestration between list and editor. */
  const [notes, setNotes] = useState(/** @type {Note[]} */ ([]));
  const [selectedId, setSelectedId] = useState(/** @type {string|null} */ (null));
  const [mode, setMode] = useState(/** @type {"view"|"edit"|"create"} */ ("view"));

  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [touched, setTouched] = useState(false);

  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const selectedNote = useMemo(() => {
    if (!selectedId) return null;
    return notes.find(n => n.id === selectedId) || null;
  }, [notes, selectedId]);

  const titleError = useMemo(() => {
    if (!touched) return "";
    if (!draft.title.trim()) return "Title is required.";
    if (draft.title.trim().length > 80) return "Title must be 80 characters or less.";
    return "";
  }, [draft.title, touched]);

  // Initial load
  useEffect(() => {
    let mounted = true;

    async function load() {
      setIsBusy(true);
      setError("");
      setStatus("Loading notes...");
      try {
        const items = await listNotes();
        if (!mounted) return;
        const sorted = sortNotes(items);
        setNotes(sorted);
        if (sorted.length > 0) setSelectedId(sorted[0].id);
        setStatus("");
      } catch (e) {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : "Failed to load notes.");
        setStatus("");
      } finally {
        if (mounted) setIsBusy(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  // Sync draft when selection changes in view mode
  useEffect(() => {
    if (mode !== "view") return;
    if (!selectedNote) return;
    setDraft({ title: selectedNote.title || "", content: selectedNote.content || "" });
    setTouched(false);
  }, [mode, selectedNote?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const showStatus = msg => {
    setStatus(msg);
    window.clearTimeout(showStatus._t);
    showStatus._t = window.setTimeout(() => setStatus(""), 2000);
  };

  // PUBLIC_INTERFACE
  const handleCreate = () => {
    setError("");
    setMode("create");
    setDraft(EMPTY_DRAFT);
    setTouched(false);
  };

  // PUBLIC_INTERFACE
  const handleSelect = id => {
    setError("");
    setSelectedId(id);
    setMode("view");
    setTouched(false);
  };

  // PUBLIC_INTERFACE
  const handleStartEdit = () => {
    if (!selectedNote) return;
    setError("");
    setMode("edit");
    setDraft({ title: selectedNote.title || "", content: selectedNote.content || "" });
    setTouched(false);
  };

  // PUBLIC_INTERFACE
  const handleCancel = () => {
    setError("");
    setMode("view");
    if (selectedNote) {
      setDraft({ title: selectedNote.title || "", content: selectedNote.content || "" });
    } else {
      setDraft(EMPTY_DRAFT);
    }
    setTouched(false);
  };

  // PUBLIC_INTERFACE
  const handleSave = async () => {
    setError("");
    setTouched(true);

    const title = draft.title.trim();
    if (!title) return;

    setIsBusy(true);
    try {
      if (mode === "create") {
        const created = await createNote({ title, content: draft.content });
        const nextNotes = sortNotes([created, ...notes]);
        setNotes(nextNotes);
        setSelectedId(created.id);
        setMode("view");
        showStatus("Saved.");
      } else if (mode === "edit" && selectedNote) {
        const updated = await updateNote(selectedNote.id, { title, content: draft.content });
        const nextNotes = sortNotes(notes.map(n => (n.id === updated.id ? updated : n)));
        setNotes(nextNotes);
        setMode("view");
        showStatus("Updated.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setIsBusy(false);
    }
  };

  // PUBLIC_INTERFACE
  const handleDelete = async id => {
    setError("");
    const note = notes.find(n => n.id === id);
    const title = note?.title || "Untitled";

    // eslint-disable-next-line no-alert
    const ok = window.confirm(`Delete "${title}"? This cannot be undone.`);
    if (!ok) return;

    setIsBusy(true);
    try {
      await deleteNote(id);
      const remaining = notes.filter(n => n.id !== id);
      setNotes(sortNotes(remaining));

      if (selectedId === id) {
        const next = remaining[0]?.id ?? null;
        setSelectedId(next);
        setMode("view");
        setDraft(
          next
            ? { title: remaining[0].title || "", content: remaining[0].content || "" }
            : EMPTY_DRAFT
        );
      }
      showStatus("Deleted.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setIsBusy(false);
    }
  };

  const canSave = !titleError && draft.title.trim() && !isBusy;

  return (
    <div className="App">
      <div className="topbar" role="banner">
        <div className="topbar-left">
          <div className="topbar-title">Retro Notes</div>
          <div className="topbar-subtitle">
            Minimal notes app • API:{" "}
            <span className="mono">
              {process.env.REACT_APP_API_BASE || process.env.REACT_APP_BACKEND_URL || "(not set)"}
            </span>
          </div>
        </div>

        <div className="topbar-right" aria-live="polite">
          {isBusy ? <span className="pill">Working…</span> : null}
          {status ? <span className="pill pill-ok">{status}</span> : null}
          {error ? <span className="pill pill-err">{error}</span> : null}
        </div>
      </div>

      <main className="layout" role="main">
        <aside className="panel sidebar" aria-label="Notes list">
          <div className="sidebar-header">
            <div>
              <div className="brand">Notes</div>
              <div className="muted">Create, edit, delete</div>
            </div>

            <button className="btn btn-primary btn-sm" type="button" onClick={handleCreate} disabled={isBusy}>
              + New
            </button>
          </div>

          <div className="sidebar-list" role="list">
            {notes.length === 0 ? (
              <div className="empty-state">
                No notes yet. Create your first note with <span className="kbd">+ New</span>.
              </div>
            ) : (
              notes.map(note => {
                const isSelected = note.id === selectedId;
                const title = note.title || "Untitled";
                const preview = (note.content || "").trim().split("\n")[0].slice(0, 80);

                return (
                  <div key={note.id} role="listitem" className={`note-row ${isSelected ? "selected" : ""}`}>
                    <button
                      type="button"
                      className="note-row-main"
                      onClick={() => handleSelect(note.id)}
                      aria-current={isSelected ? "true" : "false"}
                      title={title}
                    >
                      <div className="note-row-title">{title}</div>
                      <div className="note-row-preview">{preview || "—"}</div>
                    </button>

                    <button
                      type="button"
                      className="btn btn-danger btn-sm note-row-delete"
                      onClick={() => handleDelete(note.id)}
                      disabled={isBusy}
                      aria-label={`Delete note "${title}"`}
                    >
                      Del
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        <section className="panel editor" aria-label="Note editor">
          {mode === "view" && !selectedNote ? (
            <div className="editor-empty">
              <div className="editor-empty-title">Select a note</div>
              <div className="muted">Or create a new one from the left panel.</div>
            </div>
          ) : mode === "view" && selectedNote ? (
            <>
              <div className="editor-toolbar">
                <div className="editor-titlewrap">
                  <div className="editor-title">{selectedNote.title || "Untitled"}</div>
                  <div className="muted">Viewing</div>
                </div>
                <div className="editor-actions">
                  <button className="btn btn-primary btn-md" type="button" onClick={handleStartEdit} disabled={isBusy}>
                    Edit
                  </button>
                </div>
              </div>

              <article className="viewer">
                {selectedNote.content ? (
                  <pre className="viewer-pre">{selectedNote.content}</pre>
                ) : (
                  <div className="muted">No content.</div>
                )}
              </article>
            </>
          ) : (
            <>
              <div className="editor-toolbar">
                <div className="editor-titlewrap">
                  <div className="editor-title">{mode === "create" ? "New note" : "Edit note"}</div>
                  <div className="muted">{mode === "create" ? "Creating" : "Editing"}</div>
                </div>

                <div className="editor-actions">
                  <button
                    className="btn btn-secondary btn-md"
                    type="button"
                    onClick={handleCancel}
                    disabled={isBusy}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn btn-primary btn-md"
                    type="button"
                    onClick={handleSave}
                    disabled={!canSave}
                    aria-disabled={!canSave}
                  >
                    Save
                  </button>
                </div>
              </div>

              <form
                className="editor-form"
                onSubmit={e => {
                  e.preventDefault();
                  if (canSave) handleSave();
                  else setTouched(true);
                }}
              >
                <label className="field">
                  <div className="field-label">Title</div>
                  <input
                    className={`input ${titleError ? "input-error" : ""}`}
                    value={draft.title}
                    onChange={e => setDraft({ ...draft, title: e.target.value })}
                    onBlur={() => setTouched(true)}
                    maxLength={120}
                    placeholder="e.g. Shopping list"
                    autoFocus
                  />
                  {titleError ? <div className="field-error">{titleError}</div> : null}
                </label>

                <label className="field">
                  <div className="field-label">Content</div>
                  <textarea
                    className="textarea"
                    value={draft.content}
                    onChange={e => setDraft({ ...draft, content: e.target.value })}
                    placeholder="Write something..."
                    rows={14}
                  />
                </label>

                <div className="muted small">
                  Tip: keep it short and sweet. Your notes are saved to the backend.
                </div>
              </form>
            </>
          )}
        </section>
      </main>

      <footer className="footer">
        <span className="muted">
          Env vars used: <span className="mono">REACT_APP_API_BASE</span> (preferred) or{" "}
          <span className="mono">REACT_APP_BACKEND_URL</span>
        </span>
      </footer>
    </div>
  );
}

export default App;
