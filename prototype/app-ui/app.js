// PROTOTYPE — three radically different phone layouts for parkup (issue #7), switchable via ?variant=.
//   A  Map and sheet   dark vector map, window picked with sign plates, kerb lines coloured by evaluation, bottom sheet
//   B  List first      light vector map strip over a ranked list, points coloured by legal window, cards expand inline
//   C  Week clock      scrub any hour of the week, kerb lines coloured by legality at that hour, full-page card with imagery
// No persistence, no real data. Everything below the helpers is throwaway.

const D = window.PARKUP;
const CENTRE = [152.9905, -27.4955];

const VERDICT = {
  good: { label: "Good", color: "#4CC38A" },
  maybe: { label: "Maybe", color: "#F2B84B" },
  poor: { label: "Poor", color: "#E5624A" },
  none: { label: "Not evaluated", color: "#8E8BA8" },
};
const STATUS = {
  ok: { label: "No limits", color: "#4CC38A" },
  limited: { label: "Time limit", color: "#F2B84B" },
  no: { label: "No parking", color: "#E5624A" },
};

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer";
const STYLES = {
  dark: "https://tiles.openfreemap.org/styles/dark",
  liberty: "https://tiles.openfreemap.org/styles/liberty",
  positron: "https://tiles.openfreemap.org/styles/positron",
  satellite: {
    version: 8,
    sources: { esri: { type: "raster", tiles: [`${ESRI}/tile/{z}/{y}/{x}`], tileSize: 256, maxzoom: 19, attribution: "Esri, Vantor" } },
    layers: [{ id: "esri", type: "raster", source: "esri" }],
  },
};

// ---------- helpers ----------

const $ = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const verdictOf = (c) => c.evaluation?.verdict ?? "none";
const mid = (c) => c.line[Math.floor(c.line.length / 2)];
const dow = (d) => ((d.getDay() + 6) % 7) + 1; // Mon = 1
const fmtH = (d) => d.toLocaleTimeString("en-AU", { hour: "numeric", minute: d.getMinutes() ? "2-digit" : undefined }).replace(" ", "").toLowerCase();
const fmtDay = (d) => d.toLocaleDateString("en-AU", { weekday: "short" });

function metres(a, b) {
  const r = Math.PI / 180, x = (b[0] - a[0]) * r * Math.cos(a[1] * r), y = (b[1] - a[1]) * r;
  return Math.round(Math.hypot(x, y) * 6371000);
}
const dist = (m) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);

function statusAt(c, d) {
  const day = dow(d), h = d.getHours() + d.getMinutes() / 60;
  let s = "ok";
  for (const r of c.rules) {
    if (r.days.includes(day) && h >= r.start && h < r.end) {
      if (r.kind === "no") return "no";
      s = "limited";
    }
  }
  return s;
}
// A time limit only works if you can stay the whole limited stretch of the window, e.g. 2P covers 2 hours.
function statusOver(c, w) {
  const limitH = Math.min(...c.rules.filter((r) => r.kind === "limit").map((r) => parseInt(r.label)), Infinity);
  let worst = "ok", limitedFor = 0;
  for (let t = +w.from; t < +w.to; t += 15 * 60e3) {
    const s = statusAt(c, new Date(t));
    if (s === "no") return "no";
    limitedFor = s === "limited" ? limitedFor + 0.25 : 0;
    if (limitedFor > limitH) return "no";
    if (s === "limited") worst = "limited";
  }
  return worst;
}

function windows(now = new Date()) {
  const at = (base, days, h) => { const d = new Date(base); d.setDate(d.getDate() + days); d.setHours(h, 0, 0, 0); return d; };
  const h = now.getHours(), wd = dow(now);
  const tonight = h < 7 ? { from: now, to: at(now, 0, 7) } : { from: h >= 18 ? now : at(now, 0, 18), to: at(now, 1, 7) };
  const fri = at(now, wd === 7 ? -2 : wd === 6 ? -1 : 5 - wd, 18);
  const weekend = { from: now > fri ? now : fri, to: at(fri, 3, 7) };
  const day = { from: now, to: new Date(+now + 3 * 3600e3) };
  return [
    { key: "tonight", title: "Tonight", sub: `${fmtH(tonight.from)}–${fmtH(tonight.to)}`, ...tonight },
    { key: "weekend", title: "Weekend", sub: `${fmtDay(weekend.from)}–Mon ${fmtH(weekend.to)}`, ...weekend },
    { key: "now", title: "Now", sub: `til ${fmtH(day.to)}`, ...day },
  ];
}

// Opening hours are free text in the toilets dataset; this is the crude reading the real app would need too.
function looOpen(t, d) {
  const h = d.getHours() + d.getMinutes() / 60, wd = dow(d);
  switch (t.hours) {
    case "24 hours": return true;
    case "Daylight hours": return h >= 6 && h < 18.5;
    case "Shop hours": return h >= 9 && h < (wd === 4 ? 21 : 17.5);
    case "First to last train": return h >= 5 || h < 0.5;
    case "Weekdays 7am–10pm": return wd <= 5 && h >= 7 && h < 22;
    default: return true;
  }
}
function nearestLoo(c) {
  return D.toilets.map((t) => ({ ...t, m: metres(mid(c), [t.lon, t.lat]) })).sort((a, b) => a.m - b.m)[0];
}
const gmaps = (c) => `https://www.google.com/maps/search/?api=1&query=${mid(c)[1]},${mid(c)[0]}`;

function plate(r) {
  if (r.kind === "no") return `<span class="plate red">No parking<small>${r.label.replace("No parking ", "")}</small></span>`;
  const [limit, ...rest] = r.label.split(" ");
  return `<span class="plate">${limit}<small>${rest.join(" ")}</small></span>`;
}
const plates = (c) => (c.rules.filter((r) => r.label).map(plate).join("") || `<span class="plate grey">No signs<small>road rules only</small></span>`);

const kerbGeo = (props) => ({
  type: "FeatureCollection",
  features: D.candidates.map((c) => ({ type: "Feature", properties: { id: c.id, ...props(c) }, geometry: { type: "LineString", coordinates: c.line } })),
});
const pointGeo = (props) => ({
  type: "FeatureCollection",
  features: D.candidates.map((c) => ({ type: "Feature", properties: { id: c.id, ...props(c) }, geometry: { type: "Point", coordinates: mid(c) } })),
});

const ALL_POINTS = D.candidates.flatMap((c) => c.line);
const BOUNDS = [
  [Math.min(...ALL_POINTS.map((p) => p[0])), Math.min(...ALL_POINTS.map((p) => p[1]))],
  [Math.max(...ALL_POINTS.map((p) => p[0])), Math.max(...ALL_POINTS.map((p) => p[1]))],
];
function newMap(el, style, padding) {
  return window.__map = new maplibregl.Map({ container: el, style: STYLES[style], bounds: BOUNDS, fitBoundsOptions: { padding },
    attributionControl: { compact: true } });
}

function kerbLayers(map) {
  map.addSource("kerbs", { type: "geojson", data: kerbGeo(() => ({ color: "#888", opacity: 1, rated: 1 })) });
  map.addLayer({ id: "kerb-casing", type: "line", source: "kerbs", layout: { "line-cap": "round" },
    paint: { "line-color": "#000", "line-width": ["interpolate", ["linear"], ["zoom"], 13, 5, 18, 14], "line-opacity": ["*", 0.5, ["get", "opacity"]] } });
  map.addLayer({ id: "kerb", type: "line", source: "kerbs", filter: ["==", ["get", "rated"], 1], layout: { "line-cap": "round" },
    paint: { "line-color": ["get", "color"], "line-width": ["interpolate", ["linear"], ["zoom"], 13, 3, 18, 10], "line-opacity": ["get", "opacity"] } });
  map.addLayer({ id: "kerb-unrated", type: "line", source: "kerbs", filter: ["==", ["get", "rated"], 0],
    paint: { "line-color": ["get", "color"], "line-width": ["interpolate", ["linear"], ["zoom"], 13, 3, 18, 10], "line-opacity": ["get", "opacity"], "line-dasharray": [1, 1] } });
  map.addLayer({ id: "kerb-hit", type: "line", source: "kerbs", paint: { "line-color": "#000", "line-width": 28, "line-opacity": 0 } });
  // Kerb lines vanish at suburb zoom on a phone, so each stretch is also a dot until street zoom.
  map.addSource("kerb-mids", { type: "geojson", data: pointGeo(() => ({ color: "#888", opacity: 1 })) });
  map.addLayer({ id: "kerb-dot", type: "circle", source: "kerb-mids", maxzoom: 15.5, paint: {
    "circle-radius": 7, "circle-color": ["get", "color"], "circle-opacity": ["get", "opacity"],
    "circle-stroke-color": ["coalesce", ["get", "ring"], "#fff"], "circle-stroke-width": ["case", ["has", "ring"], 4, 2], "circle-stroke-opacity": ["get", "opacity"] } });
}
// Layer-scoped listeners live on the map, not the style, so bind them once even if the style is swapped.
function onKerbTap(map, onPick) {
  for (const id of ["kerb-hit", "kerb-dot"]) {
    map.on("click", id, (e) => onPick(e.features[0].properties.id));
    map.on("mouseenter", id, () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", id, () => (map.getCanvas().style.cursor = ""));
  }
}
function setKerbs(map, props) {
  map.getSource("kerbs")?.setData(kerbGeo(props));
  map.getSource("kerb-mids")?.setData(pointGeo(props));
}

function looMarkers(map, when) {
  return D.toilets.map((t) => {
    const el = $(`<div class="loo-pin" title="${t.name} · ${t.hours}">WC</div>`);
    const m = new maplibregl.Marker({ element: el }).setLngLat([t.lon, t.lat]).addTo(map);
    return { t, el, m, update(d) { el.classList.toggle("closed", !looOpen(t, d)); } };
  }).map((x) => (when && x.update(when), x));
}

// Add to home screen. Android Chrome fires beforeinstallprompt; iOS Safari never does, so it needs instructions.
let deferredInstall = null;
addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredInstall = e; });
const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone;
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
function installHelp() {
  if (deferredInstall) { deferredInstall.prompt(); return "Follow the prompt to install parkup."; }
  return isIOS ? "In Safari, tap Share, then Add to Home Screen." : "Open your browser menu, then Install app or Add to Home screen.";
}
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };

// ---------- Variant A: Map and sheet ----------

function VariantA(root) {
  root.append($(`<style>
    .a-top { position: absolute; top: calc(10px + var(--safe-t)); left: 0; right: 0; z-index: 5; display: flex; justify-content: center; gap: 8px; padding: 0 12px; }
    .a-legend { position: absolute; top: calc(70px + var(--safe-t)); left: 50%; transform: translateX(-50%); z-index: 5; display: flex; gap: 10px;
      padding: 4px 10px; border-radius: 999px; background: #1C1A33cc; backdrop-filter: blur(6px); white-space: nowrap; }
    .a-legend .verdict { font-size: 10px; letter-spacing: .03em; }
    .a-sheet { position: absolute; left: 0; right: 0; bottom: 0; z-index: 6; background: var(--surface); border-radius: 18px 18px 0 0;
      padding: 10px 16px calc(64px + var(--safe-b)); box-shadow: 0 -6px 24px #0008; transform: translateY(100%); transition: transform .25s ease-out; max-height: 70%; overflow: auto; }
    .a-sheet.open { transform: none; }
    .a-sheet .grab { width: 40px; height: 5px; border-radius: 3px; background: var(--raise); margin: 0 auto 10px; }
    .a-sheet h2 { margin: 0; font: 800 24px/1.1 var(--display); }
    .a-row { display: flex; gap: 8px; flex-wrap: wrap; margin: 12px 0; }
    .a-loo { display: flex; gap: 10px; align-items: center; margin: 12px 0 16px; padding: 10px; border-radius: 12px; background: var(--raise); }
    .a-install { position: absolute; left: 12px; right: 12px; bottom: calc(52px + var(--safe-b)); z-index: 5; display: flex; gap: 10px; align-items: center;
      padding: 10px 12px; border-radius: 12px; background: #fff; color: var(--ink); font-size: 14px; box-shadow: 0 4px 16px #0009; }
    .a-install button { border: 0; background: var(--ink); color: #fff; border-radius: 8px; padding: 6px 10px; }
    .a-install .x { background: none; color: var(--ink); padding: 6px; }
    @media (prefers-reduced-motion: reduce) { .a-sheet { transition: none; } }
  </style>`));
  const wins = windows();
  let win = wins[0], selected = null;
  const mapEl = root.appendChild($(`<div class="map"></div>`));
  const top = root.appendChild($(`<div class="a-top" role="group" aria-label="When"></div>`));
  const legend = root.appendChild($(`<div class="a-legend kv"></div>`));
  const sheet = root.appendChild($(`<section class="a-sheet" aria-live="polite"></section>`));
  legend.innerHTML = ["good", "maybe", "poor", "none"].map((v) => `<span class="verdict" style="--c:${VERDICT[v].color}">${v === "none" ? "Unrated" : VERDICT[v].label}</span>`).join("")
    + `<span class="verdict" style="--c:#8E8BA844">Faded = not legal</span>`;

  wins.forEach((w) => {
    const b = top.appendChild($(`<button class="plate" aria-pressed="${w === win}">${w.title}<small>${w.sub}</small></button>`));
    b.onclick = () => { win = w; top.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b)); paint(); loos.forEach((l) => l.update(win.from)); if (selected) show(selected); };
  });

  const map = newMap(mapEl, "dark", { top: 110, bottom: 140, left: 20, right: 20 });
  const paint = () => setKerbs(map, (c) => ({
    color: VERDICT[verdictOf(c)].color, rated: c.evaluation ? 1 : 0, opacity: statusOver(c, win) === "no" ? 0.2 : 1,
  }));
  let loos = [];
  onKerbTap(map, (id) => show(D.candidates.find((c) => c.id === id)));
  map.on("load", () => { kerbLayers(map); paint(); loos = looMarkers(map, win.from); });
  map.on("click", (e) => { if (!map.queryRenderedFeatures(e.point, { layers: ["kerb-hit", "kerb-dot"] }).length) { sheet.classList.remove("open"); selected = null; } });

  function show(c) {
    selected = c;
    const v = verdictOf(c), s = statusOver(c, win), loo = nearestLoo(c), ev = c.evaluation;
    sheet.innerHTML = `<div class="grab"></div>
      <span class="verdict" style="--c:${VERDICT[v].color}">${VERDICT[v].label}</span>
      <h2>${c.street}</h2>
      <div class="kv">${c.suburb} · ${c.lengthM} m of kerb · ${c.frontage} frontage</div>
      ${ev ? `<p style="margin:10px 0 0">${ev.summary}</p><ul class="reasons">${ev.reasons.map((r) => `<li>${r}</li>`).join("")}</ul>
        <div class="kv" style="margin-top:6px">Imagery ${ev.imagery} · grade ${ev.slope}%</div>`
        : `<p style="margin:10px 0 0;color:var(--muted)">No evaluation yet. Check it in Google Maps before you go.</p>`}
      <div class="a-row">${plates(c)}</div>
      <div class="kv" style="color:${STATUS[s].color}">${win.title}: ${STATUS[s].label.toLowerCase()}</div>
      <div class="a-loo"><div class="loo-pin${looOpen(loo, win.from) ? "" : " closed"}">WC</div>
        <div><strong>${loo.name}</strong> · ${dist(loo.m)}<div class="kv">${loo.hours}</div></div></div>
      <a class="gmaps" href="${gmaps(c)}" target="_blank" rel="noopener">Open in Google Maps</a>`;
    sheet.classList.add("open");
    map.easeTo({ center: mid(c), offset: [0, -140], duration: 400 });
  }

  if (!standalone() && !store.get("parkup-install-dismissed")) {
    const bar = root.appendChild($(`<div class="a-install"><span style="flex:1">Keep parkup on your home screen.</span><button>Add</button><button class="x" aria-label="Dismiss">✕</button></div>`));
    bar.querySelector("button").onclick = () => { bar.querySelector("span").textContent = installHelp(); };
    bar.querySelector(".x").onclick = () => { store.set("parkup-install-dismissed", "1"); bar.remove(); };
  }
}

// ---------- Variant B: List first ----------

function VariantB(root) {
  root.append($(`<style>
    .b { position: absolute; inset: 0; display: grid; grid-template-rows: auto 38% 1fr; background: var(--ink); }
    .b-head { display: flex; align-items: center; gap: 8px; padding: calc(10px + var(--safe-t)) 12px 10px; }
    .b-head h1 { margin: 0; font: 800 22px var(--display); letter-spacing: -.01em; flex: 1; }
    .b-seg { display: flex; background: var(--surface); border-radius: 10px; padding: 3px; }
    .b-seg button { border: 0; background: none; padding: 6px 10px; border-radius: 8px; font: 700 13px var(--display); color: var(--muted); }
    .b-seg button[aria-pressed="true"] { background: #fff; color: var(--ink); }
    .b-menu { border: 0; background: var(--surface); width: 36px; height: 36px; border-radius: 10px; }
    .b-map { position: relative; }
    .b-toggle { position: absolute; right: 10px; top: 10px; z-index: 2; border: 0; border-radius: 999px; padding: 6px 12px; background: #fff; color: var(--ink); font: 700 13px var(--display); box-shadow: 0 1px 4px #0006; }
    .b-toggle[aria-pressed="false"] { background: #ffffffaa; }
    .b-list { overflow: auto; padding: 8px 12px calc(64px + var(--safe-b)); }
    .b-sub { display: flex; justify-content: space-between; color: var(--muted); font: 500 12px var(--mono); padding: 4px 2px 8px; }
    .b-item { display: block; cursor: pointer; width: 100%; text-align: left; border: 0; background: var(--surface); border-radius: 14px; padding: 12px; margin-bottom: 8px; border-left: 6px solid var(--s); }
    .b-item[aria-expanded="true"] { background: var(--raise); }
    .b-line1 { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
    .b-line1 strong { font: 800 18px var(--display); }
    .b-more { margin-top: 10px; }
    .b-more .rowp { display: flex; gap: 6px; flex-wrap: wrap; margin: 10px 0; }
    .b-dialog { position: absolute; inset: 0; z-index: 9; background: #000a; display: grid; place-items: end center; }
    .b-dialog div { width: 100%; background: var(--surface); border-radius: 18px 18px 0 0; padding: 18px 16px calc(64px + var(--safe-b)); }
  </style>`));
  const wins = windows();
  let win = wins[0], open = null, showLoos = false;
  const el = root.appendChild($(`<div class="b">
    <header class="b-head"><h1>parkup</h1><div class="b-seg" role="group" aria-label="When"></div><button class="b-menu" aria-label="More">⋯</button></header>
    <div class="b-map"><div class="map"></div><button class="b-toggle" aria-pressed="false">WC toilets</button></div>
    <div class="b-list"></div></div>`));
  const seg = el.querySelector(".b-seg"), list = el.querySelector(".b-list");

  wins.forEach((w) => {
    const b = seg.appendChild($(`<button aria-pressed="${w === win}">${w.title}</button>`));
    b.onclick = () => { win = w; seg.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b)); render(); };
  });

  const map = newMap(el.querySelector(".map"), "liberty", 16);
  let loos = [];
  map.on("load", () => {
    map.addSource("pts", { type: "geojson", data: pointGeo(() => ({})) });
    map.addLayer({ id: "pts", type: "circle", source: "pts", filter: ["!", ["get", "hide"]], paint: {
      "circle-radius": ["case", ["get", "sel"], 11, 8], "circle-color": ["get", "color"], "circle-stroke-color": "#fff", "circle-stroke-width": ["case", ["get", "sel"], 4, 2] } });
    map.on("click", "pts", (e) => toggle(e.features[0].properties.id, true));
    loos = looMarkers(map);
    loos.forEach((l) => (l.el.style.display = "none"));
    render();
  });
  el.querySelector(".b-toggle").onclick = (e) => {
    showLoos = !showLoos; e.currentTarget.setAttribute("aria-pressed", showLoos);
    loos.forEach((l) => (l.el.style.display = showLoos ? "" : "none"));
  };

  const rank = { good: 0, maybe: 1, none: 2, poor: 3 };
  function render() {
    map.getSource("pts")?.setData(pointGeo((c) => ({ color: STATUS[statusOver(c, win)].color, sel: c.id === open, hide: statusOver(c, win) === "no" })));
    const rows = D.candidates.map((c) => ({ c, s: statusOver(c, win) })).filter((x) => x.s !== "no")
      .sort((a, b) => rank[verdictOf(a.c)] - rank[verdictOf(b.c)] || metres(CENTRE, mid(a.c)) - metres(CENTRE, mid(b.c)));
    const hidden = D.candidates.length - rows.length;
    list.innerHTML = `<div class="b-sub"><span>${rows.length} kerbs legal ${win.title.toLowerCase()} · ${win.sub}</span><span>${hidden ? `${hidden} hidden` : ""}</span></div>`;
    rows.forEach(({ c, s }) => {
      const v = verdictOf(c), loo = nearestLoo(c), ev = c.evaluation, isOpen = c.id === open;
      const item = list.appendChild($(`<div class="b-item" role="button" tabindex="0" style="--s:${STATUS[s].color}" aria-expanded="${isOpen}">
        <div class="b-line1"><strong>${c.street}</strong><span class="verdict" style="--c:${VERDICT[v].color}">${VERDICT[v].label}</span></div>
        <div class="kv">${c.suburb} · ${c.frontage} · ${STATUS[s].label} · WC ${dist(loo.m)}</div>
        ${isOpen ? `<div class="b-more">
          ${ev ? `<div>${ev.summary}</div><div class="kv" style="margin-top:4px">Imagery ${ev.imagery} · grade ${ev.slope}% · ${c.lengthM} m</div>` : `<div style="color:var(--muted)">No evaluation yet.</div>`}
          <div class="rowp">${plates(c)}</div>
          <div class="kv">Nearest toilet: ${loo.name}, ${dist(loo.m)} · ${loo.hours}</div>
          <a class="gmaps" style="margin-top:10px" href="${gmaps(c)}" target="_blank" rel="noopener">Open in Google Maps</a></div>` : ""}
      </div>`));
      item.onclick = (e) => { if (!e.target.closest("a")) toggle(c.id, false); };
      item.onkeydown = (e) => { if (e.target === item && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); toggle(c.id, false); } };
    });
  }
  function toggle(id, fromMap) {
    open = open === id && !fromMap ? null : id;
    render();
    const c = D.candidates.find((x) => x.id === open);
    if (c) { map.easeTo({ center: mid(c), zoom: 15.5, duration: 400 }); list.querySelector('[aria-expanded="true"]')?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
  }

  el.querySelector(".b-menu").onclick = () => {
    const dlg = el.appendChild($(`<div class="b-dialog"><div>
      <h2 style="margin:0 0 6px;font:800 20px var(--display)">Add parkup to your home screen</h2>
      <p style="margin:0 0 14px;color:var(--muted)">${standalone() ? "parkup is already on your home screen." : "It opens full screen, like an app."}</p>
      ${standalone() ? "" : `<button class="gmaps">Add to home screen</button>`}</div></div>`));
    dlg.onclick = (e) => { if (e.target === dlg) dlg.remove(); };
    dlg.querySelector(".gmaps")?.addEventListener("click", (e) => { e.currentTarget.replaceWith($(`<p>${installHelp()}</p>`)); });
  };
}

// ---------- Variant C: Week clock ----------

function VariantC(root) {
  root.append($(`<style>
    .c-top { position: absolute; top: calc(10px + var(--safe-t)); left: 12px; right: 12px; z-index: 5; display: flex; justify-content: space-between; align-items: flex-start; }
    .c-when { padding: 8px 12px; border-radius: 12px; background: #fff; color: var(--ink); box-shadow: 0 2px 8px #0006; }
    .c-when strong { display: block; font: 800 22px/1 var(--display); }
    .c-base { border: 0; border-radius: 10px; padding: 8px 10px; background: var(--ink); color: #fff; font: 700 13px var(--display); box-shadow: 0 2px 8px #0006; }
    .c-clock { position: absolute; left: 0; right: 0; bottom: 0; z-index: 5; padding: 10px 12px calc(56px + var(--safe-b)); background: var(--ink); border-radius: 18px 18px 0 0; }
    .c-days { display: grid; grid-template-columns: repeat(7, 1fr); font: 700 11px var(--display); color: var(--muted); text-align: center; margin-bottom: 4px; }
    .c-strip { position: relative; height: 44px; border-radius: 10px; overflow: hidden; touch-action: none; background: var(--surface); }
    .c-strip canvas { width: 100%; height: 100%; display: block; }
    .c-needle { position: absolute; top: -4px; bottom: -4px; width: 4px; margin-left: -2px; background: #fff; border-radius: 2px; box-shadow: 0 0 0 2px var(--ink); pointer-events: none; }
    .c-hint { font: 500 11px var(--mono); color: var(--muted); margin-top: 6px; display: flex; justify-content: space-between; }
    .c-page { position: absolute; inset: 0; z-index: 8; background: var(--ink); overflow: auto; transform: translateX(100%); transition: transform .25s ease-out; }
    .c-page.open { transform: none; }
    .c-page img { width: 100%; aspect-ratio: 2 / 1; object-fit: cover; display: block; background: var(--surface); }
    .c-page .in { padding: 16px 16px calc(72px + var(--safe-b)); }
    .c-page h2 { margin: 6px 0 2px; font: 800 30px/1.05 var(--display); }
    .c-back { position: absolute; top: calc(10px + var(--safe-t)); left: 12px; border: 0; border-radius: 999px; padding: 8px 14px; background: var(--ink); color: #fff; font: 700 14px var(--display); }
    .c-week { display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px; margin: 14px 0; }
    .c-week div { height: 70px; border-radius: 4px; overflow: hidden; display: flex; flex-direction: column; }
    .c-week span { flex: 1; }
    @media (prefers-reduced-motion: reduce) { .c-page { transition: none; } }
  </style>`));

  // The strip shows the next 7 days from 00:00 today, hour by hour.
  const start = new Date(); start.setHours(0, 0, 0, 0);
  let t = new Date(); t.setMinutes(0, 0, 0);
  if (t.getHours() < 18) t.setHours(21); // open on tonight
  let base = "positron";

  const mapEl = root.appendChild($(`<div class="map"></div>`));
  const top = root.appendChild($(`<div class="c-top"><div class="c-when"><span class="kv"></span><strong></strong></div><button class="c-base">Satellite</button></div>`));
  const clock = root.appendChild($(`<div class="c-clock">
    <div class="c-days"></div><div class="c-strip"><canvas></canvas><div class="c-needle"></div></div>
    <div class="c-hint"><span>Drag through the week</span><span>Colour: best kerb legal at that hour</span></div></div>`));
  const page = root.appendChild($(`<section class="c-page" aria-live="polite"></section>`));
  const strip = clock.querySelector(".c-strip"), canvas = clock.querySelector("canvas"), needle = clock.querySelector(".c-needle");

  clock.querySelector(".c-days").innerHTML = [...Array(7)].map((_, i) => `<span>${fmtDay(new Date(+start + i * 864e5))}</span>`).join("");

  // Strip colour per hour: how many good/maybe kerbs are legal. Night hours are darker.
  function drawStrip() {
    const w = (canvas.width = strip.clientWidth * 2), h = (canvas.height = strip.clientHeight * 2), g = canvas.getContext("2d");
    for (let i = 0; i < 168; i++) {
      const d = new Date(+start + i * 3600e3), hr = d.getHours();
      const good = D.candidates.filter((c) => verdictOf(c) !== "poor" && c.evaluation && statusAt(c, d) === "ok").length;
      g.fillStyle = good >= 4 ? "#4CC38A" : good >= 2 ? "#F2B84B" : "#E5624A";
      g.globalAlpha = hr >= 18 || hr < 7 ? 0.9 : 0.45;
      g.fillRect((i / 168) * w, h * 0.35, w / 168 + 1, h * 0.65);
      g.globalAlpha = 1;
      g.fillStyle = hr >= 18 || hr < 7 ? "#0E0C1F" : "#4B4770";
      g.fillRect((i / 168) * w, 0, w / 168 + 1, h * 0.3);
    }
  }

  const map = newMap(mapEl, base, { top: 90, bottom: 150, left: 20, right: 20 });
  let loos = [];
  const paint = () => {
    // Fill = legal at the chosen hour; ring = evaluation.
    setKerbs(map, (c) => ({ color: STATUS[statusAt(c, t)].color, ring: VERDICT[verdictOf(c)].color, rated: 1, opacity: 1 }));
  };
  onKerbTap(map, (id) => show(D.candidates.find((c) => c.id === id)));
  map.on("style.load", () => { kerbLayers(map); paint(); });
  map.on("load", () => { loos = looMarkers(map, t); });

  function setT(nt) {
    t = nt;
    needle.style.left = `${((t - start) / (168 * 3600e3)) * 100}%`;
    top.querySelector(".kv").textContent = t.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "short" });
    top.querySelector("strong").textContent = fmtH(t);
    loos.forEach((l) => l.update(t));
    paint();
  }
  const scrub = (e) => {
    const r = strip.getBoundingClientRect(), f = Math.min(Math.max((e.clientX - r.left) / r.width, 0), 0.9999);
    setT(new Date(+start + Math.floor(f * 168) * 3600e3));
  };
  strip.addEventListener("pointerdown", (e) => { strip.setPointerCapture(e.pointerId); scrub(e); });
  strip.addEventListener("pointermove", (e) => { if (e.buttons) scrub(e); });

  top.querySelector(".c-base").onclick = (e) => {
    base = base === "positron" ? "satellite" : "positron";
    e.currentTarget.textContent = base === "positron" ? "Satellite" : "Map";
    map.setStyle(STYLES[base]);
  };

  function show(c) {
    const v = verdictOf(c), ev = c.evaluation, loo = nearestLoo(c), [lon, lat] = mid(c), s = 0.0012;
    const img = `${ESRI}/export?bbox=${lon - s * 2},${lat - s},${lon + s * 2},${lat + s}&bboxSR=4326&imageSR=3857&size=800,400&format=jpg&f=image`;
    const week = [...Array(7)].map((_, i) => `<div title="${fmtDay(new Date(+start + i * 864e5))}">${[...Array(24)].map((_, h) =>
      `<span style="background:${STATUS[statusAt(c, new Date(+start + (i * 24 + h) * 3600e3))].color};opacity:${h >= 18 || h < 7 ? 1 : 0.5}"></span>`).join("")}</div>`).join("");
    page.innerHTML = `<img alt="Satellite view of ${c.street}" src="${img}"><button class="c-back">‹ Map</button>
      <div class="in">
        <span class="verdict" style="--c:${VERDICT[v].color}">${VERDICT[v].label}</span>
        <h2>${c.street}</h2><div class="kv">${c.suburb} · ${c.lengthM} m · ${c.frontage} frontage</div>
        ${ev ? `<p>${ev.summary}</p><ul class="reasons">${ev.reasons.map((r) => `<li>${r}</li>`).join("")}</ul><div class="kv" style="margin-top:6px">Imagery ${ev.imagery} · grade ${ev.slope}%</div>`
          : `<p style="color:var(--muted)">No evaluation yet.</p>`}
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">${plates(c)}</div>
        <div class="c-week">${week}</div>
        <div class="kv" style="margin:-8px 0 14px">Next 7 days, today at left, midnight at top. Solid = night.</div>
        <div style="display:flex;gap:10px;align-items:center;margin-bottom:16px"><div class="loo-pin${looOpen(loo, t) ? "" : " closed"}">WC</div>
          <div><strong>${loo.name}</strong> · ${dist(loo.m)}<div class="kv">${loo.hours} · ${looOpen(loo, t) ? "open" : "closed"} at ${fmtH(t)}</div></div></div>
        <a class="gmaps" href="${gmaps(c)}" target="_blank" rel="noopener">Open in Google Maps</a>
      </div>`;
    page.querySelector(".c-back").onclick = () => page.classList.remove("open");
    page.classList.add("open");
  }

  requestAnimationFrame(() => { drawStrip(); setT(t); });
  addEventListener("resize", drawStrip);
}

// ---------- switcher (prototype only) ----------

const VARIANTS = [["A", "Map and sheet", VariantA], ["B", "List first", VariantB], ["C", "Week clock", VariantC]];
const params = new URLSearchParams(location.search);
const idx = Math.max(0, VARIANTS.findIndex(([k]) => k === (params.get("variant") ?? "A").toUpperCase()));
VARIANTS[idx][2](document.getElementById("app"));

function go(step) {
  params.set("variant", VARIANTS[(idx + step + VARIANTS.length) % VARIANTS.length][0]);
  location.search = params.toString();
}
const sw = $(`<nav id="switcher" aria-label="Prototype variant"><button aria-label="Previous variant">‹</button><span>${VARIANTS[idx][0]} — ${VARIANTS[idx][1]}</span><button aria-label="Next variant">›</button></nav>`);
sw.children[0].onclick = () => go(-1);
sw.children[2].onclick = () => go(1);
document.body.append(sw);
addEventListener("keydown", (e) => {
  if (e.target.closest?.("input, textarea, [contenteditable]")) return;
  if (e.key === "ArrowLeft") go(-1);
  if (e.key === "ArrowRight") go(1);
});
