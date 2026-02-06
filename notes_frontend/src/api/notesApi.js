/**
 * Notes API client.
 *
 * Env configuration:
 * - REACT_APP_API_BASE: preferred base URL for API (e.g. "https://api.example.com")
 * - REACT_APP_BACKEND_URL: fallback base URL for API
 *
 * IMPORTANT: This frontend assumes the backend exposes a REST-ish JSON API under /notes.
 * If your backend uses different routes/shape, update only this file to adapt.
 */

/**
 * Normalize a base URL (strip trailing slashes).
 * @param {string} base
 * @returns {string}
 */
function normalizeBase(base) {
  return String(base || "").replace(/\/+$/, "");
}

/**
 * Build a URL by combining base and path safely.
 * @param {string} base
 * @param {string} path
 * @returns {string}
 */
function buildUrl(base, path) {
  const normalized = normalizeBase(base);
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${normalized}${p}`;
}

/**
 * Parse JSON response safely; falls back to text.
 * @param {Response} res
 * @returns {Promise<any>}
 */
async function parseJsonOrText(res) {
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return res.json();
  }
  return res.text();
}

/**
 * Attempt to unwrap a response shape:
 * - If backend returns { data: ... } return data
 * - Else return as-is
 * @param {any} payload
 * @returns {any}
 */
function unwrapData(payload) {
  if (payload && typeof payload === "object" && "data" in payload) return payload.data;
  return payload;
}

/**
 * Convert various note shapes to a consistent UI note object.
 * @param {any} raw
 * @returns {{id: string, title: string, content: string, updatedAt?: string, createdAt?: string}}
 */
function toUiNote(raw) {
  if (!raw || typeof raw !== "object") {
    return { id: "", title: "", content: "" };
  }
  const id = String(raw.id ?? raw._id ?? raw.noteId ?? "");
  const title = String(raw.title ?? raw.name ?? "").trim();
  const content = String(raw.content ?? raw.body ?? raw.text ?? "");
  const updatedAt = raw.updatedAt ?? raw.updated_at ?? raw.modifiedAt ?? raw.modified_at;
  const createdAt = raw.createdAt ?? raw.created_at;
  return {
    id,
    title,
    content,
    ...(updatedAt ? { updatedAt: String(updatedAt) } : {}),
    ...(createdAt ? { createdAt: String(createdAt) } : {})
  };
}

const API_BASE = process.env.REACT_APP_API_BASE || process.env.REACT_APP_BACKEND_URL || "";

/**
 * Build request init with JSON headers.
 * @param {RequestInit} init
 * @returns {RequestInit}
 */
function withJson(init) {
  const headers = {
    Accept: "application/json",
    ...(init && init.headers ? init.headers : {})
  };
  return { ...init, headers };
}

/**
 * Perform a request and throw a friendly error on non-2xx.
 * @param {string} path
 * @param {RequestInit} init
 * @returns {Promise<any>}
 */
async function request(path, init) {
  if (!API_BASE) {
    throw new Error(
      "Backend base URL is not configured. Set REACT_APP_API_BASE or REACT_APP_BACKEND_URL."
    );
  }

  const url = buildUrl(API_BASE, path);
  const res = await fetch(url, withJson(init));

  const payload = await parseJsonOrText(res);
  if (!res.ok) {
    const message =
      typeof payload === "string"
        ? payload
        : (payload && (payload.message || payload.error)) || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return payload;
}

// PUBLIC_INTERFACE
export async function listNotes() {
  /** Fetch all notes. Returns array of {id,title,content,...}. */
  const payload = await request("/notes", { method: "GET" });
  const unwrapped = unwrapData(payload);

  const items = Array.isArray(unwrapped)
    ? unwrapped
    : Array.isArray(unwrapped?.items)
      ? unwrapped.items
      : Array.isArray(unwrapped?.notes)
        ? unwrapped.notes
        : [];

  return items.map(toUiNote).filter(n => n.id);
}

// PUBLIC_INTERFACE
export async function createNote(input) {
  /** Create a note. input: {title, content}. Returns created note. */
  const payload = await request("/notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: input.title,
      content: input.content
    })
  });
  return toUiNote(unwrapData(payload));
}

// PUBLIC_INTERFACE
export async function updateNote(noteId, input) {
  /** Update a note by id. input: {title, content}. Returns updated note. */
  const payload = await request(`/notes/${encodeURIComponent(noteId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: input.title,
      content: input.content
    })
  });
  return toUiNote(unwrapData(payload));
}

// PUBLIC_INTERFACE
export async function deleteNote(noteId) {
  /** Delete a note by id. Returns void. */
  await request(`/notes/${encodeURIComponent(noteId)}`, { method: "DELETE" });
}
