import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildProxyUrl, canOpenProxyUrl, looksLikeDomain, normalizeSource, summarizeUrl } from "../src/url-tools.js";

const pageLocation = {
    protocol: "https:",
    host: "proxy.example",
    origin: "https://proxy.example"
};

test("normalizes a complete HTTPS URL", () => {
    const result = normalizeSource("https://example.com/file.zip", pageLocation);

    assert.equal(result.ok, true);
    assert.equal(result.normalized, "https://example.com/file.zip");
    assert.equal(result.autoCompleted, false);
});

test("auto-completes domain-like input as HTTPS", () => {
    const result = normalizeSource("example.com/file.zip", pageLocation);

    assert.equal(result.ok, true);
    assert.equal(result.normalized, "https://example.com/file.zip");
    assert.equal(result.autoCompleted, true);
});

test("does not treat bare asset-like names as domains", () => {
    assert.equal(looksLikeDomain("example.js"), false);
    assert.equal(looksLikeDomain("www.example.js"), true);
});

test("fixes one-slash protocol typos", () => {
    const result = normalizeSource("https:/example.com/file.zip", pageLocation);

    assert.equal(result.ok, true);
    assert.equal(result.normalized, "https://example.com/file.zip");
    assert.equal(result.notes[0], "已修复协议格式。");
});

test("expands an already proxied URL for the current host", () => {
    const result = normalizeSource("https://proxy.example/https://upstream.example/archive.tar.gz", pageLocation);

    assert.equal(result.ok, true);
    assert.equal(result.normalized, "https://upstream.example/archive.tar.gz");
    assert.equal(result.notes[0], "已识别当前节点链接并自动展开原始地址。");
});

test("rejects unsupported protocols", () => {
    const result = normalizeSource("ftp://example.com/file.zip", pageLocation);

    assert.equal(result.ok, false);
    assert.match(result.message, /暂不支持 ftp:/);
});

test("builds HTTP proxy URLs from the current origin", () => {
    const source = new URL("https://example.com/file.zip");

    assert.equal(buildProxyUrl(source, pageLocation), "https://proxy.example/https://example.com/file.zip");
    assert.equal(canOpenProxyUrl(source), true);
});

test("builds WebSocket proxy URLs from the current page protocol", () => {
    const source = new URL("wss://echo.websocket.events/");

    assert.equal(buildProxyUrl(source, pageLocation), "wss://proxy.example/wss://echo.websocket.events/");
    assert.equal(canOpenProxyUrl(source), false);
});

test("summarizes URL parts for UI display", () => {
    assert.deepEqual(summarizeUrl(new URL("https://example.com/a/b?q=1")), {
        protocol: "https",
        host: "example.com",
        path: "/a/b?q=1"
    });
});

test("index.html loads split stylesheet and module script", async () => {
    const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

    assert.match(html, /<link rel="stylesheet" href="\/src\/styles\.css">/);
    assert.match(html, /<script type="module" src="\/src\/app\.js"><\/script>/);
    assert.doesNotMatch(html, /<style>/);
    assert.doesNotMatch(html, /<script>\s*\(\(\) =>/);
});
