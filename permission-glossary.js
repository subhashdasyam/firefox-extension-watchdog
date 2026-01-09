/* global window */

const PERMISSION_GLOSSARY = {
  "activeTab": {
    "label": "Active tab",
    "misuse": "Could read or change the current page during that action.",
    "risk": "medium",
    "summary": "Temporary access to the current tab after a user action.",
    "uses": "Run a one-time action on the page you asked for."
  },
  "alarms": {
    "label": "Alarms",
    "misuse": "Usually low risk; could run tasks silently.",
    "risk": "low",
    "summary": "Schedule code to run later or periodically.",
    "uses": "Reminders, periodic sync, cleanup tasks."
  },
  "background": {
    "label": "Background",
    "misuse": "Usually low risk by itself.",
    "risk": "low",
    "summary": "Run background logic without an open tab.",
    "uses": "Keep features running across sessions."
  },
  "bookmarks": {
    "label": "Bookmarks",
    "misuse": "Could read or alter your saved bookmarks.",
    "risk": "medium",
    "summary": "Read and change your bookmarks.",
    "uses": "Bookmark managers, sync, cleanup tools."
  },
  "browserSettings": {
    "label": "Browser settings",
    "misuse": "Could change settings without clear notice.",
    "risk": "medium",
    "summary": "Change certain global browser settings.",
    "uses": "Privacy or UI tweaks."
  },
  "browsingData": {
    "label": "Browsing data",
    "misuse": "Could delete data you did not mean to remove.",
    "risk": "medium",
    "summary": "Clear data like cache, cookies, or history.",
    "uses": "Cleanup and privacy tools."
  },
  "captivePortal": {
    "label": "Captive portal",
    "misuse": "Low direct risk.",
    "risk": "low",
    "summary": "Detect if you are behind a Wi-Fi login portal.",
    "uses": "Network login helpers."
  },
  "clipboardRead": {
    "label": "Clipboard read",
    "misuse": "Could read sensitive copied data.",
    "risk": "high",
    "summary": "Read data from your clipboard.",
    "uses": "Paste helpers, password managers."
  },
  "clipboardWrite": {
    "label": "Clipboard write",
    "misuse": "Could replace what you copied.",
    "risk": "medium",
    "summary": "Write data to your clipboard.",
    "uses": "Copy helpers, formatting tools."
  },
  "contentSettings": {
    "label": "Content settings",
    "misuse": "Could weaken site protections if misused.",
    "note": "Behavior varies by browser; check compatibility.",
    "risk": "medium",
    "summary": "Change per-site content settings (varies by browser).",
    "uses": "Per-site control of features like cookies or scripts (Chromium)."
  },
  "contextualIdentities": {
    "label": "Contextual identities",
    "misuse": "Could expose container identities.",
    "risk": "medium",
    "summary": "Manage container tabs and identities.",
    "uses": "Separate work and personal logins."
  },
  "cookies": {
    "label": "Cookies",
    "misuse": "Could access session cookies or track you.",
    "risk": "high",
    "summary": "Read, write, and remove cookies on allowed sites.",
    "uses": "Session managers, login helpers."
  },
  "debugger": {
    "label": "Debugger",
    "misuse": "Could inspect or modify page data.",
    "risk": "high",
    "summary": "Attach a debugger to pages and inspect them.",
    "uses": "Developer tools and debugging."
  },
  "declarativeNetRequest": {
    "label": "Declarative net request",
    "misuse": "Could block or redirect traffic.",
    "risk": "medium",
    "summary": "Define network rules without reading each request.",
    "uses": "Ad blocking, privacy rules."
  },
  "declarativeNetRequestFeedback": {
    "label": "DNR feedback",
    "misuse": "Low direct risk.",
    "risk": "low",
    "summary": "Access debug info about matched network rules.",
    "uses": "Rule testing and diagnostics."
  },
  "declarativeNetRequestWithHostAccess": {
    "label": "DNR with host access",
    "misuse": "Could redirect or rewrite traffic on allowed sites.",
    "risk": "high",
    "summary": "Advanced rules with host access for redirects or header changes.",
    "uses": "Security or privacy tooling."
  },
  "devtools": {
    "label": "Devtools",
    "misuse": "Could add deceptive devtools UI.",
    "risk": "medium",
    "summary": "Add panels or tools to the developer tools.",
    "uses": "Developer utilities."
  },
  "dns": {
    "label": "DNS",
    "misuse": "Could probe domains you visit.",
    "risk": "medium",
    "summary": "Resolve domain names.",
    "uses": "Security or performance checks."
  },
  "downloads": {
    "label": "Downloads",
    "misuse": "Could download unwanted files.",
    "risk": "medium",
    "summary": "Download files and manage downloads.",
    "uses": "Download managers."
  },
  "downloads.open": {
    "label": "Downloads open",
    "misuse": "Could open files without clear intent.",
    "risk": "medium",
    "summary": "Open downloaded files.",
    "uses": "Open a completed download automatically."
  },
  "find": {
    "label": "Find",
    "misuse": "Low risk.",
    "risk": "low",
    "summary": "Find text within pages.",
    "uses": "Search in page utilities."
  },
  "geolocation": {
    "label": "Geolocation",
    "misuse": "Could track your location.",
    "risk": "high",
    "summary": "Access your location.",
    "uses": "Location-based features."
  },
  "history": {
    "label": "History",
    "misuse": "Could reveal or alter your browsing history.",
    "risk": "high",
    "summary": "Read or change your browsing history.",
    "uses": "History search and cleanup."
  },
  "identity": {
    "label": "Identity",
    "misuse": "Could access account tokens if misused.",
    "risk": "medium",
    "summary": "Use identity and OAuth helpers.",
    "uses": "Sign-in flows."
  },
  "idle": {
    "label": "Idle",
    "misuse": "Low direct risk.",
    "risk": "low",
    "summary": "Detect when the system is idle or locked.",
    "uses": "Pause features when inactive."
  },
  "management": {
    "label": "Management",
    "misuse": "Could disable other extensions.",
    "risk": "high",
    "summary": "Get info about installed add-ons and enable or disable them.",
    "uses": "Extension managers, security tools."
  },
  "menus": {
    "label": "Menus",
    "misuse": "Low risk; could add confusing menu entries.",
    "risk": "low",
    "summary": "Add items to browser context menus.",
    "uses": "Quick actions in right-click menu."
  },
  "menus.overrideContext": {
    "label": "Menus override",
    "misuse": "Could hide standard menu items.",
    "risk": "medium",
    "summary": "Override the default context menu in some pages.",
    "uses": "Custom context menu experiences."
  },
  "nativeMessaging": {
    "label": "Native messaging",
    "misuse": "Could pass data to native apps.",
    "risk": "high",
    "summary": "Communicate with native apps installed on the computer.",
    "uses": "Integrations with desktop apps."
  },
  "notifications": {
    "label": "Notifications",
    "misuse": "Could spam or phish via notifications.",
    "risk": "low",
    "summary": "Show system notifications.",
    "uses": "Alerts and reminders."
  },
  "pageCapture": {
    "label": "Page capture",
    "misuse": "Could capture page content.",
    "note": "Support varies by browser.",
    "risk": "medium",
    "summary": "Capture a snapshot of a tab (Chromium API).",
    "uses": "Page capture or export."
  },
  "pkcs11": {
    "label": "PKCS11",
    "misuse": "Could interact with security modules.",
    "risk": "high",
    "summary": "Access PKCS11 modules for keys and certificates.",
    "uses": "Smart cards or hardware tokens."
  },
  "privacy": {
    "label": "Privacy",
    "misuse": "Could weaken privacy settings.",
    "risk": "medium",
    "summary": "Read or change privacy-related settings.",
    "uses": "Privacy controls."
  },
  "proxy": {
    "label": "Proxy",
    "misuse": "Could route traffic through unwanted proxies.",
    "risk": "high",
    "summary": "Proxy or direct network requests.",
    "uses": "VPN or proxy tools."
  },
  "scripting": {
    "label": "Scripting",
    "misuse": "Could read or change page content.",
    "risk": "high",
    "summary": "Inject JavaScript or CSS into pages.",
    "uses": "Page customization, automation."
  },
  "search": {
    "label": "Search",
    "misuse": "Could change your search provider.",
    "risk": "medium",
    "summary": "Use or manage search engines.",
    "uses": "Search helpers."
  },
  "sessions": {
    "label": "Sessions",
    "misuse": "Could reveal recent browsing.",
    "risk": "medium",
    "summary": "Access recently closed tabs and windows.",
    "uses": "Session restore tools."
  },
  "storage": {
    "label": "Storage",
    "misuse": "Low direct risk.",
    "risk": "low",
    "summary": "Store and retrieve extension data.",
    "uses": "Save settings and state."
  },
  "tabGroups": {
    "label": "Tab groups",
    "misuse": "Low risk.",
    "risk": "low",
    "summary": "Manage tab groups.",
    "uses": "Organize tabs."
  },
  "tabHide": {
    "label": "Tab hide",
    "misuse": "Could hide tabs unexpectedly.",
    "risk": "low",
    "summary": "Hide tabs without closing them.",
    "uses": "Focus or privacy helpers."
  },
  "tabs": {
    "label": "Tabs",
    "misuse": "Could see what sites are open.",
    "risk": "medium",
    "summary": "Access tab metadata like URL or title.",
    "uses": "Tab managers."
  },
  "theme": {
    "label": "Theme",
    "misuse": "Low risk.",
    "risk": "low",
    "summary": "Read or set browser themes.",
    "uses": "Theme switchers."
  },
  "topSites": {
    "label": "Top sites",
    "misuse": "Could reveal browsing habits.",
    "risk": "medium",
    "summary": "Read your most visited sites.",
    "uses": "Speed dial pages."
  },
  "unlimitedStorage": {
    "label": "Unlimited storage",
    "misuse": "Could store large amounts of data.",
    "risk": "low",
    "summary": "Use more storage without quota limits.",
    "uses": "Large offline data sets."
  },
  "userScripts": {
    "label": "User scripts",
    "misuse": "Could inject code into pages.",
    "risk": "high",
    "summary": "Register user scripts to run on matching pages.",
    "uses": "User script managers."
  },
  "webNavigation": {
    "label": "Web navigation",
    "misuse": "Could track browsing activity.",
    "risk": "medium",
    "summary": "Observe navigation events in tabs.",
    "uses": "Track page loads."
  },
  "webRequest": {
    "label": "Web request",
    "misuse": "Could intercept or alter traffic.",
    "risk": "high",
    "summary": "Observe and modify network requests.",
    "uses": "Security, privacy, or ad blocking."
  },
  "webRequestAuthProvider": {
    "label": "Web request auth",
    "misuse": "Could interact with auth challenges.",
    "risk": "high",
    "summary": "Advanced webRequest authentication features.",
    "uses": "Enterprise authentication flows."
  },
  "webRequestBlocking": {
    "label": "Web request blocking",
    "misuse": "Could stop or rewrite requests.",
    "risk": "high",
    "summary": "Block or modify requests in a blocking way.",
    "uses": "Ad or tracker blocking."
  },
  "webRequestFilterResponse": {
    "label": "Web request filter response",
    "misuse": "Could alter page content or downloads.",
    "risk": "high",
    "summary": "Modify response bodies via stream filters.",
    "uses": "Content filtering."
  },
  "webRequestFilterResponse.serviceWorkerScript": {
    "label": "Web request filter SW",
    "misuse": "Could alter service worker behavior.",
    "risk": "high",
    "summary": "Modify service worker script responses via filters.",
    "uses": "Advanced filtering."
  }
};

const PERMISSION_ALIASES = {
  "contextMenus": "menus"
};

function getPermissionInfo(permission) {
  const key = PERMISSION_ALIASES[permission] || permission;
  return PERMISSION_GLOSSARY[key] || null;
}

window.getPermissionInfo = getPermissionInfo;
window.PERMISSION_GLOSSARY = PERMISSION_GLOSSARY;
