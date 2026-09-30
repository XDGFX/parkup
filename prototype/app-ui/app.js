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

// ---------- Variant A: Map and sheet, in four visual themes ----------

// Recolour an OpenFreeMap style in place so the base map belongs to the theme, not just the chrome around it.
function recolour(map, p) {
  for (const l of map.getStyle().layers) {
    const id = l.id;
    const set = (k, v) => { try { map.setPaintProperty(id, k, v); } catch {} };
    const hide = () => map.setLayoutProperty(id, "visibility", "none");
    if (l.type === "background") set("background-color", p.land);
    else if (l.type === "symbol") { if (/shield|oneway/.test(id)) hide(); else { set("text-color", p.label); set("text-halo-color", p.halo); } }
    else if (/boundary|aeroway|pier|ice|glacier/.test(id)) hide();
    else if (/water/.test(id)) set(l.type === "fill" ? "fill-color" : "line-color", p.water);
    else if (/park|wood/.test(id)) { set("fill-color", p.park); set("fill-opacity", 1); }
    else if (/residential/.test(id)) { set("fill-color", p.land); }
    else if (/building/.test(id)) { set("fill-color", p.building); set("fill-outline-color", p.building); }
    else if (/rail/.test(id)) set("line-color", p.rail);
    else if (/casing/.test(id)) set("line-color", p.casing);
    else if (/motorway/.test(id)) set("line-color", p.motorway);
    else if (/major/.test(id)) set("line-color", p.major);
    else if (/minor|path/.test(id)) set("line-color", p.minor);
  }
}

const TOILET_PICTO = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor">
  <circle cx="7" cy="4" r="2"/><path d="M5 7h4l1 7H8.6l-.4 7H5.8l-.4-7H4z"/>
  <circle cx="17" cy="4" r="2"/><path d="M15 7h4l2.5 8h-2.3l-.4 6h-3.6l-.4-6h-2.3z"/>
  <path d="M12 2v20" stroke="currentColor" stroke-width="1" /></svg>`;

const THEMES = {
  dusk: {
    // Refined Dusk: an indigo map under a sunset horizon, frosted-glass sheet, serif street names.
    name: "Dusk", base: "dark", sky: true, cta: "Open in Google Maps <span aria-hidden=\"true\">↗</span>",
    glow: { width: 16, blur: 12, opacity: 0.45, stroke: "#15132B" },
    map: { land: "#17152E", water: "#0D1E3A", park: "#16263A", building: "#211E42", minor: "#2A2650", major: "#3A3469",
      motorway: "#4E4380", casing: "#17152E", rail: "#2E2A58", label: "#8680B8", halo: "#17152E" },
    verdict: { good: "#6EE7B7", maybe: "#FFC482", poor: "#FF7A8A", none: "#9D98C7" },
    css: `:root { --ink: #15132B; --surface: rgba(29, 26, 58, .8); --raise: rgba(255, 255, 255, .055); --line: rgba(255, 255, 255, .09);
        --text: #F2EFFF; --muted: #A7A1D2; --glass: rgba(21, 19, 43, .6);
        --peach: #FFB48A; --rose: #F2789F; --violet: #8D6CF0;
        --dusk: linear-gradient(100deg, var(--peach), var(--rose) 55%, var(--violet));
        --display: "Instrument Serif", Georgia, serif; --body: "Geist", system-ui, sans-serif; --mono: "Geist Mono", ui-monospace, monospace; }
      html, body { background: var(--ink); }

      /* The horizon: last light over Brisbane, behind the signs */
      .a-sky { position: absolute; left: 0; right: 0; top: 0; height: 260px; z-index: 4; pointer-events: none;
        background:
          radial-gradient(110% 80% at 50% -25%, rgba(255, 170, 125, .55), rgba(242, 120, 159, .22) 45%, transparent 72%),
          linear-gradient(180deg, rgba(21, 19, 43, .75), rgba(21, 19, 43, 0)); animation: a-sky 1.2s ease-out both; }
      @keyframes a-sky { from { opacity: 0; } }

      /* Only the chosen window is a real sign; the others are etched glass */
      .a-top { top: calc(14px + var(--safe-t)); }
      .a-top button.plate { opacity: 1; transform: none; background: rgba(255, 255, 255, .07); color: rgba(242, 239, 255, .85);
        border: 1.5px solid rgba(255, 255, 255, .28); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); box-shadow: none;
        transition: background .2s, color .2s, box-shadow .2s, transform .2s; animation: a-drop .6s cubic-bezier(.2, .9, .3, 1.2) both; }
      .a-top button.plate:nth-child(2) { animation-delay: .06s; } .a-top button.plate:nth-child(3) { animation-delay: .12s; }
      .a-top button.plate[aria-pressed="true"] { background: #fff; color: var(--plate-green); border: 3px solid currentColor;
        box-shadow: 0 0 0 3px #fff, 0 10px 34px rgba(255, 150, 120, .5); transform: translateY(-1px); }
      @keyframes a-drop { from { opacity: 0; transform: translateY(-14px); } }

      .verdict { font: 600 11px var(--body); letter-spacing: .09em; }
      .a-legend { top: calc(80px + var(--safe-t)); border: 1px solid var(--line); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); color: var(--muted); }
      .a-legend .verdict { font-size: 9.5px; letter-spacing: .08em; }
      .a-legend { flex-wrap: nowrap; border-radius: 999px; padding: 5px 12px; gap: 12px; }

      .a-sheet { left: 8px; right: 8px; bottom: 8px; border-radius: 28px; padding: 12px 20px calc(66px + var(--safe-b));
        background: var(--surface); backdrop-filter: blur(26px) saturate(1.5); -webkit-backdrop-filter: blur(26px) saturate(1.5);
        border: 1px solid var(--line); box-shadow: 0 24px 70px rgba(0, 0, 0, .6); transition: transform .5s cubic-bezier(.2, .95, .25, 1.04); clip-path: inset(0 round 28px); }
      .a-sheet::before { content: ""; position: absolute; left: 28px; right: 28px; top: 0; height: 1px; background: var(--dusk); opacity: .8; }
      .a-sheet .grab { background: rgba(255, 255, 255, .16); width: 36px; height: 4px; margin-bottom: 4px; flex: none; }
      .a-body { padding-top: 10px; padding-bottom: 6px; -webkit-mask-image: linear-gradient(to bottom, transparent, #000 18px, #000 calc(100% - 18px), transparent); mask-image: linear-gradient(to bottom, transparent, #000 18px, #000 calc(100% - 18px), transparent); }
      .a-sheet .verdict { padding: 4px 11px 4px 9px; border-radius: 999px; color: var(--c); background: color-mix(in srgb, var(--c) 15%, transparent); }
      .a-sheet .verdict::before { width: 7px; height: 7px; box-shadow: 0 0 8px var(--c); }
      .a-sheet h2 { font: 400 46px/.95 var(--display); letter-spacing: -.01em; margin: 10px 0 8px; }
      .kv { font: 400 11.5px/1.5 var(--mono); color: var(--muted); letter-spacing: -.01em; }
      .a-sheet p { font-size: 16px; line-height: 1.5; margin-top: 14px !important; }
      ul.reasons { list-style: none; padding: 0; margin: 10px 0 0; }
      ul.reasons li { position: relative; padding-left: 18px; margin: 4px 0; color: var(--muted); font-size: 14.5px; }
      ul.reasons li::before { content: ""; position: absolute; left: 3px; top: .62em; width: 6px; height: 6px; border-radius: 50%; border: 1.5px solid var(--muted); }
      .a-row { margin: 18px 0 10px; }
      .a-loo { border: 1px solid var(--line); border-radius: 18px; padding: 12px 14px; margin: 16px 0 8px; background: var(--raise); }
      .a-loo strong { font-weight: 600; }
      .gmaps { background: var(--dusk); color: #1B1233; font: 600 16px var(--body); border-radius: 18px; min-height: 54px; letter-spacing: .01em;
        box-shadow: 0 12px 32px rgba(242, 120, 159, .35), inset 0 1px 0 rgba(255, 255, 255, .45); }
      .loo-pin { width: 20px; height: 20px; border-radius: 50%; background: rgba(21, 19, 43, .85); color: #A9D2FF; border: 1px solid rgba(169, 210, 255, .55);
        font: 700 7.5px var(--body); letter-spacing: .02em; box-shadow: 0 2px 10px rgba(0, 0, 0, .45); }
      .a-loo .loo-pin { width: 34px; height: 34px; font-size: 11px; }
      .loo-pin.closed { color: #625D8F; border-color: rgba(98, 93, 143, .6); }
      .a-install { left: 10px; right: 10px; border-radius: 20px; background: var(--surface); color: var(--text); border: 1px solid var(--line);
        backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); box-shadow: 0 16px 40px rgba(0, 0, 0, .5); }
      .a-install button { background: var(--dusk); color: #1B1233; font-weight: 600; border-radius: 12px; padding: 7px 14px; }
      .a-install .x { background: none; color: var(--muted); }
      .maplibregl-ctrl-attrib { background: rgba(21, 19, 43, .6) !important; color: var(--muted); }
      .maplibregl-ctrl-attrib a { color: var(--muted); }
      .maplibregl-ctrl-attrib-button { filter: invert(1) opacity(.6); }
      @media (prefers-reduced-motion: reduce) { .a-sky, .a-top button.plate { animation: none; } }`,
  },

  duskFirst: {
    name: "Dusk, first cut", base: "dark", map: null,
    verdict: { good: "#4CC38A", maybe: "#F2B84B", poor: "#E5624A", none: "#8E8BA8" },
    css: `:root { --glass: #1C1A33cc; }`,
  },

  // Night drive: warm black map, kerbs glow like pools of streetlight, frosted glass instead of solid slabs.
  sodium: {
    name: "Sodium", base: "dark", glow: true,
    map: { land: "#14110E", water: "#0A1820", park: "#141C10", building: "#1D1813", minor: "#2A2119", major: "#3E2C18",
      motorway: "#523515", casing: "#14110E", rail: "#2A2420", label: "#8F7F6D", halo: "#14110E" },
    verdict: { good: "#C3F27A", maybe: "#FFB547", poor: "#FF6F59", none: "#857A6C" },
    css: `:root { --ink: #14110E; --surface: rgba(30, 24, 18, .78); --raise: rgba(255, 181, 71, .09); --text: #F6EADB; --muted: #A8998A;
        --glass: rgba(20, 17, 14, .7); --accent: #FFB547;
        --display: "Bricolage Grotesque", system-ui, sans-serif; --body: "Instrument Sans", system-ui, sans-serif; --mono: "Martian Mono", monospace; }
      .a-sheet { left: 8px; right: 8px; bottom: 8px; border-radius: 24px; backdrop-filter: blur(18px) saturate(1.3); -webkit-backdrop-filter: blur(18px) saturate(1.3);
        border: 1px solid rgba(255, 181, 71, .22); box-shadow: 0 10px 40px #000a; }
      .a-sheet h2 { font: 800 32px/1 var(--display); letter-spacing: -.025em; font-variation-settings: "opsz" 96; }
      .a-legend { backdrop-filter: blur(12px); border: 1px solid rgba(255, 181, 71, .15); }
      .kv { font-size: 11px; letter-spacing: -.01em; }
      .gmaps { background: var(--accent); color: #14110E; font-family: var(--display); border-radius: 16px; box-shadow: 0 0 24px rgba(255, 181, 71, .35); }
      .loo-pin { background: rgba(10, 24, 32, .8); color: #8CD3FF; border: 1.5px solid #8CD3FF; box-shadow: 0 0 12px #8CD3FF77; border-radius: 50%; }
      .loo-pin.closed { color: #5C5248; border-color: #5C5248; box-shadow: none; background: rgba(20, 17, 14, .8); }
      button.plate[aria-pressed="true"] { box-shadow: 0 0 0 3px var(--ink), 0 0 22px 6px rgba(255, 181, 71, .55); }
      .a-install { background: var(--surface); color: var(--text); backdrop-filter: blur(16px); border: 1px solid rgba(255, 181, 71, .22); }
      .a-install button { background: var(--accent); color: #14110E; } .a-install .x { color: var(--text); background: none; }`,
  },

  // Daytime: Australian brown tourist signs for the sheet header and toilet pins, on a soft eucalypt map.
  tourist: {
    name: "Tourist sign", base: "positron",
    map: { land: "#EDEFE3", water: "#A3CEDC", park: "#CADDB8", building: "#DEE0D3", minor: "#FFFFFF", major: "#FBF8EE",
      motorway: "#F3E6C4", casing: "#CFC8B3", rail: "#BDB7A6", label: "#5E5849", halo: "#EDEFE3" },
    verdict: { good: "#23915A", maybe: "#D8920F", poor: "#C8412B", none: "#9A9486" },
    head: (c) => `<div class="t-sign"><div><div class="t-street">${c.street}</div><div class="t-sub">${c.suburb} · ${c.lengthM} m · ${c.frontage} frontage</div></div>
      <div class="t-arrow" aria-hidden="true">➜</div></div>`,
    loo: TOILET_PICTO,
    css: `:root { --ink: #2B2118; --surface: #FFFFFF; --raise: #F3F0E8; --text: #2B2118; --muted: #756A5C; --glass: rgba(255, 255, 255, .92); --brown: #6A3D1C;
        --display: "Gabarito", system-ui, sans-serif; --body: "Figtree", system-ui, sans-serif; --mono: "Red Hat Mono", monospace; }
      html, body { background: #EDEFE3; }
      .a-sheet { padding-top: 0; box-shadow: 0 -8px 30px rgba(43, 33, 24, .25); border-radius: 20px 20px 0 0; overflow: auto; }
      .a-sheet .grab { background: rgba(255, 255, 255, .5); position: absolute; left: 50%; top: 6px; transform: translateX(-50%); margin: 0; }
      .t-sign { margin: 0 -16px 14px; padding: 22px 18px 16px; background: var(--brown); color: #fff; display: flex; align-items: center; gap: 12px;
        border-bottom: 4px solid #fff; box-shadow: 0 4px 0 var(--brown); }
      .t-sign > div:first-child { flex: 1; }
      .t-street { font: 800 30px/1 var(--display); letter-spacing: -.01em; }
      .t-sub { font: 600 14px var(--body); opacity: .85; margin-top: 4px; }
      .t-arrow { font-size: 30px; line-height: 1; }
      .a-sheet h2, .a-sheet .a-meta { display: none; }
      .a-legend { color: var(--text); box-shadow: 0 2px 10px rgba(43, 33, 24, .2); }
      .kv { color: var(--muted); }
      .gmaps { background: var(--brown); color: #fff; font-family: var(--display); }
      .a-loo { background: var(--raise); }
      .loo-pin { width: 26px; height: 26px; border-radius: 4px; background: var(--brown); color: #fff; border: 2px solid #fff; box-shadow: 0 1px 4px rgba(0, 0, 0, .35); }
      .loo-pin.closed { background: #B3A897; }
      button.plate { box-shadow: 0 2px 6px rgba(43, 33, 24, .25); }
      button.plate[aria-pressed="true"] { box-shadow: 0 0 0 3px #EDEFE3, 0 0 0 5px var(--brown); }
      .a-install { color: var(--text); border: 1px solid #E2DCCD; }
      .a-install button { background: var(--brown); }`,
  },

  // A 90s paper street directory: yellow and red roads, printed cards with hard shadows, and a page grid reference for every kerb.
  directory: {
    name: "Street directory", base: "positron", grid: true,
    map: { land: "#FBF6DC", water: "#9FD3EA", park: "#B9E09C", building: "#EFE6C2", minor: "#FFFFFF", major: "#F6CF3F",
      motorway: "#E4546A", casing: "#6B6250", rail: "#3D3A33", label: "#1D1B16", halo: "#FBF6DC" },
    verdict: { good: "#15924B", maybe: "#EE8F00", poor: "#D7263D", none: "#8C8878" },
    head: (c) => `<div class="d-head"><span class="d-ref">Map 20 · ${gridRef(mid(c))}</span></div>`,
    css: `:root { --ink: #1B1A16; --surface: #FFFEF7; --raise: #FFF3BF; --text: #1B1A16; --muted: #5A5546; --glass: #FFFEF7; --red: #D7263D;
        --display: "Archivo", system-ui, sans-serif; --body: "Archivo", system-ui, sans-serif; --mono: "Archivo", sans-serif; }
      html, body { background: #FBF6DC; }
      .a-top { top: calc(26px + var(--safe-t)); }
      .a-legend { top: calc(86px + var(--safe-t)); border: 1.5px solid var(--ink); border-radius: 3px; box-shadow: 2px 2px 0 var(--ink); }
      .a-sheet { left: 6px; right: 6px; border: 2px solid var(--ink); border-bottom: 0; border-radius: 6px 6px 0 0; box-shadow: 0 -2px 0 var(--ink); }
      .a-sheet .grab { background: var(--ink); height: 3px; }
      .a-sheet h2 { font: 900 34px/0.95 var(--display); font-stretch: 70%; text-transform: uppercase; letter-spacing: .005em; margin-top: 6px; }
      .d-head { display: flex; align-items: center; justify-content: space-between; }
      .d-ref { background: #F6CF3F; border: 2px solid var(--ink); padding: 2px 8px; font: 900 15px var(--display); font-stretch: 75%; text-transform: uppercase; box-shadow: 2px 2px 0 var(--ink); }
      .kv { font-family: var(--display); font-stretch: 80%; font-size: 13px; font-weight: 500; }
      .verdict { font-stretch: 80%; }
      .gmaps { background: var(--red); color: #fff; border: 2px solid var(--ink); border-radius: 4px; box-shadow: 3px 3px 0 var(--ink); font: 900 18px var(--display); font-stretch: 80%; text-transform: uppercase; }
      .a-loo { background: var(--raise); border: 1.5px solid var(--ink); border-radius: 4px; }
      .loo-pin { border-radius: 2px; background: #1E5DAE; color: #fff; border: 1.5px solid #fff; box-shadow: 0 0 0 1px #1E5DAE; width: 20px; height: 20px; font-size: 9px; }
      .loo-pin.closed { background: #9C9887; box-shadow: 0 0 0 1px #9C9887; }
      button.plate { box-shadow: 2px 2px 0 var(--ink); }
      button.plate[aria-pressed="true"] { box-shadow: 3px 3px 0 var(--ink); }
      .a-install { border: 2px solid var(--ink); border-radius: 4px; box-shadow: 3px 3px 0 var(--ink); }
      .d-ruler { position: absolute; z-index: 4; background: #FFFEF7; color: var(--ink); font: 800 10px var(--display); font-stretch: 75%; overflow: hidden; pointer-events: none; }
      .d-ruler.top { top: 0; left: 0; right: 0; height: calc(16px + var(--safe-t)); border-bottom: 1.5px solid var(--ink); }
      .d-ruler.left { top: calc(16px + var(--safe-t)); bottom: 0; left: 0; width: 16px; border-right: 1.5px solid var(--ink); }
      .d-ruler span { position: absolute; transform: translate(-50%, -50%); }
      .d-ruler.top span { bottom: 0; top: auto; transform: translate(-50%, -2px); }
      .d-ruler.left span { left: 8px; }`,
  },
};

// Street-directory grid: ~450 m cells anchored on the candidates' bounding box. Letters skip I and O, as directories do.
const GRID = { lon0: BOUNDS[0][0] - 0.004, lat0: BOUNDS[1][1] + 0.004, size: 0.0045, letters: "ABCDEFGHJKLMNPQRSTUVWXYZ" };
const gridCol = (lon) => Math.floor((lon - GRID.lon0) / GRID.size);
const gridRow = (lat) => Math.floor((GRID.lat0 - lat) / GRID.size);
const gridRef = ([lon, lat]) => `${GRID.letters[gridCol(lon)] ?? "?"}${gridRow(lat) + 1}`;

function gridLayer(map, root) {
  const lines = [];
  for (let i = -2; i < 20; i++) {
    const lon = GRID.lon0 + i * GRID.size, lat = GRID.lat0 - i * GRID.size;
    lines.push([[lon, -27.6], [lon, -27.4]], [[152.9, lat], [153.1, lat]]);
  }
  map.addSource("grid", { type: "geojson", data: { type: "Feature", geometry: { type: "MultiLineString", coordinates: lines } } });
  map.addLayer({ id: "grid", type: "line", source: "grid", paint: { "line-color": "#4F86C6", "line-width": 1, "line-opacity": 0.45 } }, "kerb-casing");
  const top = root.appendChild($(`<div class="d-ruler top"></div>`)), left = root.appendChild($(`<div class="d-ruler left"></div>`));
  const draw = () => {
    const c = map.getCenter();
    top.innerHTML = [...Array(16)].map((_, i) => {
      const x = map.project([GRID.lon0 + (i + 0.5) * GRID.size, c.lat]).x;
      return `<span style="left:${x}px">${GRID.letters[i]}</span>`;
    }).join("");
    left.innerHTML = [...Array(16)].map((_, i) => {
      const y = map.project([c.lng, GRID.lat0 - (i + 0.5) * GRID.size]).y - 16;
      return `<span style="top:${y}px">${i + 1}</span>`;
    }).join("");
  };
  map.on("move", draw);
  draw();
}

function VariantA(root, theme = THEMES.dusk) {
  root.append($(`<style>
    .a-top { position: absolute; top: calc(10px + var(--safe-t)); left: 0; right: 0; z-index: 5; display: flex; justify-content: center; gap: 8px; padding: 0 12px; }
    .a-top .plate { font-family: "Overpass", sans-serif; }
    .a-top .plate small { font-family: "Overpass", sans-serif; }
    .a-legend { position: absolute; top: calc(70px + var(--safe-t)); left: 50%; transform: translateX(-50%); z-index: 5; display: flex; flex-wrap: wrap; justify-content: center; gap: 2px 10px;
      width: max-content; max-width: calc(100% - 24px); padding: 4px 12px; border-radius: 14px; background: var(--glass); backdrop-filter: blur(6px); white-space: nowrap; }
    .a-legend .verdict { font-size: 10px; letter-spacing: .03em; }
    .a-sheet { position: absolute; left: 0; right: 0; bottom: 0; z-index: 6; background: var(--surface); border-radius: 18px 18px 0 0; color: var(--text);
      padding: 10px 16px calc(64px + var(--safe-b)); box-shadow: 0 -6px 24px #0008; transform: translateY(110%); transition: transform .25s ease-out; max-height: 72%; overflow: hidden; display: flex; flex-direction: column; }
    .a-body { overflow: auto; min-height: 0; overscroll-behavior: contain; }
    .a-sheet > .gmaps { flex: none; margin-top: 12px; }
    .a-sheet.open { transform: none; }
    .a-sheet .grab { width: 40px; height: 5px; border-radius: 3px; background: var(--raise); margin: 0 auto 10px; }
    .a-sheet h2 { margin: 0; font: 800 24px/1.1 var(--display); }
    .a-row { display: flex; gap: 8px; flex-wrap: wrap; margin: 12px 0; }
    .a-row .plate, .a-row .plate small { font-family: "Overpass", sans-serif; }
    .a-caption { position: absolute; top: calc(112px + var(--safe-t)); left: 0; right: 0; z-index: 5; text-align: center; pointer-events: none;
      font: 500 11px var(--body); color: var(--muted); text-shadow: 0 1px 6px var(--ink); }
    .a-loo { display: flex; gap: 10px; align-items: center; margin: 12px 0 16px; padding: 10px; border-radius: 12px; background: var(--raise); }
    .a-install { position: absolute; left: 12px; right: 12px; bottom: calc(52px + var(--safe-b)); z-index: 5; display: flex; gap: 10px; align-items: center;
      padding: 10px 12px; border-radius: 12px; background: #fff; color: var(--ink); font-size: 14px; box-shadow: 0 4px 16px #0009; }
    .a-install button { border: 0; background: var(--ink); color: #fff; border-radius: 8px; padding: 6px 10px; }
    .a-install .x { background: none; color: var(--ink); padding: 6px; }
    .a-pulse { width: 16px; height: 16px; border-radius: 50%; border: 2px solid #fff; background: var(--c); animation: a-pulse 1.8s ease-out infinite; }
    @keyframes a-pulse { from { box-shadow: 0 0 0 0 color-mix(in srgb, var(--c) 70%, transparent); } to { box-shadow: 0 0 0 26px transparent; } }
    @media (prefers-reduced-motion: reduce) { .a-sheet { transition: none; } .a-pulse { animation: none; box-shadow: 0 0 0 6px color-mix(in srgb, var(--c) 40%, transparent); } }
  </style>`));
  root.append($(`<style>${theme.css}</style>`)); // after the base styles so the theme wins
  const V = theme.verdict, S = { ok: V.good, limited: V.maybe, no: V.poor };
  const wins = windows();
  let win = wins[0], selected = null;
  const mapEl = root.appendChild($(`<div class="map"></div>`));
  if (theme.sky) root.append($(`<div class="a-sky" aria-hidden="true"></div>`));
  const top = root.appendChild($(`<div class="a-top" role="group" aria-label="When"></div>`));
  const legend = root.appendChild($(`<div class="a-legend kv"></div>`));
  const sheet = root.appendChild($(`<section class="a-sheet" aria-live="polite"></section>`));
  legend.innerHTML = ["good", "maybe", "poor", "none"].map((v) => `<span class="verdict" style="--c:${V[v]}">${v === "none" ? "Not evaluated" : VERDICT[v].label}</span>`).join("");
  const caption = root.appendChild($(`<div class="a-caption"></div>`));
  const setCaption = () => (caption.textContent = `Faded kerbs aren't legal ${win.key === "now" ? "for the next 3 hours" : win.title.toLowerCase()}`);
  setCaption();

  wins.forEach((w) => {
    const b = top.appendChild($(`<button class="plate" aria-pressed="${w === win}">${w.title}<small>${w.sub}</small></button>`));
    b.onclick = () => { win = w; top.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b)); paint(); setCaption(); loos.forEach((l) => l.update(win.from)); if (selected) show(selected); };
  });

  const map = newMap(mapEl, theme.base, { top: theme.grid ? 130 : 110, bottom: 140, left: 30, right: 20 });
  const paint = () => setKerbs(map, (c) => ({
    color: V[verdictOf(c)], rated: c.evaluation ? 1 : 0, opacity: statusOver(c, win) === "no" ? 0.2 : 1,
  }));
  let loos = [];
  onKerbTap(map, (id) => show(D.candidates.find((c) => c.id === id)));
  map.on("load", () => {
    if (theme.map) recolour(map, theme.map);
    kerbLayers(map);
    if (theme.glow) {
      const g = theme.glow === true ? { width: 22, blur: 14, opacity: 0.55, stroke: "#14110E" } : theme.glow;
      map.addLayer({ id: "kerb-glow", type: "line", source: "kerbs", layout: { "line-cap": "round" },
        paint: { "line-color": ["get", "color"], "line-width": g.width, "line-blur": g.blur, "line-opacity": ["*", g.opacity, ["get", "opacity"]] } }, "kerb-casing");
      map.addLayer({ id: "dot-glow", type: "circle", source: "kerb-mids", maxzoom: 15.5,
        paint: { "circle-color": ["get", "color"], "circle-radius": g.width, "circle-blur": 1, "circle-opacity": ["*", g.opacity, ["get", "opacity"]] } }, "kerb-dot");
      map.setPaintProperty("kerb-dot", "circle-stroke-color", g.stroke);
    }
    if (theme.grid) gridLayer(map, root);
    paint();
    loos = looMarkers(map, win.from);
    if (theme.loo) loos.forEach((l) => (l.el.innerHTML = theme.loo));
  });
  map.on("click", (e) => { if (!map.queryRenderedFeatures(e.point, { layers: ["kerb-hit", "kerb-dot"] }).length) { sheet.classList.remove("open"); selected = null; pulse.remove(); } });
  // A soft pulsing ring marks the chosen kerb stretch while its sheet is open.
  const pulse = new maplibregl.Marker({ element: $(`<div class="a-pulse" aria-hidden="true"></div>`) });

  function show(c) {
    selected = c;
    const v = verdictOf(c), s = statusOver(c, win), loo = nearestLoo(c), ev = c.evaluation;
    sheet.innerHTML = `<div class="grab"></div><div class="a-body">
      ${theme.head ? theme.head(c) : ""}
      <span class="verdict" style="--c:${V[v]}">${VERDICT[v].label}</span>
      <h2>${c.street}</h2>
      <div class="kv a-meta">${c.suburb} · ${c.lengthM} m of kerb · ${c.frontage} frontage</div>
      ${ev ? `<p style="margin:10px 0 0">${ev.summary}</p><ul class="reasons">${ev.reasons.map((r) => `<li>${r}</li>`).join("")}</ul>
        <div class="kv" style="margin-top:6px">Imagery ${ev.imagery} · grade ${ev.slope}%</div>`
        : `<p style="margin:10px 0 0;color:var(--muted)">No evaluation yet. Look at it in Google Maps before you go.</p>`}
      <div class="a-row">${plates(c)}</div>
      <div class="kv" style="color:${S[s]}">${win.title}: ${STATUS[s].label.toLowerCase()}</div>
      <div class="a-loo"><div class="loo-pin${looOpen(loo, win.from) ? "" : " closed"}">${theme.loo ?? "WC"}</div>
        <div><strong>${loo.name}</strong> · ${dist(loo.m)}<div class="kv">${loo.hours}</div></div></div>
      </div><a class="gmaps" href="${gmaps(c)}" target="_blank" rel="noopener">${theme.cta ?? "Open in Google Maps"}</a>`;
    sheet.classList.add("open");
    pulse.getElement().style.setProperty("--c", V[v]);
    pulse.setLngLat(mid(c)).addTo(map);
    map.easeTo({ center: mid(c), offset: [0, -170], duration: 600 });
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

// The arrows compare refined Dusk with its first cut. The other themes and layouts stay reachable by URL.
const VARIANTS = [
  ["A1", "Dusk", (r) => VariantA(r, THEMES.dusk)],
  ["A0", "Dusk, first cut", (r) => VariantA(r, THEMES.duskFirst)],
];
const OTHERS = [
  ["A2", "Sodium", (r) => VariantA(r, THEMES.sodium)],
  ["A3", "Tourist sign", (r) => VariantA(r, THEMES.tourist)],
  ["A4", "Street directory", (r) => VariantA(r, THEMES.directory)],
  ["B", "List first", VariantB],
  ["C", "Week clock", VariantC],
];
const params = new URLSearchParams(location.search);
const want = (params.get("variant") ?? "A1").toUpperCase().replace(/^A$/, "A1");
const current = [...VARIANTS, ...OTHERS].find(([k]) => k === want) ?? VARIANTS[0];
const idx = Math.max(0, VARIANTS.indexOf(current));
current[2](document.getElementById("app"));

function go(step) {
  params.set("variant", VARIANTS[(idx + step + VARIANTS.length) % VARIANTS.length][0]);
  location.search = params.toString();
}
const sw = $(`<nav id="switcher" aria-label="Prototype variant"><button aria-label="Previous variant">‹</button><span>${current[0]} — ${current[1]}</span><button aria-label="Next variant">›</button></nav>`);
sw.children[0].onclick = () => go(-1);
sw.children[2].onclick = () => go(1);
document.body.append(sw);
addEventListener("keydown", (e) => {
  if (e.target.closest?.("input, textarea, [contenteditable]")) return;
  if (e.key === "ArrowLeft") go(-1);
  if (e.key === "ArrowRight") go(1);
});
