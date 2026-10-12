// The plate: a figure with its title, notes, sources and verification
// receipt, as one self-contained HTML page (fonts embedded, no network).
import { fontFaceCss, FAMILIES } from "./fonts.mjs";
import { esc, listJoin } from "./text.mjs";
import { citeLabel } from "./model.mjs";

export const CSS = `
:root{
  --bt-paper:#F4F1EA; --bt-card:#FFFDF8; --bt-plate:#FBF9F4;
  --bt-ink:#1C1B19; --bt-ink-2:#4B4842; --bt-ink-3:#736E66; --bt-ink-4:#B3ADA2;
  --bt-rule:#D9D3C6; --bt-rule-2:#E8E3D8; --bt-line:#5E5A52;
  --bt-ok:#2C6A4D; --bt-ok-wash:#E9F1EA; --bt-ok-line:#A9C9B4;
  --bt-flag:#B5431D; --bt-flag-wash:#FBEDE5; --bt-flag-line:#E7B39C;
  --bt-ask:#93650C; --bt-ask-wash:#F8F0DC; --bt-ask-line:#E2C98F;
  --bt-info:#3E5873; --bt-info-wash:#E9EEF4;
  --bt-shadow:0 1px 0 rgba(28,27,25,.04), 0 10px 30px -18px rgba(28,27,25,.25);
  color-scheme:light;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --bt-paper:#121211; --bt-card:#1C1B19; --bt-plate:#171715;
  --bt-ink:#EFEADF; --bt-ink-2:#C2BCB0; --bt-ink-3:#8F897E; --bt-ink-4:#5F5A52;
  --bt-rule:#34312C; --bt-rule-2:#2A2824; --bt-line:#ABA598;
  --bt-ok:#86C6A1; --bt-ok-wash:rgba(134,198,161,.075); --bt-ok-line:rgba(134,198,161,.38);
  --bt-flag:#F2936B; --bt-flag-wash:rgba(242,147,107,.10); --bt-flag-line:rgba(242,147,107,.55);
  --bt-ask:#E4B860; --bt-ask-wash:rgba(228,184,96,.10); --bt-ask-line:rgba(228,184,96,.5);
  --bt-info:#9FB8D6; --bt-info-wash:rgba(159,184,214,.10);
  --bt-shadow:0 1px 0 rgba(0,0,0,.3), 0 14px 34px -20px rgba(0,0,0,.8);
  color-scheme:dark;
}}
:root[data-theme="dark"]{
  --bt-paper:#121211; --bt-card:#1C1B19; --bt-plate:#171715;
  --bt-ink:#EFEADF; --bt-ink-2:#C2BCB0; --bt-ink-3:#8F897E; --bt-ink-4:#5F5A52;
  --bt-rule:#34312C; --bt-rule-2:#2A2824; --bt-line:#ABA598;
  --bt-ok:#86C6A1; --bt-ok-wash:rgba(134,198,161,.075); --bt-ok-line:rgba(134,198,161,.38);
  --bt-flag:#F2936B; --bt-flag-wash:rgba(242,147,107,.10); --bt-flag-line:rgba(242,147,107,.55);
  --bt-ask:#E4B860; --bt-ask-wash:rgba(228,184,96,.10); --bt-ask-line:rgba(228,184,96,.5);
  --bt-info:#9FB8D6; --bt-info-wash:rgba(159,184,214,.10);
  --bt-shadow:0 1px 0 rgba(0,0,0,.3), 0 14px 34px -20px rgba(0,0,0,.8);
  color-scheme:dark;
}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bt-paper);color:var(--bt-ink)}
body{font-family:${FAMILIES.sans};-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision;padding:40px 16px 56px}
.bt-plate{max-width:var(--bt-w);margin:0 auto;background:var(--bt-plate);border:1px solid var(--bt-rule);border-radius:18px;box-shadow:var(--bt-shadow);overflow:hidden}
.bt-head{display:grid;grid-template-columns:1fr auto;gap:8px 32px;padding:30px 36px 6px}
.bt-fig{font:500 11.5px/1 ${FAMILIES.mono};letter-spacing:.08em;color:var(--bt-ink-3);text-transform:uppercase;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.bt-fig b{font-weight:500;color:var(--bt-ink);margin-right:4px}
.bt-fig i{font-style:normal;color:var(--bt-ink-4)}
.bt-kicker{grid-column:1/-1;margin:18px 0 -6px;font:500 13px/1.3 ${FAMILIES.sans};color:var(--bt-ok)}
.bt-asof{font:400 11.5px/1 ${FAMILIES.mono};color:var(--bt-ink-3);letter-spacing:.04em;text-align:right;align-self:center}
.bt-title{grid-column:1/-1;margin:14px 0 0;font:400 38px/1.12 ${FAMILIES.serif};letter-spacing:-.012em;color:var(--bt-ink);max-width:24em;text-wrap:balance}
.bt-sub{grid-column:1/-1;margin:10px 0 0;font:400 16px/1.5 ${FAMILIES.sans};color:var(--bt-ink-2);max-width:46em;text-wrap:pretty}
.bt-canvas{padding:10px 10px 0;overflow-x:auto}
.bt-canvas svg{display:block;width:100%;height:auto;max-width:var(--bt-svg-w);margin:0 auto}
.bt-swipe{display:none;margin:8px 16px 0;font:400 12.5px/1.4 ${FAMILIES.sans};color:var(--bt-ink-3)}
.bt-legend{display:flex;flex-wrap:wrap;gap:8px 22px;padding:6px 36px 18px;font:400 12.5px/1.3 ${FAMILIES.sans};color:var(--bt-ink-3)}
.bt-legend span{display:inline-flex;align-items:center;gap:8px}
.bt-legend svg{flex:none}
.bt-notes{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:0;border-top:1px solid var(--bt-rule)}
.bt-note{padding:20px 24px 22px 36px;border-right:1px solid var(--bt-rule-2);position:relative}
.bt-note:last-child{border-right:0}
.bt-note h3{margin:0 0 6px;font:600 15px/1.35 ${FAMILIES.sans};color:var(--bt-ink);display:flex;gap:10px;align-items:flex-start}
.bt-note p{margin:0 0 0 30px;font:400 14px/1.55 ${FAMILIES.sans};color:var(--bt-ink-2);text-wrap:pretty}
.bt-letter{flex:none;width:20px;height:20px;border-radius:50%;display:inline-grid;place-items:center;font:600 11px/1 ${FAMILIES.sans};color:var(--bt-plate);margin-top:0}
.bt-letter.flag{background:var(--bt-flag)} .bt-letter.ask{background:var(--bt-ask)} .bt-letter.info{background:none;color:var(--bt-ink-2);box-shadow:inset 0 0 0 1.4px var(--bt-ink-3)}
.bt-note.flag{background:linear-gradient(var(--bt-flag-wash),var(--bt-flag-wash))}
.bt-note-hit{box-shadow:inset 3px 0 0 var(--bt-ink)}
.bt-node{cursor:pointer}
.bt-foot{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(0,1fr);gap:28px;padding:22px 36px 26px;border-top:1px solid var(--bt-rule);background:var(--bt-plate)}
.bt-foot h4{margin:0 0 10px;font:500 11px/1 ${FAMILIES.mono};letter-spacing:.08em;text-transform:uppercase;color:var(--bt-ink-3)}
.bt-sources{margin:0;padding:0;list-style:none;columns:2 260px;column-gap:28px;font:400 12.5px/1.45 ${FAMILIES.sans};color:var(--bt-ink-2)}
.bt-sources li{break-inside:avoid;margin:0 0 6px;padding-left:0}
.bt-sources b{font:500 11.5px/1 ${FAMILIES.mono};color:var(--bt-ink);margin-right:6px}
.bt-receipt{margin:0;padding:0;list-style:none;font:400 12.5px/1.45 ${FAMILIES.sans};color:var(--bt-ink-2)}
.bt-receipt li{display:flex;gap:8px;margin:0 0 5px}
.bt-receipt li::before{content:"";flex:none;width:7px;height:7px;border-radius:50%;margin-top:6px;background:var(--bt-ok)}
.bt-receipt li.open::before{background:var(--bt-ask)}
.bt-foot.bt-has-missing{grid-template-columns:minmax(0,1.7fr) minmax(0,1fr) minmax(0,1fr)}
.bt-law{grid-column:1/-1;margin:0;font:400 12px/1.5 ${FAMILIES.sans};color:var(--bt-ink-3)} .bt-law b{font:500 11px ${FAMILIES.mono};letter-spacing:.07em;text-transform:uppercase;margin-right:8px;color:var(--bt-ink-3)}
.bt-disclaimer{grid-column:1/-1;margin:2px 0 0;padding-top:14px;border-top:1px dashed var(--bt-rule);font:400 12px/1.5 ${FAMILIES.sans};color:var(--bt-ink-3);display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap}
.bt-mark{font:500 11px/1.5 ${FAMILIES.mono};letter-spacing:.06em;color:var(--bt-ink-3)}

/* SVG */
.bt-figure text{font-family:${FAMILIES.sans}}
.bt-card{fill:var(--bt-card);stroke:var(--bt-rule);stroke-width:1}
.bt-k-person.bt-card{fill:var(--bt-plate);stroke:var(--bt-line);stroke-width:1.1}
.bt-k-group.bt-card{fill:var(--bt-rule-2);stroke:var(--bt-rule)}
.bt-t-flag.bt-card{stroke:var(--bt-flag);stroke-width:1.6}
.bt-t-ask.bt-card{stroke:var(--bt-ask);stroke-width:1.4;stroke-dasharray:5 4}
.bt-deco{fill:none;stroke:var(--bt-rule);stroke-width:1}
.bt-disc{fill:var(--bt-card);stroke:var(--bt-line);stroke-width:1}
.bt-initials{font:600 12px ${FAMILIES.sans};fill:var(--bt-ink);letter-spacing:.02em}
.bt-icon{fill:none;stroke:var(--bt-ink-3);stroke-width:1.35;stroke-linecap:round;stroke-linejoin:round}
.bt-icon.bt-tone-flag{stroke:var(--bt-flag);fill:none}
.bt-basis{font:400 12px ${FAMILIES.sans};fill:var(--bt-ink-3)}
.bt-kind{font:500 10.5px ${FAMILIES.mono};fill:var(--bt-ink-3);letter-spacing:.06em}
.bt-name{font:600 15px ${FAMILIES.sans};fill:var(--bt-ink)}
.bt-name-sm{font-size:13.5px}
.bt-detail{font:400 12.5px ${FAMILIES.sans};fill:var(--bt-ink-2)}
.bt-value{font:500 13.5px ${FAMILIES.mono};fill:var(--bt-ink)}
.bt-cite{font:400 11px ${FAMILIES.sans};fill:var(--bt-ink-3)}
.bt-cite-rule{stroke:var(--bt-rule-2);stroke-width:1}
.bt-tone-flag{fill:var(--bt-flag)} .bt-tone-ask{fill:var(--bt-ask)} .bt-tone-ok{fill:var(--bt-ok)} .bt-tone-tax{fill:var(--bt-info)}
.bt-badge circle{stroke:var(--bt-plate);stroke-width:2.5} .bt-badge text{font:600 11px ${FAMILIES.sans};fill:var(--bt-plate)}
.bt-badge.bt-tone-flag circle{fill:var(--bt-flag)} .bt-badge.bt-tone-ask circle{fill:var(--bt-ask)}
.bt-badge.bt-tone-info circle{fill:var(--bt-card);stroke:var(--bt-ink-3);stroke-width:1.4} .bt-badge.bt-tone-info text{fill:var(--bt-ink-2)}
.bt-badge.bt-tone-flag,.bt-badge.bt-tone-ask,.bt-badge.bt-tone-info{fill:none}
.bt-halo{fill:none;stroke:var(--bt-plate);stroke-width:7;stroke-linecap:round}
.bt-zone-ok .bt-halo,.bt-zone-ok~.bt-edges .bt-halo{stroke:var(--bt-plate)}
.bt-edge{fill:none;stroke:var(--bt-line);stroke-width:1.35;stroke-linejoin:round}
.bt-edge-rel{stroke-dasharray:4 4;stroke:var(--bt-ink-3)}
.bt-arrowhead{fill:var(--bt-line)} .bt-arrowhead-flag{fill:var(--bt-flag)}
.bt-chip rect{fill:var(--bt-plate);stroke:var(--bt-rule);stroke-width:1}
.bt-chip text{font:500 11px ${FAMILIES.mono};fill:var(--bt-ink)}
.bt-gap{fill:none;stroke:var(--bt-flag);stroke-width:1.6;stroke-dasharray:5 4}
.bt-arrowhead-gap{fill:var(--bt-flag)}
.bt-chip-gap rect{fill:var(--bt-flag-wash);stroke:var(--bt-flag-line)} .bt-chip-gap text{fill:var(--bt-flag);font-weight:500}
.bt-chip-rel rect{stroke-dasharray:3 3} .bt-chip-rel text{fill:var(--bt-ink-3)}
.bt-zone rect:first-child{fill:none;stroke:var(--bt-ink-4);stroke-width:1.2;stroke-dasharray:6 5}
.bt-zone-ok rect:first-child{fill:var(--bt-ok-wash);stroke:var(--bt-ok-line);stroke-dasharray:none}
.bt-zone-flag rect:first-child{fill:var(--bt-flag-wash);stroke:var(--bt-flag-line);stroke-dasharray:5 4}
.bt-zone-flag .bt-zone-tab{stroke:var(--bt-flag-line)} .bt-zone-flag .bt-zone-label{fill:var(--bt-flag)}
.bt-zone-tab{fill:var(--bt-plate);stroke:var(--bt-ink-4);stroke-width:1}
.bt-zone-ok .bt-zone-tab{stroke:var(--bt-ok-line);fill:var(--bt-plate)}
.bt-zone-label{font:600 12px ${FAMILIES.sans};fill:var(--bt-ink-2)}
.bt-zone-ok .bt-zone-label{fill:var(--bt-ok)}

/* transfer */
.bt-band{fill:var(--bt-rule-2);opacity:.55}
.bt-band-court{fill:var(--bt-flag-wash);opacity:1;stroke:var(--bt-flag-line);stroke-width:1;stroke-dasharray:5 4}
.bt-colhead{font:500 11px ${FAMILIES.mono};fill:var(--bt-ink-3);letter-spacing:.07em}
.bt-bandhead{font:500 11px ${FAMILIES.mono};fill:var(--bt-ink);letter-spacing:.06em}
.bt-bandsub{font:400 12.5px ${FAMILIES.sans};fill:var(--bt-ink-2)}
.bt-icon-flag{stroke:var(--bt-flag)}
.bt-flow{fill:none;stroke:var(--bt-line);stroke-linecap:butt;opacity:.5}
.bt-flow-court{stroke:var(--bt-flag);opacity:.85}
.bt-flow-stay{stroke-dasharray:3 4;opacity:.7}
.bt-flow-later{stroke-dasharray:1.5 6;stroke-linecap:round;opacity:1}
.bt-station rect{fill:var(--bt-card);stroke:var(--bt-rule);stroke-width:1}
.bt-station-court rect{stroke:var(--bt-flag);stroke-width:1.5}
.bt-station-text{font:400 12.5px ${FAMILIES.sans};fill:var(--bt-ink-2)}
.bt-station-title{font:600 13px ${FAMILIES.sans};fill:var(--bt-flag)}
.bt-recip{stroke:var(--bt-line);stroke-width:1.2}
.bt-recip.bt-k-law{stroke:var(--bt-flag);stroke-dasharray:5 4;fill:var(--bt-flag-wash)}
.bt-fix{font:400 13px ${FAMILIES.sans};fill:var(--bt-ink)} .bt-fix-label{font-weight:600;fill:var(--bt-flag)}

/* ledger */
.bt-ledger-head{font:500 11px ${FAMILIES.mono};fill:var(--bt-ink-3);letter-spacing:.07em}
.bt-ledger-sub{font:400 13px ${FAMILIES.sans};fill:var(--bt-ink-2)}
.bt-ledger-name{font:600 15px ${FAMILIES.sans};fill:var(--bt-ink)}
.bt-ledger-via{font:400 12.5px ${FAMILIES.sans};fill:var(--bt-ink-3)}
.bt-bar-in{fill:var(--bt-ok)}
.bt-bar-over{fill:url(#bt-hatch);stroke:var(--bt-flag-line);stroke-width:1}
.bt-hatch-bg{fill:var(--bt-flag-wash)} .bt-hatch-line{stroke:var(--bt-flag);stroke-width:1.2;opacity:.55}
.bt-bar-seam{stroke:var(--bt-plate);stroke-width:2}
.bt-bar-label{font:500 13px ${FAMILIES.mono};fill:var(--bt-ink)}
.bt-bar-note{font:400 12.5px ${FAMILIES.sans}}
.bt-cap-rule{stroke:var(--bt-ink);stroke-width:1.2;stroke-dasharray:3 3}
.bt-cap-label{font:500 11px ${FAMILIES.mono};fill:var(--bt-ink)}
.bt-ledger-excl{font:500 20px ${FAMILIES.mono};fill:var(--bt-ok)}
.bt-ledger-excl-sub{font:400 12px ${FAMILIES.sans};fill:var(--bt-ink-3)}
.bt-ledger-rule{stroke:var(--bt-rule);stroke-width:1}
.bt-ledger-total-label{font:600 15px ${FAMILIES.sans};fill:var(--bt-ink)}
.bt-ledger-total-sub{font:400 12.5px ${FAMILIES.sans};fill:var(--bt-ink-3)}
.bt-section{border-top:1px solid var(--bt-rule);padding:4px 10px 6px}

/* ledger totals */
.bt-total{margin:4px 26px 18px;padding-top:16px;border-top:1px solid var(--bt-rule)}
.bt-total-main{margin:0 0 6px;font:600 15.5px/1.45 ${FAMILIES.sans};color:var(--bt-ink)}
.bt-total-sub{margin:0;font:400 13px/1.55 ${FAMILIES.sans};color:var(--bt-ink-3);max-width:70em}

/* checklist */
.bt-check{padding:6px 26px 22px}
.bt-check h4{margin:0 0 12px;font:500 11px/1 ${FAMILIES.mono};letter-spacing:.07em;text-transform:uppercase;color:var(--bt-ink-3)}
.bt-check ul{margin:0;padding:0;list-style:none;display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:8px 28px}
.bt-check li{display:grid;grid-template-columns:22px 1fr;gap:2px 8px;font:400 13.5px/1.4 ${FAMILIES.sans};color:var(--bt-ink)}
.bt-check li small{grid-column:2;font:400 11px/1.3 ${FAMILIES.mono};color:var(--bt-ink-3)}
.bt-mark-ok,.bt-mark-q,.bt-mark-x{width:18px;height:18px;border-radius:50%;display:grid;place-items:center;font:600 11px/1 ${FAMILIES.sans};margin-top:1px}
.bt-mark-ok{background:var(--bt-ok-wash);color:var(--bt-ok);box-shadow:inset 0 0 0 1.2px var(--bt-ok-line)}
.bt-mark-q{background:var(--bt-ask-wash);color:var(--bt-ask);box-shadow:inset 0 0 0 1.2px var(--bt-ask-line)}
.bt-mark-x{background:var(--bt-flag-wash);color:var(--bt-flag);box-shadow:inset 0 0 0 1.2px var(--bt-flag-line)}
.bt-check li.assumed{color:var(--bt-ink-2)}

/* focus: hover or focus a card to trace what it holds and who holds it */
/* Hover trace: opacity only, a strong ease-out, under 200ms, and only for real pointers. */
.bt-canvas.bt-tracing .bt-node:not(.bt-on),.bt-canvas.bt-tracing .bt-edge:not(.bt-on),.bt-canvas.bt-tracing .bt-flow:not(.bt-on),.bt-canvas.bt-tracing .bt-station:not(.bt-on),.bt-canvas.bt-tracing .bt-chip{opacity:.28}
@media (hover:hover) and (pointer:fine){.bt-node,.bt-edge,.bt-flow,.bt-station,.bt-chip{transition:opacity 160ms cubic-bezier(.23,1,.32,1)}}
.bt-node:focus{outline:none} .bt-node:focus-visible .bt-card{stroke:var(--bt-ink);stroke-width:2}
.bt-canvas-stacked{display:none}
.bt-canvas-stacked svg{max-width:420px}
@media (max-width:720px){
  .bt-canvas-wide:has(+ .bt-canvas-stacked){display:none}
  .bt-canvas-stacked{display:block;padding:6px 0 0}
  .bt-canvas.bt-canvas-stacked svg{min-width:0;width:calc(100% - 32px);max-width:420px;margin:0 auto}
  body{padding:16px 0 32px}
  .bt-plate{border-radius:0;border-left:0;border-right:0}
  .bt-head{padding:22px 16px 4px;grid-template-columns:1fr}
  .bt-fig{flex-wrap:wrap;gap:4px 12px}
  .bt-asof{text-align:left}
  .bt-swipe{display:block}
  .bt-title{font-size:28px}
  .bt-sub{font-size:15px}
  .bt-legend{padding:6px 16px 14px}
  .bt-canvas{padding:6px 0 0}
  .bt-canvas svg{min-width:var(--bt-svg-min,820px);margin:0 16px}
  .bt-note{padding:18px 16px;border-right:0;border-bottom:1px solid var(--bt-rule-2)}
  .bt-foot,.bt-foot.bt-has-missing{grid-template-columns:1fr;padding:20px 16px}
}
@media (prefers-reduced-motion:reduce){.bt-node,.bt-edge,.bt-chip{transition:none}}
`;

const SCRIPT = `
(() => {
  const params = new URLSearchParams(location.search);
  const theme = params.get("theme");
  if (theme === "dark" || theme === "light") document.documentElement.dataset.theme = theme;
  for (const canvas of document.querySelectorAll(".bt-canvas")) {
    const edges = [...canvas.querySelectorAll(".bt-edge, .bt-flow")];
    const trace = (id) => {
      const on = new Set([id]);
      // everything above (holders) and below (held) the card
      const walk = (start, dir) => { const stack = [start]; while (stack.length) { const cur = stack.pop(); for (const e of edges) { const a = dir > 0 ? e.dataset.from : e.dataset.to, b = dir > 0 ? e.dataset.to : e.dataset.from; if (a === cur && !on.has(b)) { on.add(b); stack.push(b); } } } };
      walk(id, 1); walk(id, -1);
      canvas.classList.add("bt-tracing");
      for (const n of canvas.querySelectorAll(".bt-node")) n.classList.toggle("bt-on", on.has(n.dataset.id));
      for (const e of edges) e.classList.toggle("bt-on", on.has(e.dataset.from) && on.has(e.dataset.to));
      for (const st of canvas.querySelectorAll(".bt-station")) st.classList.toggle("bt-on", on.has(st.dataset.station));
    };
    let pinned = null;
    const clear = () => { if (pinned) { trace(pinned); return; } canvas.classList.remove("bt-tracing"); for (const n of canvas.querySelectorAll(".bt-on")) n.classList.remove("bt-on"); };
    // Deep links: #focus=<card id> pins the trace and scrolls to the card; clicking a card updates the link.
    const applyHash = () => {
      const m = location.hash.match(/focus=([A-Za-z0-9_-]+)/); // no \w: this lives in a template literal
      pinned = m ? m[1] : null;
      if (pinned) { trace(pinned); const el = canvas.querySelector('.bt-node[data-id="' + pinned + '"]'); if (el && !applyHash.done) { el.scrollIntoView({ block: "center" }); applyHash.done = true; } }
      else clear();
      const n = location.hash.match(/note=([A-Z])/);
      for (const note of document.querySelectorAll(".bt-note")) note.classList.toggle("bt-note-hit", Boolean(n) && note.querySelector(".bt-letter")?.textContent === n[1]);
    };
    window.addEventListener("hashchange", applyHash);
    applyHash();
    for (const node of canvas.querySelectorAll(".bt-node")) node.addEventListener("click", () => { const id = node.dataset.id; history.replaceState(null, "", pinned === id ? "#" : "#focus=" + id); applyHash(); });
    for (const note of document.querySelectorAll(".bt-note[data-on]")) {
      if (!note.dataset.on) continue;
      note.addEventListener("pointerenter", () => trace(note.dataset.on));
      note.addEventListener("pointerleave", clear);
    }
    for (const node of canvas.querySelectorAll(".bt-node")) {
      node.addEventListener("pointerenter", () => trace(node.dataset.id));
      node.addEventListener("pointerleave", clear);
      node.addEventListener("focus", () => trace(node.dataset.id));
      node.addEventListener("blur", clear);
    }
  }
})();
`;

function legendSvg(kind) {
  if (kind === "own") return `<svg width="34" height="12" viewBox="0 0 34 12"><path d="M1 6H29" stroke="var(--bt-line)" stroke-width="1.4"/><path d="M27 2.5L33 6L27 9.5z" fill="var(--bt-line)"/></svg>`;
  if (kind === "rel") return `<svg width="34" height="12" viewBox="0 0 34 12"><path d="M1 6H29" stroke="var(--bt-ink-3)" stroke-width="1.4" stroke-dasharray="4 4"/><path d="M27 2.5L33 6L27 9.5z" fill="var(--bt-line)"/></svg>`;
  if (kind === "zone-ok") return `<svg width="22" height="14" viewBox="0 0 22 14"><rect x=".5" y=".5" width="21" height="13" rx="5" fill="var(--bt-ok-wash)" stroke="var(--bt-ok-line)"/></svg>`;
  if (kind === "gap") return `<svg width="34" height="12" viewBox="0 0 34 12"><path d="M1 6H29" stroke="var(--bt-flag)" stroke-width="1.6" stroke-dasharray="5 4"/><path d="M27 2.5L33 6L27 9.5z" fill="var(--bt-flag)"/></svg>`;
  if (kind === "zone-flag") return `<svg width="22" height="14" viewBox="0 0 22 14"><rect x=".5" y=".5" width="21" height="13" rx="5" fill="var(--bt-flag-wash)" stroke="var(--bt-flag-line)" stroke-dasharray="3 3"/></svg>`;
  if (kind === "zone-group") return `<svg width="22" height="14" viewBox="0 0 22 14"><rect x=".5" y=".5" width="21" height="13" rx="5" fill="none" stroke="var(--bt-ink-4)" stroke-dasharray="3 3"/></svg>`;
  if (kind === "flow") return `<svg width="34" height="12" viewBox="0 0 34 12"><path d="M1 6H33" stroke="var(--bt-line)" stroke-width="6" opacity=".55"/></svg>`;
  if (kind === "flow-stay") return `<svg width="34" height="12" viewBox="0 0 34 12"><path d="M1 6H33" stroke="var(--bt-line)" stroke-width="2" stroke-dasharray="3 4" opacity=".7"/></svg>`;
  if (kind === "flow-court") return `<svg width="34" height="12" viewBox="0 0 34 12"><path d="M1 6H33" stroke="var(--bt-flag)" stroke-width="5" stroke-dasharray="2 5" stroke-linecap="round"/></svg>`;
  return "";
}

export function pageHtml({ model, view, figureSvg, figureWidth, stackedSvg = null, extraSections = [], notes, legend, receipt, sourcesUsed }) {
  const docs = sourcesUsed.map((id) => ({ id, ...model.documents[id] }));
  const asOf = new Date(model.raw.asOf + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  const plateW = Math.max(1040, Math.min(1480, figureWidth + 40));
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(view.shortTitle ?? `${model.raw.household}: Fig. ${view.fig}`)}</title>
<meta name="description" content="${esc(view.title)}">
<style>${fontFaceCss()}
${CSS}</style>
</head>
<body style="--bt-w:${plateW}px;--bt-svg-w:${figureWidth}px">
<article class="bt-plate" data-view="${esc(view.id)}">
  <header class="bt-head">
    <div class="bt-fig"><b>Fig. ${esc(view.fig)}</b>${[model.raw.household, model.raw.jurisdiction?.label, model.raw.synthetic ? "Example family" : null].filter(Boolean).map((t) => `<span>${esc(t)}</span>`).join(`<i aria-hidden="true">·</i>`)}</div>
    <div class="bt-asof">${model.raw.synthetic ? "Made-up documents" : "From the documents below"} · ${esc(asOf)}</div>
    ${view.kicker ? `<p class="bt-kicker">${esc(view.kicker)}</p>` : ""}
    <h1 class="bt-title">${esc(view.title)}</h1>
    ${view.subtitle ? `<p class="bt-sub">${esc(view.subtitle)}</p>` : ""}
  </header>
  <div class="bt-canvas bt-canvas-wide">${figureSvg}</div>
  ${stackedSvg ? `<div class="bt-canvas bt-canvas-stacked">${stackedSvg}</div>` : `<p class="bt-swipe">Swipe the figure sideways to follow every line.</p>`}
  ${legend?.length ? `<div class="bt-legend">${legend.map((item) => `<span>${legendSvg(item.kind)}${esc(item.text)}</span>`).join("")}</div>` : ""}
  ${extraSections.map((s) => `<div class="bt-section">${s}</div>`).join("")}
  ${notes.length ? `<section class="bt-notes" aria-label="Notes">${notes.map((n) => `<div class="bt-note ${esc(n.tone)}" data-on="${esc(n.on ?? "")}"><h3><span class="bt-letter ${esc(n.tone)}">${esc(n.letter)}</span><span>${esc(n.title)}</span></h3><p>${esc(n.body)}</p></div>`).join("")}</section>` : ""}
  <footer class="bt-foot${model.raw.notInDocuments?.length ? " bt-has-missing" : ""}">
    <div><h4>Drawn from</h4><ul class="bt-sources">${docs.map((d) => `<li><b>${esc(d.short)}</b>${esc(d.title)}${d.date && !d.title.includes(d.date.slice(0, 4)) ? `, ${esc(d.date.slice(0, 4))}` : ""}</li>`).join("")}</ul></div>
    ${model.raw.notInDocuments?.length ? `<div class="bt-missing"><h4>Not in the documents</h4><ul class="bt-sources">${model.raw.notInDocuments.map((d) => `<li>${esc(d)}</li>`).join("")}</ul></div>` : ""}
    <div><h4>Checked before drawing</h4><ul class="bt-receipt">${receipt.map((r) => `<li class="${r.open ? "open" : ""}">${esc(r.text)}</li>`).join("")}</ul></div>
    ${view.law ? `<p class="bt-law"><b>Law applied</b> ${esc(view.law)}</p>` : ""}
    <p class="bt-disclaimer"><span>${model.raw.synthetic ? "A made-up family, for illustration. " : ""}A picture of what the documents say, not legal or tax advice. Your attorney or CPA confirms it.</span><span class="bt-mark">Drawn with belongs-to, an open-source tool with no server · every fact cited</span></p>
  </footer>
</article>
<script>${SCRIPT}</script>
</body>
</html>`;
}
