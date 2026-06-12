#!/usr/bin/env python3
"""Sentinet - passive network monitor (single-file edition).

Download, then run:

    python3 sentinet-passive.py

Opens a local dashboard in your browser showing your apps' real outbound
connections - process -> host -> volume, live. No install, no dependencies,
no proxy, no root. macOS only.

It is metadata-only by design: it shows WHO is talking to the network, WHERE,
and HOW MUCH. It never reads the contents of your traffic (that is encrypted
inside each app), so every flow is honestly marked "content unavailable", and
blocking here is advisory (observe, not enforce).

Stop with Ctrl+C.
"""
from __future__ import annotations

import json
import os
import queue
import re
import socket
import subprocess
import sys
import threading
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

DASHBOARD_HTML = '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>Sentinet — live network monitor</title>\n<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">\n<style>\n/* Sentinet dashboard — Stripe-inspired design system.\n * Clean light surface, blurple accent, soft shadows, Inter type. */\n:root{\n  --bg:#f6f9fc;\n  --surface:#ffffff;\n  --ink:#0a2540;\n  --ink-2:#1a2b42;\n  --muted:#425466;\n  --muted-2:#8898aa;\n  --line:#e6ebf1;\n  --line-2:#eef2f6;\n  --blurple:#635bff;\n  --blurple-deep:#4b45c6;\n  --cyan:#00d4ff;\n  --green:#3ecf8e;\n  --green-ink:#0e6245;\n  --amber:#e8830c;\n  --amber-bg:#fff6e8;\n  --red:#df1b41;\n  --red-bg:#fdecef;\n  --green-bg:#e7f8f0;\n  --slate-bg:#f1f5f9;\n  --radius:10px;\n  --radius-lg:16px;\n  --shadow-sm:0 1px 2px rgba(10,37,64,.06);\n  --shadow:0 2px 5px rgba(10,37,64,.06),0 10px 28px rgba(10,37,64,.06);\n  --shadow-md:0 15px 35px rgba(48,49,61,.10);\n  --grad:linear-gradient(101deg,#635bff 0%,#00d4ff 100%);\n}\n*{box-sizing:border-box;margin:0;padding:0}\nhtml{scroll-behavior:smooth}\nbody{\n  font-family:\'Inter\',-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;\n  background:var(--bg);color:var(--ink);line-height:1.5;\n  -webkit-font-smoothing:antialiased;font-size:14px;\n}\n.mono{font-family:\'JetBrains Mono\',ui-monospace,SFMono-Regular,Menlo,monospace}\nbutton{font-family:inherit;cursor:pointer}\n::selection{background:rgba(99,91,255,.18)}\n\n/* ---------- HEADER ---------- */\nheader{background:var(--surface);border-bottom:1px solid var(--line);position:sticky;top:0;z-index:30}\nheader::before{content:"";display:block;height:3px;background:var(--grad)}\n.head-inner{display:flex;align-items:center;gap:18px;padding:16px 26px;flex-wrap:wrap;max-width:1320px;margin:0 auto}\n.brand{display:flex;align-items:center;gap:10px;font-weight:800;font-size:19px;letter-spacing:-.02em}\n.brand .logo{width:26px;height:26px;border-radius:7px;background:var(--grad);box-shadow:var(--shadow-sm);position:relative}\n.brand .logo::after{content:"";position:absolute;inset:6px;border-radius:3px;background:var(--surface)}\n.mode-tag{font-size:12px;font-weight:600;padding:4px 11px;border-radius:999px;letter-spacing:.01em;background:var(--slate-bg);color:var(--muted);border:1px solid var(--line)}\n.mode-tag.live{background:var(--green-bg);color:var(--green-ink);border-color:transparent}\n.mode-tag.demo{background:var(--amber-bg);color:var(--amber);border-color:transparent}\n.mode-tag.passive{background:rgba(99,91,255,.10);color:var(--blurple-deep);border-color:transparent}\n.mode-note{font-size:12px;color:var(--muted-2)}\n.mode-note b{color:var(--blurple-deep);font-weight:600}\n\n.stats{display:flex;gap:10px;margin-left:auto;flex-wrap:wrap}\n.stat{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:8px 16px;min-width:96px;box-shadow:var(--shadow-sm)}\n.stat .k{color:var(--muted-2);text-transform:uppercase;font-size:10px;font-weight:700;letter-spacing:.06em}\n.stat .v{font-size:20px;font-weight:700;letter-spacing:-.02em;line-height:1.2;font-variant-numeric:tabular-nums}\n.stat .v.up{color:var(--blurple)}\n.stat .v.down{color:var(--green-ink)}\n\n/* ---------- CONTROLS ---------- */\nmain{max-width:1320px;margin:0 auto;padding:22px 26px 70px}\n.controls{display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap}\n.search{position:relative;flex:1;min-width:220px;max-width:380px}\n.search input{width:100%;padding:9px 14px 9px 36px;border:1px solid var(--line);border-radius:var(--radius);font-size:14px;color:var(--ink);background:var(--surface);box-shadow:var(--shadow-sm);transition:border .15s,box-shadow .15s}\n.search input:focus{outline:none;border-color:var(--blurple);box-shadow:0 0 0 3px rgba(99,91,255,.16)}\n.search .ic{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--muted-2);font-size:14px}\n.chips{display:flex;gap:6px;flex-wrap:wrap}\n.chip{font-size:12.5px;font-weight:600;padding:7px 13px;border-radius:999px;border:1px solid var(--line);background:var(--surface);color:var(--muted);transition:.13s}\n.chip:hover{border-color:var(--muted-2)}\n.chip.active{background:var(--ink);color:#fff;border-color:var(--ink)}\n.chip .n{opacity:.6;margin-left:5px;font-variant-numeric:tabular-nums}\n.toggle{display:flex;align-items:center;gap:7px;font-size:13px;color:var(--muted);font-weight:500;margin-left:auto;user-select:none;cursor:pointer}\n.toggle input{appearance:none;width:34px;height:20px;border-radius:999px;background:var(--line);position:relative;transition:.18s;cursor:pointer}\n.toggle input:checked{background:var(--blurple)}\n.toggle input::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:.18s;box-shadow:var(--shadow-sm)}\n.toggle input:checked::after{left:16px}\n\n/* ---------- TABLE ---------- */\n.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-lg);box-shadow:var(--shadow);overflow:hidden}\ntable{width:100%;border-collapse:collapse}\nthead th{text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted-2);padding:13px 18px;border-bottom:1px solid var(--line);background:#fbfcfe}\ntbody td{padding:12px 18px;border-bottom:1px solid var(--line-2);vertical-align:middle}\ntbody tr:last-child td{border-bottom:none}\n\n/* group header row */\ntr.group{cursor:pointer;transition:background .12s}\ntr.group:hover{background:#fbfcfe}\ntr.group td{padding:13px 18px}\n.gcell{display:flex;align-items:center;gap:10px}\n.chev{width:16px;height:16px;color:var(--muted-2);transition:transform .15s;flex:none}\ntr.group.open .chev{transform:rotate(90deg)}\n.gname{font-weight:650;color:var(--ink);font-size:14.5px;letter-spacing:-.01em}\n.gmeta{color:var(--muted-2);font-size:12px;font-weight:500}\n.badge-count{background:var(--slate-bg);color:var(--muted);font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;font-variant-numeric:tabular-nums}\n\n/* child row */\ntr.child{background:#fcfdff}\ntr.child td{padding:9px 18px 9px 18px}\ntr.child .host{padding-left:26px;color:var(--ink-2);font-size:13px}\ntr.child .host .port{color:var(--muted-2);font-size:11.5px}\ntr.child.hidden{display:none}\n\n.vol{font-variant-numeric:tabular-nums;color:var(--muted);font-size:13px;white-space:nowrap}\n.vol .up{color:var(--blurple)}\n.vol .dn{color:var(--green-ink)}\n.pay{font-size:12px;font-weight:600}\n.pay.vis{color:var(--green-ink)}\n.pay.lock{color:var(--muted-2)}\n\n/* verdict pills */\n.verdict{display:inline-block;font-size:11.5px;font-weight:600;padding:3px 10px;border-radius:999px;white-space:nowrap}\n.verdict.allow{background:var(--green-bg);color:var(--green-ink)}\n.verdict.leak{background:var(--amber-bg);color:var(--amber)}\n.verdict.blocked{background:var(--red-bg);color:var(--red)}\n.verdict.locked{background:var(--slate-bg);color:var(--muted)}\n.verdict.system{background:transparent;color:var(--muted-2);border:1px dashed var(--line)}\n.verdict.mixed{background:rgba(99,91,255,.10);color:var(--blurple-deep)}\n.findings{margin-top:5px;display:flex;gap:5px;flex-wrap:wrap}\n.findings span{font-size:10.5px;font-weight:600;background:var(--amber-bg);color:var(--amber);border-radius:5px;padding:1px 6px;white-space:nowrap}\n\n/* buttons */\n.btn{font-size:12px;font-weight:600;padding:6px 13px;border-radius:7px;border:1px solid var(--line);background:var(--surface);color:var(--muted);transition:.13s;white-space:nowrap}\n.btn:hover{border-color:var(--red);color:var(--red);background:var(--red-bg)}\n.btn.unblock{border-color:var(--green);color:var(--green-ink);background:var(--green-bg)}\n.btn.unblock:hover{filter:brightness(.97)}\n.btn:disabled{opacity:.4;cursor:not-allowed}\n.btn.app{font-weight:650}\n\ntr.row-leak{box-shadow:inset 3px 0 0 var(--amber)}\ntr.row-blocked{box-shadow:inset 3px 0 0 var(--red)}\ntr.group.gv-leak{box-shadow:inset 3px 0 0 var(--amber)}\ntr.group.gv-blocked{box-shadow:inset 3px 0 0 var(--red)}\n\n.empty{padding:54px;text-align:center;color:var(--muted-2)}\n.empty .pulse{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--blurple);margin-left:6px;animation:pulse 1.2s ease-in-out infinite}\n@keyframes pulse{0%,100%{opacity:.3}50%{opacity:1}}\n\nfooter{max-width:1320px;margin:0 auto;padding:18px 26px;color:var(--muted-2);font-size:12.5px}\nfooter b{color:var(--muted);font-weight:600}\n\n</style>\n</head>\n<body>\n\n<header>\n  <div class="head-inner">\n    <div class="brand"><span class="logo"></span>Sentinet</div>\n    <div id="mode" class="mode-tag">connecting…</div>\n    <span id="mode-note" class="mode-note"></span>\n    <div class="stats">\n      <div class="stat"><div class="k">apps</div><div id="s-apps" class="v">0</div></div>\n      <div class="stat"><div class="k">conns</div><div id="s-conns" class="v">0</div></div>\n      <div class="stat"><div class="k">up</div><div id="s-up" class="v up">0 B/s</div></div>\n      <div class="stat"><div class="k">down</div><div id="s-down" class="v down">0 B/s</div></div>\n      <div class="stat"><div class="k">blocked</div><div id="s-blocked" class="v">0</div></div>\n    </div>\n  </div>\n</header>\n\n<main>\n  <div class="controls">\n    <div class="search">\n      <span class="ic">⌕</span>\n      <input id="filter" type="text" placeholder="Filter by process or host…" autocomplete="off" spellcheck="false">\n    </div>\n    <div class="chips" id="chips">\n      <button class="chip active" data-v="all">All <span class="n" id="c-all">0</span></button>\n      <button class="chip" data-v="leak">Leaks <span class="n" id="c-leak">0</span></button>\n      <button class="chip" data-v="blocked">Blocked <span class="n" id="c-blocked">0</span></button>\n      <button class="chip" data-v="locked">Locked <span class="n" id="c-locked">0</span></button>\n    </div>\n    <label class="toggle"><input type="checkbox" id="group-toggle" checked> Group by process</label>\n  </div>\n\n  <div class="card">\n    <table>\n      <thead>\n        <tr>\n          <th style="width:34%">Process / Host</th>\n          <th style="width:16%">Volume ↑↓</th>\n          <th style="width:12%">Payload</th>\n          <th style="width:24%">Verdict</th>\n          <th style="width:14%">Action</th>\n        </tr>\n      </thead>\n      <tbody id="rows"></tbody>\n    </table>\n    <div id="empty" class="empty">Waiting for traffic<span class="pulse"></span></div>\n  </div>\n</main>\n\n<footer>\n  <b>Sentinet</b> · outbound network monitor · where traffic is encrypted we show metadata and say so — we don\'t pretend to see what we can\'t.\n</footer>\n\n<script>\n/* Sentinet dashboard client.\n * Live SSE feed → group connections by process, filter, expand/collapse,\n * one-click block (per host or whole app).\n */\n(() => {\n  const rowsEl = document.getElementById("rows");\n  const emptyEl = document.getElementById("empty");\n  const filterEl = document.getElementById("filter");\n  const groupToggle = document.getElementById("group-toggle");\n\n  const conns = new Map();                     // cid -> connection\n  const blocked = { hosts: new Set(), processes: new Set() };\n  const collapsed = new Set();                 // process names collapsed (default)\n  let filterText = "";\n  let verdictFilter = "all";\n  let groupBy = true;\n\n  const VERDICT_LABEL = {\n    allow: "Allowed", leak: "Leak suspected", blocked: "Blocked",\n    locked: "Content unavailable", system: "System — excluded", mixed: "Active",\n  };\n  // higher = shown as the group\'s representative verdict\n  const VRANK = { leak: 5, blocked: 4, allow: 3, locked: 2, system: 1 };\n\n  // ---- helpers ----\n  const fmtBytes = (n) => {\n    if (n < 1024) return n + " B";\n    if (n < 1048576) return (n / 1024).toFixed(1) + " KB";\n    if (n < 1073741824) return (n / 1048576).toFixed(1) + " MB";\n    return (n / 1073741824).toFixed(2) + " GB";\n  };\n  const fmtRate = (bps) => fmtBytes(bps) + "/s";\n  const esc = (s) => String(s).replace(/[&<>"]/g, (c) =>\n    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", \'"\': "&quot;" }[c]));\n\n  const passesText = (c) =>\n    !filterText ||\n    c.process.toLowerCase().includes(filterText) ||\n    c.host.toLowerCase().includes(filterText);\n  const passesVerdict = (c) => verdictFilter === "all" || c.verdict === verdictFilter;\n\n  const verdictPill = (v) =>\n    `<span class="verdict ${v}">${VERDICT_LABEL[v] || v}</span>`;\n  const findingsHtml = (f) => !f || !f.length ? "" :\n    `<div class="findings">${f.map((x) =>\n      `<span title="${esc(x.severity)}">${esc(x.kind)}: ${esc(x.sample)}</span>`).join("")}</div>`;\n  const volCell = (up, dn) =>\n    `<span class="vol"><span class="up">↑${fmtBytes(up)}</span> <span class="dn">↓${fmtBytes(dn)}</span></span>`;\n  const payCell = (vis) =>\n    `<td><span class="pay ${vis ? "vis" : "lock"}">${vis ? "readable" : "🔒 locked"}</span></td>`;\n\n  const hostBtn = (c) => {\n    const isB = blocked.hosts.has(c.host);\n    if (c.verdict === "system") return `<button class="btn" disabled>—</button>`;\n    return isB\n      ? `<button class="btn unblock" data-host="${esc(c.host)}" data-act="unblock">Unblock</button>`\n      : `<button class="btn" data-host="${esc(c.host)}" data-act="block">Block</button>`;\n  };\n  const appBtn = (proc) => {\n    const isB = blocked.processes.has(proc);\n    return isB\n      ? `<button class="btn unblock app" data-proc="${esc(proc)}" data-act="unblock">Unblock app</button>`\n      : `<button class="btn app" data-proc="${esc(proc)}" data-act="block">Block app</button>`;\n  };\n\n  // ---- counts for the filter chips (from ALL conns) ----\n  function updateCounts() {\n    let leak = 0, blk = 0, lock = 0;\n    for (const c of conns.values()) {\n      if (c.verdict === "leak") leak++;\n      else if (c.verdict === "blocked") blk++;\n      else if (c.verdict === "locked") lock++;\n    }\n    document.getElementById("c-all").textContent = conns.size;\n    document.getElementById("c-leak").textContent = leak;\n    document.getElementById("c-blocked").textContent = blk;\n    document.getElementById("c-locked").textContent = lock;\n  }\n\n  // ---- render ----\n  let raf = null;\n  const scheduleRender = () => { if (!raf) raf = requestAnimationFrame(() => { raf = null; render(); }); };\n\n  function render() {\n    updateCounts();\n    const visible = [...conns.values()].filter((c) => passesText(c) && passesVerdict(c));\n\n    let html = "";\n    if (groupBy) {\n      const groups = new Map();                // process -> conns[]\n      for (const c of visible) {\n        if (!groups.has(c.process)) groups.set(c.process, []);\n        groups.get(c.process).push(c);\n      }\n      // sort groups by total volume desc\n      const ordered = [...groups.entries()].sort((a, b) =>\n        b[1].reduce((s, c) => s + c.bytes_up + c.bytes_down, 0) -\n        a[1].reduce((s, c) => s + c.bytes_up + c.bytes_down, 0));\n\n      document.getElementById("s-apps").textContent = groups.size;\n\n      for (const [proc, list] of ordered) {\n        const up = list.reduce((s, c) => s + c.bytes_up, 0);\n        const dn = list.reduce((s, c) => s + c.bytes_down, 0);\n        const gv = list.reduce((v, c) => (VRANK[c.verdict] > VRANK[v] ? c.verdict : v), "system");\n        const pid = list[0].pid;\n        const isOpen = !collapsed.has(proc);\n        const gvClass = gv === "leak" ? "gv-leak" : gv === "blocked" ? "gv-blocked" : "";\n        html += `<tr class="group ${isOpen ? "open" : ""} ${gvClass}" data-proc="${esc(proc)}">\n          <td><div class="gcell">\n            <svg class="chev" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>\n            <span class="gname">${esc(proc)}</span>\n            <span class="gmeta">${pid ? "#" + pid : ""}</span>\n            <span class="badge-count">${list.length} conn${list.length > 1 ? "s" : ""}</span>\n          </div></td>\n          <td>${volCell(up, dn)}</td>\n          <td><span class="pay ${list.some((c) => c.payload_visible) ? "vis" : "lock"}">${list.some((c) => c.payload_visible) ? "readable" : "🔒 locked"}</span></td>\n          <td>${verdictPill(gv)}</td>\n          <td>${appBtn(proc)}</td>\n        </tr>`;\n        if (isOpen) {\n          for (const c of list.sort((a, b) => (b.bytes_up + b.bytes_down) - (a.bytes_up + a.bytes_down))) {\n            html += `<tr class="child ${c.verdict === "leak" ? "row-leak" : c.verdict === "blocked" ? "row-blocked" : ""}">\n              <td class="host">${esc(c.host)}<span class="port"> :${c.port}</span></td>\n              <td>${volCell(c.bytes_up, c.bytes_down)}</td>\n              ${payCell(c.payload_visible)}\n              <td>${verdictPill(c.verdict)}${findingsHtml(c.findings)}</td>\n              <td>${hostBtn(c)}</td>\n            </tr>`;\n          }\n        }\n      }\n    } else {\n      document.getElementById("s-apps").textContent = new Set([...conns.values()].map((c) => c.process)).size;\n      for (const c of visible.sort((a, b) => (b.bytes_up + b.bytes_down) - (a.bytes_up + a.bytes_down))) {\n        html += `<tr class="${c.verdict === "leak" ? "row-leak" : c.verdict === "blocked" ? "row-blocked" : ""}">\n          <td><span class="gname">${esc(c.process)}</span> <span class="gmeta">${esc(c.host)}<span class="port"> :${c.port}</span></span></td>\n          <td>${volCell(c.bytes_up, c.bytes_down)}</td>\n          ${payCell(c.payload_visible)}\n          <td>${verdictPill(c.verdict)}${findingsHtml(c.findings)}</td>\n          <td>${hostBtn(c)}</td>\n        </tr>`;\n      }\n    }\n\n    rowsEl.innerHTML = html;\n    emptyEl.style.display = visible.length ? "none" : "block";\n  }\n\n  // ---- interactions ----\n  rowsEl.addEventListener("click", async (e) => {\n    const btn = e.target.closest(".btn");\n    if (btn) {\n      e.stopPropagation();\n      if (btn.disabled) return;\n      const body = { action: btn.dataset.act };\n      if (btn.dataset.host) body.host = btn.dataset.host;\n      if (btn.dataset.proc) body.process = btn.dataset.proc;\n      btn.disabled = true;\n      try {\n        await fetch("/api/block", {\n          method: "POST", headers: { "Content-Type": "application/json" },\n          body: JSON.stringify(body),\n        });\n      } catch (_) { btn.disabled = false; }\n      return;\n    }\n    const grp = e.target.closest("tr.group");\n    if (grp) {\n      const proc = grp.dataset.proc;\n      if (collapsed.has(proc)) collapsed.delete(proc); else collapsed.add(proc);\n      render();\n    }\n  });\n\n  filterEl.addEventListener("input", () => { filterText = filterEl.value.trim().toLowerCase(); render(); });\n  groupToggle.addEventListener("change", () => { groupBy = groupToggle.checked; render(); });\n  document.getElementById("chips").addEventListener("click", (e) => {\n    const chip = e.target.closest(".chip");\n    if (!chip) return;\n    verdictFilter = chip.dataset.v;\n    document.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c === chip));\n    render();\n  });\n\n  // ---- SSE ----\n  function applyBlocked(b) {\n    blocked.hosts = new Set(b.hosts || []);\n    blocked.processes = new Set(b.processes || []);\n    document.getElementById("s-blocked").textContent = blocked.hosts.size + blocked.processes.size;\n  }\n\n  function connect() {\n    const src = new EventSource("/events");\n    const modeEl = document.getElementById("mode");\n    const noteEl = document.getElementById("mode-note");\n    const MODE_NOTE = {\n      passive: "real metadata · payload always 🔒 · blocking is <b>advisory</b> here",\n      live: "real capture · payload readable where TLS allows",\n      demo: "simulated feed",\n    };\n    const setMode = (mode) => {\n      if (!mode) return;\n      modeEl.textContent = mode + " mode";\n      ["demo", "live", "passive"].forEach((m) => modeEl.classList.toggle(m, m === mode));\n      if (noteEl) noteEl.innerHTML = MODE_NOTE[mode] || "";\n    };\n\n    src.onmessage = (ev) => {\n      const msg = JSON.parse(ev.data);\n      if (msg.type === "snapshot") {\n        setMode(msg.mode);\n        conns.clear();\n        (msg.connections || []).forEach((c) => conns.set(c.cid, c));\n        applyBlocked(msg.blocked || {});\n        render();\n      } else if (msg.type === "conn") {\n        conns.set(msg.conn.cid, msg.conn);\n        scheduleRender();\n      } else if (msg.type === "stats") {\n        setMode(msg.mode);\n        document.getElementById("s-conns").textContent = msg.connections;\n        document.getElementById("s-up").textContent = fmtRate(msg.up_bps);\n        document.getElementById("s-down").textContent = fmtRate(msg.down_bps);\n        const before = blocked.hosts.size + blocked.processes.size;\n        applyBlocked(msg.blocked || {});\n        if (before !== blocked.hosts.size + blocked.processes.size) render();\n      }\n    };\n    src.onerror = () => { modeEl.textContent = "reconnecting…"; };\n  }\n\n  connect();\n})();\n\n</script>\n</body>\n</html>\n'

# ===================== rules / verdict =====================
_SYSTEM_NAMES = {
    "mDNSResponder", "trustd", "apsd", "nsurlsessiond", "rapportd", "cloudd",
    "syncdefaultsd", "identityservicesd", "AssetCacheLocatorService", "configd",
    "softwareupdated", "akd", "geod", "timed", "locationd", "remindd",
    "commerce", "appstoreagent", "mdmclient", "networkserviceproxy",
    "amsengagementd", "symptomsd", "airportd",
}
_SYSTEM_PREFIXES = ("com.apple.", "system_", "_system")


def is_system_process(name):
    if not name:
        return False
    return name in _SYSTEM_NAMES or name.startswith(_SYSTEM_PREFIXES)


class RuleSet:
    def __init__(self):
        self._lock = threading.Lock()
        self._hosts = set()
        self._procs = set()

    def block(self, host=None, process=None):
        with self._lock:
            if host:
                self._hosts.add(host)
            if process:
                self._procs.add(process)

    def unblock(self, host=None, process=None):
        with self._lock:
            if host:
                self._hosts.discard(host)
            if process:
                self._procs.discard(process)

    def snapshot(self):
        with self._lock:
            return {"hosts": sorted(self._hosts), "processes": sorted(self._procs)}

    def is_blocked(self, host, process):
        with self._lock:
            return host in self._hosts or (process is not None and process in self._procs)


RULES = RuleSet()


def decide(c):
    if is_system_process(c["process"]):
        return "system"
    if RULES.is_blocked(c["host"], c["process"]):
        return "blocked"
    if c["findings"]:
        return "leak"
    if not c["payload_visible"]:
        return "locked"
    return "allow"


# ===================== store + SSE bus =====================
class Store:
    def __init__(self):
        self._lock = threading.Lock()
        self._conns = {}
        self._subs = []
        self.mode = "passive"
        self._tu = self._td = self._lu = self._ld = 0
        self._last = time.time()

    def subscribe(self):
        q = queue.Queue(maxsize=1000)
        with self._lock:
            self._subs.append(q)
        return q

    def unsubscribe(self, q):
        with self._lock:
            if q in self._subs:
                self._subs.remove(q)

    def _publish(self, ev):
        with self._lock:
            subs = list(self._subs)
        for q in subs:
            try:
                q.put_nowait(ev)
            except queue.Full:
                pass

    def record(self, process, pid, host, port, scheme="https",
               bytes_up=0, bytes_down=0, payload_visible=False):
        cid = process + "@" + host
        now = time.time()
        with self._lock:
            c = self._conns.get(cid)
            if c is None:
                c = {"cid": cid, "process": process, "pid": pid, "host": host,
                     "port": port, "scheme": scheme, "direction": "outbound",
                     "bytes_up": 0, "bytes_down": 0, "payload_visible": payload_visible,
                     "verdict": "locked", "findings": [], "requests": 0,
                     "first_seen": now, "last_seen": now}
                self._conns[cid] = c
            c["bytes_up"] += bytes_up
            c["bytes_down"] += bytes_down
            c["requests"] += 1
            c["last_seen"] = now
            c["pid"] = pid or c["pid"]
            if payload_visible:
                c["payload_visible"] = True
            c["verdict"] = decide(c)
            self._tu += bytes_up
            self._td += bytes_down
            snap = dict(c)
        self._publish({"type": "conn", "conn": snap})

    def reverdict_all(self):
        with self._lock:
            conns = list(self._conns.values())
            for c in conns:
                c["verdict"] = decide(c)
            snaps = [dict(c) for c in conns]
        for s in snaps:
            self._publish({"type": "conn", "conn": s})

    def snapshot(self):
        with self._lock:
            return [dict(c) for c in self._conns.values()]

    def tick_stats(self):
        now = time.time()
        with self._lock:
            dt = max(now - self._last, 1e-3)
            up = (self._tu - self._lu) / dt
            dn = (self._td - self._ld) / dt
            self._lu, self._ld, self._last = self._tu, self._td, now
            conns = len(self._conns)
        stats = {"type": "stats", "mode": self.mode, "up_bps": up, "down_bps": dn,
                 "connections": conns, "blocked": RULES.snapshot()}
        self._publish(stats)


STORE = Store()


def start_stats_ticker():
    def loop():
        while True:
            time.sleep(1.0)
            STORE.tick_stats()
    threading.Thread(target=loop, name="stats", daemon=True).start()


# ===================== passive engine (nettop + lsof) =====================
_CONN_RE = re.compile(r"->(\d{1,3}(?:\.\d{1,3}){3}):(\d+)")
_ESC_RE = re.compile(r"\\x([0-9a-fA-F]{2})")
_CONN_INTERVAL = 2.0
_BYTES_INTERVAL = 6.0
_latest = {}
_latest_lock = threading.Lock()
_dns_cache = {}
_dns_lock = threading.Lock()
_dns_q = queue.Queue()


def _unescape(s):
    return _ESC_RE.sub(lambda m: chr(int(m.group(1), 16)), s)


def _dns_worker():
    while True:
        ip = _dns_q.get()
        host = ip
        try:
            host = socket.gethostbyaddr(ip)[0]
        except Exception:
            host = ip
        with _dns_lock:
            _dns_cache[ip] = host


def _hostname(ip):
    with _dns_lock:
        if ip in _dns_cache:
            return _dns_cache[ip]
        _dns_cache[ip] = ip
    _dns_q.put(ip)
    return ip


def _poll_connections():
    conns = {}
    try:
        out = subprocess.run(["lsof", "-nP", "-i", "+c", "0"],
                             capture_output=True, text=True, timeout=4.0).stdout
    except (subprocess.SubprocessError, OSError):
        return conns
    for line in out.splitlines():
        if line.startswith("COMMAND"):
            continue
        tokens = line.split()
        if len(tokens) < 8:
            continue
        pid_idx = next((i for i, t in enumerate(tokens) if i > 0 and t.isdigit()), None)
        if not pid_idx:
            continue
        proc = _unescape(" ".join(tokens[:pid_idx]))
        try:
            pid = int(tokens[pid_idx])
        except ValueError:
            continue
        is_udp = "UDP" in tokens
        if not is_udp and "ESTABLISHED" not in line:
            continue
        m = _CONN_RE.search(line)
        if not m:
            continue
        ip, port = m.group(1), int(m.group(2))
        if ip.startswith("127.") or ip == "::1":
            continue
        kind = "UDP" if is_udp else "TCP"
        conns.setdefault(pid, (proc, set()))[1].add((ip, port, kind))
    return conns


def _poll_bytes():
    stats = {}
    try:
        out = subprocess.run(["nettop", "-P", "-L", "1", "-x"],
                             capture_output=True, text=True, timeout=10.0).stdout
    except (subprocess.SubprocessError, OSError):
        return stats
    for line in out.splitlines():
        f = line.split(",")
        if len(f) < 6 or "." not in f[1]:
            continue
        try:
            pid = int(f[1].rsplit(".", 1)[1])
            stats[pid] = (int(f[4]), int(f[5]))
        except (ValueError, IndexError):
            continue
    return stats


def _scheme(port, proto):
    return "https" if port == 443 else "http" if port == 80 else proto.lower()


def _connections_loop():
    while True:
        try:
            conns = _poll_connections()
            with _latest_lock:
                _latest.clear()
                _latest.update(conns)
            for pid, (proc, flows) in conns.items():
                if is_system_process(proc) or not flows:
                    continue
                for ip, port, proto in flows:
                    STORE.record(proc, pid, _hostname(ip), port, _scheme(port, proto),
                                 0, 0, payload_visible=False)
        except Exception:
            pass
        time.sleep(_CONN_INTERVAL)


def _bytes_loop():
    prev = _poll_bytes()
    time.sleep(_BYTES_INTERVAL)
    while True:
        try:
            now = _poll_bytes()
            with _latest_lock:
                snap = {pid: (p, set(f)) for pid, (p, f) in _latest.items()}
            for pid, (cin, cout) in now.items():
                if pid not in prev or pid not in snap:
                    continue
                din = max(0, cin - prev[pid][0])
                dout = max(0, cout - prev[pid][1])
                proc, flows = snap[pid]
                if not flows or (din == 0 and dout == 0):
                    continue
                si, so = din // len(flows), dout // len(flows)
                for ip, port, proto in flows:
                    STORE.record(proc, pid, _hostname(ip), port, _scheme(port, proto),
                                 so, si, payload_visible=False)
            prev = now
        except Exception:
            pass
        time.sleep(_BYTES_INTERVAL)


def start_passive_monitor():
    for fn, nm in ((_dns_worker, "dns"), (_connections_loop, "conns"), (_bytes_loop, "bytes")):
        threading.Thread(target=fn, name=nm, daemon=True).start()


# ===================== dashboard server =====================
class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/":
            self._bytes(DASHBOARD_HTML.encode(), "text/html")
        elif path == "/api/state":
            self._json({"connections": STORE.snapshot(), "blocked": RULES.snapshot()})
        elif path == "/events":
            self._events()
        else:
            self.send_error(404)

    def do_POST(self):
        if self.path != "/api/block":
            self.send_error(404)
            return
        n = int(self.headers.get("Content-Length", 0))
        try:
            body = json.loads(self.rfile.read(n) or b"{}")
        except json.JSONDecodeError:
            self.send_error(400)
            return
        host, proc = body.get("host"), body.get("process")
        if body.get("action") == "unblock":
            RULES.unblock(host=host, process=proc)
        else:
            RULES.block(host=host, process=proc)
        STORE.reverdict_all()
        self._json({"ok": True, "blocked": RULES.snapshot()})

    def _bytes(self, data, ctype):
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _json(self, obj, code=200):
        self._bytes(json.dumps(obj).encode(), "application/json")

    def _events(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        q = STORE.subscribe()
        try:
            self._sse(json.dumps({"type": "snapshot", "mode": STORE.mode,
                                  "connections": STORE.snapshot(),
                                  "blocked": RULES.snapshot()}))
            while True:
                try:
                    self._sse(json.dumps(q.get(timeout=15)))
                except queue.Empty:
                    self.wfile.write(b": keepalive\n\n")
                    self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            STORE.unsubscribe(q)

    def _sse(self, payload):
        self.wfile.write(("data: " + payload + "\n\n").encode())
        self.wfile.flush()


class _QuietServer(ThreadingHTTPServer):
    daemon_threads = True

    def handle_error(self, request, client_address):
        exc = sys.exc_info()[1]
        if isinstance(exc, (ConnectionResetError, BrokenPipeError)):
            return
        super().handle_error(request, client_address)


def start_server(host, port):
    httpd = _QuietServer((host, port), Handler)
    threading.Thread(target=httpd.serve_forever, name="dashboard", daemon=True).start()
    return httpd


# ===================== main =====================
def main():
    import argparse
    p = argparse.ArgumentParser(description="Sentinet - passive network monitor (single file)")
    p.add_argument("--port", type=int, default=8787)
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--no-browser", action="store_true")
    args = p.parse_args()

    if sys.platform != "darwin":
        print("[sentinet] Note: passive mode uses macOS tools (nettop, lsof). "
              "On other systems it will show no data.")

    start_server(args.host, args.port)
    start_stats_ticker()
    start_passive_monitor()

    url = "http://%s:%d" % (args.host, args.port)
    print("[sentinet] passive monitor running -> " + url)
    print("[sentinet] showing your apps' real outbound connections (metadata only).")
    print("[sentinet] payload is never read; blocking here is advisory. Ctrl+C to stop.")
    if not args.no_browser:
        try:
            webbrowser.open(url)
        except Exception:
            pass
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n[sentinet] bye.")


if __name__ == "__main__":
    main()
