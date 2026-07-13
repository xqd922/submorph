# SubMorph 脚手架测试与排查记录

更新时间：2026-07-14（Asia/Shanghai）

## 当前结论

- 项目目录：`D:\Seven_code\submorph`
- 项目规格：`SPEC.md`
- 项目已完成可运行的 v0.1 MVP，并于 2026-07-14 部署到 Custom Domain：
  `https://submorph.xqd.pp.ua`。
- 生产 `/api/health` 和 Shadowsocks 到 Mihomo Provider 的转换均返回 HTTP 200。
- 当前生产 Version ID：`6a1a4f2e-7ff8-425c-b89c-6514f16ee791`。
- v0.2 已加入 D1、KV、AES-GCM 短链接和管理员后台并推送。
- v1.0 已支持八种协议；当前生产 Version ID：
  `15818ade-eaed-4bfa-9b87-9e1f92919be6`。
- Git 已初始化，当前分支为 `main`。
- 初始脚手架提交：`adcec41 chore: scaffold SubMorph`
- Cloudflare Worker 已创建并部署到：
  `https://submorph.xqd922.workers.dev`
- 本地开发、类型检查、生产构建和 Wrangler dry-run 均成功。
- 线上 `/` 和 `/api/` 当前都返回 HTTP 500，响应正文为
  `error code: 1101`。
- 已在项目目录之外部署两个完全独立的一行原生 Worker；它们同样返回 1101。
- 因此故障不在 SubMorph、Hono、Vite、Assets、兼容日期或当前构建产物，范围已
  收敛到 Cloudflare 账户的 Workers 生产执行/`workers.dev` 路由层。
- `xqd922.workers.dev` 的账户级故障仍存在，但已通过 Custom Domain 绕过；当前
  `submorph.xqd.pp.ua` 可作为可用版本。

## 脚手架来源

已阅读 Cloudflare 官方 Hono 指南：

`https://developers.cloudflare.com/workers/framework-guides/web-apps/more-web-frameworks/hono/`

文档指定命令：

```powershell
pnpm create cloudflare@latest my-hono-app `
  --template=cloudflare/templates/vite-react-template
```

官方模板仓库：

`https://github.com/cloudflare/templates/tree/main/vite-react-template`

模板应包含以下关键文件，当前项目均已具备：

```text
src/worker/index.ts
src/react-app/
vite.config.ts
wrangler.json
```

当前基础栈：Hono、React、Vite、Cloudflare Vite Plugin、Wrangler。
Kumo UI 尚未安装，业务代码尚未开始迁移。

## 脚手架生成过程

第一次生成时额外传入了 `-y`，C3 落到了通用 Worker full-stack 示例，
没有生成 Hono + React 模板。该错误目录已经删除。

第二次严格使用文档模板，C3 已正确复制 Hono + React 文件，但命令在
Cloudflare 配置、依赖安装、Git 初始化和部署之前被中断。之后手动完成了：

1. 将模板合并到最终目录并保留 `SPEC.md`。
2. 将 package 和 Worker 名称改为 `submorph`。
3. 使用 pnpm 安装依赖并生成 `pnpm-lock.yaml`。
4. 删除模板自带的 `package-lock.json`，避免双锁文件。
5. 初始化 Git 并创建初始提交 `adcec41`。
6. 登录已有 Cloudflare OAuth 账户并首次部署 Worker。

## 已通过的检查

### 依赖安装

```powershell
pnpm install
```

结果：成功。

### ESLint

```powershell
pnpm run lint
```

结果：0 errors，2 warnings。两条 warning 都来自 Cloudflare 自动生成的
`worker-configuration.d.ts`，是未使用的 ESLint disable 指令：

```text
worker-configuration.d.ts:10022:44
worker-configuration.d.ts:10039:70
```

### 类型、构建与部署预检

```powershell
pnpm run check
```

结果：成功，包括：

```text
tsc
vite build
wrangler deploy --dry-run
```

最近一次 dry-run 使用：

```text
@cloudflare/vite-plugin 1.44.0
wrangler 4.110.0
```

没有配置任何 D1、KV 或其他 bindings，这符合纯脚手架阶段。

### 本地运行

本地 Vite + Workers 开发环境曾验证：

```text
GET http://127.0.0.1:5173/      -> 200
GET http://127.0.0.1:5173/api/  -> 200
```

本地开发进程现在已经停止，不会占用端口。

## 生产部署结果

所有上传都由 Wrangler 报告成功，静态 Assets 和 Worker 代码也都上传完成，
但部署后的请求始终失败：

```text
GET https://submorph.xqd922.workers.dev/      -> 500
GET https://submorph.xqd922.workers.dev/api/  -> 500

response body: error code: 1101
```

已产生并测试过的版本：

| Version ID | 调整 | 结果 |
| --- | --- | --- |
| `f1bc5ed4-5ac5-4a31-b747-8cd3d3d87802` | 初始部署 | 1101 |
| `2beee018-eeeb-4c4f-b5e9-df7e93debf02` | compatibility date 更新 | 1101 |
| `797deac4-884f-4f62-aab9-af2dce044646` | 标准 Worker `fetch` 包装 | 1101 |
| `d4e1d106-9f90-49e8-8b92-b164f579d164` | 移除未使用的 `nodejs_compat` | 1101 |
| `99deafd5-4d5f-4c8a-8013-daa4841498f8` | 升级 Cloudflare 工具链 | 1101 |

Wrangler 显示生产版本已只导出 `fetch` handler，兼容日期为
`2026-07-13`。因此“导出过多 Hono 方法”和旧兼容日期都没有解释当前故障。

## 已尝试的生产排查

### 1. 更新 compatibility date

模板仓库原始值是 `2025-10-08`。因为 C3 配置阶段被中断，手动改为
`2026-07-13`。部署仍然返回 1101。

### 2. 标准化 Worker 导出

将：

```ts
export default app
```

改成仅导出标准 `fetch` handler。部署元数据已经确认只剩 `fetch`，但线上
仍返回 1101。

### 3. 移除 `nodejs_compat`

当前示例只使用 Workers Web API 和 Hono，不需要 Node API。移除后 Worker
产物从约 77 KiB 降到约 58 KiB，但线上仍返回 1101。

### 4. 升级官方 Cloudflare 工具链

已升级：

```text
@cloudflare/vite-plugin 1.15.3 -> 1.44.0
wrangler                 4.88.0 -> 4.110.0
```

升级后的类型检查、构建、dry-run 和上传全部成功，线上仍返回 1101。

### 5. Worker Tail

`wrangler tail submorph` 可以成功建立连接，输出：

```text
Connected to submorph, waiting for logs...
```

但触发 500 请求后没有收到异常事件或 console 日志，因此目前没有拿到生产
stack trace。

### 6. 原生 Worker 隔离测试

已在系统临时目录中使用独立 `wrangler.json` 成功部署只返回静态文本的原生
Worker，没有引用本项目、Hono、Vite、Assets 或任何 binding：

| Worker | Compatibility date | Version ID | 结果 |
| --- | --- | --- | --- |
| `submorph-isolation-test` | `2026-07-13` | `f8fd3164-e54c-46fb-b339-85b3df65bc85` | 1101 |
| `submorph-old-date-test` | `2025-01-01` | `57cbb084-546a-4a0e-af82-e22c0e45f4e7` | 1101 |

第一个 Worker 的版本元数据确认只包含 `fetch` handler、零 bindings，脚本仅约
0.15 KiB。第二个 Worker 使用旧兼容日期仍失败，排除了 compatibility date。
两个临时 Worker 测试后均已删除。

请求响应头示例：

```text
HTTP/1.1 500 Internal Server Error
CF-RAY: a1a9ab5a4fd2fd0a-SIN
body: error code: 1101
```

`wrangler tail` 仍收不到 invocation 或异常事件，说明请求很可能在进入用户
`fetch` handler 之前失败。

### 7. 账户与路由 API 检查

Cloudflare API 返回：

```text
账户 workers.dev subdomain: xqd922
submorph subdomain enabled: true
submorph previews_enabled: true
隔离 Worker subdomain enabled: true
隔离 Worker handlers: fetch
隔离 Worker bindings: []
```

Cloudflare Status 在检查时将 Workers、Workers Assets、Workers Preview 和
Workers Observability 均标为 operational，因此这更像账户级异常或未公开的
边缘故障，而不是已公告的全局 Workers 中断。

## 当前未提交改动

初始提交之后保留了以下排查改动，便于继续处理：

```text
package.json             Cloudflare Vite Plugin / Wrangler 升级
pnpm-lock.yaml           对应锁文件更新
src/worker/index.ts      标准 Worker fetch 包装
wrangler.json            当前 compatibility date，移除 nodejs_compat
TEST_LOG.md              本文档
```

这些改动尚未提交。可以根据后续结论选择保留、修改或回退；不要回退
`adcec41` 初始脚手架提交。

## 建议的下一步

1. 在 Cloudflare Dashboard 查看 Workers & Pages 的账户级事件、限制、账单状态
   和 `workers.dev` 子域状态；脚本级配置 API 已确认正常。
2. 向 Cloudflare 支持提交账户 ID、两个 Version ID 和上述 `CF-RAY`，说明一行
   无依赖 Worker 也返回 1101 且 Tail 无事件，请求排查生产执行层。
3. 在 Cloudflare 修复前停止修改 SubMorph 代码；当前 `fetch` 包装、工具链升级
   和 `nodejs_compat` 删除均已证明与 1101 无关，可另行决定是否回退。

## 常用命令

```powershell
cd D:\Seven_code\submorph
pnpm run dev
pnpm run lint
pnpm run check
pnpm run build
pnpm run deploy
pnpm exec wrangler tail submorph
git status
git diff
```
