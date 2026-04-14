# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This repository is a minimal **Cloudflare Workers** project with static assets, not a pure Pages site.

- `_worker.js` is the only server-side entrypoint. It proxies `/<absolute-url>` requests, handles CORS preflight, passes WebSocket upgrades through, rewrites redirect `Location` headers back to the current origin, and rewrites upstream `text/html` to `text/cf-html` so downloads are not rendered as HTML.
- Static files are served through `env.ASSETS.fetch(...)`.
- `index.html` is intentionally self-contained: markup, styles, SEO/JSON-LD, and all client-side behavior live in one file.
- `404.html` is a separate static not-found page.
- Deployment is configured by `wrangler.toml` and `.github/workflows/deploy.yml`.

## Common commands

There is no `package.json`, lint setup, or automated test suite in this repo.

```bash
ls -la
python -m http.server 8000
wrangler dev
wrangler deploy --minify
```

There is no single-test command because there is no automated test harness; validation is manual.

## Deployment

- `wrangler.toml` uses `_worker.js` as `main` and binds the repo root as `ASSETS`.
- `.github/workflows/deploy.yml` deploys to Cloudflare Workers.
- Auto-deploy runs on pushes to `main` only when deployment-relevant files change, and also supports `workflow_dispatch`.
- The workflow validates `CLOUDFLARE_API_TOKEN`, runs `wrangler whoami`, then `wrangler deploy --dry-run --minify`, then `wrangler deploy --minify`.
- If deployment behavior changes, update both `README.md` and `CLAUDE.md` so the docs stay aligned with `wrangler.toml` and the workflow file.

## Architecture notes

### Request routing model

`_worker.js` treats the first path segment as the full target URL:

- `/https://example.com/file.zip` proxies to `https://example.com/file.zip`
- `/wss://example.com/socket` is normalized to an upstream `https:` request while preserving WebSocket upgrade handling
- invalid absolute URLs fall back to `env.ASSETS.fetch(...)`

Changes to URL parsing in `_worker.js` and `index.html` must stay aligned.

### Frontend behavior model

The bottom script in `index.html` owns all interactive behavior:

- normalizes user input into `http`, `https`, `ws`, or `wss`
- detects already-proxied URLs for the current host and expands them back to the original target
- auto-prepends `https://` for domain-like input
- builds proxied URLs using `window.location.origin` for HTTP(S) and `ws:` / `wss:` for WebSocket targets
- persists the last input in `localStorage`
- generates the "More usage" examples from per-panel `data-command-template` attributes

When changing proxy URL format, supported protocols, or examples, update both `_worker.js` and `index.html`.

### Content strategy

`index.html` contains substantial static copy and JSON-LD for search/discoverability. Avoid splitting this into generated assets or JS-rendered templates unless explicitly requested.

## Editing guidance

- Prefer keeping `index.html` self-contained unless the user explicitly asks for a refactor.
- Preserve the current light visual style unless asked to redesign it.
- For proxy behavior changes, manually verify both standard downloads and WebSocket-style URLs.
- Be careful when modifying response headers in `_worker.js`: CORS headers, redirect rewriting, and `content-type` rewriting are user-visible behavior.
