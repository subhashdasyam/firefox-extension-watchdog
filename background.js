/* global browser */

const STORAGE_KEY = "extensions";
const ALERTS_KEY = "pageAlerts";
const INIT_KEY = "initialized";
const MAX_ALERTS = 50;

let newCountCache = 0;
let alertCountCache = 0;

function countNew(entries) {
  return Object.values(entries).filter((e) => e.isNew).length;
}

async function getState() {
  const result = await browser.storage.local.get([STORAGE_KEY, INIT_KEY]);
  return {
    entries: result[STORAGE_KEY] || {},
    initialized: result[INIT_KEY] || false
  };
}

async function setState(entries, initialized = true) {
  await browser.storage.local.set({
    [STORAGE_KEY]: entries,
    [INIT_KEY]: initialized
  });
  newCountCache = countNew(entries);
  updateBadge();
}

async function getAlerts() {
  const result = await browser.storage.local.get(ALERTS_KEY);
  return result[ALERTS_KEY] || [];
}

async function setAlerts(alerts) {
  await browser.storage.local.set({ [ALERTS_KEY]: alerts });
  alertCountCache = alerts.length;
  updateBadge();
}

function updateBadge() {
  let text = "";
  let color = "#E76F51";

  if (newCountCache > 0) {
    text = String(newCountCache);
    color = "#E76F51";
  } else if (alertCountCache > 0) {
    text = "!";
    color = "#D97706";
  }

  browser.browserAction.setBadgeBackgroundColor({ color });
  browser.browserAction.setBadgeText({ text });
}

function normalizeExtensionInfo(info, isNew, permissionWarnings) {
  return {
    id: info.id,
    name: info.name,
    version: info.version,
    enabled: info.enabled,
    installType: info.installType,
    updateUrl: info.updateUrl || "",
    permissions: info.permissions || [],
    hostPermissions: info.hostPermissions || [],
    permissionWarnings: permissionWarnings || [],
    type: info.type,
    isNew,
    lastSeen: Date.now()
  };
}

function levelRank(level) {
  if (level === "high") return 2;
  if (level === "medium") return 1;
  return 0;
}

const MAX_DIFF_ITEMS = 40;

function mergeDiff(prev, incoming) {
  const safePrev = prev || { added: [], removed: [], attributes: [], text: [], overflow: {} };
  const safeNext = incoming || { added: [], removed: [], attributes: [], text: [], overflow: {} };

  const mergeList = (a, b) => {
    const combined = [...(a || []), ...(b || [])];
    return combined.slice(0, MAX_DIFF_ITEMS);
  };

  const overflow = {
    added: (safePrev.overflow?.added || 0) + (safeNext.overflow?.added || 0),
    removed: (safePrev.overflow?.removed || 0) + (safeNext.overflow?.removed || 0),
    attributes: (safePrev.overflow?.attributes || 0) + (safeNext.overflow?.attributes || 0),
    text: (safePrev.overflow?.text || 0) + (safeNext.overflow?.text || 0)
  };

  return {
    added: mergeList(safePrev.added, safeNext.added),
    removed: mergeList(safePrev.removed, safeNext.removed),
    attributes: mergeList(safePrev.attributes, safeNext.attributes),
    text: mergeList(safePrev.text, safeNext.text),
    overflow
  };
}

function mergeSecurity(prev, incoming) {
  const safePrev = prev || { scripts: [], iframes: [], forms: [], inputs: [], urlChanges: [], actionChanges: [], inlineHandlers: 0 };
  const safeNext = incoming || { scripts: [], iframes: [], forms: [], inputs: [], urlChanges: [], actionChanges: [], inlineHandlers: 0 };
  const mergeList = (a, b, limit = 30) => {
    const combined = [...(a || []), ...(b || [])];
    return combined.slice(0, limit);
  };
  return {
    scripts: mergeList(safePrev.scripts, safeNext.scripts, 20),
    iframes: mergeList(safePrev.iframes, safeNext.iframes, 10),
    forms: mergeList(safePrev.forms, safeNext.forms, 10),
    inputs: mergeList(safePrev.inputs, safeNext.inputs, 10),
    urlChanges: mergeList(safePrev.urlChanges, safeNext.urlChanges, 20),
    actionChanges: mergeList(safePrev.actionChanges, safeNext.actionChanges, 10),
    inlineHandlers: (safePrev.inlineHandlers || 0) + (safeNext.inlineHandlers || 0)
  };
}

function normalizeAlert(payload) {
  return {
    id: payload.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    url: String(payload.url || ""),
    hostname: String(payload.hostname || ""),
    title: String(payload.title || payload.hostname || payload.url || "Unknown"),
    timestamp: payload.timestamp || Date.now(),
    level: payload.level || "low",
    reasons: Array.isArray(payload.reasons) ? payload.reasons.slice(0, 6) : [],
    counts: payload.counts || { added: 0, removed: 0, attributes: 0, text: 0 },
    topTags: Array.isArray(payload.topTags) ? payload.topTags.slice(0, 3) : [],
    evidence: payload.evidence || {},
    diff: payload.diff || { added: [], removed: [], attributes: [], text: [], overflow: {} },
    security: payload.security || { scripts: [], iframes: [], forms: [], inputs: [], urlChanges: [], actionChanges: [], inlineHandlers: 0 },
    sourceExtensions: Array.isArray(payload.sourceExtensions) ? payload.sourceExtensions : []
  };
}

function normalizeInternalOrigin(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "moz-extension:" && parsed.protocol !== "chrome-extension:") {
      return null;
    }
    return `${parsed.origin}/`;
  } catch (error) {
    return null;
  }
}

function normalizeOriginPattern(pattern) {
  if (!pattern) return "";
  let value = String(pattern);
  if (value.endsWith("/*")) {
    value = value.slice(0, -1);
  }
  if (!value.endsWith("/")) {
    value += "/";
  }
  return value;
}

function matchInternalOrigin(extension, origin) {
  if (!origin) return false;
  const hostPerms = extension.hostPermissions || [];
  for (const pattern of hostPerms) {
    if (!pattern.startsWith("moz-extension://") && !pattern.startsWith("chrome-extension://")) {
      continue;
    }
    const normalized = normalizeOriginPattern(pattern);
    if (origin === normalized || origin.startsWith(normalized)) {
      return true;
    }
  }
  return false;
}

async function resolveSourceExtensions(alert) {
  const extensionUrls =
    alert && alert.evidence && Array.isArray(alert.evidence.extensionUrls)
      ? alert.evidence.extensionUrls
      : [];
  if (!extensionUrls.length) return [];

  const { entries } = await getState();
  const extensions = Object.values(entries);
  const origins = extensionUrls
    .map((url) => normalizeInternalOrigin(url))
    .filter(Boolean);

  const matches = new Map();
  for (const extension of extensions) {
    for (const origin of origins) {
      if (matchInternalOrigin(extension, origin)) {
        matches.set(extension.id, {
          id: extension.id,
          name: extension.name,
          version: extension.version,
          installType: extension.installType,
          matchedOrigin: origin
        });
      }
    }
  }

  return Array.from(matches.values());
}

function mergeAlerts(existing, incoming) {
  const merged = normalizeAlert(incoming);
  const prev = normalizeAlert(existing);
  const level = levelRank(merged.level) > levelRank(prev.level) ? merged.level : prev.level;

  const reasons = Array.from(new Set([...(prev.reasons || []), ...(merged.reasons || [])])).slice(0, 6);
  const extensionUrls = Array.from(
    new Set([...(prev.evidence.extensionUrls || []), ...(merged.evidence.extensionUrls || [])])
  ).slice(0, 3);

  return {
    ...prev,
    ...merged,
    level,
    reasons,
    counts: {
      added: (prev.counts?.added || 0) + (merged.counts?.added || 0),
      removed: (prev.counts?.removed || 0) + (merged.counts?.removed || 0),
      attributes: (prev.counts?.attributes || 0) + (merged.counts?.attributes || 0),
      text: (prev.counts?.text || 0) + (merged.counts?.text || 0)
    },
    topTags: merged.topTags.length ? merged.topTags : prev.topTags,
    evidence: {
      ...prev.evidence,
      ...merged.evidence,
      extensionUrls
    },
    diff: mergeDiff(prev.diff, merged.diff),
    sourceExtensions: Array.from(
      new Map(
        [...(prev.sourceExtensions || []), ...(merged.sourceExtensions || [])].map((entry) => [
          entry.id,
          entry
        ])
      ).values()
    )
  };
}

async function addAlert(payload) {
  const alerts = await getAlerts();
  const incoming = normalizeAlert(payload);
  incoming.sourceExtensions = await resolveSourceExtensions(incoming);
  const now = incoming.timestamp || Date.now();

  const matchIndex = alerts.findIndex(
    (alert) => alert.url === incoming.url && now - alert.timestamp < 30000
  );

  if (matchIndex >= 0) {
    const merged = mergeAlerts(alerts[matchIndex], incoming);
    alerts.splice(matchIndex, 1);
    alerts.unshift(merged);
  } else {
    alerts.unshift(incoming);
  }

  if (alerts.length > MAX_ALERTS) {
    alerts.length = MAX_ALERTS;
  }

  await setAlerts(alerts);
  return { ok: true };
}

async function hydrateCounts() {
  const result = await browser.storage.local.get([STORAGE_KEY, ALERTS_KEY]);
  const entries = result[STORAGE_KEY] || {};
  const alerts = result[ALERTS_KEY] || [];
  newCountCache = countNew(entries);
  alertCountCache = alerts.length;
  updateBadge();
}

async function getPermissionWarnings(id) {
  try {
    if (!browser.management.getPermissionWarningsById) {
      return [];
    }
    const warnings = await browser.management.getPermissionWarningsById(id);
    return Array.isArray(warnings) ? warnings : [];
  } catch (error) {
    return [];
  }
}

async function syncInventory() {
  const all = await browser.management.getAll();
  const { entries: stored, initialized } = await getState();
  const next = {};

  for (const info of all) {
    if (info.type !== "extension") continue;
    if (info.id === browser.runtime.id) continue;

    const warnings = await getPermissionWarnings(info.id);
    const prev = stored[info.id];
    const isNew = prev ? prev.isNew : initialized;
    next[info.id] = normalizeExtensionInfo(info, isNew, warnings);
  }

  await setState(next, true);
  return next;
}

async function upsertExtension(info, isNew = true) {
  if (info.type !== "extension") return;
  if (info.id === browser.runtime.id) return;

  const warnings = await getPermissionWarnings(info.id);
  const { entries: stored } = await getState();
  const prev = stored[info.id];
  const keepNew = prev ? prev.isNew : isNew;
  stored[info.id] = normalizeExtensionInfo(info, keepNew, warnings);
  await setState(stored, true);
}

async function removeExtension(id) {
  const { entries: stored, initialized } = await getState();
  if (stored[id]) {
    delete stored[id];
    await setState(stored, initialized);
  }
}

browser.management.onInstalled.addListener((info) => {
  upsertExtension(info, true).catch(() => {});
});

browser.management.onEnabled.addListener((info) => {
  upsertExtension(info, false).catch(() => {});
});

browser.management.onDisabled.addListener((info) => {
  upsertExtension(info, false).catch(() => {});
});

browser.management.onUninstalled.addListener((id) => {
  removeExtension(id).catch(() => {});
});

browser.runtime.onMessage.addListener((message) => {
  if (message && message.type === "getList") {
    const maybeSync = message.sync ? syncInventory() : Promise.resolve();
    return maybeSync.then(async () => {
      const { entries } = await getState();
      const list = Object.values(entries).sort((a, b) => {
        return a.name.localeCompare(b.name);
      });
      return { extensions: list, newCount: countNew(entries) };
    });
  }

  if (message && message.type === "clearNew") {
    return getState().then(async ({ entries }) => {
      const next = {};
      for (const [id, info] of Object.entries(entries)) {
        next[id] = { ...info, isNew: false };
      }
      await setState(next, true);
      return { ok: true };
    });
  }

  if (message && message.type === "pageMutation") {
    return addAlert(message.payload || {});
  }

  if (message && message.type === "getAlerts") {
    return getAlerts().then((alerts) => ({ alerts }));
  }

  if (message && message.type === "setAlerts") {
    const next = Array.isArray(message.alerts) ? message.alerts : [];
    return setAlerts(next).then(() => ({ ok: true }));
  }

  if (message && message.type === "clearAlerts") {
    return setAlerts([]).then(() => ({ ok: true }));
  }

  return false;
});

syncInventory()
  .then(() => hydrateCounts())
  .catch(() => {});
