/* ── Tab navigation ───────────────────────────────────────────── */
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${tab}`).classList.add("active");

    if (tab === "messages") loadMessages();
    if (tab === "tools") loadApps();
    if (tab === "toolcalls") loadToolCalls();
    if (tab === "usage") loadUsage();
    if (tab === "charts") loadCharts();
    if (tab === "logs") loadLogs();
    if (tab === "database") loadDbTables();
  });
});

/* ── Helpers ──────────────────────────────────────────────────── */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso.includes("T") ? iso : iso + "Z");
  return d.toLocaleString();
}

async function apiFetch(path) {
  const resp = await fetch(`/api${path}`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

function setEl(id, html) {
  document.getElementById(id).innerHTML = html;
}

/* ── Status dot ───────────────────────────────────────────────── */
async function checkStatus() {
  const dot = document.getElementById("status-dot");
  try {
    await apiFetch("/messages?limit=1");
    dot.className = "status-dot ok";
    dot.title = "API reachable";
  } catch {
    dot.className = "status-dot err";
    dot.title = "API unreachable";
  }
  updateTabStats();
}

/* ── Messages ─────────────────────────────────────────────────── */
async function loadMessages() {
  setEl("messages-list", '<p class="loading">Loading…</p>');
  try {
    const data = await apiFetch("/messages?limit=100");
    const msgs = data.messages || [];
    if (!msgs.length) {
      setEl("messages-list", '<p class="empty">No messages yet.</p>');
      return;
    }
    const html = msgs
      .slice()
      .reverse()
      .map(
        (m) => `
        <div class="message-bubble ${escapeHtml(m.role)}">
          ${escapeHtml(m.content)}
          <div class="bubble-meta">${escapeHtml(m.role)} · ${fmtDate(m.created_at)}</div>
        </div>`
      )
      .join("");
    setEl("messages-list", html);
    const el = document.getElementById("messages-list");
    el.scrollTop = el.scrollHeight;
  } catch (e) {
    setEl("messages-list", `<p class="error">Error: ${escapeHtml(e.message)}</p>`);
  }
}

/* ── Memories ─────────────────────────────────────────────────── */
async function loadMemories() {
  setEl("memories-list", '<p class="loading">Loading…</p>');
  try {
    const data = await apiFetch("/memories");
    renderMemories(data.memories || []);
  } catch (e) {
    setEl("memories-list", `<p class="error">Error: ${escapeHtml(e.message)}</p>`);
  }
}

async function searchMemories() {
  const q = document.getElementById("memory-search").value.trim();
  if (!q) { loadMemories(); return; }
  setEl("memories-list", '<p class="loading">Searching…</p>');
  try {
    const data = await apiFetch(`/memories?q=${encodeURIComponent(q)}`);
    renderMemories(data.memories || []);
  } catch (e) {
    setEl("memories-list", `<p class="error">Error: ${escapeHtml(e.message)}</p>`);
  }
}

function renderMemories(memories) {
  if (!memories.length) {
    setEl("memories-list", '<p class="empty">No memories found.</p>');
    return;
  }
  const html = memories
    .map((m) => {
      const content = m.content || (m.chunks && m.chunks[0] && m.chunks[0].content) || JSON.stringify(m);
      const date = m.created_at ? `<span style="float:right;color:var(--muted);font-size:11px">${fmtDate(m.created_at)}</span>` : "";
      const badge = m.is_static ? `<span class="badge green" style="margin-left:.5rem">static</span>` : "";
      return `<div class="card"><div class="card-body">${date}${escapeHtml(content)}${badge}</div></div>`;
    })
    .join("");
  setEl("memories-list", html);
}

document.getElementById("memory-search").addEventListener("keydown", (e) => {
  if (e.key === "Enter") searchMemories();
});

/* ── Apps (Tools tab) ─────────────────────────────────────────── */
let _allApps = [];

async function loadApps() {
  setEl("apps-grid", '<p class="loading">Loading apps…</p>');
  setEl("apps-summary", "");
  try {
    const data = await apiFetch("/apps");
    _allApps = data.apps || [];

    // Populate category filter
    const cats = new Set();
    _allApps.forEach((a) => (a.categories || []).forEach((c) => cats.add(c)));
    const sel = document.getElementById("apps-category");
    const existing = Array.from(sel.options).map((o) => o.value);
    [...cats].sort().forEach((c) => {
      if (!existing.includes(c)) {
        const opt = document.createElement("option");
        opt.value = c;
        opt.textContent = c.charAt(0).toUpperCase() + c.slice(1);
        sel.appendChild(opt);
      }
    });

    renderApps();
  } catch (e) {
    setEl("apps-grid", `<p class="error">Error loading apps: ${escapeHtml(e.message)}</p>`);
  }
}

function filterApps() {
  renderApps();
}

function renderApps() {
  const query = (document.getElementById("apps-search").value || "").toLowerCase();
  const category = document.getElementById("apps-category").value;

  let filtered = _allApps.filter((a) => {
    const matchesQuery =
      !query ||
      a.displayName.toLowerCase().includes(query) ||
      (a.description || "").toLowerCase().includes(query);
    const matchesCat =
      !category || (a.categories || []).includes(category);
    return matchesQuery && matchesCat;
  });

  // Connected apps first
  filtered.sort((a, b) => {
    if (a.connected && !b.connected) return -1;
    if (!a.connected && b.connected) return 1;
    return a.displayName.localeCompare(b.displayName);
  });

  const connected = _allApps.filter((a) => a.connected).length;
  document.getElementById("apps-summary").textContent =
    `${connected} connected · ${filtered.length} shown of ${_allApps.length} apps`;

  if (!filtered.length) {
    setEl("apps-grid", '<p class="empty">No apps match your search.</p>');
    return;
  }

  const html = filtered.map((app) => renderAppCard(app)).join("");
  setEl("apps-grid", html);
}

function renderAppCard(app) {
  const logoHtml = app.logo
    ? `<img class="app-logo" src="${escapeHtml(app.logo)}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" /><span class="app-logo-fallback" style="display:none">${escapeHtml(app.displayName.charAt(0))}</span>`
    : `<span class="app-logo-fallback">${escapeHtml(app.displayName.charAt(0))}</span>`;

  const cats = (app.categories || [])
    .slice(0, 2)
    .map((c) => `<span class="app-cat-tag">${escapeHtml(c)}</span>`)
    .join("");

  const btnClass = app.connected ? "btn-connect connected" : "btn-connect";
  const btnLabel = app.connected ? "Connected" : "Connect";
  const btnDisabled = app.no_auth ? 'disabled title="No auth required"' : "";
  const btnOnclick = app.connected || app.no_auth
    ? ""
    : `onclick="connectApp('${escapeHtml(app.key)}', '${escapeHtml(app.displayName)}')"`;

  return `
    <div class="app-card${app.connected ? " connected" : ""}" id="app-card-${escapeHtml(app.key)}">
      <div class="app-card-header">
        ${logoHtml}
        <div>
          <div class="app-name">${escapeHtml(app.displayName)}</div>
          <div class="app-categories">${cats}</div>
        </div>
      </div>
      <div class="app-description">${escapeHtml(app.description || "")}</div>
      <div class="app-footer">
        <span class="app-actions-count">${app.actionsCount} actions</span>
        <button class="${btnClass}" ${btnOnclick} ${btnDisabled}>${btnLabel}</button>
      </div>
    </div>`;
}

async function connectApp(appKey, appName) {
  // Update button state immediately
  const card = document.getElementById(`app-card-${appKey}`);
  if (card) {
    const btn = card.querySelector(".btn-connect");
    if (btn) { btn.textContent = "Connecting…"; btn.className = "btn-connect loading-btn"; btn.onclick = null; }
  }

  try {
    const resp = await fetch(`/api/tools/${appKey.toUpperCase()}/authorize`, { method: "POST" });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.detail || "Unknown error");

    // Open OAuth in new tab
    window.open(data.redirect_url, "_blank");

    // Show toast with the URL in case popup was blocked
    showOAuthToast(appName, data.redirect_url);

    // Reset button — user needs to refresh after completing OAuth
    if (card) {
      const btn = card.querySelector(".btn-connect");
      if (btn) { btn.textContent = "Connect"; btn.className = "btn-connect"; btn.onclick = () => connectApp(appKey, appName); }
    }
  } catch (e) {
    if (card) {
      const btn = card.querySelector(".btn-connect");
      if (btn) { btn.textContent = "Connect"; btn.className = "btn-connect"; btn.onclick = () => connectApp(appKey, appName); }
    }
    showOAuthToast(appName, null, e.message);
  }
}

function showOAuthToast(appName, url, errorMsg) {
  const toast = document.getElementById("oauth-toast");
  if (errorMsg) {
    toast.innerHTML = `<span class="oauth-toast-close" onclick="document.getElementById('oauth-toast').classList.add('hidden')">✕</span>
      <strong>Error connecting ${escapeHtml(appName)}:</strong> ${escapeHtml(errorMsg)}`;
  } else {
    toast.innerHTML = `<span class="oauth-toast-close" onclick="document.getElementById('oauth-toast').classList.add('hidden')">✕</span>
      <strong>Connecting ${escapeHtml(appName)}</strong> — a new tab opened for sign-in.
      If it was blocked: <a href="${escapeHtml(url)}" target="_blank">click here</a>.
      <br><small style="color:var(--muted)">Refresh this page after completing sign-in.</small>`;
  }
  toast.classList.remove("hidden");
}

/* ── Tool Calls ───────────────────────────────────────────────── */
async function loadToolCalls() {
  setEl("toolcalls-list", '<p class="loading">Loading…</p>');
  try {
    const data = await apiFetch("/tool-calls?limit=50");
    const calls = data.tool_calls || [];
    if (!calls.length) {
      setEl("toolcalls-list", '<p class="empty">No tool calls logged yet.</p>');
      return;
    }
    const html = calls
      .map((c) => {
        let input = c.input_json;
        let output = c.output_json;
        try { input = JSON.stringify(JSON.parse(input), null, 2); } catch {}
        try { output = JSON.stringify(JSON.parse(output), null, 2); } catch {}
        return `
          <div class="card">
            <div class="card-title">${escapeHtml(c.tool_name)} <span class="badge grey">${fmtDate(c.created_at)}</span></div>
            ${c.message_content ? `<div class="card-body" style="margin-bottom:.5rem">Triggered by: "${escapeHtml(c.message_content.slice(0, 80))}"</div>` : ""}
            <details>
              <summary style="cursor:pointer;color:var(--muted);font-size:12px">Input / Output</summary>
              <pre>${escapeHtml(input || "")}</pre>
              ${output ? `<pre>${escapeHtml(output || "")}</pre>` : ""}
            </details>
          </div>`;
      })
      .join("");
    setEl("toolcalls-list", html);
  } catch (e) {
    setEl("toolcalls-list", `<p class="error">Error: ${escapeHtml(e.message)}</p>`);
  }
}

/* ── Usage & Cost ─────────────────────────────────────────────── */
async function loadUsage() {
  setEl("usage-log", '<p class="loading">Loading…</p>');
  try {
    const d = await apiFetch("/usage");

    // Stat cards
    const stats = `
      <div class="stat-card">
        <div class="stat-value">$${d.total_cost_usd.toFixed(4)}</div>
        <div class="stat-label">Total spend</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">$${d.month_cost_usd.toFixed(4)}</div>
        <div class="stat-label">This month</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${(d.total_input_tokens + d.total_output_tokens).toLocaleString()}</div>
        <div class="stat-label">Total tokens</div>
      </div>
      <div class="stat-card" style="grid-column: span 1">
        <div style="padding-top:.25rem">
          ${(d.per_model || []).map(m => `
            <div class="model-row">
              <span style="color:var(--muted)">${escapeHtml(m.model.split('-').slice(1,3).join('-'))}</span>
              <span>$${m.cost_usd.toFixed(4)} <span style="color:var(--muted)">(${m.calls} calls)</span></span>
            </div>`).join("") || '<span class="empty">No data</span>'}
        </div>
        <div class="stat-label" style="margin-top:.5rem">By model</div>
      </div>`;
    setEl("usage-stats", stats);

    // Update header cost badge
    const badge = document.getElementById("header-cost");
    if (badge) badge.textContent = `$${d.month_cost_usd.toFixed(4)} this month`;

    // Per-message log
    const recent = d.recent || [];
    if (!recent.length) {
      setEl("usage-log", '<p class="empty">No usage recorded yet.</p>');
      return;
    }
    const logHtml = recent.map(r => `
      <div class="card">
        <div class="card-title" style="font-weight:normal;font-size:13px">
          <span style="color:var(--muted)">${escapeHtml(r.model.split('-').slice(1,3).join('-'))}</span>
          <span class="badge grey">${fmtDate(r.created_at)}</span>
          <span style="margin-left:auto;color:var(--accent)">$${Number(r.cost_usd).toFixed(6)}</span>
        </div>
        <div class="card-body">
          ${r.input_tokens.toLocaleString()} in / ${r.output_tokens.toLocaleString()} out tokens
          ${r.message_preview ? ` · "${escapeHtml(String(r.message_preview).slice(0,60))}"` : ""}
        </div>
      </div>`).join("");
    setEl("usage-log", logHtml);
  } catch (e) {
    setEl("usage-log", `<p class="error">Error: ${escapeHtml(e.message)}</p>`);
  }
}

/* ── Tab stats ────────────────────────────────────────────────── */
async function updateTabStats() {
  try {
    const stats = await apiFetch("/messages/stats");
    const el = document.getElementById("tab-count-messages");
    if (el && stats.count) el.textContent = stats.count;
  } catch {}
  try {
    const logStats = await apiFetch("/logs?limit=1");
    const el = document.getElementById("tab-count-logs");
    if (el && logStats.total !== undefined) el.textContent = logStats.total;
  } catch {}
}

/* ── Auto-refresh ─────────────────────────────────────────────── */
let _autoRefreshInterval = null;

function toggleAutoRefresh() {
  const on = document.getElementById("auto-refresh-toggle").checked;
  if (on) {
    _autoRefreshInterval = setInterval(() => {
      const activeTab = document.querySelector(".tab-btn.active")?.dataset.tab;
      if (activeTab === "messages") loadMessages();
      if (activeTab === "toolcalls") loadToolCalls();
      if (activeTab === "usage") loadUsage();
      if (activeTab === "logs") loadLogs();
      if (activeTab === "charts") loadCharts();
      updateTabStats();
    }, 30_000);
  } else {
    clearInterval(_autoRefreshInterval);
    _autoRefreshInterval = null;
  }
}

/* ── Charts ───────────────────────────────────────────────────── */
const _charts = {};

const CHART_DEFAULTS = {
  responsive: true,
  plugins: { legend: { labels: { color: "#e8e8e8" } } },
  scales: {
    x: { ticks: { color: "#888" }, grid: { color: "#2a2a2a" } },
    y: { ticks: { color: "#888" }, grid: { color: "#2a2a2a" } },
  },
};

function destroyChart(id) {
  if (_charts[id]) { _charts[id].destroy(); delete _charts[id]; }
}

async function loadCharts() {
  const days = document.getElementById("charts-days").value;
  try {
    const d = await apiFetch(`/charts?days=${days}`);
    renderCostChart(d.daily_cost || []);
    renderModelsChart(d.per_model || []);
    renderMessagesChart(d.messages_per_day || []);
    renderToolsChart(d.tool_frequency || []);
  } catch (e) {
    console.error("Charts error:", e.message);
  }
}

function renderCostChart(data) {
  destroyChart("cost");
  const ctx = document.getElementById("chart-cost").getContext("2d");
  _charts["cost"] = new Chart(ctx, {
    type: "line",
    data: {
      labels: data.map(d => d.day),
      datasets: [{
        label: "Cost (USD)",
        data: data.map(d => d.cost),
        borderColor: "#4f8ef7",
        backgroundColor: "rgba(79,142,247,0.1)",
        tension: 0.3,
        fill: true,
      }],
    },
    options: { ...CHART_DEFAULTS },
  });
}

function renderModelsChart(data) {
  destroyChart("models");
  const ctx = document.getElementById("chart-models").getContext("2d");
  _charts["models"] = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: data.map(m => m.model.split("-").slice(1, 3).join("-")),
      datasets: [{
        data: data.map(m => m.cost_usd),
        backgroundColor: ["#4f8ef7", "#3ecf8e", "#f7b84f", "#f75555"],
      }],
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: "#e8e8e8" } } },
    },
  });
}

function renderMessagesChart(data) {
  destroyChart("messages");
  const ctx = document.getElementById("chart-messages").getContext("2d");
  _charts["messages"] = new Chart(ctx, {
    type: "bar",
    data: {
      labels: data.map(d => d.day),
      datasets: [{
        label: "Messages",
        data: data.map(d => d.count),
        backgroundColor: "rgba(62,207,142,0.7)",
      }],
    },
    options: { ...CHART_DEFAULTS },
  });
}

function renderToolsChart(data) {
  destroyChart("tools");
  const ctx = document.getElementById("chart-tools").getContext("2d");
  _charts["tools"] = new Chart(ctx, {
    type: "bar",
    data: {
      labels: data.map(d => d.tool_name),
      datasets: [{
        label: "Calls",
        data: data.map(d => d.count),
        backgroundColor: "rgba(247,184,79,0.7)",
      }],
    },
    options: {
      ...CHART_DEFAULTS,
      indexAxis: "y",
    },
  });
}

/* ── Memory Knowledge Graph ───────────────────────────────────── */
const ENTITY_COLORS = {
  person:  { background: "#1e3a5f", border: "#4f8ef7" },
  place:   { background: "#1e3a2e", border: "#3ecf8e" },
  date:    { background: "#3a2a1e", border: "#f7b84f" },
  concept: { background: "#2a1e3a", border: "#9b59b6" },
  memory:  { background: "#1a1a1a", border: "#333" },
};

function extractEntities(text) {
  const entities = [];
  const personPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g;
  let m;
  while ((m = personPattern.exec(text)) !== null) {
    entities.push({ label: m[1], type: "person" });
  }
  const datePattern = /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}|\b\d{4}\b)/g;
  while ((m = datePattern.exec(text)) !== null) {
    entities.push({ label: m[1], type: "date" });
  }
  const placePattern = /(?:in|at|near|from|to)\s+([A-Z][a-zA-Z\s]{2,20}?)(?=[,.\s]|$)/g;
  while ((m = placePattern.exec(text)) !== null) {
    entities.push({ label: m[1].trim(), type: "place" });
  }
  return [...new Map(entities.map(e => [e.label, e])).values()];
}

let _graphNetwork = null;

async function loadMemoryGraph() {
  const container = document.getElementById("graph-container");
  container.innerHTML = '<p class="loading" style="padding:2rem">Building graph from memories...</p>';
  document.getElementById("graph-node-detail").style.display = "none";

  try {
    const data = await apiFetch("/memories");
    const memories = data.memories || [];

    if (!memories.length) {
      container.innerHTML = '<p class="empty" style="padding:2rem">No memories to graph yet.</p>';
      return;
    }

    const nodes = new vis.DataSet();
    const edges = new vis.DataSet();
    const entityIndex = new Map();
    let nextId = 1;

    memories.forEach((mem, i) => {
      const text = mem.content || "";
      const memNodeId = `mem_${i}`;
      const shortLabel = text.length > 45 ? text.slice(0, 45) + "…" : text;

      nodes.add({
        id: memNodeId,
        label: shortLabel,
        title: text,
        color: { background: ENTITY_COLORS.memory.background, border: ENTITY_COLORS.memory.border },
        shape: "dot",
        size: 8,
        font: { color: "#666", size: 10 },
      });

      extractEntities(text).forEach(ent => {
        const key = `${ent.type}:${ent.label.toLowerCase()}`;
        if (!entityIndex.has(key)) {
          const entId = `ent_${nextId++}`;
          entityIndex.set(key, entId);
          nodes.add({
            id: entId,
            label: ent.label,
            title: `[${ent.type}] ${ent.label}`,
            color: { background: ENTITY_COLORS[ent.type].background, border: ENTITY_COLORS[ent.type].border },
            shape: "ellipse",
            size: 14,
            font: { color: "#e8e8e8", size: 12 },
          });
        }
        edges.add({
          from: memNodeId,
          to: entityIndex.get(key),
          color: { color: "#2a2a2a", hover: "#4f8ef7" },
          width: 1,
        });
      });
    });

    container.innerHTML = "";
    if (_graphNetwork) { _graphNetwork.destroy(); }

    _graphNetwork = new vis.Network(container, { nodes, edges }, {
      physics: { stabilization: { iterations: 150 } },
      interaction: { hover: true, tooltipDelay: 200 },
      edges: { smooth: { type: "continuous" } },
    });

    _graphNetwork.on("click", (params) => {
      if (!params.nodes.length) return;
      const node = nodes.get(params.nodes[0]);
      document.getElementById("graph-node-title").textContent = node.label;
      document.getElementById("graph-node-body").textContent = node.title || "";
      document.getElementById("graph-node-detail").style.display = "block";
    });

    // Render legend
    const legendHtml = Object.entries(ENTITY_COLORS).map(([type, colors]) =>
      `<span class="graph-legend-item" style="border-color:${colors.border}">${type}</span>`
    ).join("");
    document.getElementById("graph-legend").innerHTML = legendHtml;

  } catch (e) {
    container.innerHTML = `<p class="error" style="padding:2rem">Error: ${escapeHtml(e.message)}</p>`;
  }
}

/* ── Logs ─────────────────────────────────────────────────────── */
let _logsOffset = 0;
const LOGS_LIMIT = 50;
let _logsEventTypesLoaded = false;

async function loadLogs(append = false) {
  if (!append) {
    _logsOffset = 0;
    _logsEventTypesLoaded = false;
    setEl("logs-list", '<p class="loading">Loading…</p>');
  }
  const level = document.getElementById("logs-level").value;
  const eventType = document.getElementById("logs-event-type").value;
  let url = `/logs?limit=${LOGS_LIMIT}&offset=${_logsOffset}`;
  if (level) url += `&level=${encodeURIComponent(level)}`;
  if (eventType) url += `&event_type=${encodeURIComponent(eventType)}`;

  try {
    if (!_logsEventTypesLoaded) {
      _logsEventTypesLoaded = true;
      apiFetch("/logs/event-types").then(types => {
        const sel = document.getElementById("logs-event-type");
        const existing = Array.from(sel.options).map(o => o.value);
        (types.event_types || []).forEach(t => {
          if (!existing.includes(t)) {
            const opt = document.createElement("option");
            opt.value = t; opt.textContent = t;
            sel.appendChild(opt);
          }
        });
      }).catch(() => {});
    }

    const d = await apiFetch(url);
    const logs = d.logs || [];
    const total = d.total || 0;

    const html = logs.map(log => {
      let metaHtml = "";
      if (log.metadata) {
        let pretty = log.metadata;
        try { pretty = JSON.stringify(JSON.parse(log.metadata), null, 2); } catch {}
        metaHtml = `<details><summary style="cursor:pointer;color:var(--muted);font-size:11px;margin-top:.4rem">Metadata</summary><pre>${escapeHtml(pretty)}</pre></details>`;
      }
      return `
        <div class="card log-entry log-${escapeHtml(log.level)}">
          <div class="card-title">
            <span class="badge badge-${escapeHtml(log.level)}">${escapeHtml(log.level)}</span>
            <span class="log-event-type">${escapeHtml(log.event_type)}</span>
            <span class="badge grey" style="margin-left:auto">${fmtDate(log.created_at)}</span>
          </div>
          <div class="card-body">${escapeHtml(log.message)}</div>
          ${metaHtml}
        </div>`;
    }).join("");

    if (append) {
      document.getElementById("logs-list").insertAdjacentHTML("beforeend", html);
    } else {
      setEl("logs-list", html || '<p class="empty">No logs found.</p>');
    }

    _logsOffset += logs.length;
    const moreBtn = document.getElementById("logs-load-more");
    moreBtn.style.display = (_logsOffset < total) ? "block" : "none";

    // Update tab count
    const el = document.getElementById("tab-count-logs");
    if (el) el.textContent = total;

  } catch (e) {
    setEl("logs-list", `<p class="error">Error: ${escapeHtml(e.message)}</p>`);
  }
}

function loadMoreLogs() {
  loadLogs(true);
}

/* ── Database Viewer ──────────────────────────────────────────── */
async function loadDbTables() {
  try {
    const d = await apiFetch("/db/tables");
    const sel = document.getElementById("db-table-select");
    const current = sel.value;
    sel.innerHTML = '<option value="">Select a table…</option>';
    (d.tables || []).forEach(t => {
      const opt = document.createElement("option");
      opt.value = t; opt.textContent = t;
      if (t === current) opt.selected = true;
      sel.appendChild(opt);
    });
    if (current && d.tables.includes(current)) {
      loadTableData(0);
    }
  } catch (e) {
    setEl("db-rows", `<p class="error">Error: ${escapeHtml(e.message)}</p>`);
  }
}

async function loadTableData(offset = 0) {
  const table = document.getElementById("db-table-select").value;
  if (!table) {
    setEl("db-schema", "");
    setEl("db-rows", "");
    setEl("db-pagination", "");
    return;
  }
  const PAGE = 50;
  setEl("db-rows", '<p class="loading">Loading…</p>');
  setEl("db-schema", "");
  setEl("db-pagination", "");

  try {
    const [schema, rowsData] = await Promise.all([
      apiFetch(`/db/tables/${encodeURIComponent(table)}/schema`),
      apiFetch(`/db/tables/${encodeURIComponent(table)}/rows?limit=${PAGE}&offset=${offset}`),
    ]);

    const cols = schema.columns || [];
    const rows = rowsData.rows || [];
    const total = rowsData.total || 0;

    // Schema bar
    const schemaHtml = `
      <div class="db-schema-bar">
        <strong>${escapeHtml(table)}</strong>
        ${cols.map(c => `<span class="db-col-badge">${escapeHtml(c.name)} <span style="color:var(--muted)">${escapeHtml(c.type)}</span></span>`).join("")}
        <span style="margin-left:auto;color:var(--muted);font-size:12px">${total.toLocaleString()} rows</span>
      </div>`;
    setEl("db-schema", schemaHtml);

    // Rows table
    if (!rows.length) {
      setEl("db-rows", '<p class="empty" style="margin-top:.75rem">No rows in this table.</p>');
    } else {
      const colNames = cols.map(c => c.name);
      const tableHtml = `
        <div class="db-table-wrapper">
          <table class="db-table">
            <thead><tr>${colNames.map(c => `<th>${escapeHtml(c)}</th>`).join("")}</tr></thead>
            <tbody>${rows.map(row =>
              `<tr>${colNames.map(c => `<td title="${escapeHtml(String(row[c] ?? ""))}">${escapeHtml(String(row[c] ?? ""))}</td>`).join("")}</tr>`
            ).join("")}</tbody>
          </table>
        </div>`;
      setEl("db-rows", tableHtml);
    }

    // Pagination
    const totalPages = Math.ceil(total / PAGE) || 1;
    const currentPage = Math.floor(offset / PAGE) + 1;
    let pagHtml = `<span style="color:var(--muted);font-size:12px">Page ${currentPage} of ${totalPages}</span>`;
    if (offset > 0) pagHtml += ` <button onclick="loadTableData(${offset - PAGE})">← Prev</button>`;
    if (offset + PAGE < total) pagHtml += ` <button onclick="loadTableData(${offset + PAGE})">Next →</button>`;
    setEl("db-pagination", pagHtml);

  } catch (e) {
    setEl("db-rows", `<p class="error">Error: ${escapeHtml(e.message)}</p>`);
  }
}

/* ── Init ─────────────────────────────────────────────────────── */
checkStatus();
loadMessages();
// Load usage summary quietly for the header badge
apiFetch("/usage").then(d => {
  const badge = document.getElementById("header-cost");
  if (badge && d.month_cost_usd !== undefined) {
    badge.textContent = `$${d.month_cost_usd.toFixed(4)} this month`;
  }
}).catch(() => {});
