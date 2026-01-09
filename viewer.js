/* global browser */

const ALERTS_KEY = "pageAlerts";
const EXTENSIONS_KEY = "extensions";
const metaEl = document.getElementById("meta");
const listView = document.getElementById("list-view");
const detailView = document.getElementById("detail-view");
const listEl = document.getElementById("alert-list");
const listSummaryEl = document.getElementById("list-summary");
const storageEl = document.getElementById("storage-usage");
const listInfoEl = document.getElementById("list-info");
const filterYearEl = document.getElementById("filter-year");
const filterMonthEl = document.getElementById("filter-month");
const filterDayEl = document.getElementById("filter-day");
const clearStartEl = document.getElementById("clear-start");
const clearEndEl = document.getElementById("clear-end");
const clearRangeBtn = document.getElementById("clear-range");
const clearAllBtn = document.getElementById("clear-all");
const exportFilteredBtn = document.getElementById("export-filtered");
const exportAllBtn = document.getElementById("export-all");
const pruneButtons = Array.from(document.querySelectorAll("[data-prune]"));
const openPageBtn = document.getElementById("open-page");
const copyBtn = document.getElementById("copy-json");
const detailTitle = document.getElementById("detail-title");
const summaryEl = document.getElementById("summary");
const impactSection = document.getElementById("impact-section");
const extensionActivitySection = document.getElementById("extension-activity-section");
const reasonsSection = document.getElementById("reasons-section");
const candidatesSection = document.getElementById("candidates-section");
const addedSection = document.getElementById("added-section");
const removedSection = document.getElementById("removed-section");
const attrSection = document.getElementById("attr-section");
const textSection = document.getElementById("text-section");

const MAX_LIST_ITEMS = 200;
const filterState = { year: "all", month: "all", day: "all" };
let allAlerts = [];

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

function formatConfidence(level) {
  if (level === "high") return "High confidence";
  if (level === "medium") return "Medium confidence";
  if (level === "low") return "Low confidence";
  return "Unknown confidence";
}

function summarizeReasons(reasons, limit = 3) {
  if (!Array.isArray(reasons) || !reasons.length) return [];
  const seen = new Set();
  const items = [];
  for (const reason of reasons) {
    const label = REASON_LABELS[reason] || String(reason).replace(/\.$/, "");
    if (seen.has(label)) continue;
    seen.add(label);
    items.push(label);
    if (items.length >= limit) break;
  }
  return items;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchPattern(url, pattern) {
  if (!pattern || !url) return false;
  if (pattern === "<all_urls>") return true;
  if (pattern.startsWith("moz-extension://") || pattern.startsWith("chrome-extension://")) {
    return url.startsWith(pattern);
  }

  let scheme = "*";
  let hostAndPath = pattern;
  const splitIndex = pattern.indexOf("://");
  if (splitIndex !== -1) {
    scheme = pattern.slice(0, splitIndex);
    hostAndPath = pattern.slice(splitIndex + 3);
  }

  let hostPattern = hostAndPath;
  let pathPattern = "/*";
  const slashIndex = hostAndPath.indexOf("/");
  if (slashIndex !== -1) {
    hostPattern = hostAndPath.slice(0, slashIndex);
    pathPattern = hostAndPath.slice(slashIndex);
  }

  try {
    const parsed = new URL(url);
    const urlScheme = parsed.protocol.replace(":", "");
    if (scheme !== "*" && scheme !== urlScheme) {
      return false;
    }

    const hostname = parsed.hostname;
    let hostOk = false;
    if (hostPattern === "*") {
      hostOk = true;
    } else if (hostPattern.startsWith("*.")) {
      const base = hostPattern.slice(2);
      hostOk = hostname === base || hostname.endsWith("." + base);
    } else {
      hostOk = hostname === hostPattern;
    }

    if (!hostOk) return false;

    const urlPath = parsed.pathname + parsed.search;
    const regex = "^" + escapeRegex(pathPattern).replace(/\*/g, ".*") + "$";
    return new RegExp(regex).test(urlPath);
  } catch (error) {
    return false;
  }
}

function riskRank(risk) {
  if (risk === "high") return 3;
  if (risk === "medium") return 2;
  if (risk === "low") return 1;
  return 0;
}

function permissionRisk(permission) {
  if (typeof getPermissionInfo === "function") {
    const info = getPermissionInfo(permission);
    if (info && info.risk) return info.risk;
  }
  return "unknown";
}

function selectRiskyPermissions(perms) {
  if (!Array.isArray(perms)) return [];
  const scored = perms.map((perm) => ({ perm, risk: permissionRisk(perm) }));
  scored.sort((a, b) => riskRank(b.risk) - riskRank(a.risk));
  return scored.slice(0, 4);
}

function buildCandidateBadges(candidate) {
  const badges = [];
  if (candidate.hasAllUrls) badges.push({ label: "All sites", risk: "high" });
  if (candidate.matchedHosts.length) badges.push({ label: "Matches this site", risk: "medium" });
  if (candidate.hasActiveTab) badges.push({ label: "Needs click (activeTab)", risk: "low" });
  for (const perm of candidate.riskyPerms) {
    badges.push({ label: perm.perm, risk: perm.risk });
  }
  return badges;
}

function candidateScore(candidate) {
  let score = 0;
  if (candidate.hasAllUrls) score += 6;
  if (candidate.matchedHosts.length) score += 4;
  if (candidate.hasActiveTab) score += 1;
  for (const perm of candidate.riskyPerms) {
    score += riskRank(perm.risk);
  }
  return score;
}

function getSourceName(alert, origin) {
  if (!origin) return "";
  const sources = Array.isArray(alert.sourceExtensions) ? alert.sourceExtensions : [];
  const normalizedOrigin = origin.endsWith("/") ? origin : `${origin}/`;
  const match = sources.find((item) => {
    const matched = item.matchedOrigin || "";
    const normalizedMatched = matched.endsWith("/") ? matched : `${matched}/`;
    return normalizedOrigin === normalizedMatched || normalizedOrigin.startsWith(normalizedMatched);
  });
  return match ? match.name || match.id : "";
}

function renderImpact(alert) {
  impactSection.innerHTML = "";
  const heading = document.createElement("h3");
  heading.textContent = "Security-impact changes";
  impactSection.appendChild(heading);

  const list = document.createElement("ul");
  list.className = "impact-list";

  const security = alert.security || {};
  const items = [];

  for (const script of security.scripts || []) {
    const origin = script.origin || "";
    const sourceName = getSourceName(alert, origin);
    const title = script.inline
      ? "Inline script injected"
      : "Script injected";
    const meta = script.src ? script.src : (script.inline ? "Inline script" : "(no src)");
    items.push({
      title: sourceName ? `${title} • ${sourceName}` : title,
      meta,
      level: script.originKind === "extension" ? "high" : "medium"
    });
  }

  for (const iframe of security.iframes || []) {
    const origin = iframe.origin || "";
    const sourceName = getSourceName(alert, origin);
    items.push({
      title: sourceName ? `Iframe added • ${sourceName}` : "Iframe added",
      meta: iframe.src || "(no src)",
      level: iframe.originKind === "extension" ? "high" : "medium"
    });
  }

  for (const change of security.actionChanges || []) {
    items.push({
      title: "Form action changed",
      meta: `${change.oldValue || ""} → ${change.newValue || ""}`,
      level: "high"
    });
  }

  for (const change of security.urlChanges || []) {
    const origin = change.origin || "";
    const sourceName = getSourceName(alert, origin);
    const label = sourceName ? `URL changed • ${sourceName}` : "URL changed";
    items.push({
      title: label,
      meta: `${change.oldValue || ""} → ${change.newValue || ""}`,
      level: change.originKind === "extension" ? "high" : "medium"
    });
  }

  if (security.inlineHandlers) {
    items.push({
      title: "Inline event handlers added",
      meta: `${security.inlineHandlers} handler(s)`,
      level: "medium"
    });
  }

  if (Array.isArray(security.inputs)) {
    const passwordInputs = security.inputs.filter((item) => item.inputType === "password");
    if (passwordInputs.length) {
      items.push({
        title: "Password fields added",
        meta: `${passwordInputs.length} field(s)`,
        level: "high"
      });
    }
  }

  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "No high-signal changes detected.";
    impactSection.appendChild(empty);
    return;
  }

  for (const item of items.slice(0, 8)) {
    const li = document.createElement("li");
    li.className = "impact-item";

    const title = document.createElement("div");
    title.className = "impact-title";
    title.textContent = item.title;

    const meta = document.createElement("div");
    meta.className = "impact-meta";
    meta.textContent = item.meta;

    const tag = document.createElement("div");
    tag.className = `impact-tag ${item.level}`;
    tag.textContent = item.level.toUpperCase();

    li.appendChild(title);
    li.appendChild(meta);
    li.appendChild(tag);
    list.appendChild(li);
  }

  impactSection.appendChild(list);
}

function renderExtensionActivity(alert) {
  extensionActivitySection.innerHTML = "";
  const heading = document.createElement("h3");
  heading.textContent = "What the extension did";
  extensionActivitySection.appendChild(heading);

  const security = alert.security || {};
  const groups = new Map();
  const sources = Array.isArray(alert.sourceExtensions) ? alert.sourceExtensions : [];

  function resolveExtensionName(item) {
    const origin = item.origin || "";
    const named = getSourceName(alert, origin);
    if (named) return named;
    if (item.originKind === "extension" && sources.length === 1) {
      return sources[0].name || sources[0].id;
    }
    return "";
  }

  function getGroup(name) {
    if (!groups.has(name)) {
      groups.set(name, {
        name,
        scripts: [],
        iframes: [],
        urlChanges: []
      });
    }
    return groups.get(name);
  }

  function addScript(item) {
    const sourceName = resolveExtensionName(item);
    if (!sourceName && item.originKind !== "extension") return;
    const group = getGroup(sourceName || "Unknown extension");
    group.scripts.push(item);
  }

  function addIframe(item) {
    const sourceName = resolveExtensionName(item);
    if (!sourceName && item.originKind !== "extension") return;
    const group = getGroup(sourceName || "Unknown extension");
    group.iframes.push(item);
  }

  function addUrlChange(item) {
    const sourceName = resolveExtensionName(item);
    if (!sourceName && item.originKind !== "extension") return;
    const group = getGroup(sourceName || "Unknown extension");
    group.urlChanges.push(item);
  }

  for (const script of security.scripts || []) {
    addScript(script);
  }

  for (const iframe of security.iframes || []) {
    addIframe(iframe);
  }

  for (const change of security.urlChanges || []) {
    addUrlChange(change);
  }

  if (!groups.size) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "No extension-attributed actions detected.";
    extensionActivitySection.appendChild(empty);
    return;
  }

  const list = document.createElement("ul");
  list.className = "candidate-list";

  for (const group of groups.values()) {
    const card = document.createElement("li");
    card.className = "candidate-card";

    const title = document.createElement("div");
    title.className = "candidate-title";
    title.textContent = group.name;

    const totalActions = group.scripts.length + group.iframes.length + group.urlChanges.length;
    const meta = document.createElement("div");
    meta.className = "candidate-meta";
    meta.textContent = `${totalActions} action${totalActions === 1 ? "" : "s"} detected`;

    const activityList = document.createElement("ul");
    activityList.className = "activity-list";

    if (group.scripts.length) {
      const item = document.createElement("li");
      item.className = "activity-item";
      const sample = group.scripts[0].src ? group.scripts[0].src : "Inline script";
      item.innerHTML = `<strong>Scripts injected:</strong> ${group.scripts.length}`;
      const sampleEl = document.createElement("div");
      sampleEl.className = "activity-sample";
      sampleEl.textContent = `Example: ${sample}`;
      item.appendChild(sampleEl);
      activityList.appendChild(item);
    }

    if (group.iframes.length) {
      const item = document.createElement("li");
      item.className = "activity-item";
      const sample = group.iframes[0].src || "(no src)";
      item.innerHTML = `<strong>Iframes added:</strong> ${group.iframes.length}`;
      const sampleEl = document.createElement("div");
      sampleEl.className = "activity-sample";
      sampleEl.textContent = `Example: ${sample}`;
      item.appendChild(sampleEl);
      activityList.appendChild(item);
    }

    if (group.urlChanges.length) {
      const item = document.createElement("li");
      item.className = "activity-item";
      const change = group.urlChanges[0];
      const sample = `${change.oldValue || ""} → ${change.newValue || ""}`;
      item.innerHTML = `<strong>URLs changed:</strong> ${group.urlChanges.length}`;
      const sampleEl = document.createElement("div");
      sampleEl.className = "activity-sample";
      sampleEl.textContent = `Example: ${sample}`;
      item.appendChild(sampleEl);
      activityList.appendChild(item);
    }

    card.appendChild(title);
    card.appendChild(meta);
    card.appendChild(activityList);
    list.appendChild(card);
  }

  extensionActivitySection.appendChild(list);
}

function renderSourceExtensions(alert, extensions) {
  const sources = Array.isArray(alert.sourceExtensions) ? alert.sourceExtensions : [];
  if (!sources.length) return;

  const section = document.createElement("div");
  section.className = "section";
  section.setAttribute("data-source-section", "true");
  const heading = document.createElement("h3");
  heading.textContent = "Matched extension resources";
  section.appendChild(heading);

  const list = document.createElement("ul");
  list.className = "candidate-list";

  for (const source of sources) {
    const card = document.createElement("li");
    card.className = "candidate-card";

    const title = document.createElement("div");
    title.className = "candidate-title";
    title.textContent = source.name || source.id;

    const meta = document.createElement("div");
    meta.className = "candidate-meta";
    meta.textContent = `v${source.version || ""} • ${source.installType || "unknown"} • ${source.matchedOrigin || "moz-extension"}`;

    const badges = document.createElement("div");
    badges.className = "candidate-badges";
    const badge = document.createElement("span");
    badge.className = "badge high";
    badge.textContent = "Matched internal URL";
    badges.appendChild(badge);

    card.appendChild(title);
    card.appendChild(meta);
    card.appendChild(badges);
    list.appendChild(card);
  }

  section.appendChild(list);
  summaryEl.parentElement.insertBefore(section, reasonsSection);
}

function renderCandidates(alert, extensions) {
  candidatesSection.innerHTML = "";
  const heading = document.createElement("h3");
  heading.textContent = "Possible extensions that can modify this page";
  candidatesSection.appendChild(heading);

  if (!alert.url) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "No page URL available.";
    candidatesSection.appendChild(empty);
    return;
  }

  const candidates = [];
  for (const ext of extensions) {
    const hostPerms = ext.hostPermissions || [];
    const matched = hostPerms.filter((pattern) => matchPattern(alert.url, pattern));
    const hasAllUrls = hostPerms.includes("<all_urls>");
    const hasActiveTab = Array.isArray(ext.permissions) && ext.permissions.includes("activeTab");

    if (!matched.length && !hasAllUrls && !hasActiveTab) {
      continue;
    }

    candidates.push({
      ext,
      matchedHosts: matched,
      hasAllUrls,
      hasActiveTab,
      riskyPerms: selectRiskyPermissions(ext.permissions)
    });
  }

  if (!candidates.length) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "No installed extensions advertise access to this site.";
    candidatesSection.appendChild(empty);
    return;
  }

  candidates.sort((a, b) => candidateScore(b) - candidateScore(a));

  if (!alert.sourceExtensions || !alert.sourceExtensions.length) {
    if (alert.evidence && Array.isArray(alert.evidence.extensionUrls) && alert.evidence.extensionUrls.length) {
      const note = document.createElement("div");
      note.className = "muted";
      const sample = alert.evidence.extensionUrls.slice(0, 2).join(", ");
      note.textContent = `Extension URLs were detected (${sample}). This list shows add-ons that can access this site.`;
      candidatesSection.appendChild(note);
    }
  }

  const list = document.createElement("ul");
  list.className = "candidate-list";

  for (const candidate of candidates) {
    const card = document.createElement("li");
    card.className = "candidate-card";

    const title = document.createElement("div");
    title.className = "candidate-title";
    title.textContent = candidate.ext.name || candidate.ext.id;

    const meta = document.createElement("div");
    meta.className = "candidate-meta";
    let accessText = "";
    if (candidate.hasAllUrls) {
      accessText = "Access: all sites";
    } else if (candidate.matchedHosts.length) {
      accessText = `Access: ${candidate.matchedHosts.slice(0, 3).join(", ")}`;
    } else if (candidate.hasActiveTab) {
      accessText = "Access: activeTab (requires click)";
    }
    meta.textContent = `v${candidate.ext.version} • ${candidate.ext.installType || "unknown"} • ${accessText}`;

    const badges = document.createElement("div");
    badges.className = "candidate-badges";
    for (const badge of buildCandidateBadges(candidate)) {
      const span = document.createElement("span");
      span.className = `badge ${badge.risk}`;
      span.textContent = badge.label;
      badges.appendChild(span);
    }

    card.appendChild(title);
    card.appendChild(meta);
    card.appendChild(badges);
    list.appendChild(card);
  }

  candidatesSection.appendChild(list);
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return "Unknown time";
  const delta = Date.now() - timestamp;
  if (delta < 60000) return "Just now";
  if (delta < 3600000) return `${Math.floor(delta / 60000)}m ago`;
  if (delta < 86400000) return `${Math.floor(delta / 3600000)}h ago`;
  return `${Math.floor(delta / 86400000)}d ago`;
}

function formatDateTime(timestamp) {
  if (!timestamp) return "Unknown time";
  const date = new Date(timestamp);
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatBytes(bytes) {
  if (typeof bytes !== "number" || Number.isNaN(bytes)) return "Unknown";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function downloadJson(payload, filename) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function currentFilterLabel() {
  if (filterState.year === "all" && filterState.month === "all" && filterState.day === "all") {
    return "All dates";
  }
  const parts = [];
  if (filterState.year !== "all") parts.push(filterState.year);
  if (filterState.month !== "all") {
    const monthIndex = Number(filterState.month) - 1;
    if (monthIndex >= 0 && monthIndex < MONTH_NAMES.length) {
      parts.push(MONTH_NAMES[monthIndex]);
    }
  }
  if (filterState.day !== "all") parts.push(`Day ${filterState.day}`);
  return parts.join(" • ") || "Filtered";
}

function buildExportPayload(alerts, scopeLabel) {
  return {
    exportedAt: new Date().toISOString(),
    scope: scopeLabel,
    filter: { ...filterState },
    totalStored: allAlerts.length,
    count: alerts.length,
    alerts
  };
}

function populateSelect(select, options, current) {
  select.innerHTML = "";
  for (const option of options) {
    const el = document.createElement("option");
    el.value = option.value;
    el.textContent = option.label;
    if (option.value === current) {
      el.selected = true;
    }
    select.appendChild(el);
  }
}

function populateDateFilters(alerts) {
  const years = new Set();
  for (const alert of alerts) {
    if (!alert.timestamp) continue;
    years.add(new Date(alert.timestamp).getFullYear());
  }
  const yearOptions = [{ value: "all", label: "All years" }];
  Array.from(years)
    .sort((a, b) => b - a)
    .forEach((year) => {
      yearOptions.push({ value: String(year), label: String(year) });
    });
  if (!yearOptions.some((option) => option.value === filterState.year)) {
    filterState.year = "all";
  }
  populateSelect(filterYearEl, yearOptions, filterState.year);

  const monthOptions = [{ value: "all", label: "All months" }];
  MONTH_NAMES.forEach((name, index) => {
    monthOptions.push({ value: String(index + 1), label: name });
  });
  populateSelect(filterMonthEl, monthOptions, filterState.month);

  const dayOptions = [{ value: "all", label: "All days" }];
  for (let day = 1; day <= 31; day += 1) {
    dayOptions.push({ value: String(day), label: String(day) });
  }
  populateSelect(filterDayEl, dayOptions, filterState.day);
}

function applyDateFilters(alerts) {
  return alerts.filter((alert) => {
    if (!alert.timestamp) {
      return filterState.year === "all" && filterState.month === "all" && filterState.day === "all";
    }
    const date = new Date(alert.timestamp);
    if (filterState.year !== "all" && date.getFullYear() !== Number(filterState.year)) {
      return false;
    }
    if (filterState.month !== "all" && date.getMonth() + 1 !== Number(filterState.month)) {
      return false;
    }
    if (filterState.day !== "all" && date.getDate() !== Number(filterState.day)) {
      return false;
    }
    return true;
  });
}

async function updateStorageUsage() {
  if (!storageEl) return;
  try {
    if (browser.storage.local.getBytesInUse) {
      const [total, alertsBytes] = await Promise.all([
        browser.storage.local.getBytesInUse(null),
        browser.storage.local.getBytesInUse(ALERTS_KEY)
      ]);
      const quota = browser.storage.local.QUOTA_BYTES;
      const quotaText = typeof quota === "number" ? ` of ${formatBytes(quota)}` : "";
      storageEl.textContent = `Storage: ${formatBytes(total)}${quotaText} (alerts ${formatBytes(alertsBytes)})`;
      return;
    }
  } catch (error) {
    // ignore
  }

  storageEl.textContent = "Storage: unavailable";
}

function renderList() {
  listView.hidden = false;
  detailView.hidden = true;
  listEl.innerHTML = "";
  listInfoEl.textContent = "";

  const filtered = applyDateFilters(allAlerts);
  const totalCount = allAlerts.length;
  const filteredCount = filtered.length;
  metaEl.textContent = `${totalCount} alerts stored`;
  listSummaryEl.textContent = `${filteredCount} alerts • ${currentFilterLabel()}`;
  exportFilteredBtn.disabled = filteredCount === 0;
  exportAllBtn.disabled = totalCount === 0;

  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "No alerts match this filter.";
    listEl.appendChild(empty);
    return;
  }

  const visible = filtered.slice(0, MAX_LIST_ITEMS);
  if (filtered.length > MAX_LIST_ITEMS) {
    listInfoEl.textContent = `Showing first ${MAX_LIST_ITEMS} of ${filtered.length} alerts. Narrow the date filters to see more.`;
  }

  for (const alert of visible) {
    const card = document.createElement("li");
    card.className = "alert-card";

    const link = document.createElement("a");
    link.href = `viewer.html?id=${encodeURIComponent(alert.id)}`;

    const title = document.createElement("div");
    title.className = "alert-title";
    title.textContent = alert.title || alert.url || "Untitled page";

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `${alert.hostname || "Unknown"} • ${formatRelativeTime(alert.timestamp)} • ${String(alert.level || "low").toUpperCase()}`;

    const dateLine = document.createElement("div");
    dateLine.className = "alert-date";
    dateLine.textContent = formatDateTime(alert.timestamp);

    link.appendChild(title);
    link.appendChild(meta);
    link.appendChild(dateLine);
    card.appendChild(link);
    listEl.appendChild(card);
  }
}

async function persistAlerts(next) {
  try {
    await browser.runtime.sendMessage({ type: "setAlerts", alerts: next });
  } catch (error) {
    await browser.storage.local.set({ [ALERTS_KEY]: next });
  }
}

async function clearOlderThan(months) {
  if (!Number.isFinite(months)) return;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  const cutoffTime = cutoff.getTime();
  const next = allAlerts.filter((alert) => (alert.timestamp || 0) >= cutoffTime);
  await persistAlerts(next);
  allAlerts = next;
  populateDateFilters(allAlerts);
  renderList();
  updateStorageUsage();
}

async function clearRange(startValue, endValue) {
  if (!startValue || !endValue) {
    alert("Choose both a start and end date.");
    return;
  }
  const start = new Date(`${startValue}T00:00:00`);
  const end = new Date(`${endValue}T23:59:59.999`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    alert("Invalid date range.");
    return;
  }
  if (start > end) {
    alert("Start date must be before end date.");
    return;
  }
  const startTime = start.getTime();
  const endTime = end.getTime();
  const next = allAlerts.filter((alert) => {
    const ts = alert.timestamp || 0;
    return ts < startTime || ts > endTime;
  });
  await persistAlerts(next);
  allAlerts = next;
  populateDateFilters(allAlerts);
  renderList();
  updateStorageUsage();
}

async function clearAllAlerts() {
  await persistAlerts([]);
  allAlerts = [];
  populateDateFilters(allAlerts);
  renderList();
  updateStorageUsage();
}

function showList(alerts) {
  allAlerts = Array.isArray(alerts) ? alerts.slice() : [];
  allAlerts.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  openPageBtn.disabled = true;
  copyBtn.disabled = true;
  populateDateFilters(allAlerts);
  updateStorageUsage();
  renderList();
}

function buildSection(title, items, formatter, overflow) {
  const section = document.createElement("div");
  const heading = document.createElement("h3");
  heading.textContent = title;
  section.appendChild(heading);

  if (!items || !items.length) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "None";
    section.appendChild(empty);
    return section;
  }

  const list = document.createElement("ul");
  list.className = "change-list";
  for (const item of items) {
    const li = document.createElement("li");
    li.className = "change-item";
    formatter(li, item);
    list.appendChild(li);
  }
  section.appendChild(list);

  if (overflow) {
    const extra = document.createElement("div");
    extra.className = "muted";
    extra.textContent = `+${overflow} more changes not shown`;
    section.appendChild(extra);
  }

  return section;
}

function renderDetail(alert) {
  listView.hidden = true;
  detailView.hidden = false;
  metaEl.textContent = `${alert.hostname || "Unknown"} • ${formatDateTime(alert.timestamp)} (${formatRelativeTime(alert.timestamp)})`;
  detailTitle.textContent = alert.title || alert.url || "Alert details";

  openPageBtn.disabled = !alert.url;
  copyBtn.disabled = false;
  openPageBtn.onclick = () => {
    if (alert.url) window.open(alert.url, "_blank");
  };

  copyBtn.onclick = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(alert, null, 2));
      copyBtn.textContent = "Copied";
      setTimeout(() => (copyBtn.textContent = "Copy raw"), 1000);
    } catch (error) {
      copyBtn.textContent = "Copy failed";
      setTimeout(() => (copyBtn.textContent = "Copy raw"), 1000);
    }
  };

  const counts = alert.counts || {};
  const level = alert.level || "low";
  const reasons = Array.isArray(alert.reasons) ? alert.reasons : [];
  summaryEl.innerHTML = "";
  const existing = document.querySelectorAll("[data-source-section]");
  existing.forEach((node) => node.remove());
  const levelEl = document.createElement("div");
  levelEl.className = `level ${level}`;
  levelEl.textContent = `Extension activity detected (${formatConfidence(level)})`;
  summaryEl.appendChild(levelEl);

  const signals = summarizeReasons(reasons, 3);
  if (signals.length) {
    const signalEl = document.createElement("div");
    signalEl.textContent = `Signals: ${signals.join(", ")}`;
    summaryEl.appendChild(signalEl);
  }

  const sources = Array.isArray(alert.sourceExtensions) ? alert.sourceExtensions : [];
  if (sources.length) {
    const sourceNames = sources
      .slice(0, 2)
      .map((source) => source.name || source.id)
      .filter(Boolean);
    if (sourceNames.length) {
      const sourceEl = document.createElement("div");
      sourceEl.textContent = `Possible source: ${sourceNames.join(", ")}`;
      summaryEl.appendChild(sourceEl);
    }
  }

  const countsEl = document.createElement("div");
  countsEl.textContent = `Changes: +${counts.added || 0} -${counts.removed || 0} attr ${counts.attributes || 0} text ${counts.text || 0}`;
  summaryEl.appendChild(countsEl);

  renderSourceExtensions(alert, window.__extensions || []);
  renderExtensionActivity(alert);

  reasonsSection.innerHTML = "";
  const reasonsBlock = buildSection("Reasons", reasons, (li, item) => {
    const label = document.createElement("div");
    label.className = "label";
    label.textContent = item;
    li.appendChild(label);
  });
  reasonsSection.appendChild(reasonsBlock);
  renderCandidates(alert, window.__extensions || []);

  const diff = alert.diff || {};
  const overflow = diff.overflow || {};

  addedSection.innerHTML = "";
  addedSection.appendChild(
    buildSection("Added nodes", diff.added || [], (li, item) => {
      const label = document.createElement("div");
      label.className = "label";
      label.textContent = `${item.tag || "node"} • ${item.selector || "(unknown)"}`;
      const body = document.createElement("pre");
      body.textContent = item.snippet || "";
      li.appendChild(label);
      li.appendChild(body);
    }, overflow.added)
  );

  removedSection.innerHTML = "";
  removedSection.appendChild(
    buildSection("Removed nodes", diff.removed || [], (li, item) => {
      const label = document.createElement("div");
      label.className = "label";
      label.textContent = `${item.tag || "node"} • ${item.selector || "(unknown)"}`;
      const body = document.createElement("pre");
      body.textContent = item.snippet || "";
      li.appendChild(label);
      li.appendChild(body);
    }, overflow.removed)
  );

  attrSection.innerHTML = "";
  attrSection.appendChild(
    buildSection("Attribute changes", diff.attributes || [], (li, item) => {
      const label = document.createElement("div");
      label.className = "label";
      label.textContent = `${item.attribute || "attribute"} • ${item.selector || "(unknown)"}`;
      const body = document.createElement("pre");
      body.textContent = `Old: ${item.oldValue || ""}
New: ${item.newValue || ""}`;
      li.appendChild(label);
      li.appendChild(body);
    }, overflow.attributes)
  );

  textSection.innerHTML = "";
  textSection.appendChild(
    buildSection("Text changes", diff.text || [], (li, item) => {
      const label = document.createElement("div");
      label.className = "label";
      label.textContent = item.selector || "(unknown)";
      const body = document.createElement("pre");
      body.textContent = `Old: ${item.oldValue || ""}
New: ${item.newValue || ""}`;
      li.appendChild(label);
      li.appendChild(body);
    }, overflow.text)
  );
}

async function loadExtensions() {
  try {
    const result = await browser.storage.local.get(EXTENSIONS_KEY);
    return Object.values(result[EXTENSIONS_KEY] || {});
  } catch (error) {
    return [];
  }
}

async function loadAlerts() {
  let alerts = [];
  try {
    const response = await browser.runtime.sendMessage({ type: "getAlerts" });
    alerts = response.alerts || [];
  } catch (error) {
    const result = await browser.storage.local.get(ALERTS_KEY);
    alerts = result[ALERTS_KEY] || [];
  }
  return alerts;
}

filterYearEl.addEventListener("change", () => {
  filterState.year = filterYearEl.value || "all";
  renderList();
});

filterMonthEl.addEventListener("change", () => {
  filterState.month = filterMonthEl.value || "all";
  renderList();
});

filterDayEl.addEventListener("change", () => {
  filterState.day = filterDayEl.value || "all";
  renderList();
});

for (const button of pruneButtons) {
  button.addEventListener("click", async () => {
    const months = Number(button.dataset.prune);
    if (!Number.isFinite(months)) return;
    const confirmText = `Clear alerts older than ${months} month${months === 1 ? "" : "s"}?`;
    if (!confirm(confirmText)) return;
    await clearOlderThan(months);
  });
}

clearRangeBtn.addEventListener("click", async () => {
  if (!confirm("Clear alerts within this date range?")) return;
  await clearRange(clearStartEl.value, clearEndEl.value);
});

clearAllBtn.addEventListener("click", async () => {
  if (!confirm("Clear all stored alerts?")) return;
  await clearAllAlerts();
});

exportFilteredBtn.addEventListener("click", () => {
  const filtered = applyDateFilters(allAlerts);
  if (!filtered.length) return;
  const label = currentFilterLabel();
  const filename = `extension-watchdog-alerts-${slugify(label)}-${new Date().toISOString().slice(0, 10)}.json`;
  const payload = buildExportPayload(filtered, label);
  downloadJson(payload, filename);
});

exportAllBtn.addEventListener("click", () => {
  if (!allAlerts.length) return;
  const filename = `extension-watchdog-alerts-all-${new Date().toISOString().slice(0, 10)}.json`;
  const payload = buildExportPayload(allAlerts, "All alerts");
  downloadJson(payload, filename);
});

(async () => {
  const [alerts, extensions] = await Promise.all([loadAlerts(), loadExtensions()]);
  window.__extensions = extensions;
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  if (!id) {
    showList(alerts);
    return;
  }

  const alert = alerts.find((item) => item.id === id);
  if (!alert) {
    showList(alerts);
    return;
  }

  renderDetail(alert);
})();
