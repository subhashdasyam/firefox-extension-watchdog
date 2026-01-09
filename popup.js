/* global browser */

const STORAGE_KEY = "extensions";
const ALERTS_KEY = "pageAlerts";
const listEl = document.getElementById("list");
const alertsListEl = document.getElementById("alerts-list");
const alertsEmptyEl = document.getElementById("alerts-empty");
const alertsMoreEl = document.getElementById("alerts-more");
const metaEl = document.getElementById("meta");
const emptyEl = document.getElementById("empty");
const refreshBtn = document.getElementById("refresh");
const clearBtn = document.getElementById("clear");
const openLogBtn = document.getElementById("open-log");
const openLogBtn2 = document.getElementById("open-log-2");
const clearAlertsBtn = document.getElementById("clear-alerts");
const alertsView = document.getElementById("alerts-view");
const extensionsView = document.getElementById("extensions-view");
const tabButtons = Array.from(document.querySelectorAll(".segmented-button"));
const alertSummaryEl = document.getElementById("alerts-summary");
const extensionsSummaryEl = document.getElementById("extensions-summary");
const filterButtons = Array.from(document.querySelectorAll("#alert-filters [data-filter]"));
const countAllEl = document.getElementById("count-all");
const countHighEl = document.getElementById("count-high");
const countMediumEl = document.getElementById("count-medium");
const countLowEl = document.getElementById("count-low");

const MAX_GROUPS = 6;
let currentView = "alerts";
let currentFilter = "all";
let cachedAlerts = [];
let cachedExtensions = [];
let cachedNewCount = 0;
let cachedAlertStats = { totalAlerts: 0, totalSites: 0, counts: { high: 0, medium: 0, low: 0 } };

function formatRiskLabel(risk) {
  return risk ? risk.toUpperCase() : "UNKNOWN";
}

function buildPermissionTooltip(permission) {
  let info = null;
  if (typeof getPermissionInfo === "function") {
    info = getPermissionInfo(permission);
  }

  if (!info) {
    return [
      `Permission: ${permission}`,
      `What it does: Access to the ${permission} API.`,
      "Common uses: Varies by extension.",
      "Possible misuse: Depends on the API and sites it can access.",
      "Risk: UNKNOWN"
    ].join("\n");
  }

  const lines = [info.label || permission];
  if (info.summary) lines.push(`What it does: ${info.summary}`);
  if (info.uses) lines.push(`Common uses: ${info.uses}`);
  if (info.misuse) lines.push(`Possible misuse: ${info.misuse}`);
  if (info.note) lines.push(`Note: ${info.note}`);
  lines.push(`Risk: ${formatRiskLabel(info.risk)}`);
  return lines.join("\n");
}

function getPermissionRisk(permission) {
  if (typeof getPermissionInfo !== "function") return "unknown";
  const info = getPermissionInfo(permission);
  return info && info.risk ? info.risk : "unknown";
}

function buildHostTooltip(pattern) {
  const value = String(pattern || "");
  let scope = value;
  let risk = "low";

  if (value === "<all_urls>" || value === "*://*/*") {
    scope = "All websites";
    risk = "high";
  } else if (value.includes("*")) {
    risk = "medium";
  }

  return {
    tooltip: [
      `Host access: ${scope}`,
      "What it does: Grants extra access on matching sites (script/style injection, read tab URL/title, cross-origin requests, observe requests).",
      "Possible misuse: Could monitor or modify content on those sites.",
      `Risk: ${formatRiskLabel(risk)}`
    ].join("\n"),
    risk
  };
}

function normalizeName(value) {
  return String(value || "");
}

function buildFromEntries(entries) {
  const list = Object.values(entries || {});
  list.sort((a, b) => normalizeName(a.name).localeCompare(normalizeName(b.name)));
  return {
    extensions: list,
    newCount: list.filter((item) => item.isNew).length
  };
}

function createTagList(values, emptyText, type) {
  const wrapper = document.createElement("div");
  wrapper.className = "tags";

  if (!Array.isArray(values) || values.length === 0) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = emptyText;
    wrapper.appendChild(empty);
    return wrapper;
  }

  for (const value of values) {
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = value;
    if (type === "permission") {
      tag.title = buildPermissionTooltip(value);
      tag.dataset.risk = getPermissionRisk(value);
    }
    if (type === "host") {
      const meta = buildHostTooltip(value);
      tag.title = meta.tooltip;
      tag.dataset.risk = meta.risk;
    }
    wrapper.appendChild(tag);
  }

  return wrapper;
}

function createSection(labelText, contentNode) {
  const section = document.createElement("div");
  section.className = "section";

  const label = document.createElement("div");
  label.className = "label";
  label.textContent = labelText;

  section.appendChild(label);
  section.appendChild(contentNode);
  return section;
}

function renderList(extensions, newCount) {
  listEl.innerHTML = "";
  emptyEl.hidden = extensions.length !== 0;

  cachedExtensions = extensions;
  cachedNewCount = newCount;
  extensionsSummaryEl.textContent = `${extensions.length} extensions • ${newCount} new`;
  updateMeta();

  for (const info of extensions) {
    const item = document.createElement("li");
    item.className = "item";

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = info.name;

    if (info.isNew) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = "NEW";
      name.appendChild(badge);
    }

    const details = document.createElement("div");
    details.className = "details";
    details.textContent = `v${info.version} • ${info.enabled ? "Enabled" : "Disabled"} • ${info.installType || "unknown"}`;

    const metaBlock = document.createElement("div");
    metaBlock.className = "meta-block";
    const idLine = document.createElement("div");
    idLine.className = "meta-line";
    idLine.textContent = `ID: ${info.id}`;
    metaBlock.appendChild(idLine);

    if (info.updateUrl) {
      const updateLine = document.createElement("div");
      updateLine.className = "meta-line";
      updateLine.textContent = `Update URL: ${info.updateUrl}`;
      metaBlock.appendChild(updateLine);
    }

    const permissionsSection = createSection(
      "API permissions",
      createTagList(info.permissions, "None", "permission")
    );
    const hostSection = createSection(
      "Host permissions",
      createTagList(info.hostPermissions, "None", "host")
    );

    const warningsList = document.createElement("ul");
    warningsList.className = "warnings";
    if (Array.isArray(info.permissionWarnings) && info.permissionWarnings.length > 0) {
      for (const warning of info.permissionWarnings) {
        const itemEl = document.createElement("li");
        itemEl.textContent = warning;
        warningsList.appendChild(itemEl);
      }
    } else {
      const none = document.createElement("li");
      none.className = "muted";
      none.textContent = "None";
      warningsList.appendChild(none);
    }
    const warningsSection = createSection("Permission warnings", warningsList);

    item.appendChild(name);
    item.appendChild(details);
    item.appendChild(metaBlock);
    item.appendChild(permissionsSection);
    item.appendChild(hostSection);
    item.appendChild(warningsSection);
    listEl.appendChild(item);
  }
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return "Unknown time";
  const delta = Date.now() - timestamp;
  if (delta < 60000) return "Just now";
  if (delta < 3600000) return `${Math.floor(delta / 60000)}m ago`;
  if (delta < 86400000) return `${Math.floor(delta / 3600000)}h ago`;
  return `${Math.floor(delta / 86400000)}d ago`;
}

const REASON_LABELS = Object.freeze({
  "Extension resource URLs were found on the page.": "extension resource URL",
  "Scripts were injected into the page.": "injected script",
  "Inline scripts were injected into the page.": "inline script injected",
  "Inline event handlers were added.": "inline event handlers",
  "Iframes were added to the page.": "iframe added",
  "Forms were added to the page.": "new form added",
  "Sensitive input fields were added.": "new input fields",
  "Links or media sources were changed.": "link or source changed",
  "Form actions were changed.": "form action changed",
  "Many elements were added or removed.": "large DOM changes"
});

function levelRank(level) {
  if (level === "high") return 3;
  if (level === "medium") return 2;
  if (level === "low") return 1;
  return 0;
}

function formatConfidence(level) {
  if (level === "high") return "High confidence";
  if (level === "medium") return "Medium confidence";
  if (level === "low") return "Low confidence";
  return "Unknown confidence";
}

function formatReasonLabel(reason) {
  return REASON_LABELS[reason] || String(reason).replace(/\.$/, "");
}

function summarizeReasons(reasons, limit = 2) {
  if (!Array.isArray(reasons) || !reasons.length) return [];
  const seen = new Set();
  const items = [];
  for (const reason of reasons) {
    const label = formatReasonLabel(reason);
    if (seen.has(label)) continue;
    seen.add(label);
    items.push(label);
    if (items.length >= limit) break;
  }
  return items;
}

function getHostname(alert) {
  if (alert.hostname) return String(alert.hostname);
  if (!alert.url) return "";
  try {
    return new URL(alert.url).hostname;
  } catch (error) {
    return "";
  }
}

function baseDomain(hostname) {
  const parts = String(hostname || "").split(".").filter(Boolean);
  if (parts.length <= 2) return hostname;
  const last = parts[parts.length - 1];
  const second = parts[parts.length - 2];
  if (last.length === 2 && second.length <= 3 && parts.length >= 3) {
    return parts.slice(-3).join(".");
  }
  return parts.slice(-2).join(".");
}

function groupKey(alert) {
  const host = getHostname(alert);
  if (!host) return "Unknown site";
  return baseDomain(host);
}

function setView(view) {
  if (view !== "alerts" && view !== "extensions") return;
  currentView = view;
  alertsView.hidden = view !== "alerts";
  extensionsView.hidden = view !== "extensions";
  tabButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  updateMeta();
}

function updateMeta() {
  if (currentView === "alerts") {
    const { totalAlerts, totalSites } = cachedAlertStats;
    metaEl.textContent = totalAlerts
      ? `${totalSites} sites • ${totalAlerts} alerts`
      : "No recent site activity";
  } else {
    metaEl.textContent = `${cachedExtensions.length} extensions • ${cachedNewCount} new`;
  }
}

function updateFilterButtons(stats) {
  countAllEl.textContent = stats.totalSites;
  countHighEl.textContent = stats.counts.high;
  countMediumEl.textContent = stats.counts.medium;
  countLowEl.textContent = stats.counts.low;

  filterButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.filter === currentFilter);
  });
}

function renderAlerts(alerts) {
  alertsListEl.innerHTML = "";
  cachedAlerts = Array.isArray(alerts) ? alerts : [];

  const groups = new Map();
  for (const alert of cachedAlerts) {
    const key = groupKey(alert);
    const level = alert.level || "low";
    const existing = groups.get(key) || {
      key,
      level: "low",
      latest: 0,
      latestAlert: null,
      count: 0,
      signals: new Set(),
      sources: new Set()
    };
    existing.count += 1;
    if (levelRank(level) > levelRank(existing.level)) {
      existing.level = level;
    }
    if ((alert.timestamp || 0) > existing.latest) {
      existing.latest = alert.timestamp || 0;
      existing.latestAlert = alert;
    }
    const reasonLabels = Array.isArray(alert.reasons) ? alert.reasons.map(formatReasonLabel) : [];
    for (const label of reasonLabels) {
      existing.signals.add(label);
    }
    if (Array.isArray(alert.sourceExtensions)) {
      for (const source of alert.sourceExtensions) {
        const name = source.name || source.id;
        if (name) existing.sources.add(name);
      }
    }
    groups.set(key, existing);
  }

  const groupList = Array.from(groups.values()).sort((a, b) => b.latest - a.latest);
  const stats = {
    totalAlerts: cachedAlerts.length,
    totalSites: groupList.length,
    counts: { high: 0, medium: 0, low: 0 }
  };
  for (const group of groupList) {
    if (group.level === "high") stats.counts.high += 1;
    else if (group.level === "medium") stats.counts.medium += 1;
    else stats.counts.low += 1;
  }
  cachedAlertStats = stats;
  alertSummaryEl.textContent = stats.totalAlerts
    ? `${stats.totalSites} sites • ${stats.totalAlerts} alerts`
    : "No alerts yet.";
  updateFilterButtons(stats);
  updateMeta();

  const filtered = currentFilter === "all"
    ? groupList
    : groupList.filter((group) => group.level === currentFilter);

  alertsEmptyEl.hidden = true;
  alertsMoreEl.hidden = true;

  if (groupList.length === 0) {
    alertsEmptyEl.textContent = "No site alerts yet.";
    alertsEmptyEl.hidden = false;
    return;
  }

  if (filtered.length === 0) {
    alertsEmptyEl.textContent = "No sites match this filter.";
    alertsEmptyEl.hidden = false;
    return;
  }

  const visible = filtered.slice(0, MAX_GROUPS);

  for (const group of visible) {
    const item = document.createElement("li");
    item.className = "alert-group";

    const header = document.createElement("div");
    header.className = "alert-group-header";
    const title = document.createElement("div");
    title.className = "alert-group-title";
    title.textContent = group.key;
    const meta = document.createElement("div");
    meta.className = "alert-group-meta";
    meta.textContent = `${group.count} alert${group.count === 1 ? "" : "s"} • ${formatRelativeTime(group.latest)}`;
    header.appendChild(title);
    header.appendChild(meta);

    const confidence = document.createElement("div");
    confidence.className = `alert-evidence ${group.level}`;
    confidence.textContent = `Activity detected (${formatConfidence(group.level)})`;

    const signalLine = document.createElement("div");
    signalLine.className = "alert-group-signal";
    const signals = Array.from(group.signals).slice(0, 3);
    signalLine.innerHTML = signals.length
      ? `<strong>Signals:</strong> ${signals.join(", ")}`
      : "<strong>Signals:</strong> Page changed";

    const sourceNames = Array.from(group.sources).slice(0, 2);
    let sourceLine = null;
    if (sourceNames.length) {
      sourceLine = document.createElement("div");
      sourceLine.className = "alert-group-sources";
      sourceLine.textContent = `Possible source: ${sourceNames.join(", ")}`;
    }

    const actions = document.createElement("div");
    actions.className = "alert-actions";
    const viewBtn = document.createElement("button");
    viewBtn.type = "button";
    viewBtn.className = "ghost-button";
    viewBtn.textContent = "Open details";
    viewBtn.addEventListener("click", () => {
      if (group.latestAlert) {
        openViewer(group.latestAlert.id);
      } else {
        openViewer("");
      }
    });
    actions.appendChild(viewBtn);

    item.appendChild(header);
    item.appendChild(confidence);
    item.appendChild(signalLine);
    if (sourceLine) item.appendChild(sourceLine);
    item.appendChild(actions);
    alertsListEl.appendChild(item);
  }

  if (filtered.length > MAX_GROUPS) {
    alertsMoreEl.hidden = false;
  }
}

async function loadList(sync = false) {
  let response = null;

  try {
    response = await browser.runtime.sendMessage({ type: "getList", sync });
  } catch (error) {
    response = null;
  }

  if (!response || !Array.isArray(response.extensions)) {
    try {
      const result = await browser.storage.local.get(STORAGE_KEY);
      response = buildFromEntries(result[STORAGE_KEY] || {});
    } catch (error) {
      response = { extensions: [], newCount: 0 };
    }
  }

  renderList(response.extensions || [], response.newCount || 0);
}

function openViewer(alertId) {
  const url = browser.runtime.getURL(`viewer.html${alertId ? `?id=${encodeURIComponent(alertId)}` : ""}`);
  try {
    window.open(url, "_blank");
  } catch (error) {
    // ignore
  }
}

async function loadAlerts() {
  let response = null;

  try {
    response = await browser.runtime.sendMessage({ type: "getAlerts" });
  } catch (error) {
    response = null;
  }

  if (!response || !Array.isArray(response.alerts)) {
    try {
      const result = await browser.storage.local.get(ALERTS_KEY);
      response = { alerts: result[ALERTS_KEY] || [] };
    } catch (error) {
      response = { alerts: [] };
    }
  }

  renderAlerts(response.alerts || []);
}

refreshBtn.addEventListener("click", () => {
  loadList(true).catch(() => {});
});

clearBtn.addEventListener("click", async () => {
  await browser.runtime.sendMessage({ type: "clearNew" });
  loadList(false).catch(() => {});
});

clearAlertsBtn.addEventListener("click", async () => {
  await browser.runtime.sendMessage({ type: "clearAlerts" });
  loadAlerts().catch(() => {});
});

openLogBtn.addEventListener("click", () => {
  openViewer("");
});

openLogBtn2.addEventListener("click", () => {
  openViewer("");
});

for (const button of tabButtons) {
  button.addEventListener("click", () => {
    setView(button.dataset.view);
  });
}

for (const button of filterButtons) {
  button.addEventListener("click", () => {
    currentFilter = button.dataset.filter || "all";
    renderAlerts(cachedAlerts);
  });
}

browser.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes[STORAGE_KEY]) {
    const entries = changes[STORAGE_KEY].newValue || {};
    const { extensions, newCount } = buildFromEntries(entries);
    renderList(extensions, newCount);
  }
  if (changes[ALERTS_KEY]) {
    renderAlerts(changes[ALERTS_KEY].newValue || []);
  }
});

loadList(true).catch(() => {});
loadAlerts().catch(() => {});
setView(currentView);
