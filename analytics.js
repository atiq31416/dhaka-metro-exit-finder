// Firebase Analytics (Google Analytics 4). Loads only when firebase-config.js is filled in.
// The app calls window.track(name, params); events are queued until Firebase is ready.
// No GPS coordinates or personal data are sent: only screen names, station ids and place names.
const SDK = "https://www.gstatic.com/firebasejs/10.14.1";
const queue = [];
let send = null;
window.track = (name, params = {}) => { if (send) send(name, params); else if (queue.length < 100) queue.push([name, params]); };

const cfg = window.FIREBASE_CONFIG || {};
if (cfg.apiKey && cfg.measurementId && navigator.onLine !== false) {
  (async () => {
    try {
      const [{ initializeApp }, { getAnalytics, isSupported, logEvent, setUserProperties }] = await Promise.all([
        import(`${SDK}/firebase-app.js`), import(`${SDK}/firebase-analytics.js`)
      ]);
      if (!(await isSupported())) return;
      const analytics = getAnalytics(initializeApp(cfg));
      const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
      setUserProperties(analytics, { app_mode: standalone ? "installed" : "browser" });
      send = (name, params) => { try { logEvent(analytics, name, params); } catch {} };
      queue.splice(0).forEach(([n, p]) => send(n, p));
    } catch { /* blocked or offline: the app works without analytics */ }
  })();
}
