# Firefox Extension Watchdog

Firefox Extension Watchdog helps people understand how browser extensions may be affecting the pages they visit. It detects high-signal page changes, attributes them to extensions when possible, and provides a clear, non-blocking UI for review and alerts.

## Key Features

- **Extension inventory**
  - Lists all installed extensions with version, status, install type, permissions, host permissions, and browser permission warnings.
  - Highlights newly installed extensions.

- **Real-time page change detection**
  - Monitors DOM mutations for high-signal security changes (scripts, iframes, form actions, URL/source changes, inline handlers, and sensitive inputs).
  - Captures evidence and redacts sensitive values to avoid leaking data.

- **Attribution (when possible)**
  - Detects `moz-extension://` resource URLs and maps them back to the owning extension.
  - Shows "What the extension did" with concrete actions and examples.

- **Alert dashboard**
  - Grouped activity by site with confidence levels.
  - Date filters (year/month/day) to slice large histories.
  - Storage usage display and data retention tools.

- **Data management**
  - Clear alerts by age (1/3/6/12 months), by date range, or clear all.
  - Export filtered alerts or all alerts as JSON.

## How It Works

- A content script listens for DOM mutations and records security-relevant changes.
- The background script stores alerts and maintains extension inventory.
- The popup provides a quick, summarized view and links to the full dashboard.
- The dashboard shows detailed evidence, attribution, and advanced diff data.

## Permissions Used

- `management` - read installed extensions and their permissions
- `storage` - store alerts and extension inventory
- `<all_urls>` - monitor pages for security-relevant changes

## Development

1. Open Firefox and go to `about:debugging` -> **This Firefox**.
2. **Load Temporary Add-on** and select `manifest.json`.
3. Visit sites, then open the extension popup or dashboard to review alerts.

## Notes on Attribution

Firefox does not expose which extension triggered a DOM mutation. Attribution is only possible when extension-origin URLs are present (for example, `moz-extension://...`) or when a single matched extension is the only plausible source. Unknown activity remains labeled as such to avoid false claims.

## License

Creative Commons Attribution-NoDerivatives 4.0 International (CC BY-ND 4.0). See `LICENSE`.
