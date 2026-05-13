const ASSET_LIKE_EXTENSIONS = new Set([
    "css",
    "js",
    "png",
    "jpg",
    "jpeg",
    "gif",
    "svg",
    "webp",
    "ico",
    "txt",
    "json",
    "xml",
    "map",
    "html",
    "htm"
]);

export function decodeMaybe(value) {
    try {
        return decodeURIComponent(value);
    } catch (error) {
        return value;
    }
}

export function looksLikeDomain(candidate) {
    const clean = decodeMaybe(candidate).trim();
    if (!clean) {
        return false;
    }

    const [basePart] = clean.split(/[?#]/);
    const firstSegment = basePart.split("/")[0];
    const hostPart = firstSegment.replace(/:\d+$/, "");
    const isHostname = /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(hostPart);
    const isLocalhost = /^localhost$/i.test(hostPart);
    const isIpv4 = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostPart);

    if (!isHostname && !isLocalhost && !isIpv4) {
        return false;
    }

    const tld = hostPart.split(".").pop().toLowerCase();
    const hasExtraHint = basePart.includes("/") || /:\d+$/.test(firstSegment) || /^www\./i.test(firstSegment);

    if (isHostname && !hasExtraHint && ASSET_LIKE_EXTENSIONS.has(tld)) {
        return false;
    }

    return true;
}

export function normalizeSource(rawValue, options = {}) {
    const origin = options.origin || "https://proxy.example";
    const host = options.host || new URL(origin).host;
    const input = decodeMaybe(`${rawValue || ""}`).trim();

    if (!input) {
        return {
            ok: false,
            empty: true,
            message: "粘贴一个原始下载链接后，这里会实时生成加速地址。"
        };
    }

    let candidate = input;
    let autoCompleted = false;
    const notes = [];
    const proxyPrefixes = [
        `http://${host}/`,
        `https://${host}/`,
        `ws://${host}/`,
        `wss://${host}/`,
        `${origin.replace(/\/$/, "")}/`
    ];

    for (const prefix of proxyPrefixes) {
        if (candidate.startsWith(prefix)) {
            candidate = candidate.slice(prefix.length);
            autoCompleted = true;
            notes.push("已识别当前节点链接并自动展开原始地址。");
            break;
        }
    }

    if (/^(https?|wss?):\/(?!\/)/i.test(candidate)) {
        candidate = candidate.replace(/^([a-z]+):\/(?!\/)/i, "$1://");
        autoCompleted = true;
        notes.push("已修复协议格式。");
    }

    if (/^\/\//.test(candidate)) {
        candidate = `https:${candidate}`;
        autoCompleted = true;
        notes.push("已补全为 https 协议。");
    }

    if (!/^[a-z][a-z\d+.-]*:/i.test(candidate) && looksLikeDomain(candidate)) {
        candidate = `https://${candidate}`;
        autoCompleted = true;
        notes.push("已自动补全为 https 链接。");
    }

    let url;
    try {
        url = new URL(candidate);
    } catch (error) {
        return {
            ok: false,
            input,
            message: "这不是一个可访问的链接，请检查协议、域名和路径是否完整。"
        };
    }

    if (!["http:", "https:", "ws:", "wss:"].includes(url.protocol)) {
        return {
            ok: false,
            input,
            message: `暂不支持 ${url.protocol} 协议，请使用 http、https、ws 或 wss。`
        };
    }

    return {
        ok: true,
        input,
        url,
        normalized: url.href,
        autoCompleted,
        notes,
        message: notes[0] || (["ws:", "wss:"].includes(url.protocol) ? "WebSocket 链接可用，已准备好生成代理地址。" : "链接可用，已准备好生成加速地址。")
    };
}

export function buildProxyUrl(url, locationObject = { protocol: "https:", host: "proxy.example", origin: "https://proxy.example" }) {
    const isWebSocket = ["ws:", "wss:"].includes(url.protocol);
    const base = isWebSocket
        ? `${locationObject.protocol === "https:" ? "wss:" : "ws:"}//${locationObject.host}`
        : locationObject.origin;

    return `${base.replace(/\/$/, "")}/${url.href}`;
}

export function canOpenProxyUrl(url) {
    return ["http:", "https:"].includes(url.protocol);
}

export function summarizeUrl(url) {
    return {
        protocol: url.protocol.replace(":", ""),
        host: url.host,
        path: `${url.pathname || "/"}${url.search || ""}`
    };
}
