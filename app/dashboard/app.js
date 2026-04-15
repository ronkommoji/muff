/* ── Tab navigation ───────────────────────────────────────────── */
let _activeTab = "messages";

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    _activeTab = tab;
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${tab}`).classList.add("active");

    // SSE-backed tabs use cached data; others fetch on demand
    if (tab === "messages" && _sseData.messages) renderMessages(_sseData.messages);
    else if (tab === "messages") loadMessages();
    if (tab === "toolcalls" && _sseData.tool_calls) renderToolCalls(_sseData.tool_calls);
    else if (tab === "toolcalls") loadToolCalls();
    if (tab === "usage" && _sseData.usage) renderUsage(_sseData.usage);
    else if (tab === "usage") loadUsage();
    if (tab === "tools") loadApps();
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
}

/* ── SSE real-time stream ─────────────────────────────────────── */
let _sseData = { messages: null, tool_calls: null, usage: null };

function startSSE() {
  const source = new EventSource("/api/stream");

  source.onmessage = (e) => {
    const data = JSON.parse(e.data);
    _sseData = data;

    // Always update the header cost badge
    if (data.usage && data.usage.month_cost_usd !== undefined) {
      const badge = document.getElementById("header-cost");
      if (badge) badge.textContent = `$${data.usage.month_cost_usd.toFixed(4)} this month`;
    }

    // Re-render the currently visible tab
    if (_activeTab === "messages" && data.messages) renderMessages(data.messages);
    if (_activeTab === "toolcalls" && data.tool_calls) renderToolCalls(data.tool_calls);
    if (_activeTab === "usage" && data.usage) renderUsage(data.usage);
  };

  source.onerror = () => {
    source.close();
    // Reconnect after 5 seconds
    setTimeout(startSSE, 5000);
  };
}

/* ── Messages ─────────────────────────────────────────────────── */
function renderMessages(msgs) {
  // API returns DESC order; reverse to show oldest→newest (scroll to bottom)
  const ordered = msgs.slice().reverse();
  if (!ordered.length) {
    setEl("messages-list", '<p class="empty">No messages yet.</p>');
    return;
  }
  const html = ordered
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
}

async function loadMessages() {
  setEl("messages-list", '<p class="loading">Loading…</p>');
  try {
    const data = await apiFetch("/messages?limit=100");
    renderMessages(data.messages || []);
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
function renderToolCalls(calls) {
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
}

async function loadToolCalls() {
  setEl("toolcalls-list", '<p class="loading">Loading…</p>');
  try {
    const data = await apiFetch("/tool-calls?limit=50");
    renderToolCalls(data.tool_calls || []);
  } catch (e) {
    setEl("toolcalls-list", `<p class="error">Error: ${escapeHtml(e.message)}</p>`);
  }
}

/* ── Usage & Cost ─────────────────────────────────────────────── */
function renderUsage(d) {
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
}

async function loadUsage() {
  setEl("usage-log", '<p class="loading">Loading…</p>');
  try {
    const d = await apiFetch("/usage");
    renderUsage(d);
  } catch (e) {
    setEl("usage-log", `<p class="error">Error: ${escapeHtml(e.message)}</p>`);
  }
}

/* ── Init ─────────────────────────────────────────────────────── */
checkStatus();
loadMessages();
startSSE();
