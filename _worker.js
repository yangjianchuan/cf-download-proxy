export default {
    async fetch(request, env, ctx) {
        //跨域预请求直接同意
        if (request.method === "OPTIONS") {
            return new Response(null, {
                status: 204,
                headers: {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS",
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
            const res = await fetch(proxyRequest);
            const reqUpgrade = request.headers.get("Upgrade")?.toLowerCase();

            // 如果是websocket协议或者服务端返回101切换协议，就直接返回响应，不处理了
            if (reqUpgrade === "websocket" || res.status === 101) {
                return res;
            }

            const headers = new Headers(res.headers);
            headers.set("Access-Control-Allow-Origin", "*");
            headers.set("Access-Control-Allow-Methods", "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS");
            headers.set("Access-Control-Allow-Headers", request.headers.get("Access-Control-Request-Headers") || "*");
            // 处理content-type,不返回html类型，否则会被浏览器当成html解析，导致无法下载
            let contentType = headers.get("content-type");
            if (contentType?.includes("text/html")) {
                contentType = contentType.replace("text/html", "text/cf-html");
                headers.set("content-type", contentType);
            }
            // 如果是重定向的话，处理一下重定向地址，改成当前worker的地址
            if (res.status >= 300 && res.status < 400) {
                //处理重定向
                const loc = headers.get("Location");
                if (loc) {
                    const toUrl = new URL(loc, goUrl);
                    headers.set("Location", `${url.origin}/${toUrl}`);
                }
            }
            //没有特殊情况就直接返回
            return new Response(res.body, {
                status: res.status,
                statusText: res.statusText,
                headers
            });
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
