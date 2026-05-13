# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This repository is a minimal **Cloudflare Workers** project with static assets, not a pure Pages site.

- `_worker.js` is the only server-side entrypoint. It proxies `/<absolute-url>` requests, handles CORS preflight, passes WebSocket upgrades through, rewrites redirect `Location` headers back to the current origin, rewrites upstream `text/html` to `text/cf-html` so downloads are not rendered as HTML, and caches safe GET download responses at the Cloudflare edge.
- Static files are served through `env.ASSETS.fetch(...)`.
- `index.html` keeps markup and SEO/JSON-LD in one file, while shared page styles and client-side behavior live under `src/`.
- `404.html` is a separate static not-found page.
- Deployment is configured by `wrangler.toml` and `.github/workflows/deploy.yml`.

## Common commands

There is no build step or lint setup. Automated tests use Node's built-in `node:test` runner.

```bash
ls -la
python -m http.server 8000
npm test
wrangler dev
wrangler deploy --minify
```

There is no separate single-test command; run `npm test` for the full lightweight test suite and use manual validation for Worker/network behavior.

## Deployment

- `wrangler.toml` uses `_worker.js` as `main` and binds the repo root as `ASSETS`.
- `.assetsignore` must exclude `_worker.js` so Wrangler does not try to upload the worker entrypoint as a public asset. It must also exclude development-only files such as `package.json`, `test/`, `node_modules/`, and `.sisyphus/` because the repo root is bound as public `ASSETS`.
- `.github/workflows/deploy.yml` deploys to Cloudflare Workers.
- Auto-deploy runs on pushes to `main` only when deployment-relevant files change, and also supports `workflow_dispatch`.
- The workflow runs `npm test`, validates `CLOUDFLARE_API_TOKEN`, runs `wrangler whoami`, then `wrangler deploy --dry-run --minify`, then `wrangler deploy --minify`.
- If deployment behavior changes, update both `README.md` and `CLAUDE.md` so the docs stay aligned with `wrangler.toml` and the workflow file.

## Architecture notes

### Request routing model

`_worker.js` treats the first path segment as the full target URL:

- `/https://example.com/file.zip` proxies to `https://example.com/file.zip`
- `/wss://example.com/socket` is normalized to an upstream `https:` request while preserving WebSocket upgrade handling
- invalid absolute URLs fall back to `env.ASSETS.fetch(...)`

Changes to URL parsing in `_worker.js` and `index.html` must stay aligned.

### Frontend behavior model

The module script in `src/app.js` owns all interactive behavior, while `src/url-tools.js` contains URL parsing/building helpers covered by automated tests:

- normalizes user input into `http`, `https`, `ws`, or `wss`
- detects already-proxied URLs for the current host and expands them back to the original target
- auto-prepends `https://` for domain-like input
- builds proxied URLs using `window.location.origin` for HTTP(S) and `ws:` / `wss:` for WebSocket targets
- persists the last input in `localStorage`
- generates the "More usage" examples from per-panel `data-command-template` attributes

When changing proxy URL format, supported protocols, or examples, update both `_worker.js` and `index.html`.

### Content strategy

`index.html` contains substantial static copy and JSON-LD for search/discoverability. Avoid moving this copy into generated assets or JS-rendered templates unless explicitly requested.

### Edge cache behavior

`_worker.js` uses Cloudflare Cache API for conservative download acceleration:

- only safe `GET` requests are eligible for cache lookup/write
- requests with `Authorization`, `Cookie`, `Cache-Control: no-store` / `no-cache` / `private`, or sensitive signed-URL query keys bypass cache
- upstream `200` responses with `Content-Length` can be cached unless they include `Set-Cookie`, `Vary: *`, or `Cache-Control: no-store` / `no-cache` / `private`
- redirects, `206 Partial Content`, WebSocket upgrades, and non-GET requests are not cached
- `Range` requests can read an already cached full response, but range misses are fetched from upstream and not stored
- cache status is exposed through `X-Proxy-Cache` and optionally `X-Proxy-Cache-Reason`
- the cache is local to each Cloudflare data center, so the first request in a region can still be slow

## Deployment pitfall

- Symptom: `wrangler deploy --dry-run --minify` or `wrangler deploy --minify` fails with `Uploading a Pages _worker.js file as an asset`, or development files become publicly accessible as static assets.
- Root cause: the repo root is bound as `ASSETS`, so Wrangler scans repository files as static assets unless they are explicitly ignored.
- Fix: keep a root `.assetsignore` file that excludes `_worker.js`, repo metadata, and development-only files such as `.git`, `.github`, `.sisyphus`, `node_modules`, `package.json`, `package-lock.json`, and `test`.

## Editing guidance

- Keep `index.html`, `src/styles.css`, `src/app.js`, and `src/url-tools.js` aligned when changing frontend behavior.
- Preserve the current light visual style unless asked to redesign it.
- For proxy behavior changes, manually verify both standard downloads and WebSocket-style URLs.
- For cache behavior changes, verify `MISS`, repeat-request `HIT`, and auth/cookie/range `BYPASS` cases with deployed Worker responses.
- Be careful when modifying response headers in `_worker.js`: CORS headers, redirect rewriting, `content-type` rewriting, and `X-Proxy-Cache` headers are user-visible behavior.
