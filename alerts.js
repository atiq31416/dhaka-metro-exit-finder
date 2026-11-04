// Service alerts (delays, closures, changed timings), posted by an admin to Firebase Realtime Database at alerts/.
// Riders read them with one plain HTTPS request (no SDK, no open connection), every few minutes while the app is open.
// The last list is kept on the phone so alerts still show offline. The Firebase SDK only loads on the admin page.
const SDK = "https://www.gstatic.com/firebasejs/10.14.1";
const cfg = window.FIREBASE_CONFIG || {};
const KEY = "dm-alerts", HID = "dm-alerts-hidden", POLL = 3 * 60000;
const LEVELS = { closed: 3, delay: 2, info: 1 };
const read = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const emit = () => window.dispatchEvent(new Event("alerts:update"));

let cache = read(KEY, { at: 0, list: [] }), offline = false, fb = null, loading = null;
const valid = (a) => a && typeof a.title === "string" && LEVELS[a.level];
const isActive = (a, now = Date.now()) => (!a.from || a.from <= now) && (!a.until || a.until > now);

const A = window.ALERTS = {
  enabled: !!cfg.databaseURL,
  all: () => cache.list,
  active: () => cache.list.filter((a) => isActive(a)),
  isActive,
  savedAt: () => cache.at,
  offline: () => offline,
  hidden: () => read(HID, []),
  hide(id) { write(HID, [...read(HID, []).filter((x) => cache.list.some((a) => a.id === x)), id]); emit(); },
  refresh,
  admin: { user: null, isAdmin: false, ready: false, init, signIn, signOut, post, remove }
};

async function refresh() {
  if (!A.enabled) return;
  try {
    const r = await fetch(`${cfg.databaseURL.replace(/\/$/, "")}/alerts.json`, { cache: "no-store" });
    if (!r.ok) throw new Error(r.status);
    const j = (await r.json()) || {};
    const list = Object.entries(j).map(([id, v]) => ({ id, ...v })).filter(valid)
      .sort((a, b) => LEVELS[b.level] - LEVELS[a.level] || (b.t || 0) - (a.t || 0));
    cache = { at: Date.now(), list }; offline = false; write(KEY, cache);
  } catch { offline = true; }
  emit();
}

if (A.enabled) {
  refresh();
  setInterval(() => { if (document.visibilityState === "visible") refresh(); }, POLL);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && Date.now() - cache.at > 60000) refresh(); });
  window.addEventListener("online", refresh);
}

// ---------- admin (posting) ----------
function sdk() {
  if (!loading) loading = (async () => {
    const [app, au, db] = await Promise.all([import(`${SDK}/firebase-app.js`), import(`${SDK}/firebase-auth.js`), import(`${SDK}/firebase-database.js`)]);
    const a = app.getApps().length ? app.getApp() : app.initializeApp(cfg);
    fb = { au, db, auth: au.getAuth(a), d: db.getDatabase(a) };
    return fb;
  })().catch((e) => { loading = null; throw e; });
  return loading;
}
async function init() {
  const f = await sdk();
  if (A.admin._watching) return; A.admin._watching = true;
  f.au.onAuthStateChanged(f.auth, async (u) => {
    const ad = A.admin;
    ad.user = u && !u.isAnonymous ? u : null; ad.isAdmin = false;
    if (ad.user) {
      try { f.db.goOnline(f.d); ad.isAdmin = (await f.db.get(f.db.ref(f.d, `admins/${u.uid}`))).val() === true; } catch { ad.isAdmin = false; }
    }
    ad.ready = true; emit();
  });
}
async function signIn(email, password) { const f = await sdk(); await f.au.signInWithEmailAndPassword(f.auth, email, password); }
async function signOut() { const f = await sdk(); await f.au.signOut(f.auth); }
async function post(a) {
  const f = await sdk(); f.db.goOnline(f.d); // live.js may have taken the shared connection offline
  const clean = { title: a.title, level: a.level, from: a.from || Date.now(), t: f.db.serverTimestamp(), by: f.auth.currentUser.uid };
  for (const k of ["titleBn", "body", "bodyBn", "stations"]) if (a[k]) clean[k] = a[k];
  if (a.until) clean.until = a.until;
  await f.db.set(f.db.push(f.db.ref(f.d, "alerts")), clean);
  await refresh();
}
async function remove(id) { const f = await sdk(); f.db.goOnline(f.d); await f.db.remove(f.db.ref(f.d, `alerts/${id}`)); await refresh(); }

emit();
