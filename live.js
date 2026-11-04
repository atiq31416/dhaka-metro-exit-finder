// Crowdsourced live trains (Firebase Realtime Database). Off until databaseURL is set in firebase-config.js.
// A rider who taps "share" sends only their position ALONG the line (km from Uttara North), direction and speed.
// Their GPS coordinates never leave the phone. Each rider writes one node, live/<anonymous uid>, removed when they stop or disconnect.
const SDK = "https://www.gstatic.com/firebasejs/10.14.1";
const cfg = window.FIREBASE_CONFIG || {};
const FRESH = 120000; // ignore reports older than 2 min
let fb = null, loading = null, unsubs = [], offT = null, sharing = false, mine = null, reports = [], offset = 0;
const wants = new Set();
const emit = () => window.dispatchEvent(new Event("live:update"));

const LIVE = window.LIVE = {
  enabled: !!(cfg.apiKey && cfg.databaseURL),
  state: "idle", // idle | connecting | live | offline | error
  error: "",
  reports: () => reports,
  now: () => Date.now() + offset,
  myId: () => fb?.auth.currentUser?.uid || null,
  want, publish, stop
};

function load() {
  if (!loading) loading = (async () => {
    const [app, db, au] = await Promise.all([import(`${SDK}/firebase-app.js`), import(`${SDK}/firebase-database.js`), import(`${SDK}/firebase-auth.js`)]);
    const a = app.getApps().length ? app.getApp() : app.initializeApp(cfg);
    fb = { db, au, d: db.getDatabase(a), auth: au.getAuth(a) };
    return fb;
  })().catch((e) => { loading = null; LIVE.state = "error"; LIVE.error = "Live rider data is not reachable right now, so only estimates are shown."; emit(); throw e; });
  return loading;
}

async function listen() {
  if (unsubs.length) return;
  LIVE.state = "connecting"; emit();
  const { db, d } = await load();
  db.goOnline(d);
  unsubs.push(db.onValue(db.ref(d, ".info/serverTimeOffset"), (s) => { offset = s.val() || 0; }));
  unsubs.push(db.onValue(db.ref(d, ".info/connected"), (s) => { LIVE.state = s.val() ? "live" : "offline"; emit(); }));
  const q = db.query(db.ref(d, "live"), db.orderByChild("t"), db.startAt(LIVE.now() - FRESH), db.limitToLast(300));
  unsubs.push(db.onValue(q, (snap) => {
    const out = [];
    snap.forEach((c) => { const v = c.val(); if (v && typeof v.km === "number" && (v.dir === "N" || v.dir === "S")) out.push({ id: c.key, km: v.km, dir: v.dir, v: v.v || 0, t: v.t }); });
    reports = out; emit();
  }, () => { LIVE.state = "error"; LIVE.error = "Live data is not readable. Check the database rules."; emit(); }));
}

function quiet() {
  unsubs.splice(0).forEach((u) => u());
  if (fb) fb.db.goOffline(fb.d);
  LIVE.state = "idle"; emit();
}

// Pages that show trains call want(key, true/false). The connection closes 30 s after nobody needs it,
// which keeps us inside the free plan's 100 simultaneous connections.
function want(key, on) {
  if (!LIVE.enabled) return;
  on ? wants.add(key) : wants.delete(key);
  clearTimeout(offT);
  if (wants.size || sharing) listen().catch(() => {});
  else offT = setTimeout(() => { if (!wants.size && !sharing) quiet(); }, 30000);
}

async function publish({ km, dir, v }) {
  if (!LIVE.enabled) throw new Error("off");
  sharing = true; await listen();
  const { db, d, au, auth } = fb;
  if (!auth.currentUser) await au.signInAnonymously(auth);
  const ref = db.ref(d, `live/${auth.currentUser.uid}`);
  if (mine !== ref.toString()) { await db.onDisconnect(ref).remove(); mine = ref.toString(); }
  await db.set(ref, { km: Math.round(km * 1000) / 1000, dir, v: Math.round(Math.max(0, Math.min(120, v))), t: db.serverTimestamp() });
}

async function stop() {
  sharing = false;
  if (fb && fb.auth.currentUser && mine) {
    const ref = fb.db.ref(fb.d, `live/${fb.auth.currentUser.uid}`);
    try { await fb.db.remove(ref); await fb.db.onDisconnect(ref).cancel(); } catch {}
    mine = null;
  }
  want("_share", false);
}

window.dispatchEvent(new Event("live:init"));
