(() => {
  "use strict";
  const M = window.METRO;
  const S = M.stations;
  const $ = (sel, el = document) => el.querySelector(sel);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---------- storage (safe) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
  };

  // ---------- geo helpers ----------
  const R = 6371000, rad = (d) => d * Math.PI / 180, deg = (r) => r * 180 / Math.PI;
  function dist(a, b) {
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function bearing(a, b) {
    const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
    const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
    return (deg(Math.atan2(y, x)) + 360) % 360;
  }
  function offset(p, brg, m) {
    const d = m / R, b = rad(brg), la = rad(p.lat), lo = rad(p.lng);
    const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(b));
    const lo2 = lo + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2));
    return { lat: deg(la2), lng: deg(lo2) };
  }
  const DIRS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
  const dirName = (b) => DIRS[Math.round(b / 45) % 8];
  const SIDE_BRG = { N: 0, E: 90, S: 180, W: 270 };
  const fmtDist = (m) => m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
  const walkMin = (m) => Math.max(1, Math.round(m / 75));

  // ---------- user corrections ----------
  let fixes = store.get("dm-fixes", {});
  const saveFixes = () => store.set("dm-fixes", fixes);

  function exitsOf(st) {
    return st.exits.map((e, i) => {
      // Put the exit on the side of the road it is named for, ~45 m from the viaduct centre line.
      const a = (st.axis + 90) % 360, b = (st.axis + 270) % 360, want = SIDE_BRG[e.side];
      const diff = (x) => Math.min(Math.abs(x - want), 360 - Math.abs(x - want));
      const pos = offset(st, diff(a) < diff(b) ? a : b, 45);
      const f = (fixes[st.id] || {})[i] || {};
      return { i, side: e.side, conf: e.conf, name: f.name || e.name, toward: f.toward || e.toward,
        lat: f.lat ?? pos.lat, lng: f.lng ?? pos.lng, mine: !!(f.name || f.toward || f.lat), placed: f.lat != null };
    });
  }
  const track = (name, params) => { try { window.track?.(name, params); } catch {} };
  const byId = (id) => S.find((s) => s.id === id);
  const nearestStation = (p) => S.reduce((best, s) => { const d = dist(p, s); return d < best.d ? { s, d } : best; }, { s: S[0], d: Infinity });

  // ---------- state ----------
  const state = {
    pos: null, acc: null, geoErr: null, heading: null,
    stationId: null,
    dest: null,
    from: store.get("dm-from", "uttara-north"), to: store.get("dm-to", "motijheel"),
    mode: store.get("dm-mode", "exit"), // home screen: "rail" = Find Metro Rail, "exit" = Find Exit
    toSt: store.get("dm-tost", null) // Find Metro Rail destination station
  };

  // ---------- service status ----------
  function dhakaNow() {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
    const g = (t) => parts.find((p) => p.type === t)?.value;
    return { day: g("weekday"), mins: (+g("hour") % 24) * 60 + +g("minute") };
  }
  const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const fmt12 = (t) => { let [h, m] = t.split(":").map(Number); const ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12; return `${h}:${String(m).padStart(2, "0")} ${ap}`; };
  function serviceStatus() {
    const { day, mins } = dhakaNow();
    const d = day === "Fri" ? M.schedule.days.friday : M.schedule.days.regular;
    const open = toMin(d.fromNorth[0]), close = toMin(d.fromMotijheel[1]);
    if (mins < open) return { on: false, text: `Opens ${fmt12(d.fromNorth[0])}` };
    if (mins > close) return { on: false, text: "Closed" };
    return { on: true, text: `Open till ${fmt12(d.fromMotijheel[1])}` };
  }
  function renderStatus() {
    const s = serviceStatus();
    $("#status").innerHTML = `${s.on ? "●" : "○"} ${esc(s.text)}`;
  }

  // ---------- toast / dialog ----------
  let toastT;
  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 3200); }

  // ---------- geolocation ----------
  let watchId = null;
  function startGeo() {
    if (!("geolocation" in navigator)) { state.geoErr = "This browser has no location support."; render(); return; }
    if (watchId != null) return;
    watchId = navigator.geolocation.watchPosition((p) => {
      const first = !state.pos;
      const prevNear = state.pos ? nearestStation(state.pos).s.id : null;
      if (first) track("location_permission", { state: "granted" });
      state.pos = { lat: p.coords.latitude, lng: p.coords.longitude }; state.acc = p.coords.accuracy; state.geoErr = null;
      shareFix(state.pos, state.acc, Date.now()); // p.timestamp is unreliable on some phones
      const n = nearestStation(state.pos);
      // Re-draw only when something visible changes, so typing and the map are not interrupted.
      if ((first || prevNear !== n.s.id) && (current() === "exit" || current() === "stations")) render(true);
    }, (err) => {
      track("location_permission", { state: err.code === 1 ? "denied" : "error" });
      state.geoErr = err.code === 1 ? "Location permission was denied. You can still pick your station by hand, or allow location in your browser's site settings." : "Could not get your location right now.";
      watchId = null; render(true);
    }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 });
  }

  // ---------- compass ----------
  let compassOn = false;
  function onOrient(e) {
    let h = null;
    if (typeof e.webkitCompassHeading === "number") h = e.webkitCompassHeading;
    else if (e.absolute && typeof e.alpha === "number") h = (360 - e.alpha) % 360;
    if (h == null) return;
    state.heading = h; updateNeedle();
  }
  async function startCompass() {
    try {
      if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
        const r = await DeviceOrientationEvent.requestPermission(); if (r !== "granted") { toast("Compass permission was not given."); return; }
      }
      window.addEventListener("deviceorientationabsolute", onOrient, true);
      window.addEventListener("deviceorientation", onOrient, true);
      compassOn = true; track("compass_on"); toast("Compass on. Hold your phone flat."); render(true);
    } catch { toast("Compass is not available on this device."); }
  }

  // ---------- routing ----------
  const current = () => (location.hash.replace("#", "").split("/")[0] || "exit");
  window.addEventListener("hashchange", () => render());

  // ---------- tab bar animation ----------
  // A lime pill slides under the tabs and follows the active one while it widens.
  const TAB_ORDER = ["exit", "stations", "fares", "info"];
  let lastTab = null, indRaf = 0;
  function moveIndicator(animate) {
    const bar = $("#tabs"), on = bar.querySelector("a.on");
    let ind = bar.querySelector(".tab-ind");
    if (!ind) { ind = document.createElement("span"); ind.className = "tab-ind"; bar.prepend(ind); }
    if (!on) { ind.style.opacity = 0; return; }
    const place = () => { ind.style.opacity = 1; ind.style.transform = `translateX(${on.offsetLeft}px)`; ind.style.width = on.offsetWidth + "px"; };
    cancelAnimationFrame(indRaf);
    if (!animate) { place(); return; }
    const end = performance.now() + 520;
    const step = (t) => { place(); if (t < end) indRaf = requestAnimationFrame(step); };
    indRaf = requestAnimationFrame(step);
  }
  window.addEventListener("resize", () => moveIndicator(false));

  function render(keepScroll) {
    const tab = current();
    const navTab = tab === "station" ? "stations" : tab;
    document.querySelectorAll("#tabs a").forEach((a) => a.classList.toggle("on", a.dataset.tab === navTab));
    const changed = lastTab !== null && lastTab !== navTab;
    const dir = changed ? Math.sign(TAB_ORDER.indexOf(navTab) - TAB_ORDER.indexOf(lastTab)) : 0;
    moveIndicator(lastTab !== null);
    const vEl = $("#view");
    vEl.classList.remove("enter-r", "enter-l", "enter-up");
    if (!keepScroll) {
      void vEl.offsetWidth;
      vEl.classList.add(dir > 0 ? "enter-r" : dir < 0 ? "enter-l" : "enter-up");
    }
    if (navTab !== lastTab) track("screen_view", { screen_name: navTab, firebase_screen: navTab });
    lastTab = navTab;
    const y = window.scrollY;
    if (map) { map.remove(); map = null; }
    const v = $("#view");
    if (tab === "stations") v.innerHTML = viewStations();
    else if (tab === "station") v.innerHTML = viewStation(location.hash.split("/")[1]);
    else if (tab === "fares") v.innerHTML = viewFares();
    else if (tab === "info") v.innerHTML = viewInfo();
    else v.innerHTML = viewHome();
    bind(tab);
    wantLive(tab); renderLive();
    if (keepScroll) window.scrollTo(0, y); else window.scrollTo(0, 0);
  }

  // Radial tick ring (60 ticks); ticks near the walking direction glow green.
  function ticks(brg) {
    let out = "";
    for (let i = 0; i < 60; i++) {
      const a = i * 6, d = Math.min(Math.abs(a - brg), 360 - Math.abs(a - brg));
      const t = brg == null ? 0 : Math.max(0, 1 - d / 70);
      const len = 14 + t * 10, r1 = 108 - len, r2 = 108, ra = (a - 90) * Math.PI / 180;
      const col = t > 0 ? `rgba(${Math.round(217 - t * 120)},${Math.round(249 - t * 50)},${Math.round(157 - t * 110)},${0.35 + t * 0.65})` : "#4a4b4a";
      out += `<line x1="${110 + r1 * Math.cos(ra)}" y1="${110 + r1 * Math.sin(ra)}" x2="${110 + r2 * Math.cos(ra)}" y2="${110 + r2 * Math.sin(ra)}" stroke="${col}" stroke-width="3" stroke-linecap="round"/>`;
    }
    return `<svg class="ticks" id="ticks" viewBox="0 0 220 220" aria-hidden="true">${out}</svg>`;
  }

  // ---------- exit finder ----------
  function bestExit(st, dest) {
    const ex = exitsOf(st).map((e) => ({ ...e, d: dist(e, dest) }));
    ex.sort((a, b) => a.d - b.d);
    return ex;
  }
  function confBadge(e) {
    if (e.mine) return `<span class="badge mine">Your fix</span>`;
    return e.conf === "high" ? `<span class="badge high">Confirmed</span>` : e.conf === "med" ? `<span class="badge med">Likely</span>` : `<span class="badge low">Unverified</span>`;
  }
  function stationOptions(sel) {
    return S.map((s) => `<option value="${s.id}" ${s.id === sel ? "selected" : ""}>${s.code} · ${esc(s.name)} (${s.bn})</option>`).join("");
  }

  function geoHtml() {
    let geo = "";
    if (state.pos) {
      const n = nearestStation(state.pos);
      geo = `<p class="small muted" style="margin:8px 0 0">📍 Nearest station: <b>${esc(n.s.name)}</b>, ${fmtDist(n.d)} away${state.acc ? ` (GPS ±${Math.round(state.acc)} m)` : ""}.
        ${state.stationId !== n.s.id ? `<button class="btn sm" data-use="${n.s.id}">Select it</button>` : ""}</p>`;
    } else if (state.geoErr) {
      geo = `<p class="note" style="margin-top:10px">${esc(state.geoErr)}</p>`;
    } else {
      geo = `<button class="btn primary" id="geo" style="margin-top:10px;width:100%">📍 Allow location to find my station</button>`;
    }
    return geo;
  }

  function modeSwitch() {
    const b = (m, label) => `<button role="tab" aria-selected="${state.mode === m}" class="${state.mode === m ? "on" : ""}" data-mode="${m}">${label}</button>`;
    return `<div class="seg" role="tablist">${b("rail", "Find Metro Rail")}${b("exit", "Find Exit")}</div>`;
  }
  const viewHome = () => modeSwitch() + (state.mode === "rail" ? viewRail() : viewExit());

  function viewExit() {
    const st = byId(state.stationId);
    const geo = geoHtml();

    let result = ""; // the compass card only appears once both station and destination are picked
    if (st && state.dest) {
      const ex = bestExit(st, state.dest);
      const b = ex[0];
      const brg = bearing(b, state.dest);
      const nb = nearestStation(state.dest);
      const better = nb.s.id !== st.id && dist(st, state.dest) - nb.d > 600
        ? `<p class="note" style="margin-top:12px"><b>Tip:</b> ${esc(nb.s.name)} is closer to ${esc(state.dest.n)} (${fmtDist(nb.d)} vs ${fmtDist(dist(st, state.dest))}). <button class="btn sm" data-use="${nb.s.id}">Switch</button></p>` : "";
      const sideNote = ex.length > 1 && ex[1].d - b.d < 40
        ? `<p class="small muted">Both exits are about the same distance from here, so either works.</p>` : "";
      result = `
      <section class="card answer">
        <div class="small muted">At ${esc(st.name)}, going to <b>${esc(state.dest.n)}</b></div>
        <div class="big">Take the <span class="hl">${esc(b.name)}</span></div>
        <div class="muted">Toward ${esc(b.toward)} ${confBadge(b)}</div>
        <div class="compass">
          <div class="ring">${ticks(brg)}
            <div class="needle"><span class="n">N</span><svg id="needle" viewBox="0 0 24 24" style="transform:rotate(${brg}deg)"><path d="M12 2 4.5 20.3l.7.7L12 18l6.8 3 .7-.7z"/></svg></div>
          </div>
          <div style="font-size:18px">Walk <span class="hl">${dirName(brg)}</span> after exiting</div>
          <div class="muted small">${fmtDist(b.d)} straight-line · about ${walkMin(b.d * 1.3)} min on foot</div>
          ${compassOn ? `<div class="small muted" id="hdg">The arrow turns with your phone.</div>` : `<div><button class="btn sm" id="compass">Turn on compass</button></div>`}
        </div>
        ${sideNote}
        ${better}
        <div class="row" style="margin-top:14px">
          <a class="btn" target="_blank" rel="noopener" data-track="walking_route" href="https://www.google.com/maps/dir/?api=1&origin=${b.lat},${b.lng}&destination=${state.dest.lat},${state.dest.lng}&travelmode=walking">Walking route</a>
          <a class="btn" href="#station/${st.id}">All exits</a>
        </div>
      </section>`;
    }

    const chips = st ? st.landmarks.map((l, i) => `<button class="chip ${state.dest && state.dest.n === l.n ? "on" : ""}" data-lm="${i}">${esc(l.n)}</button>`).join("") : "";

    return `
    ${result}
    <section class="card">
      <label class="lbl" for="st">Select your metro station</label>
      <select id="st"><option value="">Choose a station</option>${stationOptions(state.stationId)}</select>
      ${geo}
    </section>
    ${st ? `
    <section class="card">
      <label class="lbl">Where are you going?</label>
      <div class="chips">${chips}</div>
      <div style="margin-top:12px">
        <input type="search" id="q" placeholder="Search a place (e.g. Square Hospital)" autocomplete="off" enterkeyhint="search">
        <div class="results" id="res"></div>
      </div>
      <p class="small muted" style="margin:10px 0 0">Or tap the map to drop your destination.</p>
      <div id="map"></div>
    </section>` : ""}
    ${st ? "" : `<p class="muted small">Pick your station (or allow location), then choose where you're headed. The app tells you which exit to take and which way to walk.</p>`}`;
  }

  // ---------- stations ----------
  function viewStations() {
    const near = state.pos ? nearestStation(state.pos) : null;
    return `
    <h2>${esc(M.line.name)} <span class="muted small">${esc(M.line.nameBn)}</span></h2>
    <p class="muted small">Uttara North to Motijheel, ${S.length} stations, ${M.line.lengthKm} km. Tap a station for its exits.</p>
    <section class="card" id="live-card"></section>
    <section class="card">
      <div class="trains-wrap"><div class="trains" id="trains" aria-hidden="true"></div>
      <ul class="line">
        ${S.map((s) => `<li><a href="#station/${s.id}" class="${near && near.s.id === s.id && near.d < 1500 ? "near" : ""}">
          <span class="stop"></span>
          <span class="nm"><b>${esc(s.name)}</b><span class="muted small">${s.bn}${s.transfer ? " · interchange (future)" : ""}</span></span>
          <span class="code">${near && near.s.id === s.id ? fmtDist(near.d) + " · " : ""}${s.code}</span></a></li>`).join("")}
      </ul></div>
      <p class="small muted legend"><span class="nw"><span class="tr S live">↓</span> to Motijheel</span> <span class="nw"><span class="tr N live">↑</span> to Uttara North</span> <span class="nw">Solid = live from riders</span> <span class="nw">Dashed = estimated</span></p>
    </section>
    <p class="note">${esc(M.line.note)}</p>`;
  }

  function viewStation(id) {
    const st = byId(id); if (!st) return `<p>Station not found. <a href="#stations">Back</a></p>`;
    const ex = exitsOf(st);
    const i = S.indexOf(st);
    return `
    <p><a class="back" href="#stations" aria-label="All stations">←</a></p>
    <h2>${esc(st.name)} <span class="muted">${st.bn}</span></h2>
    <p class="muted small">${st.code} · opened ${new Date(st.opened).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}${st.transfer ? " · " + esc(st.transfer) : ""}</p>
    <section class="card" id="station-live" data-st="${st.id}"></section>
    <section class="card">
      <h3>Exits</h3>
      ${ex.map((e) => `<div class="exit">
        <div class="t">${esc(e.name)} ${confBadge(e)}</div>
        <div>Toward ${esc(e.toward)}</div>
        <div class="row" style="margin-top:8px;flex-wrap:wrap">
          <button class="btn sm" data-fix="${e.i}" style="flex:0">Fix this exit</button>
          <a class="btn sm" style="flex:0" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${e.lat},${e.lng}">Map</a>
        </div></div>`).join("")}
      <p class="small muted" style="margin:10px 0 0">Exit names and sides are approximate. When you're at the station, tap <b>Fix this exit</b> to save the real sign name and its exact position on this phone.</p>
      <div id="map"></div>
    </section>
    <section class="card">
      <h3>Nearby places</h3>
      <table><tr><th>Place</th><th>Best exit</th><th>Distance</th></tr>
      ${st.landmarks.map((l) => { const b = bestExit(st, l)[0]; return `<tr><td>${esc(l.n)}</td><td>${esc(b.name)}</td><td>${fmtDist(b.d)}</td></tr>`; }).join("")}
      </table>
      <button class="btn primary" style="margin-top:12px;width:100%" data-use="${st.id}" data-go="exit">Find my exit here</button>
    </section>
    <section class="card small">
      <b>Next stations:</b> ${i > 0 ? `↑ ${esc(S[i - 1].name)} (to Uttara North)` : "terminus"} · ${i < S.length - 1 ? `↓ ${esc(S[i + 1].name)} (to Motijheel)` : "terminus"}
    </section>`;
  }

  // ---------- find metro rail (which platform) ----------
  // st.axis is the bearing the viaduct runs toward Motijheel. Trains are assumed to keep LEFT
  // (like Bangladesh Railway), so the platform for your train is on the left of its direction of travel.
  function railPlan(st, to) {
    const dir = to.km > st.km ? "S" : "N";
    const travel = dir === "S" ? st.axis : (st.axis + 180) % 360;
    return { dir, travel, side: (travel + 270) % 360, term: dir === "S" ? S[S.length - 1] : S[0],
      stops: Math.abs(S.indexOf(to) - S.indexOf(st)), mins: Math.max(2, Math.round(Math.abs(to.km - st.km) / KM_PER_MIN)) };
  }
  function relText(side) {
    if (state.heading == null) return `Go to the <span class="hl">${dirName(side)}</span> side`;
    const d = (side - state.heading + 360) % 360;
    const where = d < 45 || d > 315 ? "straight ahead" : d < 135 ? "on your right" : d < 225 ? "behind you" : "on your left";
    return `Your platform is <span class="hl">${where}</span>`;
  }
  // Top view of the station: up = the way your train runs. The whole drawing turns with the compass.
  function platformSvg(p) {
    const rot = (p.travel - (state.heading || 0) + 360) % 360;
    const arrow = (x, y, up, col) => `<path d="M${x} ${y + (up ? -9 : 9)} l7 ${up ? 10 : -10} h-14z" fill="${col}"/>`;
    return `<div class="plat-wrap"><svg class="plat" viewBox="0 0 240 240" aria-hidden="true">
      <circle cx="120" cy="120" r="116" fill="var(--card-2)" stroke="var(--line)"/>
      <g id="plat-rot" style="transform:rotate(${rot}deg);transform-origin:120px 120px">
        <rect x="54" y="34" width="26" height="172" rx="6" fill="var(--brand)"/>
        <rect x="160" y="34" width="26" height="172" rx="6" fill="var(--card)" stroke="var(--line)"/>
        <line x1="96" y1="20" x2="96" y2="220" stroke="#6b6d6a" stroke-width="3" stroke-dasharray="2 5"/>
        <line x1="144" y1="20" x2="144" y2="220" stroke="#6b6d6a" stroke-width="3" stroke-dasharray="2 5"/>
        <rect x="84" y="78" width="24" height="64" rx="8" fill="var(--brand)"/>
        ${arrow(96, 62, true, "var(--brand)")}
        <rect x="132" y="100" width="24" height="64" rx="8" fill="#4a4b4a"/>
        ${arrow(144, 180, false, "#6b6d6a")}
      </g>
      <circle cx="120" cy="120" r="7" fill="var(--blue)" stroke="#fff" stroke-width="3"/>
    </svg>
    <span class="plat-n" id="plat-n" style="transform:rotate(${-(state.heading || 0)}deg)"><b>N</b></span></div>`;
  }
  function railNext(st, p) {
    const n = nextAt(st, p.dir);
    return n ? `Next train to ${esc(p.term.name)}: <b>${fmtEta(n)}</b> ${n.live ? `<span class="badge high">Live</span>` : `<span class="badge med">${n.first ? "First train" : "Estimated"}</span>`}`
      : `No more trains to ${esc(p.term.name)} today.`;
  }
  function viewRail() {
    const st = byId(state.stationId), to = byId(state.toSt);
    let result = "";
    if (st && to && st.id !== to.id) {
      const p = railPlan(st, to);
      result = `
      <section class="card answer" id="rail-card">
        <div class="small muted">At ${esc(st.name)}, going to <b>${esc(to.name)}</b></div>
        <div class="big">Board the train to <span class="hl">${esc(p.term.name)}</span></div>
        <div class="muted">Platform on the ${dirName(p.side)} side of the tracks <span class="badge med">Likely</span></div>
        <div class="compass">
          ${platformSvg(p)}
          <div style="font-size:18px" id="rel">${relText(p.side)}</div>
          <div class="muted small">The green platform is yours. The arrow shows the way your train runs.</div>
          <div class="muted small">${p.stops} stop${p.stops === 1 ? "" : "s"} · about ${p.mins} min · Tk ${fareBetween(st, to)}</div>
          <div class="small" id="rail-next">${railNext(st, p)}</div>
          ${compassOn ? `<div class="small muted">The drawing turns with your phone. Hold it flat.</div>` : `<div><button class="btn sm" id="compass">Turn on compass</button></div>`}
        </div>
        <p class="small muted" style="margin:12px 0 0">Platform signs show the last station, so follow the signs for <b>${esc(p.term.name)}</b>. The side assumes trains keep left, so check the sign before you go up.</p>
      </section>`;
    }
    const toOpts = S.filter((x) => !st || x.id !== st.id).map((x) => `<option value="${x.id}" ${x.id === state.toSt ? "selected" : ""}>${x.code} · ${esc(x.name)} (${x.bn})</option>`).join("");
    return `
    ${result}
    <section class="card">
      <label class="lbl" for="st">Select your metro station</label>
      <select id="st"><option value="">Choose a station</option>${stationOptions(state.stationId)}</select>
      ${geoHtml()}
    </section>
    <section class="card">
      <label class="lbl" for="dst">Where are you going?</label>
      <select id="dst"><option value="">Choose a destination station</option>${toOpts}</select>
    </section>
    ${st && to ? "" : `<p class="muted small">Pick your station and the station you're going to. The app shows which platform to use, and the compass turns the drawing to match where you're facing.</p>`}`;
  }
  function updatePlat() {
    const g = $("#plat-rot"); if (!g) return;
    const st = byId(state.stationId), to = byId(state.toSt); if (!st || !to) return;
    const p = railPlan(st, to);
    g.style.transform = `rotate(${(p.travel - (state.heading || 0) + 360) % 360}deg)`;
    const n = $("#plat-n"); if (n) n.style.transform = `rotate(${-(state.heading || 0)}deg)`;
    const r = $("#rel"); if (r) r.innerHTML = relText(p.side);
  }

  // ---------- fares ----------
  function fareBetween(a, b) {
    if (a.id === b.id) return 0;
    const km = Math.abs(a.km - b.km);
    return Math.min(M.fare.max, Math.max(M.fare.min, Math.ceil((km * M.fare.perKm) / 10) * 10));
  }
  function viewFares() {
    const a = byId(state.from), b = byId(state.to);
    const f = fareBetween(a, b), n = Math.abs(S.indexOf(a) - S.indexOf(b));
    const mins = Math.round(n * (M.schedule.endToEndMin / (S.length - 1)));
    return `
    <h2>Fares</h2>
    <section class="card">
      <label class="lbl" for="ff">From</label><select id="ff">${stationOptions(state.from)}</select>
      <div style="height:10px"></div>
      <label class="lbl" for="ft">To</label><select id="ft">${stationOptions(state.to)}</select>
      <div class="row" style="margin-top:12px"><button class="btn" id="swap">⇅ Swap</button></div>
    </section>
    <section class="card answer">
      ${n === 0 ? `<b>Choose two different stations.</b>` : `
      <div class="small muted">Single journey ticket</div>
      <div class="fare">৳${f}<small> / ৳${M.fare.max}</small></div>
      <div class="meter"><i style="width:${(f / M.fare.max) * 100}%"></i></div>
      <div>With MRT / Rapid Pass you pay <span class="hl">৳${Math.round(f * (1 - M.fare.passDiscount))}</span></div>
      <div class="muted small" style="margin-top:6px">${n} stop${n > 1 ? "s" : ""} · about ${mins} min</div>`}
    </section>
    <section class="card">
      <h3>From ${esc(a.name)} to every station</h3>
      <table><tr><th>Station</th><th>Fare</th><th>Pass</th></tr>
      ${S.filter((s) => s.id !== a.id).map((s) => { const x = fareBetween(a, s); return `<tr><td>${esc(s.name)}</td><td>৳${x}</td><td>৳${Math.round(x * 0.9)}</td></tr>`; }).join("")}
      </table>
    </section>
    <p class="note">${esc(M.fare.note)}</p>`;
  }

  // ---------- info ----------
  function viewInfo() {
    const d = M.schedule.days;
    const fixedCount = Object.values(fixes).reduce((n, o) => n + Object.keys(o).length, 0);
    const s = serviceStatus();
    return `
    <h2>Metro info</h2>
    <section class="card ${s.on ? "answer" : ""}"><b>${s.on ? "Trains are running now." : "Trains are not running now."}</b> <span class="muted">${esc(s.text)}</span></section>
    <section class="card">
      <h3>Train timings</h3>
      <table>
        <tr><th></th><th>From Uttara North</th><th>From Motijheel</th></tr>
        ${[d.regular, d.friday].map((x) => `<tr><td><b>${x.label}</b></td><td>${fmt12(x.fromNorth[0])} to ${fmt12(x.fromNorth[1])}</td><td>${fmt12(x.fromMotijheel[0])} to ${fmt12(x.fromMotijheel[1])}</td></tr>`).join("")}
      </table>
      <p class="small muted">${esc(M.schedule.headway)}. End to end takes about ${M.schedule.endToEndMin} min. Source: ${esc(M.schedule.source)}. Hours have changed several times, and special schedules apply on Eid and some public holidays.</p>
    </section>
    ${M.info.map((g) => `<section class="card"><h3>${esc(g.h)}</h3><ul class="plain">${g.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></section>`).join("")}
    <section class="card">
      <h3>About the exit data</h3>
      <p class="small">Station positions and road sides are drawn from maps. Exit names are generic ("West exit") because the real signs (letters or numbers) aren't published in one reliable place. Exits marked <span class="badge low">Unverified</span> are best guesses (Uttara stations, Dhaka University, Secretariat and Motijheel) and <span class="badge med">Likely</span> ones should be right about the side of the road.</p>
      <p class="small">You have saved <b>${fixedCount}</b> exit fix${fixedCount === 1 ? "" : "es"} on this phone.</p>
      <div class="row" style="flex-wrap:wrap">
        <button class="btn sm" id="export" style="flex:0">Copy my fixes</button>
        <button class="btn sm" id="reset" style="flex:0" ${fixedCount ? "" : "disabled"}>Clear my fixes</button>
      </div>
    </section>
    <section class="card credit">
      <img src="img/atiqur.jpg" alt="Atiqur Rahaman" width="56" height="56">
      <div><div class="small muted">Made by</div><b>Atiqur Rahaman</b><div class="small muted">CEO &amp; Founder @ Design Monks &amp; Dev Monks</div></div>
        <div class="social">
        <a class="li" href="https://www.linkedin.com/in/atiq31416/" target="_blank" rel="noopener" aria-label="Atiqur Rahaman on LinkedIn"><svg viewBox="0 0 24 24"><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9h4v12H3zm7 0h3.8v1.7h.05c.53-1 1.83-2.05 3.77-2.05 4.03 0 4.78 2.65 4.78 6.1V21h-4v-5.5c0-1.3-.02-3-1.83-3-1.83 0-2.12 1.43-2.12 2.9V21h-4z"/></svg></a>
        <a class="li" href="https://www.facebook.com/atiq31416" target="_blank" rel="noopener" aria-label="Atiqur Rahaman on Facebook"><svg viewBox="0 0 24 24"><path d="M14 8.5V6.8c0-.8.2-1.3 1.4-1.3H17V2.3c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3v2H7.5V12h2.8v9.8H14V12h2.8l.4-3.5z"/></svg></a>
      </div>
    </section>
    <p class="small muted">Not an official DMTCL app. Data updated ${esc(M.updated)}. Map data © OpenStreetMap contributors.</p>`;
  }

  // ---------- trains: timetable estimates + rider reports ----------
  // Positions are kept as km from Uttara North. "S" = toward Motijheel (km goes up), "N" = toward Uttara North.
  const LEN = S[S.length - 1].km;
  const KM_PER_MIN = LEN / M.schedule.endToEndMin; // average speed including stops
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const DIR_NAME = { S: "Motijheel", N: "Uttara North" };
  const Live = () => (window.LIVE && window.LIVE.enabled ? window.LIVE : null);

  // Dhaka is UTC+6 all year (no daylight saving).
  function dhakaClock() {
    const d = new Date(Date.now() + 6 * 3600000);
    return { fri: d.getUTCDay() === 5, mins: d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60 };
  }
  function headwayAt(m, fri) {
    const h = M.schedule.headwayMin;
    if (fri && h.fridayAllOffPeak) return h.offPeak;
    return h.peakHours.some(([a, b]) => m >= toMin(a) && m < toMin(b)) ? h.peak : h.offPeak;
  }
  function departures(range, fri) {
    const out = []; let t = toMin(range[0]); const end = toMin(range[1]);
    while (t <= end) { out.push(t); t += headwayAt(t, fri); }
    if (out[out.length - 1] !== end) out.push(end); // the published last train
    return out;
  }
  // Estimated trains now, from the timetable. Each has km, dir and the departure time it came from.
  function estimated() {
    const { fri, mins } = dhakaClock();
    const d = fri ? M.schedule.days.friday : M.schedule.days.regular;
    const out = [];
    for (const [dir, range] of [["S", d.fromNorth], ["N", d.fromMotijheel]]) {
      for (const dep of departures(range, fri)) {
        const run = (mins - dep) * KM_PER_MIN;
        if (run >= 0 && run <= LEN) out.push({ dir, km: dir === "S" ? run : LEN - run, live: false, dep });
      }
    }
    return out;
  }
  // Rider reports, moved forward by their speed since they were sent, then grouped into trains.
  function liveTrains() {
    const lv = Live(); if (!lv) return [];
    const now = lv.now(), me = lv.myId();
    const pts = lv.reports().filter((r) => now - r.t < 90000).map((r) => ({
      dir: r.dir, me: r.id === me, age: now - r.t,
      km: clamp(r.km + (r.dir === "S" ? 1 : -1) * Math.min(r.v, 80) * (now - r.t) / 3600000, 0, LEN)
    }));
    const out = [];
    for (const dir of ["S", "N"]) {
      const g = pts.filter((p) => p.dir === dir).sort((a, b) => a.km - b.km);
      for (const p of g) {
        const last = out[out.length - 1];
        if (last && last.dir === dir && p.km - last.kmMax < 0.7) { last.sum += p.km; last.n++; last.kmMax = p.km; last.km = last.sum / last.n; last.me ||= p.me; }
        else out.push({ dir, km: p.km, kmMax: p.km, sum: p.km, n: 1, me: p.me, live: true });
      }
    }
    return out;
  }
  // Live trains replace any estimate within 1.5 km going the same way.
  function trainsNow() {
    const live = liveTrains();
    const est = estimated().filter((e) => !live.some((l) => l.dir === e.dir && Math.abs(l.km - e.km) < 1.5));
    return [...live, ...est];
  }
  // Next train reaching a station in one direction: live trains still upstream, else the next timetable train.
  function nextAt(st, dir) {
    if ((dir === "S" && st.km >= LEN) || (dir === "N" && st.km <= 0)) return null; // terminus: trains end here
    const ahead = (km) => (dir === "S" ? st.km - km : km - st.km);
    let best = null;
    for (const t of trainsNow().filter((x) => x.dir === dir)) {
      const a = ahead(t.km); if (a < -0.05) continue;
      const min = Math.max(0, a) / KM_PER_MIN;
      if (!best || min < best.min) best = { min, live: t.live, n: t.n || 0 };
    }
    if (!best) { // no train on the line heading here yet: next departure from the terminus
      const { fri, mins } = dhakaClock();
      const d = fri ? M.schedule.days.friday : M.schedule.days.regular;
      const deps = departures(dir === "S" ? d.fromNorth : d.fromMotijheel, fri);
      const run = (dir === "S" ? st.km : LEN - st.km) / KM_PER_MIN;
      const dep = deps.find((x) => x + run >= mins);
      if (dep != null) best = { min: dep + run - mins, live: false, first: dep === deps[0] && mins < deps[0] };
    }
    return best;
  }
  function fmtEta(n) {
    if (!n) return "";
    if (n.min < 0.75) return "Arriving";
    if (n.min <= 45) return `~${Math.round(n.min)} min`;
    const at = Math.round(dhakaClock().mins + n.min) % 1440; // far off: show the clock time instead
    return "At " + fmt12(`${Math.floor(at / 60)}:${String(at % 60).padStart(2, "0")}`);
  }

  // ---------- sharing my train ----------
  const share = { on: false, since: 0, hist: [], dir: null, v: 0, km: null, lastSent: 0, away: 0, msg: "", wake: null };
  // Nearest point on the line (straight segments between stations): km along the line and metres off it.
  function snap(p) {
    let best = { off: Infinity, km: 0 };
    for (let i = 0; i < S.length - 1; i++) {
      const a = S[i], b = S[i + 1], kx = 111320 * Math.cos(rad(a.lat)), ky = 110540;
      const bx = (b.lng - a.lng) * kx, by = (b.lat - a.lat) * ky, px = (p.lng - a.lng) * kx, py = (p.lat - a.lat) * ky;
      const L2 = bx * bx + by * by, t = L2 ? clamp((px * bx + py * by) / L2, 0, 1) : 0;
      const off = Math.hypot(px - t * bx, py - t * by);
      if (off < best.off) best = { off, km: a.km + t * (b.km - a.km) };
    }
    return best;
  }
  function kmLabel(km) {
    const i = S.findIndex((s) => s.km >= km);
    if (i <= 0) return `at ${S[0].name}`;
    const a = S[i - 1], b = S[i];
    if (km - a.km < 0.25) return `at ${a.name}`;
    if (b.km - km < 0.25) return `at ${b.name}`;
    return `between ${a.name} and ${b.name}`;
  }
  async function startShare() {
    const lv = Live(); if (!lv) return;
    if (!confirm("Share this train's position?\n\nOnly your spot along the metro line, direction and speed are sent, never your exact GPS location or who you are. Keep the app open while you ride. Sharing stops when you leave the line or after 90 minutes.")) return;
    Object.assign(share, { on: true, since: Date.now(), hist: [], dir: null, v: 0, km: null, lastSent: 0, away: 0, msg: "Getting your position…" });
    try { share.wake = await navigator.wakeLock?.request("screen"); } catch {}
    track("live_share", { state: "on" });
    startGeo(); lv.want("_share", true); renderLive();
  }
  function stopShare(msg) {
    if (!share.on) return;
    share.on = false; share.msg = "";
    try { share.wake?.release(); } catch {} share.wake = null;
    Live()?.stop(); track("live_share", { state: "off" });
    if (msg) toast(msg);
    renderLive();
  }
  function shareFix(pos, acc, ts) {
    if (!share.on) return;
    if (Date.now() - share.since > 90 * 60000) return stopShare("Stopped sharing after 90 minutes.");
    if (acc > 150) { share.msg = "Waiting for a better GPS signal…"; return renderLive(); }
    const s = snap(pos);
    if (s.off > 350) {
      if (++share.away >= 3) return stopShare("You seem to have left the metro line, so sharing stopped.");
      share.msg = "You are not on the metro line right now."; return renderLive();
    }
    share.away = 0; share.km = s.km;
    share.hist.push({ km: s.km, t: ts }); share.hist = share.hist.filter((h) => ts - h.t <= 180000);
    // Direction: at least 300 m along the line at train-like speed (walkers under the viaduct do not count).
    const f = share.hist[0], dk = s.km - f.km, hrs = (ts - f.t) / 3600000;
    if (hrs > 0 && Math.abs(dk) >= 0.3 && Math.abs(dk) / hrs >= 12) share.dir = dk > 0 ? "S" : "N";
    const r = share.hist.find((h) => ts - h.t <= 60000) || f, rh = (ts - r.t) / 3600000;
    share.v = rh > 0.004 ? clamp(Math.abs(s.km - r.km) / rh, 0, 100) : share.v;
    if (!share.dir) { share.msg = "Waiting for the train to move so we know which way it is going…"; return renderLive(); }
    share.msg = `Sharing: ${kmLabel(s.km)}, heading to ${DIR_NAME[share.dir]}.`;
    if (ts - share.lastSent >= 8000) {
      share.lastSent = ts;
      Live()?.publish({ km: s.km, dir: share.dir, v: share.v }).catch(() => { share.msg = "Could not send. Check your internet."; renderLive(); });
    }
    renderLive();
  }

  // ---------- trains UI ----------
  function liveCard() {
    const lv = Live(), on = serviceStatus().on, trains = trainsNow();
    const nLive = trains.filter((t) => t.live).length, nEst = trains.length - nLive;
    let h = `<h3>Trains now <span class="badge ${nLive ? "high" : "med"}">${nLive ? "Live" : "Estimated"}</span></h3>`;
    h += trains.length
      ? `<p class="small" style="margin:0">${trains.length} train${trains.length === 1 ? "" : "s"} on the line: ${nLive ? `<b>${nLive} reported live by riders</b>${nEst ? `, ${nEst} estimated from the timetable` : ""}` : "positions are estimated from the timetable"}.</p>`
      : `<p class="small muted" style="margin:0">${on ? "No trains expected on the line right now." : "Trains are not running now."}</p>`;
    if (lv) {
      if (share.on) h += `<div class="share on"><span class="pulse"></span><div class="small">${esc(share.msg)}</div><button class="btn sm" id="share-stop" style="flex:0">Stop</button></div>`;
      else h += `<div class="share"><div class="small muted">On a train? Share where it is so other riders see it live. No account, and your exact location is never sent.</div><button class="btn sm primary" id="share-start" style="flex:0">Share my train</button></div>`;
      if (lv.state === "error") h += `<p class="small muted" style="margin:8px 0 0">${esc(lv.error)}</p>`;
    }
    return h;
  }
  function stationLiveCard(st) {
    const row = (dir) => { const n = nextAt(st, dir); if (!n && ((dir === "S" && st.km >= LEN) || (dir === "N" && st.km <= 0))) return "";
      return `<tr><td>To ${DIR_NAME[dir]}</td><td><b>${n ? fmtEta(n) : "No more today"}</b></td><td>${n ? (n.live ? `<span class="badge high">Live${n.n > 1 ? ` · ${n.n} riders` : ""}</span>` : `<span class="badge med">${n.first ? "First train" : "Estimated"}</span>`) : ""}</td></tr>`; };
    return `<h3>Next train</h3><table>${row("S")}${row("N")}</table>
      <p class="small muted" style="margin:8px 0 0">Live times come from riders sharing on board. Estimates use the timetable and can be a few minutes off.</p>`;
  }
  function placeTrains() {
    const box = $("#trains"), stops = [...document.querySelectorAll(".line .stop")];
    if (!box || stops.length !== S.length) return;
    const top = box.getBoundingClientRect().top;
    const left = box.getBoundingClientRect().left, r0 = stops[0].getBoundingClientRect(), cx = r0.left - left + r0.width / 2;
    const ys = stops.map((s) => { const r = s.getBoundingClientRect(); return r.top - top + r.height / 2; });
    box.innerHTML = trainsNow().map((t) => {
      const i = clamp(S.findIndex((s) => s.km >= t.km), 1, S.length - 1), a = S[i - 1], b = S[i];
      const y = ys[i - 1] + (ys[i] - ys[i - 1]) * ((t.km - a.km) / ((b.km - a.km) || 1));
      return `<span class="tr ${t.dir} ${t.live ? "live" : "est"}${t.me ? " me" : ""}" style="top:${y}px;left:${cx + (t.dir === "S" ? -24 : 24) - 10}px" title="${t.live ? "Live" : "Estimated"} · to ${DIR_NAME[t.dir]}">${t.dir === "S" ? "↓" : "↑"}</span>`;
    }).join("");
  }
  function renderLive() {
    const c = $("#live-card"); if (c) { c.innerHTML = liveCard(); $("#share-start")?.addEventListener("click", startShare); $("#share-stop")?.addEventListener("click", () => stopShare()); }
    const sc = $("#station-live"); if (sc) sc.innerHTML = stationLiveCard(byId(sc.dataset.st));
    const rn = $("#rail-next"), st = byId(state.stationId), to = byId(state.toSt);
    if (rn && st && to && st.id !== to.id) rn.innerHTML = railNext(st, railPlan(st, to));
    placeTrains();
  }
  window.addEventListener("live:update", renderLive);
  window.addEventListener("live:init", () => wantLive(current()));
  window.addEventListener("resize", placeTrains);
  setInterval(renderLive, 5000);
  const wantLive = (tab) => Live()?.want("view", tab === "stations" || tab === "station" || (tab === "exit" && state.mode === "rail"));

  // ---------- map ----------
  let map = null, destMarker = null;
  const pin = (color, size = 14) => L.divIcon({ className: "", iconSize: [size, size], html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>` });
  function initMap(st, clickable) {
    const el = $("#map"); if (!el || typeof L === "undefined") { if (el) el.outerHTML = `<p class="small muted">Map needs an internet connection.</p>`; return; }
    map = L.map(el, { zoomControl: false, attributionControl: true }).setView([st.lat, st.lng], 18);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
    const brand = getComputedStyle(document.documentElement).getPropertyValue("--brand").trim() || "#a6e35a";
    L.marker([st.lat, st.lng], { icon: pin(brand, 18) }).addTo(map).bindTooltip(st.name);
    const ex = exitsOf(st);
    const best = state.dest && clickable ? bestExit(st, state.dest)[0] : null;
    ex.forEach((e) => {
      const on = best && best.i === e.i;
      L.marker([e.lat, e.lng], { icon: L.divIcon({ className: "", iconSize: [0, 0], html: `<div style="transform:translate(${e.side === "W" ? "-100%" : e.side === "E" ? "0" : "-50%"},${e.side === "N" ? "-100%" : e.side === "S" ? "0" : "-50%"});white-space:nowrap;background:${on ? brand : "#2a2b2a"};color:${on ? "#141514" : "#f4f5f3"};border:2px solid ${brand};border-radius:999px;padding:3px 9px;font:700 12px 'DM Sans',system-ui">${esc(e.name)}</div>` }) }).addTo(map);
    });
    const pts = [[st.lat, st.lng]];
    if (state.pos) { L.marker([state.pos.lat, state.pos.lng], { icon: pin("#2f7cf6") }).addTo(map).bindTooltip("You"); if (dist(state.pos, st) < 2000) pts.push([state.pos.lat, state.pos.lng]); }
    if (clickable) {
      if (state.dest) { destMarker = L.marker([state.dest.lat, state.dest.lng], { icon: pin("#d93025", 16) }).addTo(map).bindTooltip(state.dest.n); pts.push([state.dest.lat, state.dest.lng]);
        if (best) L.polyline([[best.lat, best.lng], [state.dest.lat, state.dest.lng]], { color: brand, dashArray: "6 6", weight: 3 }).addTo(map); }
      map.on("click", (ev) => setDest({ n: "Dropped pin", lat: ev.latlng.lat, lng: ev.latlng.lng, source: "map" }));
    } else {
      st.landmarks.forEach((l) => L.circleMarker([l.lat, l.lng], { radius: 5, color: "#d93025" }).addTo(map).bindTooltip(l.n));
    }
    if (pts.length > 1) map.fitBounds(pts, { padding: [40, 40], maxZoom: 17 });
  }

  function setDest(d) {
    state.dest = d; render(true);
    const st = byId(state.stationId);
    if (st) { const b = bestExit(st, d)[0]; track("exit_recommended", { station: st.id, destination: d.n, source: d.source || "chip", exit: b.name, exit_confidence: b.mine ? "user" : b.conf }); }
    setTimeout(() => $(".answer")?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
  }

  function updateNeedle() {
    updatePlat();
    const n = $("#needle"); if (!n || !state.dest) return;
    const st = byId(state.stationId); if (!st) return;
    const b = bestExit(st, state.dest)[0];
    const brg = bearing(b, state.dest);
    n.style.transform = `rotate(${(brg - (state.heading || 0) + 360) % 360}deg)`;
    const t = $("#ticks"); if (t && state.heading != null) t.style.transform = `rotate(${-state.heading}deg)`;
  }

  // ---------- place search ----------
  let searchT, searchCtl;
  function search(q) {
    const res = $("#res"); if (!res) return;
    q = q.trim(); if (q.length < 2) { res.innerHTML = ""; return; }
    const ql = q.toLowerCase();
    const local = [];
    S.forEach((s) => s.landmarks.forEach((l) => { if (l.n.toLowerCase().includes(ql)) local.push({ n: l.n, lat: l.lat, lng: l.lng, sub: `near ${s.name}` }); }));
    const draw = (online) => {
      const all = [...local, ...online].slice(0, 8);
      res.innerHTML = all.length ? all.map((r, i) => `<button data-r="${i}"><b>${esc(r.n)}</b><div class="small muted">${esc(r.sub || "")}</div></button>`).join("") : `<div class="small muted" style="padding:8px 0">No match yet.</div>`;
      res.querySelectorAll("button").forEach((b) => b.onclick = () => setDest({ ...all[+b.dataset.r], source: "search" }));
    };
    draw([]);
    clearTimeout(searchT);
    searchT = setTimeout(async () => {
      if (!navigator.onLine) return;
      try {
        searchCtl?.abort(); searchCtl = new AbortController();
        const u = `https://nominatim.openstreetmap.org/search?format=json&limit=6&countrycodes=bd&viewbox=90.32,23.90,90.46,23.70&bounded=1&q=${encodeURIComponent(q)}`;
        const r = await fetch(u, { signal: searchCtl.signal, headers: { "Accept-Language": "en" } });
        const j = await r.json();
        draw(j.map((x) => ({ n: x.display_name.split(",")[0], sub: x.display_name.split(",").slice(1, 3).join(","), lat: +x.lat, lng: +x.lon })));
      } catch {}
    }, 450);
  }

  // ---------- fix dialog ----------
  function openFix(st, i) {
    const e = exitsOf(st)[i];
    const dlg = document.createElement("dialog");
    dlg.innerHTML = `<form method="dialog">
      <h3>Fix ${esc(e.name)} · ${esc(st.name)}</h3>
      <label class="lbl">Name on the sign (e.g. "Exit A" or "Gate 2")</label>
      <input type="text" id="fn" value="${esc(e.name)}">
      <label class="lbl">Leads toward</label>
      <input type="text" id="ft2" value="${esc(e.toward)}">
      <button type="button" class="btn" id="here" style="width:100%">📍 I'm standing at this exit now: save my position</button>
      <p class="small muted" id="herestat">${e.placed ? "Position saved earlier." : "Position is estimated."}</p>
      <div class="row"><button class="btn" value="cancel">Cancel</button><button class="btn primary" value="ok" id="ok">Save</button></div>
    </form>`;
    document.body.appendChild(dlg);
    let here = null;
    $("#here", dlg).onclick = () => {
      $("#herestat", dlg).textContent = "Getting your position…";
      navigator.geolocation.getCurrentPosition((p) => {
        here = { lat: p.coords.latitude, lng: p.coords.longitude };
        $("#herestat", dlg).textContent = `Got it (±${Math.round(p.coords.accuracy)} m). Tap Save.`;
      }, () => ($("#herestat", dlg).textContent = "Couldn't get location."), { enableHighAccuracy: true, timeout: 15000 });
    };
    dlg.addEventListener("close", () => {
      if (dlg.returnValue === "ok") {
        const f = (fixes[st.id] ||= {});
        const cur = f[i] || {};
        cur.name = $("#fn", dlg).value.trim() || undefined;
        cur.toward = $("#ft2", dlg).value.trim() || undefined;
        if (here) { cur.lat = here.lat; cur.lng = here.lng; }
        f[i] = cur; saveFixes(); track("exit_fixed", { station: st.id, exit_index: i, gps: !!here }); toast("Saved on this phone."); render(true);
      }
      dlg.remove();
    });
    dlg.showModal();
  }

  // ---------- event binding ----------
  function bind(tab) {
    document.querySelectorAll("[data-use]").forEach((b) => b.onclick = () => {
      if (state.stationId !== b.dataset.use) state.dest = null;
      state.stationId = b.dataset.use; track("select_station", { station: b.dataset.use, method: "gps_suggestion" });
      if (b.dataset.go) location.hash = "#" + b.dataset.go; else render(true);
    });
    document.querySelectorAll("[data-mode]").forEach((b) => b.onclick = () => {
      if (state.mode === b.dataset.mode) return;
      state.mode = b.dataset.mode; store.set("dm-mode", state.mode); track("home_mode", { mode: state.mode }); render(true);
    });
    if (tab === "exit" && state.mode === "rail") {
      $("#st").onchange = (e) => { state.stationId = e.target.value || null; if (state.stationId) track("select_station", { station: state.stationId, method: "manual" }); render(true); };
      $("#dst").onchange = (e) => { state.toSt = e.target.value || null; store.set("dm-tost", state.toSt); if (state.toSt) track("platform_finder", { from: state.stationId || "", to: state.toSt }); render(true); };
      $("#geo")?.addEventListener("click", startGeo);
      $("#compass")?.addEventListener("click", startCompass);
      updatePlat();
    }
    if (tab === "exit" && state.mode !== "rail") {
      $("#st").onchange = (e) => { state.stationId = e.target.value || null; state.dest = null; if (state.stationId) track("select_station", { station: state.stationId, method: "manual" }); render(true); };
      $("#geo")?.addEventListener("click", startGeo);
      $("#compass")?.addEventListener("click", startCompass);
      const st = byId(state.stationId);
      if (st) {
        document.querySelectorAll("[data-lm]").forEach((b) => b.onclick = () => setDest(st.landmarks[+b.dataset.lm]));
        $("#q").oninput = (e) => search(e.target.value);
        initMap(st, true);
        updateNeedle();
      }
    }
    if (tab === "station") {
      const st = byId(location.hash.split("/")[1]);
      if (st) { document.querySelectorAll("[data-fix]").forEach((b) => b.onclick = () => openFix(st, +b.dataset.fix)); initMap(st, false); }
    }
    if (tab === "fares") {
      $("#ff").onchange = (e) => { state.from = e.target.value; store.set("dm-from", state.from); track("fare_check", { from: state.from, to: state.to }); render(true); };
      $("#ft").onchange = (e) => { state.to = e.target.value; store.set("dm-to", state.to); track("fare_check", { from: state.from, to: state.to }); render(true); };
      $("#swap").onclick = () => { [state.from, state.to] = [state.to, state.from]; store.set("dm-from", state.from); store.set("dm-to", state.to); render(true); };
    }
    if (tab === "info") {
      $("#export").onclick = async () => {
        const txt = JSON.stringify(fixes, null, 2);
        try { await navigator.clipboard.writeText(txt); toast("Copied. Paste it to whoever maintains the app data."); } catch { prompt("Copy your fixes:", txt); }
      };
      $("#reset").onclick = () => { if (confirm("Remove all exit fixes saved on this phone?")) { fixes = {}; saveFixes(); render(true); } };
    }
  }

  document.addEventListener("click", (e) => { const t = e.target.closest?.("[data-track]"); if (t) track(t.dataset.track, { station: state.stationId || "" }); });

  // ---------- boot ----------
  renderStatus(); setInterval(renderStatus, 60000);
  render();
  // Ask for location on open. If the browser already has permission this is silent.
  startGeo();
  if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => {});
})();
