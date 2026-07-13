---
name: verify
description: Build/launch/drive recipe to verify shacl-ui.js changes end-to-end in a real browser.
---

# Verifying shacl-ui.js changes

Surface: the `<shacl-renderer>` web component rendered on the demo pages under `src/`.

## Launch

```bash
npm run dev -- --port 5199 --strictPort   # vite dev server
# demo pages: http://localhost:5199/src/index.html (alice/PersonShape, useLightDom),
#             src/cv.html, src/publication.html, src/rdf-connect.html
```

## Drive (headless Chrome over CDP, no extra deps)

Node ≥22 has a global `WebSocket`; Chrome lives at
`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`. Launch with
`--headless=new --remote-debugging-port=<port> --user-data-dir=$(mktemp -d)`, get the page's
`webSocketDebuggerUrl` from `http://localhost:<port>/json/list`, then use `Runtime.evaluate`
(`awaitPromise: true, returnByValue: true`) and `Page.captureScreenshot`.

Gotchas:
- Wait for `customElements.whenDefined('shacl-renderer')` **and** `el.loading === false`
  before touching `el.renderRoot` (it is undefined until the first Lit update).
- `src/index.html` uses `useLightDom`, so `el.renderRoot` == the element itself and inputs are
  reachable with plain `querySelectorAll`.
- Useful assertions: `el.dataStore.getQuads()` for synchronous store state right after
  dispatching a `change` event on an input; `await el.data('text/turtle')` for the public API.
- Plus icons: green `svg` with `float-right` classes; x icons: `svg` whose path `d` starts
  `M6 18L18 6`. Beware: selecting "the last x icon" hits the last field on the page, not the
  row you just added.
