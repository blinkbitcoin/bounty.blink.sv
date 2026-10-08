// blinkhack site — static, no dependencies, no external requests (CSP: 'self' only).
"use strict";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else e.setAttribute(k, v);
  }
  for (const k of kids) if (k != null) e.append(k);
  return e;
};
const fmtSats = n => n == null ? "" : Number(n).toLocaleString("en-US");
const fmtBtc = n => (n / 1e8).toLocaleString("en-US", { minimumFractionDigits: 8, maximumFractionDigits: 8 });
const CHAPTER_TITLES = { theft: "1 · The theft", trail: "2 · Following the coins", ecash: "3 · Before the attack",
  lightning: "4 · Lightning nodes", ark: "5 · Second's Ark server", lnwallet: "6 · Lightning wallet", live: "7 · Latest movements" };
const LINK_LABEL = { tx: "mempool.space", address: "mempool.space", channel: "mempool.space", node: "1ml.com", evm: "etherscan.io" };

async function getJSON(p) { const r = await fetch(p, { cache: "no-cache" }); if (!r.ok) throw new Error(p); return r.json(); }
async function getText(p) { const r = await fetch(p, { cache: "no-cache" }); if (!r.ok) throw new Error(p); return r.text(); }

// RFC 4180 CSV parser
function parseCSV(text) {
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(f); f = ""; if (row.length > 1 || row[0] !== "") rows.push(row); row = [];
    } else f += c;
  }
  if (f !== "" || row.length) { row.push(f); rows.push(row); }
  const head = rows.shift();
  return rows.map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

function copyButton(value) {
  const b = el("button", { class: "copy", type: "button", title: "Copy", text: "copy" });
  b.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(value); b.textContent = "copied"; }
    catch { b.textContent = "select + copy"; }
    setTimeout(() => (b.textContent = "copy"), 1500);
  });
  return b;
}
const idv = v => el("span", { class: "idv" }, el("code", { text: v }), " ", copyButton(v));
const extLink = (href, label) => el("a", { href, rel: "noopener noreferrer", target: "_blank", text: label });
const badge = attr => el("span", { class: `badge ${attr}`, text: attr });
const when = s => (s || "").replace("T", " ").replace("Z", " UTC");

// ─────────────────────────── sections ───────────────────────────

function renderStatus(meta, holdings) {
  const parts = [`Data as of ${meta.as_of}`, `verified against the blockchain at block ${fmtSats(meta.tip_height)}`,
    `${fmtSats(meta.indicators)} indicators`];
  if (holdings) parts.push(`balances checked ${when(holdings.checked_at)}`);
  $("#status").textContent = parts.join(" · ");
}

function renderHoldings(h) {
  if (!h) return;
  $("#holdings").hidden = false; $("#nav-holdings").hidden = false;
  const parts = [`${fmtBtc(h.total_proven_sats)} BTC at addresses proven to be his`];
  if (h.total_traced_sats) parts.push(`${fmtBtc(h.total_traced_sats)} BTC at traced addresses`);
  if (h.total_probable_sats) parts.push(`${fmtBtc(h.total_probable_sats)} BTC at probable addresses`);
  $("#holdings-summary").textContent = `Unspent now: ${parts.join(", ")} (see What the labels mean).`;
  const tb = $("#holdings-body");
  for (const r of h.addresses) {
    tb.append(el("tr", {},
      el("td", {}, el("a", { href: `#row-${r.id}`, text: r.id })),
      el("td", {}, idv(r.value), r.note ? el("div", { class: "note", text: r.note }) : null),
      el("td", { class: "num" }, fmtBtc(r.balance_sats),
        r.foreign_sats ? el("div", { class: "note", text: `+ ${fmtBtc(r.foreign_sats)} from others, not counted` }) : null),
      el("td", {}, badge(r.attribution)), el("td", {}, extLink(r.link, "mempool.space"))));
  }
}

function renderTimeline(t) {
  const ol = $("#timeline-list");
  const entries = [...t.entries].sort((a, b) => a.date.localeCompare(b.date));
  const kindLabel = { onchain: "on chain", public: "public record", record: "Blink's records" };
  for (const e of entries) {
    const head = el("div", { class: "when" }, el("time", { datetime: e.date, text: e.date }), " ",
      el("span", { class: "kind", text: kindLabel[e.kind] || e.kind }));
    if (e.chapter) head.append(" ", el("a", { class: "chap", href: `#ch-${e.chapter}`, text: CHAPTER_TITLES[e.chapter] }));
    const li = el("li", { class: e.kind }, head, el("p", { text: e.text }));
    if (e.source_url) li.append(el("p", { class: "src" }, el("a", { href: e.source_url, rel: "noopener noreferrer", text: e.source_label || "Source" })));
    if (e.indicators.length) {
      const chips = el("p", { class: "chips" });
      for (const i of e.indicators) chips.append(el("a", { class: "chip", href: `#row-${i.id}`, title: i.value, text: i.id }), " ");
      li.append(chips);
    }
    ol.append(li);
  }
}

// One fully expanded block per indicator — no tables, no scrolling (Lukas, 2026-10-07).
function indicatorCard(r, withAnchor) {
  const card = el("article", Object.assign({ class: "ind" }, withAnchor ? { id: `row-${r.id}` } : {}),
    el("div", { class: "ind-head" }, el("strong", { text: r.id }), el("span", { class: "ind-type", text: r.type }), badge(r.attribution),
      r.scid ? el("span", { class: "note", text: `channel id ${r.scid}` }) : null),
    el("div", { class: "ind-val" }, idv(r.value), " ", extLink(r.explorer_link, LINK_LABEL[r.type] || "explorer")),
    el("p", { class: "ind-role", text: r.role }),
    el("p", { class: "ind-method" }, el("span", { class: "lbl", text: "How we know: " }), r.method),
    el("p", { class: "ind-dates" },
      el("span", { title: `incident-record commit ${r.known_since_commit}`, text: `Known since ${when(r.known_since)}` }),
      r.first_seen_on_chain ? ` · First seen on chain ${when(r.first_seen_on_chain)}` : null));
  card.dataset.chapter = r.chapter; card.dataset.type = r.type; card.dataset.attr = r.attribution;
  card.dataset.text = Object.values(r).join(" ").toLowerCase();
  return card;
}

function renderTable(rows) {
  const list = $("#ind-list");
  for (const c of [...new Set(rows.map(r => r.chapter))]) $("#f-group").append(el("option", { value: c, text: CHAPTER_TITLES[c] || c }));
  for (const t of [...new Set(rows.map(r => r.type))]) $("#f-type").append(el("option", { text: t }));
  for (const r of rows) list.append(indicatorCard(r, true));
  const apply = () => {
    const g = $("#f-group").value, ty = $("#f-type").value, at = $("#f-attr").value, q = $("#f-text").value.trim().toLowerCase();
    let shown = 0;
    for (const c of list.children) {
      c.hidden = (g && c.dataset.chapter !== g) || (ty && c.dataset.type !== ty) || (at && c.dataset.attr !== at) || (q && !c.dataset.text.includes(q));
      if (!c.hidden) shown++;
    }
    $("#ind-count").textContent = `Showing ${shown} of ${rows.length} indicators.`;
  };
  for (const s of ["#f-group", "#f-type", "#f-attr", "#f-text"]) $(s).addEventListener("input", apply);
  apply();
}

function renderChapterTables(rows) {
  for (const sec of $$("section.chapter")) {
    const mine = rows.filter(r => r.chapter === sec.dataset.chapter && !/^W-P\d+$/.test(r.id));
    const det = el("details", { class: "list" }, el("summary", { text: `Addresses, transactions and channels in this chapter (${mine.length})` }));
    const list = el("div", { class: "ind-list" });
    for (const r of mine) list.append(indicatorCard(r, false));
    det.append(list); $(".chapter-table", sec).append(det);
    const n = rows.filter(r => r.chapter === sec.dataset.chapter && /^W-P\d+$/.test(r.id)).length;
    if (n) $(".chapter-table", sec).append(el("p", { class: "note", text: `The ${n} individual peg-out transactions are in the full list below (IDs W-P001 to W-P${String(n).padStart(3, "0")}).` }));
  }
}

function renderTimestamps(idx) {
  const box = $("#ts-list");
  if (!box || !idx) return;
  for (const t of [...idx.entries].reverse()) {
    const base = `timestamps/${t.dir}/manifest.txt`;
    box.append(el("br"), `${t.label}: `, el("a", { href: base, text: "manifest" }), " · ",
      el("a", { href: `${base}.asc`, text: t.signed ? "signature" : "signature (pending)" }), " · ",
      el("a", { href: `${base}.ots`, text: "OpenTimestamps proof" }),
      t.anchored_block ? ` (anchored in Bitcoin block ${t.anchored_block})` : " (anchoring pending)");
  }
}

function renderFederations(rows) {
  const tb = $("#fed-table tbody");
  if (!tb) return;
  const agg = new Map();
  for (const r of rows.filter(r => /^W-P\d+$/.test(r.id))) {
    const m = r.role.match(/^Peg-out from (.+) paying ([\d,]+) sats/);
    if (!m) continue;
    const v = agg.get(m[1]) || { n: 0, sats: 0 };
    v.n += 1; v.sats += Number(m[2].replace(/,/g, "")); agg.set(m[1], v);
  }
  const unl = "an unlisted federation";
  const list = [...agg.entries()].sort((a, b) => (a[0] === unl) - (b[0] === unl) || b[1].sats - a[1].sats);
  let tn = 0, ts = 0;
  for (const [k, v] of list) {
    tn += v.n; ts += v.sats;
    tb.append(el("tr", {}, el("td", { text: k === unl ? "Unlisted federations (not in the public Fedimint observer; our estimate: roughly 70–90)" : k }),
      el("td", { class: "num", text: fmtSats(v.n) }), el("td", { class: "num", text: fmtSats(v.sats) })));
  }
  tb.append(el("tr", { class: "total" }, el("td", { text: "Total" }), el("td", { class: "num", text: fmtSats(tn) }), el("td", { class: "num", text: fmtSats(ts) })));
}

// ─────────────────────────── flow graph (layered DAG, SVG), one per chapter ───────────────────────────

function renderGraph(sec, flows, rowsById, holdings) {
  const ch = sec.dataset.chapter;
  const svg = $("svg.graph", sec), detail = $("aside.detail", sec), NS = "http://www.w3.org/2000/svg";
  const s = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
  // drop "change back to the same address" edges (address reuse would create a cycle)
  const inputsOf = new Map();
  for (const e of flows.edges) if (e.chapter === ch) (inputsOf.get(e.to) || inputsOf.set(e.to, new Set()).get(e.to)).add(e.from);
  const edgesC = flows.edges.filter(e => e.chapter === ch && !(inputsOf.get(e.from)?.has(e.to)));
  if (!edgesC.length) { $(".graph-wrap", sec).hidden = true; return; }
  const all = new Map(flows.nodes.map(n => [n.id, n]));
  const nodes = new Map();
  for (const e of edgesC) for (const k of [e.from, e.to]) if (!nodes.has(k)) nodes.set(k, { ...all.get(k), in: [], out: [] });
  for (const e of edgesC) { nodes.get(e.from).out.push(e); nodes.get(e.to).in.push(e); }
  const bal = new Map((holdings?.addresses || []).map(a => [a.value, a.balance_sats]));

  const indeg = new Map([...nodes.keys()].map(k => [k, nodes.get(k).in.length]));
  const layer = new Map(), queue = [...nodes.keys()].filter(k => indeg.get(k) === 0);
  queue.forEach(k => layer.set(k, 0));
  while (queue.length) {
    const k = queue.shift();
    for (const e of nodes.get(k).out) {
      layer.set(e.to, Math.max(layer.get(e.to) ?? 0, layer.get(k) + 1));
      indeg.set(e.to, indeg.get(e.to) - 1);
      if (indeg.get(e.to) === 0) queue.push(e.to);
    }
  }
  for (let pass = 0; pass < 3; pass++)            // any node left in a cycle: place after its known predecessors
    for (const [k, n] of nodes) if (!layer.has(k)) layer.set(k, 1 + Math.max(-1, ...n.in.map(e => layer.get(e.from) ?? -1)));
  for (const [k, n] of nodes) if (!n.in.length && n.out.length) layer.set(k, Math.max(0, Math.min(...n.out.map(e => layer.get(e.to))) - 1));

  const cols = [];
  for (const [k, l] of layer) (cols[l] ||= []).push(k);
  const COLW = 200, ROWH = 54, PAD = 20, BOXW = 150, BOXH = 34;
  const pos = new Map();
  cols.forEach((col, l) => {
    if (!col) return;
    const bary = k => { const ins = nodes.get(k).in.map(e => pos.get(e.from)?.y).filter(v => v != null); return ins.length ? ins.reduce((a, b) => a + b) / ins.length : 0; };
    col.sort((a, b) => bary(a) - bary(b) || a.localeCompare(b));
    col.forEach((k, i) => pos.set(k, { x: PAD + l * COLW, y: PAD + i * ROWH }));
  });
  const W = PAD * 2 + cols.length * COLW, H = PAD * 2 + Math.max(...cols.filter(Boolean).map(c => c.length)) * ROWH;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.setAttribute("width", W); svg.setAttribute("height", H);

  const anchor = (k, side) => {
    const n = nodes.get(k), p = pos.get(k);
    if (n.kind === "tx") return { x: p.x + (side === "out" ? 6 : -6) + BOXW / 2, y: p.y + BOXH / 2 };
    return { x: p.x + (side === "out" ? BOXW : 0), y: p.y + BOXH / 2 };
  };
  const gEdges = s("g", { class: "edges" }), gNodes = s("g", { class: "nodes" });
  svg.append(gEdges, gNodes);
  const edgeEls = [];
  for (const e of edgesC) {
    const a = anchor(e.from, "out"), b = anchor(e.to, "in"), mx = (a.x + b.x) / 2;
    const w = e.sats ? 1 + 5 * Math.log10(Math.max(e.sats, 10)) / 9 : 1.5;
    const p = s("path", { d: `M${a.x},${a.y} C${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`, "stroke-width": w.toFixed(2), class: "edge" });
    const t = s("title"); t.textContent = e.sats ? `${fmtSats(e.sats)} sats` : "";
    p.append(t); gEdges.append(p); edgeEls.push({ e, p });
  }
  const received = k => nodes.get(k).in.reduce((a, e) => a + (e.sats || 0), 0);
  const sinkLabel = { service: "swap service (not his)", swap_deposit: "swap service (not his)", pending: "not yet established", federation: "federation (not his)", ark_board: "Ark boarding output",
    withheld: "owner not established", later_batch: "his — other chapter", blink_hot_wallet: "Blink hot wallet", earlier_coins: "his earlier coins" };
  const nodeEls = new Map();
  for (const [k, n] of nodes) {
    const p = pos.get(k), g = s("g", { class: `node ${n.kind} ${n.attribution || ""} ${n.class || ""}`, tabindex: 0 });
    if (n.kind === "tx") {
      g.append(s("circle", { cx: p.x + BOXW / 2, cy: p.y + BOXH / 2, r: 6 }));
      const t = s("text", { x: p.x + BOXW / 2, y: p.y + BOXH / 2 - 10, "text-anchor": "middle", class: "tlabel" });
      t.textContent = n.ref; g.append(t);
    } else {
      g.append(s("rect", { x: p.x, y: p.y, width: BOXW, height: BOXH, rx: n.kind === "channel" ? 14 : 4 }));
      const t1 = s("text", { x: p.x + 6, y: p.y + 14, class: "nlabel" });
      t1.textContent = n.kind === "address" || n.kind === "channel" ? `${n.ref}${n.attribution === "probable" ? " (probable)" : ""}${n.kind === "channel" ? " · channel" : ""}` : (sinkLabel[n.class] || n.label);
      const t2 = s("text", { x: p.x + 6, y: p.y + 28, class: "nsub" });
      // real totals from the chain (not just the arrows drawn here)
      const got = n.received_sats ?? received(k);
      t2.textContent = bal.get(k) ? `unspent ${fmtBtc(bal.get(k))} BTC` : (got ? `${n.kind === "channel" ? "capacity" : n.kind === "address" ? "received" : ""} ${fmtBtc(got)} BTC`.trim() : "");
      g.append(t1, t2);
    }
    g.addEventListener("click", () => select(k));
    g.addEventListener("keydown", ev => { if (ev.key === "Enter") select(k); });
    gNodes.append(g); nodeEls.set(k, g);
  }

  function select(k) {
    const n = nodes.get(k);
    const near = new Set([k, ...n.in.map(e => e.from), ...n.out.map(e => e.to)]);
    for (const [kk, g] of nodeEls) g.classList.toggle("dim", !near.has(kk));
    for (const { e, p } of edgeEls) p.classList.toggle("hl", e.from === k || e.to === k);
    detail.hidden = false; detail.replaceChildren();
    const r = n.ref && rowsById.get(n.ref);
    if (r) {
      detail.append(el("h3", { text: `${n.ref} — ${r.type === "tx" ? "transaction" : r.type}` }), idv(r.value), " ", extLink(r.explorer_link, LINK_LABEL[r.type]),
        el("p", { text: r.role }), el("p", {}, badge(r.attribution), " ", r.method),
        el("p", { class: "note", text: `Known since ${when(r.known_since)} · first seen on chain ${when(r.first_seen_on_chain)}` }),
        el("p", {}, el("a", { href: `#row-${n.ref}`, text: "Show in the full table" })));
    } else {
      detail.append(el("h3", { text: n.label }));
      const e = n.in[0];
      if (n.kind === "sink" && e) detail.append(el("p", { text: `${fmtSats(e.sats)} sats — output ` }, el("code", { text: e.outpoint })));
    }
  }
}

// ─────────────────────────── boot ───────────────────────────

(async () => {
  try {
    // A single-file review preview (scripts/bundle_preview.py) embeds the data instead of fetching it.
    const B = window.BLINKHACK_DATA;
    const [meta, timeline, flows, csv] = B ? [B.meta, B.timeline, B.flows, B.csv] : await Promise.all([
      getJSON("data/meta.json"), getJSON("data/timeline.json"), getJSON("data/flows.json"), getText("data/indicators.csv")]);
    const holdings = !meta.holdings_published ? null
      : B ? B.holdings : await getJSON("data/holdings.json").catch(() => null);
    const rows = parseCSV(csv), rowsById = new Map(rows.map(r => [r.id, r]));
    renderStatus(meta, holdings);
    renderHoldings(holdings);
    renderTimeline(timeline);
    renderTimestamps(B ? B.timestamps : await getJSON("timestamps/index.json").catch(() => null));
    renderFederations(rows);
    for (const sec of $$("section.chapter")) renderGraph(sec, flows, rowsById, holdings);
    renderChapterTables(rows);
    renderTable(rows);
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
  } catch (err) {
    $("#status").textContent = "Could not load the data files. If you opened this file directly, serve the folder over HTTP.";
    console.error(err);
  }
})();
