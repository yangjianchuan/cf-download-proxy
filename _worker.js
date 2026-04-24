const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS"
};

const SENSITIVE_QUERY_KEYS = new Set([
    "token",
    "access_token",
    "signature",
    "sig",
    "expires",
    "x-amz-signature",
    "x-amz-credential",
    "x-amz-expires",
    "awsaccesskeyid"
]);

function isWebSocketRequest(request) {
    return request.headers.get("Upgrade")?.toLowerCase() === "websocket";
}

function createCacheKey(request) {
    return new Request(new URL(request.url).toString(), { method: "GET" });
}

function hasUncacheableControl(headers) {
    const cacheControl = headers.get("Cache-Control")?.toLowerCase();
    return cacheControl?.includes("no-store") || cacheControl?.includes("no-cache") || cacheControl?.includes("private");
}

function hasVaryStar(headers) {
    return headers.get("Vary")?.split(",").some((value) => value.trim() === "*");
}

function hasSensitiveQuery(goUrl) {
    for (const key of goUrl.searchParams.keys()) {
        if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
            return true;
        }
    }
    return false;
}

function getCacheBypassReason(request, goUrl) {
    if (request.method !== "GET") {
        return "method";
    }
    if (isWebSocketRequest(request)) {
        return "websocket";
    }
    if (request.headers.has("Authorization")) {
        return "authorization";
    }
    if (request.headers.has("Cookie")) {
        return "cookie";
    }
    if (hasUncacheableControl(request.headers)) {
        return "no-store";
    }
    if (hasSensitiveQuery(goUrl)) {
        return "signed-url";
    }
    return null;
}

function getResponseBypassReason(response, request) {
    if (request.headers.has("Range")) {
        return "range-miss";
    }
    if (response.status !== 200) {
        return "status";
    }
    if (response.headers.has("Set-Cookie")) {
        return "set-cookie";
    }
    if (hasVaryStar(response.headers)) {
        return "vary-star";
    }
    if (hasUncacheableControl(response.headers)) {
        return "no-store";
    }
    if (!response.headers.has("Content-Length")) {
        return "no-length";
    }
    return null;
}

function setProxyHeaders(headers, request) {
    headers.set("Access-Control-Allow-Origin", CORS_HEADERS["Access-Control-Allow-Origin"]);
    headers.set("Access-Control-Allow-Methods", CORS_HEADERS["Access-Control-Allow-Methods"]);
    headers.set("Access-Control-Allow-Headers", request.headers.get("Access-Control-Request-Headers") || "*");
}

function buildProxyResponse(response, request, workerUrl, upstreamUrl, cacheStatus, cacheReason) {
    const headers = new Headers(response.headers);
    setProxyHeaders(headers, request);

    const contentType = headers.get("content-type");
    if (contentType?.includes("text/html")) {
        headers.set("content-type", contentType.replace("text/html", "text/cf-html"));
    }

    if (response.status >= 300 && response.status < 400) {
        const loc = headers.get("Location");
        if (loc) {
            const toUrl = new URL(loc, upstreamUrl);
            headers.set("Location", `${workerUrl.origin}/${toUrl}`);
        }
    }

    headers.set("X-Proxy-Cache", cacheStatus);
    if (cacheReason) {
        headers.set("X-Proxy-Cache-Reason", cacheReason);
    } else {
        headers.delete("X-Proxy-Cache-Reason");
    }

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
    });
}

export default {
    async fetch(request, env, ctx) {
        if (request.method === "OPTIONS") {
            return new Response(null, {
                status: 204,
                headers: {
                    ...CORS_HEADERS,
                    "Access-Control-Allow-Headers": request.headers.get("Access-Control-Request-Headers") || "*",
                    "Access-Control-Max-Age": "86400"
                }
            });
        }

        const url = new URL(request.url);
        const go = url.pathname.substring(1) + url.search;
        let goUrl;
        try {
            goUrl = new URL(go);
        } catch (e) {
            return env.ASSETS.fetch(new Request(new URL(go, request.url)));
        }
        if (goUrl.protocol === "ws:") {
            goUrl.protocol = "http:";
        }
        if (goUrl.protocol === "wss:") {
            goUrl.protocol = "https:";
        }
        if (!['http:', 'https:'].includes(goUrl.protocol)) {
            return new Response(`错误：不支持的协议 ${goUrl.protocol}`, {
                status: 400,
                headers: {
                    "content-type": "text/plain;charset=utf-8"
                }
            });
        }

        try {
            const proxyRequest = new Request(goUrl, request);

            if (isWebSocketRequest(request)) {
                return fetch(proxyRequest);
            }

            const requestBypassReason = getCacheBypassReason(request, goUrl);
            const cacheKey = requestBypassReason ? null : createCacheKey(request);
            const cacheMatchRequest = request.headers.has("Range") ? request : cacheKey;

            if (cacheMatchRequest) {
                const cachedResponse = await caches.default.match(cacheMatchRequest);
                if (cachedResponse) {
                    return buildProxyResponse(cachedResponse, request, url, goUrl, "HIT");
                }
            }

            const res = await fetch(proxyRequest);

            if (res.status === 101) {
                return res;
            }

            const responseBypassReason = requestBypassReason || getResponseBypassReason(res, request);
            const cacheStatus = responseBypassReason ? "BYPASS" : "MISS";
            const proxiedResponse = buildProxyResponse(res, request, url, goUrl, cacheStatus, responseBypassReason);

            if (!responseBypassReason && cacheKey) {
                ctx.waitUntil(caches.default.put(cacheKey, proxiedResponse.clone()).catch(() => {}));
            }

            return proxiedResponse;
        } catch (e) {
            return new Response(`fetch 错误: ${e}`, {
                status: 503,
                headers: {
                    "content-type": "text/plain;charset=utf-8"
                }
            });
        }
    },
};
