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
  // ---------- language ----------
  const I = window.I18N;
  let lang = store.get("dm-lang", /^bn/i.test(navigator.language || "") ? "bn" : "en");
  if (!I[lang]) lang = "en";
  function t(k, v = {}) {
    let s = I[lang][k] ?? I.en[k] ?? k;
    if (typeof s === "function") return s(v);
    return typeof s === "string" ? s.replace(/\{(\w+)\}/g, (_, x) => v[x] ?? "") : s;
  }
  const bn = () => lang === "bn";
  const sn = (s) => (bn() ? s.bn : s.name); // station name in the current language (not escaped)
  const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
  const toBn = (s) => String(s).replace(/[0-9]/g, (d) => BN_DIGITS[d]);
  // Bangla mode shows Bangla digits. Done on visible text only (never attributes, URLs or the map), after each render.
  function bnDigits(root) {
    if (!bn() || !root) return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => n.parentElement?.closest("#map, script, style, [data-nd]") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
    for (let n; (n = w.nextNode());) if (/[0-9]/.test(n.nodeValue)) n.nodeValue = toBn(n.nodeValue);
  }
  const dirName = (b) => t("dirs")[Math.round(b / 45) % 8];
  const SIDE_BRG = { N: 0, E: 90, S: 180, W: 270 };
  const fmtDist = (m) => m < 1000 ? t("m", { n: Math.round(m / 10) * 10 }) : t("km", { n: (m / 1000).toFixed(1) });
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
      // Bangla uses a name built from the side, unless the data or the rider gave a real sign name.
      const name = f.name || (bn() && e.name === I.en.side_exit[e.side] ? t("side_exit")[e.side] : e.name);
      return { i, side: e.side, conf: e.conf, name, toward: f.toward || (bn() && e.towardBn) || e.toward,
        lift: f.lift || e.lift || null, esc: f.esc || e.esc || null,
        lat: f.lat ?? pos.lat, lng: f.lng ?? pos.lng, mine: !!(f.name || f.toward || f.lat || f.lift || f.esc), placed: f.lat != null };
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
  const fmt12 = (s) => {
    let [h, m] = s.split(":").map(Number); h %= 24;
    const hm = `${h % 12 || 12}:${String(m).padStart(2, "0")}`;
    if (!bn()) return `${hm} ${h >= 12 ? "PM" : "AM"}`;
    const part = h >= 4 && h < 12 ? "সকাল" : h < 15 && h >= 12 ? "দুপুর" : h >= 15 && h < 18 ? "বিকেল" : h >= 18 && h < 20 ? "সন্ধ্যা" : "রাত";
    return `${part} ${toBn(hm)}`;
  };
  function serviceStatus() {
    const { day, mins } = dhakaNow();
    const d = day === "Fri" ? M.schedule.days.friday : M.schedule.days.regular;
    const open = toMin(d.fromNorth[0]), close = toMin(d.fromMotijheel[1]);
    if (mins < open) return { on: false, text: t("status_opens", { t: fmt12(d.fromNorth[0]) }) };
    if (mins > close) return { on: false, text: t("status_closed") };
    return { on: true, text: t("status_open_till", { t: fmt12(d.fromMotijheel[1]) }) };
  }
  function renderStatus() {
    const s = serviceStatus();
    $("#status").innerHTML = `${s.on ? "●" : "○"} ${esc(s.text)}`;
    bnDigits($("#status"));
  }

  // ---------- toast / dialog ----------
  let toastT;
  function toast(msg) { const el = $("#toast"); el.textContent = bn() ? toBn(msg) : msg; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (el.hidden = true), 3200); }

  // ---------- geolocation ----------
  let watchId = null;
  function startGeo() {
    if (!("geolocation" in navigator)) { state.geoErr = "geo_none"; render(); return; }
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
      state.geoErr = err.code === 1 ? "geo_denied" : "geo_fail"; // i18n key
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
        const r = await DeviceOrientationEvent.requestPermission(); if (r !== "granted") { toast(t("compass_denied")); return; }
      }
      window.addEventListener("deviceorientationabsolute", onOrient, true);
      window.addEventListener("deviceorientation", onOrient, true);
      compassOn = true; track("compass_on"); toast(t("compass_ok")); render(true);
    } catch { toast(t("compass_na")); }
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
    const navTab = tab === "station" ? "stations" : tab === "admin" ? "info" : tab;
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
    else if (tab === "admin") v.innerHTML = viewAdmin();
    else v.innerHTML = viewHome();
    bind(tab);
    wantLive(tab); renderLive();
    renderAlerts();
    bnDigits(v);
    if (keepScroll) window.scrollTo(0, y);
    else if (location.hash === "#info/rush") $("#rush")?.scrollIntoView({ block: "start" });
    else window.scrollTo(0, 0);
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
    if (e.mine) return `<span class="badge mine">${t("conf_mine")}</span>`;
    return badge(e.conf);
  }
  const badge = (conf) => `<span class="badge ${conf}">${t("conf_" + conf)}</span>`;
  function stationOptions(sel, skip) {
    return S.filter((s) => s.id !== skip).map((s) => `<option value="${s.id}" ${s.id === sel ? "selected" : ""}>${bn() ? `${s.bn} (${esc(s.name)})` : `${s.code} · ${esc(s.name)} (${s.bn})`}</option>`).join("");
  }

  function geoHtml() {
    let geo = "";
    if (state.pos) {
      const n = nearestStation(state.pos);
      geo = `<p class="small muted" style="margin:8px 0 0">${t("nearest", { st: esc(sn(n.s)), d: fmtDist(n.d), acc: state.acc ? t("gps_acc", { m: Math.round(state.acc) }) : "" })}
        ${state.stationId !== n.s.id ? `<button class="btn sm" data-use="${n.s.id}">${t("select_it")}</button>` : ""}</p>`;
    } else if (state.geoErr) {
      geo = `<p class="note" style="margin-top:10px">${esc(t(state.geoErr))}</p>`;
    } else {
      geo = `<button class="btn primary" id="geo" style="margin-top:10px;width:100%">${t("allow_loc")}</button>`;
    }
    return geo;
  }

  function modeSwitch() {
    const b = (m, label) => `<button role="tab" aria-selected="${state.mode === m}" class="${state.mode === m ? "on" : ""}" data-mode="${m}">${label}</button>`;
    return `<div class="seg" role="tablist">${b("rail", t("mode_rail"))}${b("exit", t("mode_exit"))}</div>`;
  }
  const viewHome = () => modeSwitch() + (state.mode === "rail" ? viewRail() : viewExit());

  // ---------- facilities ----------
  const FAC_ICON = {
    lift: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 10l3-3 3 3M9 14l3 3 3-3" fill="none"/>',
    escalator: '<path d="M3 19h4l9-11h5" fill="none"/><circle cx="12" cy="6" r="1.6"/>',
    stairs: '<path d="M3 20h5v-5h5v-5h5V5h3" fill="none"/>',
    tvm: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8v5H8zM9 16h6" fill="none"/>',
    counter: '<path d="M3 13h18v7H3z" fill="none"/><circle cx="12" cy="6" r="2.5"/><path d="M8 13c0-2.5 1.8-4 4-4s4 1.5 4 4" fill="none"/>',
    topup: '<rect x="3" y="6" width="18" height="12" rx="2" fill="none"/><path d="M12 9v6M9 12h6" fill="none"/>',
    toilet: '<circle cx="8" cy="5" r="2"/><circle cx="16" cy="5" r="2"/><path d="M6 9h4v6H9v5H7v-5H6zM16 9l3 7h-2v4h-2v-4h-2z"/>'
  };
  const facIcon = (k) => `<svg class="fi" viewBox="0 0 24 24" aria-hidden="true">${FAC_ICON[k] || ""}</svg>`;
  const stFac = (st) => M.facilities.items.map((f) => ({ ...f, ...((st.fac || {})[f.k] || {}) }));
  // Lift / escalator at one exit: the rider's own fix wins, else the station-wide report (both sides of the road).
  function exitFac(st, e) {
    const all = stFac(st);
    return ["lift", "escalator"].map((k) => {
      const v = k === "lift" ? e.lift : e.esc, f = all.find((x) => x.k === k);
      const st8 = v === "y" ? "yes" : v === "n" ? "no" : f && f.where === "both" ? f.conf : "unknown";
      const label = st8 === "yes" ? t("fac_exit_yes") : st8 === "no" ? t("fac_exit_no") : st8 === "unknown" ? t("fac_exit_unknown") : t("conf_" + st8);
      return `<span class="fchip ${st8}">${facIcon(k)}${t("fac_" + k)} · ${label}</span>`;
    }).join("");
  }
  function facCard(st) {
    return `<section class="card">
      <h3>${t("fac_h")}</h3>
      <ul class="fac">${stFac(st).map((f) => `<li>${facIcon(f.k)}<div><b>${t("fac_" + f.k)}</b> ${badge(f.conf)}
        <div class="small muted">${t("where_" + f.where)}${(bn() ? f.noteBn : f.note) ? " · " + esc(bn() ? f.noteBn : f.note) : ""}</div></div></li>`).join("")}</ul>
      <p class="small muted" style="margin:10px 0 0">${t("fac_note", { src: esc(bn() ? M.facilities.sourceBn : M.facilities.source) })}</p>
    </section>`;
  }

  // ---------- crowding (estimate) ----------
  function crowdAt(dir, when = dhakaClock()) {
    const c = M.crowd, d = when.fri ? c.friday : c.regular;
    return d[dir][Math.floor(when.mins / 60) - c.startHour] ?? null;
  }
  const crowdTag = (lv) => `<span class="crowd c${lv}">${t("crowd")[lv]}</span>`;

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
        ? `<p class="note" style="margin-top:12px">${t("tip_closer", { st: esc(sn(nb.s)), p: esc(state.dest.n), d1: fmtDist(nb.d), d2: fmtDist(dist(st, state.dest)) })} <button class="btn sm" data-use="${nb.s.id}">${t("switch")}</button></p>` : "";
      const sideNote = ex.length > 1 && ex[1].d - b.d < 40
        ? `<p class="small muted">${t("both_same")}</p>` : "";
      result = `
      <section class="card answer">
        <div class="small muted">${t("at_going", { st: esc(sn(st)), d: esc(state.dest.n) })}</div>
        <div class="big">${t("take_the", { e: esc(b.name) })}</div>
        <div class="muted">${t("toward", { x: esc(b.toward) })} ${confBadge(b)}</div>
        <div class="fchips"><span class="small muted">${t("at_exit_fac")}</span> ${exitFac(st, b)}</div>
        <div class="compass">
          <div class="ring">${ticks(brg)}
            <div class="needle"><span class="n" data-nd>N</span><svg id="needle" viewBox="0 0 24 24" style="transform:rotate(${brg}deg)"><path d="M12 2 4.5 20.3l.7.7L12 18l6.8 3 .7-.7z"/></svg></div>
          </div>
          <div style="font-size:18px">${t("walk_dir", { d: dirName(brg) })}</div>
          <div class="muted small">${t("straight", { d: fmtDist(b.d), m: walkMin(b.d * 1.3) })}</div>
          ${compassOn ? `<div class="small muted" id="hdg">${t("arrow_turns")}</div>` : `<div><button class="btn sm" id="compass">${t("compass_btn")}</button></div>`}
        </div>
        ${sideNote}
        ${better}
        <div class="row" style="margin-top:14px">
          <a class="btn" target="_blank" rel="noopener" data-track="walking_route" href="https://www.google.com/maps/dir/?api=1&origin=${b.lat},${b.lng}&destination=${state.dest.lat},${state.dest.lng}&travelmode=walking">${t("walking_route")}</a>
          <a class="btn" href="#station/${st.id}">${t("all_exits")}</a>
        </div>
      </section>`;
    }

    const chips = st ? st.landmarks.map((l, i) => `<button class="chip ${state.dest && state.dest.n === l.n ? "on" : ""}" data-lm="${i}">${esc(l.n)}</button>`).join("") : "";

    return `
    ${result}
    <section class="card">
      <label class="lbl" for="st">${t("select_station_lbl")}</label>
      <select id="st"><option value="">${t("choose_station")}</option>${stationOptions(state.stationId)}</select>
      ${geo}
    </section>
    ${st ? `
    <section class="card">
      <label class="lbl">${t("where_going")}</label>
      <div class="chips">${chips}</div>
      <div style="margin-top:12px">
        <input type="search" id="q" placeholder="${esc(t("search_ph"))}" autocomplete="off" enterkeyhint="search">
        <div class="results" id="res"></div>
      </div>
      <p class="small muted" style="margin:10px 0 0">${t("tap_map")}</p>
      <div id="map"></div>
    </section>` : ""}
    ${st ? "" : `<p class="muted small">${t("exit_hint")}</p>`}`;
  }

  // ---------- stations ----------
  function viewStations() {
    const near = state.pos ? nearestStation(state.pos) : null;
    return `
    <h2>${esc(bn() ? M.line.nameBn : M.line.name)} ${bn() ? "" : `<span class="muted small">${esc(M.line.nameBn)}</span>`}</h2>
    <p class="muted small">${t("stations_intro", { n: S.length, km: M.line.lengthKm })}</p>
    <section class="card" id="live-card"></section>
    <section class="card">
      <div class="trains-wrap"><div class="trains" id="trains" aria-hidden="true"></div>
      <ul class="line">
        ${S.map((s) => `<li><a href="#station/${s.id}" class="${near && near.s.id === s.id && near.d < 1500 ? "near" : ""}">
          <span class="stop"></span>
          <span class="nm"><b>${esc(sn(s))}</b><span class="muted small">${bn() ? esc(s.name) : s.bn}${s.transfer ? " · " + t("interchange") : ""}</span></span>
          <span class="code">${near && near.s.id === s.id ? fmtDist(near.d) + " · " : ""}<span data-nd>${s.code}</span></span></a></li>`).join("")}
      </ul></div>
      <p class="small muted legend"><span class="nw"><span class="tr S live">↓</span> ${t("legend_s")}</span> <span class="nw"><span class="tr N live">↑</span> ${t("legend_n")}</span> <span class="nw">${t("legend_live")}</span> <span class="nw">${t("legend_est")}</span></p>
    </section>
    <p class="note">${esc(bn() ? M.line.noteBn : M.line.note)}</p>`;
  }

  function viewStation(id) {
    const st = byId(id); if (!st) return `<p>${t("st_not_found")} <a href="#stations">${t("back")}</a></p>`;
    const ex = exitsOf(st);
    const i = S.indexOf(st);
    const opened = new Date(st.opened).toLocaleDateString(bn() ? "bn-BD" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
    return `
    <p><a class="back" href="#stations" aria-label="${t("all_stations")}">←</a></p>
    <h2>${esc(sn(st))} <span class="muted">${bn() ? esc(st.name) : st.bn}</span></h2>
    <p class="muted small"><span data-nd>${st.code}</span> · ${t("opened", { d: opened })}${st.transfer ? " · " + esc(bn() ? st.transferBn : st.transfer) : ""}</p>
    <section class="card" id="station-live" data-st="${st.id}"></section>
    <section class="card">
      <h3>${t("exits_h")}</h3>
      ${ex.map((e) => `<div class="exit">
        <div class="t">${esc(e.name)} ${confBadge(e)}</div>
        <div>${t("toward", { x: esc(e.toward) })}</div>
        <div class="fchips">${exitFac(st, e)}</div>
        <div class="row" style="margin-top:8px;flex-wrap:wrap">
          <button class="btn sm" data-fix="${e.i}" style="flex:0">${t("fix_exit")}</button>
          <a class="btn sm" style="flex:0" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${e.lat},${e.lng}">${t("map")}</a>
        </div></div>`).join("")}
      <p class="small muted" style="margin:10px 0 0">${t("exits_note")}</p>
      <div id="map"></div>
    </section>
    ${facCard(st)}
    <section class="card">
      <h3>${t("nearby_h")}</h3>
      <table><tr><th>${t("th_place")}</th><th>${t("th_best")}</th><th>${t("th_dist")}</th></tr>
      ${st.landmarks.map((l) => { const b = bestExit(st, l)[0]; return `<tr><td>${esc(l.n)}</td><td>${esc(b.name)}</td><td>${fmtDist(b.d)}</td></tr>`; }).join("")}
      </table>
      <button class="btn primary" style="margin-top:12px;width:100%" data-use="${st.id}" data-go="exit">${t("find_exit_here")}</button>
    </section>
    <section class="card small">
      <b>${t("next_stations")}</b> ${i > 0 ? `↑ ${esc(sn(S[i - 1]))} ${t("to_un")}` : t("terminus")} · ${i < S.length - 1 ? `↓ ${esc(sn(S[i + 1]))} ${t("to_mj")}` : t("terminus")}
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
    if (state.heading == null) return t("go_side", { d: dirName(side) });
    const d = (side - state.heading + 360) % 360, r = t("rel");
    const where = d < 45 || d > 315 ? r.ahead : d < 135 ? r.right : d < 225 ? r.behind : r.left;
    return t("plat_where", { w: where });
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
    <span class="plat-n" id="plat-n" style="transform:rotate(${-(state.heading || 0)}deg)"><b data-nd>N</b></span></div>`;
  }
  const etaBadge = (n) => n.live ? `<span class="badge high">${t("b_live")}${n.n > 1 ? ` · ${t("riders", { n: n.n })}` : ""}</span>` : `<span class="badge med">${t(n.first ? "b_first" : "b_est")}</span>`;
  function railNext(st, p) {
    const n = nextAt(st, p.dir);
    return n ? `${t("next_train_to", { t: esc(sn(p.term)) })} <b>${fmtEta(n)}</b> ${etaBadge({ ...n, n: 0 })}`
      : t("no_more_to", { t: esc(sn(p.term)) });
  }
  function railCrowd(p) {
    const lv = crowdAt(p.dir);
    return lv == null ? "" : `<div class="small">${t("crowd_now")} ${crowdTag(lv)} ${badge(M.crowd.conf)} <a href="#info/rush">${t("rush_h")}</a></div>`;
  }
  function viewRail() {
    const st = byId(state.stationId), to = byId(state.toSt);
    let result = "";
    if (st && to && st.id !== to.id) {
      const p = railPlan(st, to);
      result = `
      <section class="card answer" id="rail-card">
        <div class="small muted">${t("at_going", { st: esc(sn(st)), d: esc(sn(to)) })}</div>
        <div class="big">${t("board_to", { t: esc(sn(p.term)) })}</div>
        <div class="muted">${t("plat_side", { d: dirName(p.side) })} ${badge("med")}</div>
        <div class="compass">
          ${platformSvg(p)}
          <div style="font-size:18px" id="rel">${relText(p.side)}</div>
          <div class="muted small">${t("green_plat")}</div>
          <div class="muted small">${t("stops_min_fare", { n: p.stops, m: p.mins, f: fareBetween(st, to) })}</div>
          <div class="small" id="rail-next">${railNext(st, p)}</div>
          ${railCrowd(p)}
          ${compassOn ? `<div class="small muted">${t("drawing_turns")}</div>` : `<div><button class="btn sm" id="compass">${t("compass_btn")}</button></div>`}
        </div>
        <p class="small muted" style="margin:12px 0 0">${t("plat_signs", { t: esc(sn(p.term)) })}</p>
      </section>`;
    }
    return `
    ${result}
    <section class="card">
      <label class="lbl" for="st">${t("select_station_lbl")}</label>
      <select id="st"><option value="">${t("choose_station")}</option>${stationOptions(state.stationId)}</select>
      ${geoHtml()}
    </section>
    <section class="card">
      <label class="lbl" for="dst">${t("where_going")}</label>
      <select id="dst"><option value="">${t("choose_dest")}</option>${stationOptions(state.toSt, st && st.id)}</select>
    </section>
    ${st && to ? "" : `<p class="muted small">${t("rail_hint")}</p>`}`;
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
    <h2>${t("fares_h")}</h2>
    <section class="card">
      <label class="lbl" for="ff">${t("from")}</label><select id="ff">${stationOptions(state.from)}</select>
      <div style="height:10px"></div>
      <label class="lbl" for="ft">${t("to")}</label><select id="ft">${stationOptions(state.to)}</select>
      <div class="row" style="margin-top:12px"><button class="btn" id="swap">${t("swap")}</button></div>
    </section>
    <section class="card answer">
      ${n === 0 ? `<b>${t("choose_two")}</b>` : `
      <div class="small muted">${t("sjt")}</div>
      <div class="fare">৳${f}<small> / ৳${M.fare.max}</small></div>
      <div class="meter"><i style="width:${(f / M.fare.max) * 100}%"></i></div>
      <div>${t("with_pass", { x: Math.round(f * (1 - M.fare.passDiscount)) })}</div>
      <div class="muted small" style="margin-top:6px">${t("stops_min", { n, m: mins })}</div>`}
    </section>
    <section class="card">
      <h3>${t("from_every", { a: esc(sn(a)) })}</h3>
      <table><tr><th>${t("th_station")}</th><th>${t("th_fare")}</th><th>${t("th_pass")}</th></tr>
      ${S.filter((s) => s.id !== a.id).map((s) => { const x = fareBetween(a, s); return `<tr><td>${esc(sn(s))}</td><td>৳${x}</td><td>৳${Math.round(x * 0.9)}</td></tr>`; }).join("")}
      </table>
    </section>
    <p class="note">${esc(bn() ? M.fare.noteBn : M.fare.note)}</p>`;
  }

  // ---------- rush-hour guide ----------
  // One row of hourly bars per direction. Height and colour both carry the crowd level; the current hour is outlined.
  function rushCard() {
    const c = M.crowd, now = dhakaClock(), fri = state.rushDay ? state.rushDay === "fri" : now.fri;
    const d = fri ? c.friday : c.regular, dayInfo = fri ? M.schedule.days.friday : M.schedule.days.regular;
    const nowIdx = fri === now.fri ? Math.floor(now.mins / 60) - c.startHour : -1;
    const row = (dir) => {
      const name = t(dir === "S" ? "rush_dir_s" : "rush_dir_n");
      const bars = d[dir].map((lv, i) => {
        const h = c.startHour + i, hh = `${String(h).padStart(2, "0")}:00`;
        return `<span class="hb${lv == null ? " off" : " c" + lv}${i === nowIdx ? " now" : ""}" title="${esc(fmt12(hh))}: ${lv == null ? t("no_service") : t("crowd")[lv]}"><i style="height:${lv == null ? 4 : 25 + lv * 25}%"></i></span>`;
      }).join("");
      const summary = d[dir].map((lv, i) => `${c.startHour + i}:00 ${lv == null ? t("no_service") : t("crowd")[lv]}`).join(", ");
      return `<div class="rush-row"><div class="small"><b>${name}</b></div><div class="hbars" role="img" aria-label="${esc(name + ": " + summary)}">${bars}</div></div>`;
    };
    const hl = (h) => bn() ? `${h % 12 || 12}টা` : `${h % 12 || 12}${h < 12 ? "am" : "pm"}`;
    const axis = [6, 9, 12, 15, 18, 21].map((h) => `<span style="left:${((h - c.startHour) + 0.5) / d.S.length * 100}%">${hl(h)}</span>`).join("");
    const sNow = crowdAt("S"), nNow = crowdAt("N");
    const seg = (k, label) => `<button role="tab" aria-selected="${fri === (k === "fri")}" class="${fri === (k === "fri") ? "on" : ""}" data-rush="${k}">${esc(label)}</button>`;
    return `<section class="card" id="rush">
      <h3>${t("rush_h")} ${badge(c.conf)}</h3>
      <div class="seg" role="tablist" style="margin-bottom:10px">${seg("reg", bn() ? M.schedule.days.regular.labelBn : M.schedule.days.regular.label)}${seg("fri", bn() ? M.schedule.days.friday.labelBn : M.schedule.days.friday.label)}</div>
      <p class="small muted" style="margin:0 0 10px">${t("rush_intro", { day: esc(bn() ? dayInfo.labelBn : dayInfo.label) })}</p>
      ${sNow != null && nNow != null ? `<p class="small" style="margin:0 0 10px">${t("rush_now_line", { s: crowdTag(sNow), n: crowdTag(nNow) })}</p>` : ""}
      ${row("S")}${row("N")}
      <div class="haxis" aria-hidden="true">${axis}</div>
      <p class="small legend">${t("crowd").map((x, i) => `<span class="nw"><span class="sw c${i}"></span>${x}</span>`).join(" ")} <span class="nw"><span class="sw nowsw"></span>${t("now")}</span></p>
      <h3 style="margin-top:14px">${t("rush_tips")}</h3>
      <ul class="plain">${c.tips.map((x) => `<li>${esc(bn() ? x.bn : x.t)} ${badge(x.conf)}</li>`).join("")}</ul>
    </section>`;
  }

  // ---------- info ----------
  function viewInfo() {
    const d = M.schedule.days;
    const fixedCount = Object.values(fixes).reduce((n, o) => n + Object.keys(o).length, 0);
    const s = serviceStatus();
    return `
    <h2>${t("info_h")}</h2>
    <section class="card ${s.on ? "answer" : ""}"><b>${t(s.on ? "running" : "not_running")}</b> <span class="muted">${esc(s.text)}</span></section>
    <section class="card">
      <h3>${t("timings_h")}</h3>
      <table>
        <tr><th></th><th>${t("from_un")}</th><th>${t("from_mj")}</th></tr>
        ${[d.regular, d.friday].map((x) => `<tr><td><b>${esc(bn() ? x.labelBn : x.label)}</b></td><td>${t("range", { a: fmt12(x.fromNorth[0]), b: fmt12(x.fromNorth[1]) })}</td><td>${t("range", { a: fmt12(x.fromMotijheel[0]), b: fmt12(x.fromMotijheel[1]) })}</td></tr>`).join("")}
      </table>
      <p class="small muted">${t("timings_note", { hw: esc(bn() ? M.schedule.headwayBn : M.schedule.headway), m: M.schedule.endToEndMin, src: esc(bn() ? M.schedule.sourceBn : M.schedule.source) })}</p>
    </section>
    ${rushCard()}
    ${M.info.map((g) => `<section class="card"><h3>${esc(bn() ? g.hBn : g.h)}</h3><ul class="plain">${(bn() ? g.itemsBn : g.items).map((i) => `<li>${esc(i)}</li>`).join("")}</ul></section>`).join("")}
    <section class="card">
      <h3>${t("about_h")}</h3>
      <p class="small">${t("about_p", { low: badge("low"), med: badge("med") })}</p>
      <p class="small">${t("saved_fixes", { n: fixedCount })}</p>
      <div class="row" style="flex-wrap:wrap">
        <button class="btn sm" id="export" style="flex:0">${t("copy_fixes")}</button>
        <button class="btn sm" id="reset" style="flex:0" ${fixedCount ? "" : "disabled"}>${t("clear_fixes")}</button>
      </div>
    </section>
    <section class="card credit">
      <img src="img/atiqur.jpg" alt="Atiqur Rahaman" width="56" height="56">
      <div><div class="small muted">${t("made_by")}</div><b>Atiqur Rahaman</b><div class="small muted">${t("ceo")}</div></div>
        <div class="social">
        <a class="li" href="https://www.linkedin.com/in/atiq31416/" target="_blank" rel="noopener" aria-label="Atiqur Rahaman on LinkedIn"><svg viewBox="0 0 24 24"><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9h4v12H3zm7 0h3.8v1.7h.05c.53-1 1.83-2.05 3.77-2.05 4.03 0 4.78 2.65 4.78 6.1V21h-4v-5.5c0-1.3-.02-3-1.83-3-1.83 0-2.12 1.43-2.12 2.9V21h-4z"/></svg></a>
        <a class="li" href="https://www.facebook.com/atiq31416" target="_blank" rel="noopener" aria-label="Atiqur Rahaman on Facebook"><svg viewBox="0 0 24 24"><path d="M14 8.5V6.8c0-.8.2-1.3 1.4-1.3H17V2.3c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3v2H7.5V12h2.8v9.8H14V12h2.8l.4-3.5z"/></svg></a>
      </div>
    </section>
    <p class="small muted">${t("footer", { d: esc(M.updated) })} ${(window.FIREBASE_CONFIG || {}).databaseURL ? `· <a href="#admin">${t("post_alert_link")}</a>` : ""}</p>`;
  }

  // ---------- trains: timetable estimates + rider reports ----------
  // Positions are kept as km from Uttara North. "S" = toward Motijheel (km goes up), "N" = toward Uttara North.
  const LEN = S[S.length - 1].km;
  const KM_PER_MIN = LEN / M.schedule.endToEndMin; // average speed including stops
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const dirTo = (dir) => sn(dir === "S" ? S[S.length - 1] : S[0]); // terminus name a train is heading to
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
    if (n.min < 0.75) return t("arriving");
    if (n.min <= 45) return t("eta_min", { m: Math.round(n.min) });
    const at = Math.round(dhakaClock().mins + n.min) % 1440; // far off: show the clock time instead
    return t("eta_at", { t: fmt12(`${Math.floor(at / 60)}:${String(at % 60).padStart(2, "0")}`) });
  }

  // ---------- sharing my train ----------
  const share = { on: false, since: 0, hist: [], dir: null, v: 0, km: null, lastSent: 0, away: 0, msg: null, wake: null }; // msg = [i18n key, vars]
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
    if (i <= 0) return t("at_st", { s: sn(S[0]) });
    const a = S[i - 1], b = S[i];
    if (km - a.km < 0.25) return t("at_st", { s: sn(a) });
    if (b.km - km < 0.25) return t("at_st", { s: sn(b) });
    return t("between", { a: sn(a), b: sn(b) });
  }
  async function startShare() {
    const lv = Live(); if (!lv) return;
    if (!confirm(t("share_confirm"))) return;
    Object.assign(share, { on: true, since: Date.now(), hist: [], dir: null, v: 0, km: null, lastSent: 0, away: 0, msg: ["share_getting"] });
    try { share.wake = await navigator.wakeLock?.request("screen"); } catch {}
    track("live_share", { state: "on" });
    startGeo(); lv.want("_share", true); renderLive();
  }
  function stopShare(msg) {
    if (!share.on) return;
    share.on = false; share.msg = null;
    try { share.wake?.release(); } catch {} share.wake = null;
    Live()?.stop(); track("live_share", { state: "off" });
    if (msg) toast(msg);
    renderLive();
  }
  function shareFix(pos, acc, ts) {
    if (!share.on) return;
    if (Date.now() - share.since > 90 * 60000) return stopShare(t("share_90"));
    if (acc > 150) { share.msg = ["share_gps"]; return renderLive(); }
    const s = snap(pos);
    if (s.off > 350) {
      if (++share.away >= 3) return stopShare(t("share_left"));
      share.msg = ["share_off_line"]; return renderLive();
    }
    share.away = 0; share.km = s.km;
    share.hist.push({ km: s.km, t: ts }); share.hist = share.hist.filter((h) => ts - h.t <= 180000);
    // Direction: at least 300 m along the line at train-like speed (walkers under the viaduct do not count).
    const f = share.hist[0], dk = s.km - f.km, hrs = (ts - f.t) / 3600000;
    if (hrs > 0 && Math.abs(dk) >= 0.3 && Math.abs(dk) / hrs >= 12) share.dir = dk > 0 ? "S" : "N";
    const r = share.hist.find((h) => ts - h.t <= 60000) || f, rh = (ts - r.t) / 3600000;
    share.v = rh > 0.004 ? clamp(Math.abs(s.km - r.km) / rh, 0, 100) : share.v;
    if (!share.dir) { share.msg = ["share_wait_dir"]; return renderLive(); }
    share.msg = ["share_msg", { where: kmLabel(s.km), d: dirTo(share.dir) }];
    if (ts - share.lastSent >= 8000) {
      share.lastSent = ts;
      Live()?.publish({ km: s.km, dir: share.dir, v: share.v }).catch(() => { share.msg = ["share_fail"]; renderLive(); });
    }
    renderLive();
  }

  // ---------- trains UI ----------
  function liveCard() {
    const lv = Live(), on = serviceStatus().on, trains = trainsNow();
    const nLive = trains.filter((t) => t.live).length, nEst = trains.length - nLive;
    let h = `<h3>${t("trains_now")} <span class="badge ${nLive ? "high" : "med"}">${t(nLive ? "b_live" : "b_est")}</span></h3>`;
    h += trains.length
      ? `<p class="small" style="margin:0">${t("trains_count", { n: trains.length, live: nLive, est: nEst })}</p>`
      : `<p class="small muted" style="margin:0">${t(on ? "no_trains_expected" : "not_running")}</p>`;
    if (lv) {
      if (share.on) h += `<div class="share on"><span class="pulse"></span><div class="small">${esc(share.msg ? t(share.msg[0], share.msg[1]) : "")}</div><button class="btn sm" id="share-stop" style="flex:0">${t("stop")}</button></div>`;
      else h += `<div class="share"><div class="small muted">${t("share_pitch")}</div><button class="btn sm primary" id="share-start" style="flex:0">${t("share_btn")}</button></div>`;
      if (lv.state === "error") h += `<p class="small muted" style="margin:8px 0 0">${bn() ? t("live_err") : esc(lv.error)}</p>`;
    }
    return h;
  }
  function stationLiveCard(st) {
    const row = (dir) => { const n = nextAt(st, dir); if (!n && ((dir === "S" && st.km >= LEN) || (dir === "N" && st.km <= 0))) return "";
      return `<tr><td>${t("to_dir", { d: esc(dirTo(dir)) })}</td><td><b>${n ? fmtEta(n) : t("no_more_today")}</b></td><td>${n ? etaBadge(n) : ""}</td></tr>`; };
    return `<h3>${t("next_train")}</h3><table>${row("S")}${row("N")}</table>
      <p class="small muted" style="margin:8px 0 0">${t("live_note")}</p>`;
  }
  function placeTrains() {
    const box = $("#trains"), stops = [...document.querySelectorAll(".line .stop")];
    if (!box || stops.length !== S.length) return;
    const top = box.getBoundingClientRect().top;
    const left = box.getBoundingClientRect().left, r0 = stops[0].getBoundingClientRect(), cx = r0.left - left + r0.width / 2;
    const ys = stops.map((s) => { const r = s.getBoundingClientRect(); return r.top - top + r.height / 2; });
    box.innerHTML = trainsNow().map((tr) => {
      const i = clamp(S.findIndex((s) => s.km >= tr.km), 1, S.length - 1), a = S[i - 1], b = S[i];
      const y = ys[i - 1] + (ys[i] - ys[i - 1]) * ((tr.km - a.km) / ((b.km - a.km) || 1));
      return `<span class="tr ${tr.dir} ${tr.live ? "live" : "est"}${tr.me ? " me" : ""}" style="top:${y}px;left:${cx + (tr.dir === "S" ? -24 : 24) - 10}px" title="${esc(t(tr.live ? "b_live" : "b_est") + " · " + t("to_dir", { d: dirTo(tr.dir) }))}">${tr.dir === "S" ? "↓" : "↑"}</span>`;
    }).join("");
  }
  function renderLive() {
    const c = $("#live-card"); if (c) { c.innerHTML = liveCard(); $("#share-start")?.addEventListener("click", startShare); $("#share-stop")?.addEventListener("click", () => stopShare()); }
    const sc = $("#station-live"); if (sc) sc.innerHTML = stationLiveCard(byId(sc.dataset.st));
    const rn = $("#rail-next"), st = byId(state.stationId), to = byId(state.toSt);
    if (rn && st && to && st.id !== to.id) rn.innerHTML = railNext(st, railPlan(st, to));
    placeTrains();
    bnDigits(c); bnDigits(sc); bnDigits(rn);
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
    const el = $("#map"); if (!el || typeof L === "undefined") { if (el) el.outerHTML = `<p class="small muted">${t("map_offline")}</p>`; return; }
    map = L.map(el, { zoomControl: false, attributionControl: true }).setView([st.lat, st.lng], 18);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
    const brand = getComputedStyle(document.documentElement).getPropertyValue("--brand").trim() || "#a6e35a";
    L.marker([st.lat, st.lng], { icon: pin(brand, 18) }).addTo(map).bindTooltip(sn(st));
    const ex = exitsOf(st);
    const best = state.dest && clickable ? bestExit(st, state.dest)[0] : null;
    ex.forEach((e) => {
      const on = best && best.i === e.i;
      L.marker([e.lat, e.lng], { icon: L.divIcon({ className: "", iconSize: [0, 0], html: `<div style="transform:translate(${e.side === "W" ? "-100%" : e.side === "E" ? "0" : "-50%"},${e.side === "N" ? "-100%" : e.side === "S" ? "0" : "-50%"});white-space:nowrap;background:${on ? brand : "#2a2b2a"};color:${on ? "#141514" : "#f4f5f3"};border:2px solid ${brand};border-radius:999px;padding:3px 9px;font:700 12px 'DM Sans',system-ui">${esc(e.name)}</div>` }) }).addTo(map);
    });
    const pts = [[st.lat, st.lng]];
    if (state.pos) { L.marker([state.pos.lat, state.pos.lng], { icon: pin("#2f7cf6") }).addTo(map).bindTooltip(t("you")); if (dist(state.pos, st) < 2000) pts.push([state.pos.lat, state.pos.lng]); }
    if (clickable) {
      if (state.dest) { destMarker = L.marker([state.dest.lat, state.dest.lng], { icon: pin("#d93025", 16) }).addTo(map).bindTooltip(state.dest.n); pts.push([state.dest.lat, state.dest.lng]);
        if (best) L.polyline([[best.lat, best.lng], [state.dest.lat, state.dest.lng]], { color: brand, dashArray: "6 6", weight: 3 }).addTo(map); }
      map.on("click", (ev) => setDest({ n: t("dropped_pin"), lat: ev.latlng.lat, lng: ev.latlng.lng, source: "map" }));
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
    S.forEach((s) => s.landmarks.forEach((l) => { if (l.n.toLowerCase().includes(ql)) local.push({ n: l.n, lat: l.lat, lng: l.lng, sub: t("near_st", { st: sn(s) }) }); }));
    const draw = (online) => {
      const all = [...local, ...online].slice(0, 8);
      res.innerHTML = all.length ? all.map((r, i) => `<button data-r="${i}"><b>${esc(r.n)}</b><div class="small muted">${esc(r.sub || "")}</div></button>`).join("") : `<div class="small muted" style="padding:8px 0">${t("no_match")}</div>`;
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
    const opt = (v, cur) => ["", "y", "n"].map((x) => `<option value="${x}" ${x === (cur || "") ? "selected" : ""}>${t(x === "y" ? "yes" : x === "n" ? "no" : "unknown")}</option>`).join("");
    dlg.innerHTML = `<form method="dialog">
      <h3>${t("fix_title", { e: esc(e.name), st: esc(sn(st)) })}</h3>
      <label class="lbl">${t("fix_sign")}</label>
      <input type="text" id="fn" value="${esc(e.name)}">
      <label class="lbl">${t("fix_toward")}</label>
      <input type="text" id="ft2" value="${esc(e.toward)}">
      <div class="row">
        <div><label class="lbl" for="flift">${t("fix_lift")}</label><select id="flift">${opt("", (fixes[st.id] || {})[i]?.lift)}</select></div>
        <div><label class="lbl" for="fesc">${t("fix_esc")}</label><select id="fesc">${opt("", (fixes[st.id] || {})[i]?.esc)}</select></div>
      </div>
      <button type="button" class="btn" id="here" style="width:100%">${t("fix_here")}</button>
      <p class="small muted" id="herestat">${t(e.placed ? "fix_saved_before" : "fix_est")}</p>
      <div class="row"><button class="btn" value="cancel">${t("cancel")}</button><button class="btn primary" value="ok" id="ok">${t("save")}</button></div>
    </form>`;
    document.body.appendChild(dlg);
    let here = null;
    $("#here", dlg).onclick = () => {
      $("#herestat", dlg).textContent = t("fix_getting");
      navigator.geolocation.getCurrentPosition((p) => {
        here = { lat: p.coords.latitude, lng: p.coords.longitude };
        $("#herestat", dlg).textContent = t("fix_got", { m: Math.round(p.coords.accuracy) });
      }, () => ($("#herestat", dlg).textContent = t("fix_noloc")), { enableHighAccuracy: true, timeout: 15000 });
    };
    dlg.addEventListener("close", () => {
      if (dlg.returnValue === "ok") {
        const f = (fixes[st.id] ||= {});
        const cur = f[i] || {};
        // Keep the default text out of the fix, so an untouched field still follows the language switch.
        const nm = $("#fn", dlg).value.trim(), tw = $("#ft2", dlg).value.trim();
        cur.name = nm && (nm !== e.name || cur.name) ? nm : undefined;
        cur.toward = tw && (tw !== e.toward || cur.toward) ? tw : undefined;
        cur.lift = $("#flift", dlg).value || undefined;
        cur.esc = $("#fesc", dlg).value || undefined;
        if (here) { cur.lat = here.lat; cur.lng = here.lng; }
        f[i] = cur; saveFixes(); track("exit_fixed", { station: st.id, exit_index: i, gps: !!here }); toast(t("saved_phone")); render(true);
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
    if (tab === "admin") bindAdmin();
    if (tab === "fares") {
      $("#ff").onchange = (e) => { state.from = e.target.value; store.set("dm-from", state.from); track("fare_check", { from: state.from, to: state.to }); render(true); };
      $("#ft").onchange = (e) => { state.to = e.target.value; store.set("dm-to", state.to); track("fare_check", { from: state.from, to: state.to }); render(true); };
      $("#swap").onclick = () => { [state.from, state.to] = [state.to, state.from]; store.set("dm-from", state.from); store.set("dm-to", state.to); render(true); };
    }
    if (tab === "info") {
      document.querySelectorAll("[data-rush]").forEach((b) => b.onclick = () => { state.rushDay = b.dataset.rush; track("rush_guide", { day: state.rushDay }); render(true); });
      $("#export").onclick = async () => {
        const txt = JSON.stringify(fixes, null, 2);
        try { await navigator.clipboard.writeText(txt); toast(t("copied")); } catch { prompt(t("copy_prompt"), txt); }
      };
      $("#reset").onclick = () => { if (confirm(t("confirm_clear"))) { fixes = {}; saveFixes(); render(true); } };
    }
  }

  document.addEventListener("click", (e) => { const t = e.target.closest?.("[data-track]"); if (t) track(t.dataset.track, { station: state.stationId || "" }); });

  // ---------- service alerts ----------
  function fmtWhen(ts) { // date and time in Dhaka
    const d = new Date(ts + 6 * 3600000);
    const day = new Date(ts).toLocaleDateString(bn() ? "bn-BD" : "en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short" });
    return `${day}, ${fmt12(`${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, "0")}`)}`;
  }
  const alertStations = (a) => (a.stations || "").split(",").map((id) => byId(id.trim())).filter(Boolean).map(sn).join(", ");
  function alertHtml(a, admin) {
    const title = bn() && a.titleBn ? a.titleBn : a.title, body = bn() && a.bodyBn ? a.bodyBn : a.body, sts = alertStations(a);
    const meta = [sts && t("alert_stations", { s: esc(sts) }), a.t && t("alert_posted", { t: esc(fmtWhen(a.t)) }), a.until && t("alert_until", { t: esc(fmtWhen(a.until)) })].filter(Boolean).join(" · ");
    return `<div class="alert ${a.level}" role="status">
      <div class="al-body"><b>${esc(t("alert_lv")[a.level] || "")}: ${esc(title)}</b>${body ? `<div class="small">${esc(body)}</div>` : ""}<div class="small al-meta">${meta}</div></div>
      ${admin ? `<button class="btn sm" data-del="${esc(a.id)}">Delete</button>` : `<button class="al-x" data-hide="${esc(a.id)}" aria-label="${t("alert_hide")}">×</button>`}
    </div>`;
  }
  function renderAlerts() {
    const box = $("#alerts"), A = window.ALERTS; if (!box) return;
    if (!A || current() === "admin") { box.innerHTML = ""; return; }
    const hid = A.hidden(), list = A.active().filter((a) => !hid.includes(a.id));
    box.innerHTML = list.map((a) => alertHtml(a)).join("") +
      (list.length && A.offline() && A.savedAt() ? `<p class="small muted al-off">${t("alerts_cached", { t: esc(fmtWhen(A.savedAt())) })}</p>` : "");
    box.querySelectorAll("[data-hide]").forEach((b) => b.onclick = () => { track("alert_hide", {}); A.hide(b.dataset.hide); });
    bnDigits(box);
  }
  window.addEventListener("alerts:update", () => { renderAlerts(); if (current() === "admin") renderAdmin(); });

  // Admin page (#admin): English only, for whoever runs the app. Writes are checked by the database rules.
  const viewAdmin = () => `
    <p><a class="back" href="#info" aria-label="Back to info">←</a></p>
    <h2>Service alerts</h2>
    <div id="admin-auth"></div>
    <section class="card"><h3>Posted alerts</h3><div id="admin-list"></div></section>`;
  let adminKey = "";
  function renderAdmin() {
    const A = window.ALERTS, box = $("#admin-auth"), lst = $("#admin-list"); if (!box) return;
    if (!A || !A.enabled) { box.innerHTML = `<p class="note">Alerts need <code>databaseURL</code> in firebase-config.js.</p>`; return; }
    const ad = A.admin;
    lst.innerHTML = A.all().length ? A.all().map((a) => alertHtml(a, true) + (A.isActive(a) ? "" : `<p class="small muted" style="margin:-6px 0 10px">Not showing now (outside its time window).</p>`)).join("") : `<p class="small muted">No alerts posted.</p>`;
    lst.querySelectorAll("[data-del]").forEach((b) => b.onclick = async () => {
      if (!confirm("Delete this alert for everyone?")) return;
      try { await ad.remove(b.dataset.del); toast("Deleted."); } catch (e) { toast("Could not delete: " + (e.code || e.message)); }
    });
    const key = !ad.ready ? "wait" : !ad.user ? "out" : ad.isAdmin ? "admin:" + ad.user.uid : "user:" + ad.user.uid;
    if (key === adminKey) return; adminKey = key;
    if (key === "wait") box.innerHTML = `<section class="card"><p class="small muted">Loading…</p></section>`;
    else if (key === "out") box.innerHTML = `<section class="card"><form id="al-login">
      <label class="lbl" for="al-email">Admin email</label><input type="text" id="al-email" autocomplete="username" inputmode="email">
      <div style="height:10px"></div>
      <label class="lbl" for="al-pw">Password</label><input type="password" id="al-pw" autocomplete="current-password">
      <button class="btn primary" style="width:100%;margin-top:12px">Sign in</button></form>
      <p class="small muted">Only accounts listed under <code>admins</code> in the database can post. Setup steps are in the README.</p></section>`;
    else if (!ad.isAdmin) box.innerHTML = `<section class="card"><p class="small">Signed in as <b>${esc(ad.user.email || "")}</b>, but this account can't post yet.</p>
      <p class="small">In Firebase console → Realtime Database → Data, add <code>admins / ${esc(ad.user.uid)} : true</code>, then reload this page.</p>
      <button class="btn sm" id="al-out">Sign out</button></section>`;
    else box.innerHTML = `<section class="card"><form id="al-form">
      <p class="small muted" style="margin-top:0">Signed in as ${esc(ad.user.email || "")} · <a href="#admin" id="al-out">Sign out</a></p>
      <label class="lbl" for="al-level">Type</label>
      <select id="al-level"><option value="delay">Delay</option><option value="closed">Closure</option><option value="info">Notice (changed timings, other news)</option></select>
      <label class="lbl" for="al-title" style="margin-top:10px">Headline (English)</label><input type="text" id="al-title" maxlength="140" required placeholder="Trains running 15 min late">
      <label class="lbl" for="al-titlebn" style="margin-top:10px">Headline (Bangla, optional)</label><input type="text" id="al-titlebn" maxlength="140" placeholder="ট্রেন ১৫ মিনিট দেরিতে চলছে">
      <label class="lbl" for="al-body" style="margin-top:10px">Details (English, optional)</label><textarea id="al-body" maxlength="600" rows="3"></textarea>
      <label class="lbl" for="al-bodybn" style="margin-top:10px">Details (Bangla, optional)</label><textarea id="al-bodybn" maxlength="600" rows="3"></textarea>
      <label class="lbl" style="margin-top:10px">Stations affected (leave empty for the whole line)</label>
      <div class="chips">${S.map((s) => `<label class="chip"><input type="checkbox" value="${s.id}"> ${esc(s.name)}</label>`).join("")}</div>
      <label class="lbl" for="al-from" style="margin-top:10px">Show from</label><input type="datetime-local" id="al-from">
      <label class="lbl" for="al-until" style="margin-top:10px">Hide after</label><input type="datetime-local" id="al-until">
      <p class="small muted">Times are this phone's local time. Leave "Show from" empty to show it now, and "Hide after" empty to keep it until you delete it.</p>
      <button class="btn primary" style="width:100%">Post alert</button></form></section>`;
    $("#al-login")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      try { await ad.signIn($("#al-email").value.trim(), $("#al-pw").value); } catch (err) { toast("Sign-in failed: " + (err.code || err.message)); }
    });
    $("#al-out")?.addEventListener("click", (e) => { e.preventDefault(); ad.signOut(); });
    $("#al-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target, ts = (v) => (v ? new Date(v).getTime() : 0), until = ts($("#al-until").value), from = ts($("#al-from").value);
      if (until && until <= Math.max(from, Date.now())) { toast("\"Hide after\" must be in the future."); return; }
      const a = { level: $("#al-level").value, title: $("#al-title").value.trim(), titleBn: $("#al-titlebn").value.trim(), body: $("#al-body").value.trim(), bodyBn: $("#al-bodybn").value.trim(),
        stations: [...f.querySelectorAll(".chips input:checked")].map((x) => x.value).join(","), from, until };
      if (!a.title) return;
      try { await ad.post(a); f.reset(); track("alert_post", { level: a.level }); toast("Posted. Riders see it within a few minutes."); }
      catch (err) { toast("Could not post: " + (err.code || err.message)); }
    });
  }
  function bindAdmin() {
    adminKey = "";
    const A = window.ALERTS;
    if (A && A.enabled) { A.admin.init().catch(() => { const box = $("#admin-auth"); if (box) box.innerHTML = `<p class="note">Could not load Firebase. Check your internet and reload.</p>`; adminKey = "err"; }); A.refresh(); }
    renderAdmin();
  }

  // ---------- language switch ----------
  function applyLang() {
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n)));
    const b = $("#lang"); if (b) { b.textContent = t("lang_btn"); b.setAttribute("aria-label", t("lang_aria")); }
    document.title = t("brand_title");
  }
  $("#lang")?.addEventListener("click", () => {
    lang = bn() ? "en" : "bn"; store.set("dm-lang", lang); track("language", { lang });
    applyLang(); renderStatus(); render(true); moveIndicator(false);
  });

  // ---------- boot ----------
  applyLang();
  renderStatus(); setInterval(renderStatus, 60000);
  render();
  // Ask for location on open. If the browser already has permission this is silent.
  startGeo();
  if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => {});
})();
