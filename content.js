/* global browser, chrome */

const api = typeof browser !== "undefined" ? browser : chrome;

(() => {
  if (window.top !== window) {
    return;
  }

  const QUIET_WINDOW_MS = 1500;
  const MIN_REPORT_INTERVAL_MS = 10000;
  const CHANGE_THRESHOLD = 25;
  const MAX_DESCENDANTS = 50;
  const MAX_DETAIL_ENTRIES = 30;
  const MAX_SNIPPET_LENGTH = 220;
  const MAX_MUTATIONS_PER_WINDOW = 3000;
  const MAX_SECURITY_ITEMS = 20;
  const SETTLE_AFTER_LOAD_MS = 2000;

  const INTERESTING_TAGS = new Set([
    "script",
    "iframe",
    "object",
    "embed",
    "link",
    "form",
    "input",
    "textarea",
    "select",
    "button",
    "img"
  ]);

  const ATTRIBUTE_WATCH = new Set([
    "src",
    "href",
    "action",
    "onclick",
    "onload",
    "onerror",
    "style",
    "data-src",
    "data-href"
  ]);

  let counts = resetCounts();
  let evidence = resetEvidence();
  let details = resetDetails();
  let security = resetSecurity();
  let tagCounts = {};
  let pendingTimer = null;
  let lastReport = 0;
  let observing = false;
  let settledAt = null;
  let mutationSeen = 0;

  const esc =
    typeof CSS !== "undefined" && CSS.escape
      ? CSS.escape
      : (value) => String(value).replace(/[^a-zA-Z0-9_-]/g, "\$&");

  function markSettled() {
    settledAt = Date.now() + SETTLE_AFTER_LOAD_MS;
  }

  if (document.readyState === "complete") {
    markSettled();
  } else {
    window.addEventListener("load", markSettled, { once: true });
  }

  function isSettled() {
    return settledAt !== null && Date.now() >= settledAt;
  }

  function resetCounts() {
    return { added: 0, removed: 0, attributes: 0, text: 0 };
  }

  function resetEvidence() {
    return {
      extensionUrls: new Set(),
      scriptAdds: 0,
      inlineScripts: 0,
      inlineHandlers: 0,
      iframeAdds: 0,
      formAdds: 0,
      linkChanges: 0,
      srcChanges: 0,
      actionChanges: 0
    };
  }

  function resetDetails() {
    return {
      added: [],
      removed: [],
      attributes: [],
      text: [],
      overflow: { added: 0, removed: 0, attributes: 0, text: 0 }
    };
  }

  function resetSecurity() {
    return {
      scripts: [],
      iframes: [],
      forms: [],
      inputs: [],
      urlChanges: [],
      actionChanges: [],
      inlineHandlers: 0
    };
  }

  function resetWindow() {
    counts = resetCounts();
    evidence = resetEvidence();
    details = resetDetails();
    security = resetSecurity();
    tagCounts = {};
    mutationSeen = 0;
  }

  function isExtensionUrl(value) {
    if (!value) return false;
    return value.startsWith("moz-extension://") || value.startsWith("chrome-extension://");
  }

  function originFromUrl(value) {
    try {
      if (!value) return "";
      const parsed = new URL(value, window.location.href);
      return parsed.origin;
    } catch (error) {
      return "";
    }
  }

  function originKind(origin) {
    if (!origin) return "unknown";
    if (origin.startsWith("moz-extension://") || origin.startsWith("chrome-extension://")) {
      return "extension";
    }
    if (origin === window.location.origin) return "page";
    return "external";
  }

  function recordUrl(value) {
    if (isExtensionUrl(value)) {
      evidence.extensionUrls.add(value);
    }
  }

  function trackTag(tagName) {
    const tag = (tagName || "").toLowerCase();
    if (!tag) return;
    tagCounts[tag] = (tagCounts[tag] || 0) + 1;
  }

  function truncate(value, limit = MAX_SNIPPET_LENGTH) {
    const text = String(value || "");
    if (text.length <= limit) return text;
    return `${text.slice(0, limit)}...`;
  }

  function sanitizeSnippet(html) {
    return truncate(
      String(html || "")
        .replace(/value="[^"]*"/gi, 'value="[redacted]"')
        .replace(/value='[^']*'/gi, "value='[redacted]'"),
      MAX_SNIPPET_LENGTH
    );
  }

  function getSelector(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return "";
    if (el.id) return `#${esc(el.id)}`;

    const parts = [];
    let current = el;
    let depth = 0;

    while (current && current.nodeType === Node.ELEMENT_NODE && depth < 3) {
      let part = current.tagName.toLowerCase();
      if (current.classList && current.classList.length) {
        const classes = Array.from(current.classList).slice(0, 2).map(esc).join(".");
        if (classes) {
          part += `.${classes}`;
        }
      }

      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          (child) => child.tagName === current.tagName
        );
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          part += `:nth-of-type(${index})`;
        }
      }

      parts.unshift(part);
      if (parent && parent.id) {
        parts.unshift(`#${esc(parent.id)}`);
        break;
      }

      current = parent;
      depth += 1;
    }

    return parts.join(" > ");
  }

  function recordDetail(type, payload) {
    if (details[type].length < MAX_DETAIL_ENTRIES) {
      details[type].push(payload);
    } else {
      details.overflow[type] += 1;
    }
  }

  function pushSecurity(list, entry) {
    if (list.length >= MAX_SECURITY_ITEMS) return;
    list.push(entry);
  }

  function shouldCaptureNode(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
    const tag = node.tagName.toLowerCase();
    if (INTERESTING_TAGS.has(tag)) return true;
    if (node.hasAttribute("src") || node.hasAttribute("href") || node.hasAttribute("action")) return true;
    return false;
  }

  function checkElement(el, trackTags = false) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return;

    if (trackTags) {
      trackTag(el.tagName);
    }

    const tag = el.tagName;

    if (tag === "SCRIPT") {
      evidence.scriptAdds += 1;
      if (el.src) {
        recordUrl(el.src);
      } else if (el.textContent && el.textContent.trim()) {
        evidence.inlineScripts += 1;
      }
    }

    if (tag === "IFRAME") {
      evidence.iframeAdds += 1;
    }

    if (tag === "FORM") {
      evidence.formAdds += 1;
    }

    const attrs = ["src", "href", "data-src", "data-href", "style"];
    for (const attr of attrs) {
      if (!el.hasAttribute(attr)) continue;
      recordUrl(el.getAttribute(attr));
    }

    for (const name of el.getAttributeNames()) {
      if (name.startsWith("on")) {
        evidence.inlineHandlers += 1;
      }
    }
  }

  function scanNode(node, trackTags = false) {
    if (!node) return;

    if (node.nodeType === Node.ELEMENT_NODE) {
      checkElement(node, trackTags);
      const root = node;
      if (root.querySelectorAll) {
        const nodes = root.querySelectorAll("[src],[href],script,style,iframe,form");
        let scanned = 0;
        for (const child of nodes) {
          checkElement(child);
          scanned += 1;
          if (scanned >= MAX_DESCENDANTS) break;
        }
      }
    }
  }

  function recordAddedNode(node) {
    if (!shouldCaptureNode(node)) return;
    const el = node;
    const tag = el.tagName.toLowerCase();
    const selector = getSelector(el);
    const snippet = sanitizeSnippet(el.outerHTML);

    recordDetail("added", {
      tag,
      selector,
      snippet,
      src: el.getAttribute("src") || "",
      href: el.getAttribute("href") || "",
      action: el.getAttribute("action") || "",
      inputType: el.getAttribute("type") || ""
    });

    if (tag === "script") {
      const src = el.getAttribute("src") || "";
      const origin = originFromUrl(src);
      pushSecurity(security.scripts, {
        type: "script",
        selector,
        src,
        inline: !src,
        origin,
        originKind: originKind(origin)
      });
    }

    if (tag === "iframe") {
      const src = el.getAttribute("src") || "";
      const origin = originFromUrl(src);
      pushSecurity(security.iframes, {
        type: "iframe",
        selector,
        src,
        origin,
        originKind: originKind(origin)
      });
    }

    if (tag === "form") {
      const action = el.getAttribute("action") || "";
      pushSecurity(security.forms, {
        type: "form",
        selector,
        action
      });
    }

    if (tag === "input") {
      const inputType = (el.getAttribute("type") || "text").toLowerCase();
      pushSecurity(security.inputs, {
        type: "input",
        selector,
        inputType,
        name: el.getAttribute("name") || ""
      });
    }
  }

  function recordRemovedNode(node) {
    if (!shouldCaptureNode(node)) return;
    const el = node;
    const tag = el.tagName.toLowerCase();
    recordDetail("removed", {
      tag,
      selector: getSelector(el),
      snippet: sanitizeSnippet(el.outerHTML)
    });
  }

  function recordAttributeChange(target, name, oldValue) {
    if (!target || target.nodeType !== Node.ELEMENT_NODE) return;
    if (!ATTRIBUTE_WATCH.has(name) && !name.startsWith("on")) return;

    const newValue = target.getAttribute(name);
    const safeOld = name === "value" ? "[redacted]" : truncate(oldValue || "");
    const safeNew = name === "value" ? "[redacted]" : truncate(newValue || "");

    if (name === "href") evidence.linkChanges += 1;
    if (name === "src") evidence.srcChanges += 1;
    if (name === "action") evidence.actionChanges += 1;

    if (name.startsWith("on")) {
      evidence.inlineHandlers += 1;
      security.inlineHandlers += 1;
    }

    if (name === "src" || name === "href" || name === "data-src" || name === "data-href") {
      recordUrl(newValue);
      const origin = originFromUrl(newValue);
      pushSecurity(security.urlChanges, {
        tag: target.tagName.toLowerCase(),
        attribute: name,
        selector: getSelector(target),
        oldValue: safeOld,
        newValue: safeNew,
        origin,
        originKind: originKind(origin)
      });
    }

    if (name === "action") {
      pushSecurity(security.actionChanges, {
        selector: getSelector(target),
        oldValue: safeOld,
        newValue: safeNew
      });
    }

    recordDetail("attributes", {
      selector: getSelector(target),
      tag: target.tagName.toLowerCase(),
      attribute: name,
      oldValue: safeOld,
      newValue: safeNew
    });
  }

  function recordTextChange(node, oldValue) {
    if (!node || node.nodeType !== Node.TEXT_NODE) return;
    const parent = node.parentElement;
    if (!parent) return;
    if (parent.isContentEditable) return;
    const tag = parent.tagName;
    if (tag === "SCRIPT" || tag === "STYLE") {
      const oldText = truncate(oldValue || "");
      const newText = truncate(node.data || "");
      recordDetail("text", {
        selector: getSelector(parent),
        oldValue: oldText,
        newValue: newText
      });
      return;
    }
  }

  function topTags(limit = 3) {
    return Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([tag, count]) => ({ tag, count }));
  }

  function classifyEvidence() {
    const reasons = [];
    let level = "low";

    if (evidence.extensionUrls.size > 0) {
      level = "high";
      reasons.push("Extension resource URLs were found on the page.");
    }

    if (evidence.scriptAdds > 0 || evidence.inlineScripts > 0) {
      if (level === "low") level = "medium";
      reasons.push("Scripts were injected into the page.");
    }

    if (evidence.iframeAdds > 0) {
      if (level === "low") level = "medium";
      reasons.push("Iframes were added to the page.");
    }

    if (evidence.linkChanges > 0 || evidence.srcChanges > 0) {
      if (level === "low") level = "medium";
      reasons.push("Links or media sources were changed.");
    }

    if (evidence.actionChanges > 0) {
      if (level === "low") level = "medium";
      reasons.push("Form actions were changed.");
    }

    if (evidence.inlineHandlers > 0) {
      if (level === "low") level = "medium";
      reasons.push("Inline event handlers were added.");
    }

    const structural = counts.added + counts.removed;
    if (structural >= CHANGE_THRESHOLD) {
      reasons.push("Many elements were added or removed.");
    }

    return { level, reasons: reasons.slice(0, 6) };
  }

  function hasSecurityImpact() {
    return (
      security.scripts.length ||
      security.iframes.length ||
      security.forms.length ||
      security.inputs.length ||
      security.urlChanges.length ||
      security.actionChanges.length ||
      security.inlineHandlers ||
      evidence.extensionUrls.size > 0
    );
  }

  function scheduleFlush() {
    if (pendingTimer) clearTimeout(pendingTimer);
    pendingTimer = setTimeout(flush, QUIET_WINDOW_MS);
  }

  function flush() {
    pendingTimer = null;
    const total = counts.added + counts.removed + counts.attributes + counts.text;
    const now = Date.now();
    const { level, reasons } = classifyEvidence();

    if (total === 0 && evidence.extensionUrls.size === 0) {
      resetWindow();
      return;
    }

    if (!isSettled() && level !== "high") {
      resetWindow();
      return;
    }

    if (level === "low") {
      resetWindow();
      return;
    }

    if (!hasSecurityImpact() && level !== "high") {
      resetWindow();
      return;
    }

    if (level !== "high" && now - lastReport < MIN_REPORT_INTERVAL_MS) {
      resetWindow();
      return;
    }

    lastReport = now;

    const payload = {
      url: window.location.href,
      hostname: window.location.hostname,
      title: document.title || window.location.hostname,
      timestamp: now,
      level,
      reasons,
      counts: { ...counts },
      topTags: topTags(),
      evidence: {
        extensionUrls: Array.from(evidence.extensionUrls).slice(0, 3),
        scriptAdds: evidence.scriptAdds,
        inlineScripts: evidence.inlineScripts,
        inlineHandlers: evidence.inlineHandlers,
        iframeAdds: evidence.iframeAdds,
        formAdds: evidence.formAdds,
        linkChanges: evidence.linkChanges,
        srcChanges: evidence.srcChanges,
        actionChanges: evidence.actionChanges
      },
      security: {
        scripts: security.scripts,
        iframes: security.iframes,
        forms: security.forms,
        inputs: security.inputs,
        urlChanges: security.urlChanges,
        actionChanges: security.actionChanges,
        inlineHandlers: security.inlineHandlers
      },
      diff: {
        added: details.added,
        removed: details.removed,
        attributes: details.attributes,
        text: details.text,
        overflow: details.overflow
      }
    };

    api.runtime.sendMessage({ type: "pageMutation", payload }).catch(() => {});

    resetWindow();
  }

  const observer = new MutationObserver((mutations) => {
    mutationSeen += mutations.length;
    if (mutationSeen > MAX_MUTATIONS_PER_WINDOW) {
      details.overflow.added += 1;
      scheduleFlush();
      return;
    }

    for (const mutation of mutations) {
      if (mutation.type === "childList") {
        counts.added += mutation.addedNodes.length;
        counts.removed += mutation.removedNodes.length;
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            scanNode(node, true);
            recordAddedNode(node);
          }
        }
        for (const node of mutation.removedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            recordRemovedNode(node);
          }
        }
      }

      if (mutation.type === "attributes") {
        counts.attributes += 1;
        if (mutation.attributeName) {
          recordAttributeChange(mutation.target, mutation.attributeName, mutation.oldValue);
        }
      }

      if (mutation.type === "characterData") {
        counts.text += 1;
        recordTextChange(mutation.target, mutation.oldValue);
      }
    }

    scheduleFlush();
  });

  function startObserver() {
    if (observing) return;
    if (!document.documentElement) return;
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeOldValue: true,
      characterData: true,
      characterDataOldValue: true,
      attributeFilter: Array.from(ATTRIBUTE_WATCH)
    });
    observing = true;
  }

  function stopObserver() {
    if (!observing) return;
    observer.disconnect();
    observing = false;
  }

  function handleVisibility() {
    if (document.visibilityState === "visible") {
      resetWindow();
      startObserver();
    } else {
      stopObserver();
    }
  }

  document.addEventListener("visibilitychange", handleVisibility);
  handleVisibility();
})();
