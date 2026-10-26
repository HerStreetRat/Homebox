// Homebox home-server: serves the app and saves its data to a JSON file.
// No dependencies; runs on Node 20+. Settings via environment:
//   PORT (default 8080), SITE_DIR (default: repo root), DATA_DIR (default ./data)
"use strict";
const http = require("http");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT) || 8080;
const SITE_DIR = path.resolve(process.env.SITE_DIR || path.join(__dirname, ".."));
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, "data"));
const DATA_FILE = path.join(DATA_DIR, "homebox.json");
const AUTH_FILE = path.join(DATA_DIR, "auth.json");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const PHOTO_DIR = path.join(DATA_DIR, "photos");
const MAX_PHOTO = 8 * 1024 * 1024;
const PHOTO_TYPES = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };
const MAX_BODY = 5 * 1024 * 1024;
const KEEP_BACKUPS = 30;

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml",
  ".png": "image/png", ".ico": "image/x-icon", ".md": "text/plain; charset=utf-8", ".txt": "text/plain; charset=utf-8",
};

/* ---------- storage ---------- */
async function readJson(file, fallback) {
  try { return JSON.parse(await fsp.readFile(file, "utf8")); } catch (e) { if (e.code === "ENOENT") return fallback; throw e; }
}
async function writeFileAtomic(file, data) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(tmp, data, { mode: 0o600 });
  await fsp.rename(tmp, file);
}
const writeJson = (file, value) => writeFileAtomic(file, JSON.stringify(value, null, 2));
async function backup(doc) {
  await fsp.mkdir(BACKUP_DIR, { recursive: true });
  const day = new Date().toISOString().slice(0, 10);
  await writeJson(path.join(BACKUP_DIR, `homebox-${day}.json`), doc);
  const files = (await fsp.readdir(BACKUP_DIR)).filter((f) => /^homebox-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  for (const f of files.slice(0, Math.max(0, files.length - KEEP_BACKUPS))) await fsp.unlink(path.join(BACKUP_DIR, f)).catch(() => {});
}
const emptyDoc = () => ({ version: 0, updatedAt: null, data: { items: {}, tasks: {}, parts: {}, projects: {} } });

// One write at a time, so versions never interleave.
let queue = Promise.resolve();
const serial = (fn) => { const run = queue.then(fn, fn); queue = run.catch(() => {}); return run; };

/* ---------- auth: one password, set from the app on first use ---------- */
const hashPassword = (pw, salt) => new Promise((res, rej) =>
  crypto.scrypt(pw, salt, 64, { N: 16384, r: 8, p: 1 }, (err, key) => err ? rej(err) : res(key.toString("hex"))));
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
async function loadAuth() { return readJson(AUTH_FILE, null); }
function tokenFrom(req) { const h = req.headers.authorization || ""; return h.startsWith("Bearer ") ? h.slice(7) : ""; }
async function isAuthed(req) {
  const auth = await loadAuth(), t = tokenFrom(req);
  return !!(auth && t && (auth.tokens || []).some((x) => x.hash === sha(t)));
}
async function issueToken(auth, label) {
  const token = crypto.randomBytes(32).toString("hex");
  auth.tokens = [...(auth.tokens || []), { hash: sha(token), label: String(label || "").slice(0, 80), created: new Date().toISOString() }].slice(-20);
  await writeJson(AUTH_FILE, auth);
  return token;
}
const failures = new Map(); // ip -> [timestamps]
function tooMany(ip) {
  const now = Date.now(), recent = (failures.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  failures.set(ip, recent);
  return recent.length >= 10;
}
const noteFailure = (ip) => failures.set(ip, [...(failures.get(ip) || []), Date.now()]);

/* ---------- http helpers ---------- */
function send(res, status, body, headers = {}) {
  const isJson = typeof body !== "string" && !Buffer.isBuffer(body);
  res.writeHead(status, { "Content-Type": isJson ? "application/json; charset=utf-8" : "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers });
  res.end(isJson ? JSON.stringify(body) : body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", (c) => { size += c.length; if (size > MAX_BODY) { reject(Object.assign(new Error("too large"), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}); } catch { reject(Object.assign(new Error("bad json"), { status: 400 })); } });
    req.on("error", reject);
  });
}
function readRaw(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", (c) => { size += c.length; if (size > limit) { reject(Object.assign(new Error("That photo is too large."), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
// Photo ids are random hex, so a name can never reach outside PHOTO_DIR.
async function findPhoto(id) {
  if (!/^[a-f0-9]{32}$/.test(id || "")) return null;
  for (const [type, ext] of Object.entries(PHOTO_TYPES)) {
    const file = path.join(PHOTO_DIR, id + ext);
    try { await fsp.access(file); return { file, type }; } catch {}
  }
  return null;
}
const validData = (d) => d && typeof d === "object" && ["items", "tasks"].every((k) => d[k] && typeof d[k] === "object" && !Array.isArray(d[k]));

/* ---------- API ---------- */
async function api(req, res, route, url) {
  const ip = req.socket.remoteAddress || "";
  if (route === "status" && req.method === "GET") {
    const auth = await loadAuth();
    return send(res, 200, { app: "homebox", configured: !!auth, authed: await isAuthed(req) });
  }
  if (route === "setup" && req.method === "POST") {
    const body = await readBody(req);
    const pw = String(body.password || "");
    if (pw.length < 8) return send(res, 400, { error: "Use at least 8 characters." });
    return serial(async () => {
      if (await loadAuth()) return send(res, 409, { error: "A password is already set." });
      const salt = crypto.randomBytes(16).toString("hex");
      const auth = { salt, hash: await hashPassword(pw, salt), tokens: [] };
      const token = await issueToken(auth, body.device);
      send(res, 200, { token });
    });
  }
  if (route === "login" && req.method === "POST") {
    if (tooMany(ip)) return send(res, 429, { error: "Too many tries. Wait 10 minutes and try again." });
    const body = await readBody(req), auth = await loadAuth();
    if (!auth) return send(res, 409, { error: "No password set yet." });
    const given = Buffer.from(await hashPassword(String(body.password || ""), auth.salt), "hex");
    if (!crypto.timingSafeEqual(given, Buffer.from(auth.hash, "hex"))) {
      noteFailure(ip);
      await new Promise((r) => setTimeout(r, 800));
      return send(res, 401, { error: "That password isn't right." });
    }
    return serial(async () => send(res, 200, { token: await issueToken(await loadAuth(), body.device) }));
  }
  if (!(await isAuthed(req))) return send(res, 401, { error: "Sign in first." });

  if (route === "logout" && req.method === "POST") {
    return serial(async () => {
      const auth = await loadAuth(), h = sha(tokenFrom(req));
      auth.tokens = (auth.tokens || []).filter((x) => x.hash !== h);
      await writeJson(AUTH_FILE, auth);
      send(res, 200, { ok: true });
    });
  }
  if (route === "data" && req.method === "GET") return send(res, 200, await readJson(DATA_FILE, emptyDoc()));
  if (route === "data" && req.method === "PUT") {
    const body = await readBody(req);
    if (!validData(body.data)) return send(res, 400, { error: "That doesn't look like Homebox data." });
    return serial(async () => {
      const current = await readJson(DATA_FILE, emptyDoc());
      if (Number(body.baseVersion) !== current.version) return send(res, 409, current);
      const next = { version: current.version + 1, updatedAt: new Date().toISOString(), data: body.data };
      await writeJson(DATA_FILE, next);
      await backup(next).catch((e) => console.error("backup failed:", e.message));
      send(res, 200, { version: next.version, updatedAt: next.updatedAt });
    });
  }
  if (route === "photo" && req.method === "POST") {
    const ext = PHOTO_TYPES[(req.headers["content-type"] || "").split(";")[0].trim()];
    if (!ext) return send(res, 415, { error: "Use a JPEG, PNG or WebP image." });
    const buf = await readRaw(req, MAX_PHOTO);
    if (!buf.length) return send(res, 400, { error: "The photo was empty." });
    const id = crypto.randomBytes(16).toString("hex");
    await fsp.mkdir(PHOTO_DIR, { recursive: true });
    await writeFileAtomic(path.join(PHOTO_DIR, id + ext), buf);
    return send(res, 200, { id });
  }
  if (route === "photo" && (req.method === "GET" || req.method === "DELETE")) {
    const hit = await findPhoto(url.searchParams.get("id"));
    if (!hit) return send(res, 404, { error: "Not found" });
    if (req.method === "DELETE") { await fsp.unlink(hit.file); return send(res, 200, { ok: true }); }
    const buf = await fsp.readFile(hit.file);
    res.writeHead(200, { "Content-Type": hit.type, "Content-Length": buf.length, "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" });
    return res.end(buf);
  }
  return send(res, 404, { error: "Not found" });
}

/* ---------- static files ---------- */
async function serveStatic(req, res, urlPath) {
  if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Method not allowed");
  let rel = decodeURIComponent(urlPath);
  if (rel.endsWith("/")) rel += "index.html";
  const parts = rel.split("/").filter(Boolean);
  if (parts.some((p) => p.startsWith(".") || p === "server" || p === "node_modules")) return send(res, 404, "Not found");
  const file = path.join(SITE_DIR, ...parts);
  if (!file.startsWith(SITE_DIR + path.sep)) return send(res, 404, "Not found");
  let stat;
  try { stat = await fsp.stat(file); } catch { return send(res, 404, "Not found"); }
  if (stat.isDirectory()) return serveStatic(req, res, urlPath.replace(/\/?$/, "/"));
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, {
    "Content-Type": TYPES[ext] || "application/octet-stream",
    "Content-Length": stat.size,
    "Cache-Control": ext === ".html" || path.basename(file) === "sw.js" ? "no-cache" : "public, max-age=3600",
    "X-Content-Type-Options": "nosniff",
  });
  if (req.method === "HEAD") return res.end();
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    const m = url.pathname.match(/^\/api\/([a-z]+)$/);
    if (m) return await api(req, res, m[1], url);
    if (url.pathname.startsWith("/api/")) return send(res, 404, { error: "Not found" });
    return await serveStatic(req, res, url.pathname);
  } catch (e) {
    if (!res.headersSent) send(res, e.status || 500, { error: e.status ? e.message : "Server error" });
    if (!e.status) console.error(e);
  }
});

fs.mkdirSync(DATA_DIR, { recursive: true });
server.listen(PORT, () => console.log(`Homebox listening on ${PORT}; site ${SITE_DIR}; data ${DATA_DIR}`));
for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => server.close(() => process.exit(0)));
