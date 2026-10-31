// Sumit Glimpses backend — one Netlify Function that both the client site and the admin page talk to.
// Storage: Netlify Blobs (built in, no keys, no extra account).
import { getStore } from "@netlify/blobs";

export const config = { path: "/api/*" };

const CH = 3 * 1024 * 1024; // upload/serve chunk size (stays well under Netlify's 6 MB limit)
const meta = () => getStore({ name: "sg-meta", consistency: "strong" });
const media = () => getStore({ name: "sg-media", consistency: "strong" });
const enc = new TextEncoder();
// Only this Gmail can open the admin page (plus the password).
const ADMIN_EMAIL = ((typeof process !== "undefined" && process.env && process.env.ADMIN_EMAIL) || "sumitkr7797@gmail.com").trim().toLowerCase();
const emailOk = (e) => String(e || "").trim().toLowerCase() === ADMIN_EMAIL;

const json = (o, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const bad = (m, s = 400) => json({ error: m }, s);

// ---------- crypto helpers ----------
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const same = (a, b) => { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; };
async function pbkdf2(pw, salt) {
  const k = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: 100000 }, k, 256));
}
async function sha(s) { return hex(await crypto.subtle.digest("SHA-256", enc.encode(s))); }
async function secret() {
  const m = meta(); let s = await m.get("secret");
  if (!s) { s = hex(crypto.getRandomValues(new Uint8Array(32))); await m.set("secret", s); }
  return s;
}
async function hmac(data) {
  const k = await crypto.subtle.importKey("raw", enc.encode(await secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(await crypto.subtle.sign("HMAC", k, enc.encode(data)));
}
async function makeToken() {
  const p = b64u(enc.encode(JSON.stringify({ exp: Date.now() + 30 * 24 * 3600 * 1000 })));
  return p + "." + (await hmac(p));
}
async function isAdmin(req) {
  const h = req.headers.get("authorization") || "";
  const t = h.startsWith("Bearer ") ? h.slice(7) : "";
  const [p, sig] = t.split(".");
  if (!p || !sig) return false;
  if (!same(sig, await hmac(p))) return false;
  try { return JSON.parse(atob(p.replace(/-/g, "+").replace(/_/g, "/"))).exp > Date.now(); } catch { return false; }
}

// ---------- admin password ----------
const envPw = () => (typeof process !== "undefined" && process.env && process.env.ADMIN_PASSWORD) || "";
async function configured() { return !!envPw() || !!(await meta().get("admin", { type: "json" })); }
async function checkPassword(pw) {
  const e = envPw();
  if (e) return same(await sha(pw), await sha(e));
  const a = await meta().get("admin", { type: "json" });
  if (!a) return false;
  return same(await pbkdf2(pw, a.salt), a.hash);
}
async function throttle(ok) {
  const m = meta(); const now = Date.now();
  let l = (await m.get("lock", { type: "json" })) || { n: 0, t: now };
  if (now - l.t > 10 * 60 * 1000) l = { n: 0, t: now };
  if (ok === undefined) return l.n >= 6; // just asking: locked?
  if (ok) { await m.delete("lock"); return false; }
  l.n++; l.t = now; await m.setJSON("lock", l); return l.n >= 6;
}

// ---------- data helpers ----------
async function listAll(prefix) {
  const m = meta(); const { blobs } = await m.list({ prefix });
  const rows = await Promise.all(blobs.map((b) => m.get(b.key, { type: "json" })));
  return rows.filter(Boolean);
}
const upCode = (c) => String(c || "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 20);
const okId = (s) => /^[a-zA-Z0-9-]{8,60}$/.test(s || "");
async function readBody(req) { try { return await req.json(); } catch { return {}; } }
const mediaUrl = (id) => "/api/media/" + id;
const pub = (o, claim) => ({ code: o.code, client: o.client, price: o.price, url: o.url, paid: !!o.paid, title: o.title, claimed: !!claim });

async function deleteFile(id) {
  const m = meta(); const f = await m.get("file:" + id, { type: "json" });
  if (!f) return;
  const md = media();
  await Promise.all(Array.from({ length: f.chunks }, (_, i) => md.delete(id + "/" + i)));
  await m.delete("file:" + id);
}

// ---------- routes ----------
async function route(req) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  const method = req.method;
  const m = meta();
  const [a, b, c] = path;

  // ===== public =====
  if (a === "status" && method === "GET") return json({ configured: await configured() });

  if (a === "setup" && method === "POST") {
    if (await configured()) return bad("Admin password is already set.", 403);
    const { password, email } = await readBody(req);
    if (!emailOk(email)) return bad("Only the admin Gmail can create the password.", 401);
    if (!password || String(password).length < 6) return bad("Password must be at least 6 characters.");
    const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
    await m.setJSON("admin", { salt, hash: await pbkdf2(String(password), salt) });
    return json({ token: await makeToken() });
  }

  if (a === "login" && method === "POST") {
    if (await throttle()) return bad("Too many tries. Wait 10 minutes.", 429);
    const { password, email } = await readBody(req);
    if (!(await configured())) return bad("Admin password not created yet.", 409);
    if (emailOk(email) && password && (await checkPassword(String(password)))) { await throttle(true); return json({ token: await makeToken() }); }
    await throttle(false);
    return bad("Wrong Gmail or password.", 401);
  }

  if (a === "samples" && method === "GET") {
    const s = (await listAll("sample:")).sort((x, y) => y.at - x.at);
    return json(s.map((o) => ({ id: o.id, title: o.title, kind: o.kind, url: o.url, at: o.at })));
  }

  if (a === "order" && b && method === "GET") {
    const code = upCode(b);
    const o = await m.get("order:" + code, { type: "json" });
    if (!o) return bad("Code not found.", 404);
    return json(pub(o, await m.get("claim:" + code, { type: "json" })));
  }

  if (a === "claim" && method === "POST") {
    const { code, utr } = await readBody(req); const k = upCode(code);
    if (!(await m.get("order:" + k, { type: "json" }))) return bad("Code not found.", 404);
    const u = String(utr || "").trim().slice(0, 40);
    if (u.length < 6) return bad("Please enter a valid transaction ID.");
    await m.setJSON("claim:" + k, { code: k, utr: u, at: Date.now() });
    return json({ ok: true });
  }

  if (a === "feedback" && method === "POST") {
    const { code, rating, text } = await readBody(req); const k = upCode(code);
    if (!(await m.get("order:" + k, { type: "json" }))) return bad("Code not found.", 404);
    const r = Math.round(+rating);
    if (!(r >= 1 && r <= 5)) return bad("Choose a star rating.");
    await m.setJSON("fb:" + k, { code: k, rating: r, text: String(text || "").slice(0, 1000), at: Date.now() });
    return json({ ok: true });
  }

  // ===== media (public by unguessable id; supports Range so video seeks) =====
  if (a === "media" && b && (method === "GET" || method === "HEAD")) {
    if (!okId(b)) return bad("Not found.", 404);
    const f = await m.get("file:" + b, { type: "json" });
    if (!f) return bad("Not found.", 404);
    const size = f.size;
    let start = 0, end = size - 1, partial = false;
    const rg = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") || "");
    if (rg) {
      partial = true;
      if (rg[1] === "" && rg[2] !== "") { start = Math.max(0, size - +rg[2]); }
      else { start = +rg[1]; if (rg[2] !== "") end = Math.min(+rg[2], size - 1); }
      if (start >= size || start > end) return new Response(null, { status: 416, headers: { "content-range": "bytes */" + size } });
    } else if (size > CH) partial = true; // big file without Range: send first piece (browsers then ask for the rest)
    const idx = Math.floor(start / CH);
    end = Math.min(end, (idx + 1) * CH - 1);
    const headers = {
      "content-type": f.type || "application/octet-stream", "accept-ranges": "bytes",
      "content-length": String(end - start + 1), "cache-control": "private, max-age=3600",
    };
    if (partial) headers["content-range"] = `bytes ${start}-${end}/${size}`;
    if (method === "HEAD") return new Response(null, { status: partial ? 206 : 200, headers });
    const buf = await media().get(b + "/" + idx, { type: "arrayBuffer" });
    if (!buf) return bad("Not found.", 404);
    return new Response(new Uint8Array(buf).slice(start - idx * CH, end - idx * CH + 1), { status: partial ? 206 : 200, headers });
  }

  // ===== admin only =====
  if (a === "admin") {
    if (!(await isAdmin(req))) return bad("Please unlock admin again.", 401);

    if (b === "data" && method === "GET") {
      const [orders, claims, fb] = await Promise.all([listAll("order:"), listAll("claim:"), listAll("fb:")]);
      const cm = {}; claims.forEach((x) => (cm[x.code] = x));
      return json({ orders: orders.sort((x, y) => y.at - x.at), claims: cm, feedback: fb.sort((x, y) => y.at - x.at) });
    }

    if (b === "upload" && c && method === "PUT") {
      const n = +path[3];
      if (!okId(c) || !Number.isInteger(n) || n < 0 || n > 2000) return bad("Bad upload.");
      const buf = await req.arrayBuffer();
      if (buf.byteLength > CH + 1024) return bad("Chunk too large.", 413);
      await media().set(c + "/" + n, buf);
      return json({ ok: true });
    }
    if (b === "finish" && c && method === "POST") {
      const { name, type, size, chunks } = await readBody(req);
      if (!okId(c) || !(size > 0) || chunks !== Math.ceil(size / CH)) return bad("Bad upload details.");
      await m.setJSON("file:" + c, { name: String(name || "file").slice(0, 120), type: String(type || "application/octet-stream").slice(0, 80), size, chunks, at: Date.now() });
      return json({ id: c, url: mediaUrl(c) });
    }

    if (b === "order" && !c && method === "POST") {
      const { client, price, fileId } = await readBody(req);
      const name = String(client || "").trim().slice(0, 80), p = +price;
      if (!name || !(p > 0)) return bad("Fill name and price.");
      if (!okId(fileId) || !(await m.get("file:" + fileId, { type: "json" }))) return bad("Video upload not found.");
      let code, tries = 0;
      do { code = "GLM-" + Math.floor(1000 + Math.random() * 9000); } while ((await m.get("order:" + code)) && ++tries < 50);
      const o = { code, client: name, price: p, url: mediaUrl(fileId), fileId, paid: false, title: "Video for " + name, at: Date.now() };
      await m.setJSON("order:" + code, o);
      return json(o);
    }
    if (b === "order" && c && method === "PATCH") {
      const k = upCode(c); const o = await m.get("order:" + k, { type: "json" });
      if (!o) return bad("Not found.", 404);
      const body = await readBody(req);
      if (body.price !== undefined && +body.price > 0) o.price = +body.price;
      if (body.paid !== undefined) o.paid = !!body.paid;
      await m.setJSON("order:" + k, o);
      return json(o);
    }
    if (b === "order" && c && method === "DELETE") {
      const k = upCode(c); const o = await m.get("order:" + k, { type: "json" });
      if (o) { await Promise.all([m.delete("order:" + k), m.delete("claim:" + k), m.delete("fb:" + k)]); if (o.fileId) await deleteFile(o.fileId); }
      return json({ ok: true });
    }

    if (b === "sample" && !c && method === "POST") {
      const { title, fileId, kind } = await readBody(req);
      if (!okId(fileId) || !(await m.get("file:" + fileId, { type: "json" }))) return bad("Upload not found.");
      const id = "s" + Date.now();
      const s = { id, title: String(title || "").trim().slice(0, 80), url: mediaUrl(fileId), fileId, kind: kind === "image" ? "image" : "video", at: Date.now() };
      await m.setJSON("sample:" + id, s);
      return json(s);
    }
    if (b === "sample" && c && method === "DELETE") {
      const s = await m.get("sample:" + c, { type: "json" });
      if (s) { await m.delete("sample:" + c); if (s.fileId) await deleteFile(s.fileId); }
      return json({ ok: true });
    }
  }

  return bad("Not found.", 404);
}

export default async (req) => {
  try { return await route(req); }
  catch (e) { return json({ error: "Server error: " + (e && e.message ? e.message : e) }, 500); }
};
