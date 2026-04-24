# cf-download-proxy

一个基于 Cloudflare Workers 的极简下载代理站点。

本仓库包含：

- `_worker.js`：Cloudflare Worker 入口，用于代理 `/<绝对链接>` 请求
- `index.html`：主页，包含页面结构、样式和前端交互逻辑
- `404.html`：自定义 404 页面
- `logo.svg` / `favicon.ico`：静态资源
- `wrangler.toml`：Wrangler 部署配置

## 这是部署在 Workers 还是 Pages？

本项目的核心运行方式是：**Cloudflare Workers + 静态资源 Assets**。

原因：

- 仓库包含 Worker 入口文件 `_worker.js`
- `wrangler.toml` 使用 `main = "_worker.js"`
- 代码中使用了 `env.ASSETS.fetch(...)` 作为静态资源回退

所以它不是单纯的 Pages 静态站点，而是一个 **Workers 项目**，同时附带静态页面资源。

## 工作方式

Worker 接受如下格式的请求：

```text
https://你的域名/https://example.com/file.zip
https://你的域名/https://github.com/owner/repo/archive/main.zip
wss://你的域名/wss://echo.websocket.events/
```

行为概览：

- `OPTIONS` 预检请求直接返回 CORS 响应头
- 支持代理 `http`、`https`、`ws`、`wss` 原始链接
- WebSocket 升级请求直接透传
- 上游返回重定向时，会把 `Location` 改写为当前代理域名
- 上游返回 `text/html` 时，会改写为 `text/cf-html`，避免浏览器把下载内容当 HTML 直接渲染
- 对安全的 `GET` 下载响应使用 Cloudflare 边缘缓存，重复下载可能更快
- 非代理路径会回退到静态资源服务

## 边缘缓存加速

Worker 会对适合缓存的 `GET` 下载响应使用 Cloudflare Cache API：

- 第一次请求通常是 `X-Proxy-Cache: MISS`，同一 Cloudflare 数据中心内的重复请求可能变成 `X-Proxy-Cache: HIT`
- 缓存是数据中心本地缓存，不是全局缓存或 Tiered Cache；不同地区的首次请求仍可能较慢
- 带 `Authorization`、`Cookie`、签名参数、`Cache-Control: no-store` / `no-cache` / `private` 的请求会绕过缓存
- 上游返回重定向、`Set-Cookie`、`Vary: *`、`no-store`、非 `200` 或缺少 `Content-Length` 的响应会绕过缓存
- `Range` 请求不会把上游 `206` 响应写入缓存，但如果完整文件已缓存且带 `Content-Length`，后续分片请求可以受益

可用响应头检查缓存状态：

```text
X-Proxy-Cache: HIT | MISS | BYPASS
X-Proxy-Cache-Reason: <reason>
```

## 本地开发

这个仓库没有构建步骤，通常直接编辑文件即可。

### 本地预览静态页面

```bash
python -m http.server 8000
```

然后打开 `http://127.0.0.1:8000`。

### 使用 Wrangler 本地运行

如果你已经安装了 Wrangler：

```bash
wrangler dev
```

本仓库已提供 `wrangler.toml`，可直接用于本地调试和部署。

## 手工部署到 Cloudflare Workers

适合本地一次性手工发布。

### 1. 安装 Wrangler

```bash
npm install -g wrangler
```

### 2. 登录 Cloudflare

```bash
wrangler login
```

### 3. 检查 `wrangler.toml`

仓库根目录已包含可用配置：

```toml
name = "cf-download-proxy"
main = "_worker.js"
compatibility_date = "2026-04-14"

[assets]
directory = "."
binding = "ASSETS"
```

如果 `name` 已被占用，请改成你自己的唯一名称。

### 4. 部署

```bash
wrangler deploy --minify
```

部署成功后，Cloudflare 会返回 Worker 地址。若需要自定义域名，可在 Cloudflare Dashboard 中继续绑定。

## 自动部署到 Cloudflare Workers

适合和 GitHub 联动，做到推送即发布。

本仓库已经新增 GitHub Actions 工作流：

- `.github/workflows/deploy.yml`
- `.assetsignore` 用于避免 `_worker.js` 被当作公开静态资源上传到 `ASSETS`

当前工作流具备这些保护：

- 只在 `main` 分支变更部署相关文件时自动触发
- 支持 `workflow_dispatch` 手工触发
- 使用 `concurrency` 避免同一分支重复部署互相覆盖
- 显式检查 `CLOUDFLARE_API_TOKEN` 是否已配置
- 部署前执行 `wrangler whoami` 验证身份
- 部署前执行 `wrangler deploy --dry-run --minify` 做配置校验
- 正式部署使用 `wrangler deploy --minify`

### GitHub Actions 部署前准备

#### 1. 获取 `CLOUDFLARE_API_TOKEN`

在 Cloudflare Dashboard 中按下面步骤创建：

1. 登录 Cloudflare Dashboard
2. 打开右上角头像对应的 **My Profile**
3. 进入 **API Tokens**
4. 点击 **Create Token**
5. 选择 **API令牌模板**
6. 选择 **编辑 Cloudflare Workers**
7. 选择你的账号和目标资源范围
8. 创建后复制生成的 Token

如果直接使用 **编辑 Cloudflare Workers** 模板，通常就不需要手工逐项勾选权限。

#### 2. `CLOUDFLARE_API_TOKEN` 需要的最小具体权限

对于**当前这个仓库**和**当前这份 workflow**，最小实用权限建议这样配：

- **Account** → **Workers Scripts** → **Edit**

资源范围建议限制到：

- 目标 Cloudflare Account

说明：

- 这足以覆盖当前仓库的 `wrangler deploy --minify` 部署 Worker 脚本与静态资源
- 当前 `wrangler.toml` 没有声明需要额外管理 KV、R2、D1、Queues、Routes、DNS 等资源，所以不需要给这些权限

如果你保留 workflow 里的 `wrangler whoami` 校验步骤，而该步骤因为权限过小失败，可额外补：

- **User** → **User Details** → **Read**

这不是部署本身的核心权限，而是给身份检查步骤兜底。

#### 2.1 推荐的 Token 权限截图式清单

如果你是在 Cloudflare Dashboard 里手工填写自定义 Token，可以按下面这份清单去对照：

```text
Token name:
  GitHub Actions - cf-download-proxy

Permissions:
  Account | Workers Scripts | Edit
  User    | User Details    | Read   (可选，仅用于 wrangler whoami 更稳)

Account Resources:
  Include | <你的 Cloudflare Account>

Zone Resources:
  All zones | None

IP Filtering:
  Off

TTL:
  No expiration 或按你的安全策略设置
```

你可以把它理解成：

- **必选**：`Account | Workers Scripts | Edit`
- **可选**：`User | User Details | Read`
- **资源范围**：只选目标 Account，不要放大到全部资源

如果以后你再扩展配置，才需要按需增加权限，例如：

- 绑定自定义路由：可能需要 **Zone** → **Workers Routes** → **Edit**
- 操作 KV / R2 / D1：分别增加对应资源权限
- 管理 DNS：增加对应 Zone DNS 权限

建议：

- 这个 Token 只用于 CI 部署
- 权限尽量最小化，只给部署当前 Worker 所需权限
- 不要把 Token 直接写进代码仓库

#### 3. 配置 GitHub Secret

进入 GitHub 仓库：

- `Settings` → `Secrets and variables` → `Actions` → `New repository secret`

新增：

- Name：`CLOUDFLARE_API_TOKEN`
- Secret：粘贴你刚才从 Cloudflare 复制的 Token

### 工作流说明

自动部署工作流以仓库中的实际文件为准：

- `.github/workflows/deploy.yml`

当前策略大致包括：

- 仅在 `main` 分支且部署相关文件发生变更时自动触发
- 支持 `workflow_dispatch` 手工触发
- 使用 `concurrency` 避免重复部署互相覆盖
- 部署前检查 `CLOUDFLARE_API_TOKEN`
- 执行 `wrangler whoami`
- 执行 `wrangler deploy --dry-run --minify`
- 最后执行 `wrangler deploy --minify`

如果后续 workflow 有调整，请以仓库里的实际 YAML 配置为准，不要只依赖 README 文本描述。

## 部署后检查项

每次部署后，建议至少验证这些流程：

- 首页能正常打开
- 输入普通 `https://...` 链接后，能正确生成代理地址
- 点击打开后，文件下载正常
- 重复请求安全的 `GET` 下载链接时，可通过 `X-Proxy-Cache` 看到 `MISS` / `HIT` / `BYPASS` 状态
- 页面里的 `curl` / `wget` / `npm` 等示例命令使用的是当前域名
- 上游重定向仍然停留在当前代理域名下
- WebSocket 代理地址仍然正确使用 `ws://` 或 `wss://`
- 不存在的页面会返回 `404.html`
