# SubMorph 实施大纲

状态：待实施  
更新日期：2026-07-14  
正式域名：`https://submorph.xqd.pp.ua`

## 1. 项目定位

SubMorph 是部署在 Cloudflare Workers 上的订阅转换服务，负责：

1. 接收远程订阅 URL、单个代理 URI 或代理 URI 列表。
2. 安全获取、识别并解析订阅内容。
3. 将不同协议转换为统一内部节点模型。
4. 输出 Mihomo、Mihomo Provider、sing-box、v2rayNG 或浏览器预览格式。
5. 提供稳定的加密短链接。
6. 提供由 Cloudflare Access 保护的管理后台。

项目保持一个仓库、一个 Worker、一个部署。生产流量使用 Custom Domain，当前不依赖异常的 `xqd922.workers.dev` 子域。

## 2. 第一版范围

### 2.1 完整产品目标

- 公共订阅转换页面。
- `/sub?url=...&target=...` 客户端转换接口。
- 自动识别远程订阅、单节点 URI、URI 列表、Base64 和 Clash YAML。
- Shadowsocks、VMess、Trojan、VLESS、Hysteria 2、SOCKS5、AnyTLS、Snell。
- Mihomo 完整 YAML、Mihomo Provider YAML、sing-box 1.13 JSON、v2rayNG
  Base64、浏览器预览。
- 根据 User-Agent 自动选择输出格式。
- 成功结果 KV 缓存。
- D1 转换统计和加密短链接。
- Cloudflare Access 管理后台。
- Turnstile、Rate Limiting、SSRF 防护和敏感信息脱敏。

### 2.2 暂不实现

- 用户注册、多租户和付费套餐。
- 节点测速、定时检测和自动排序。
- 在线编辑 Clash 或 sing-box 模板。
- 第三方短链接服务。
- 插件系统、ORM 或通用 Repository 层。
- 订阅历史版本和旧系统统计迁移。

## 3. 整体架构

```text
Browser / Proxy Client
          │
          ▼
submorph.xqd.pp.ua
          │
          ▼
Cloudflare Worker
 ├── Workers Assets
 │    ├── Public React App
 │    └── Admin React App
 ├── Hono Routes
 │    ├── Public API
 │    └── Admin API
 ├── Conversion Engine
 │    ├── Safe Source Loader
 │    ├── Subscription Decoder
 │    ├── Protocol Parsers
 │    ├── Normalize / Validate / Deduplicate
 │    └── Output Renderers
 ├── KV Conversion Cache
 ├── D1 Events / Links / Blocks / Audit
 ├── Cloudflare Access
 └── Turnstile / Rate Limiting
```

## 4. 目录规划

按垂直功能逐步创建文件，不预先生成空目录和空抽象。

```text
src/
  worker/
    index.ts
    routes/
      public.ts
      admin.ts
    conversion/
      model.ts
      errors.ts
      convert.ts
      source.ts
      subscription.ts
      protocols/
      outputs/
    database/
      conversions.ts
      links.ts
      blocked.ts
      audit.ts
    platform/
      cache.ts
      crypto.ts
      fetch.ts
      access.ts
  react-app/
    public/
    admin/
    components/
    styles.css
    main.tsx
migrations/
tests/
  fixtures/
  protocols/
  outputs/
```

公开页面和管理后台必须构建成独立前端 chunk，公共访问者不能下载管理表格和图表代码。

## 5. 统一节点模型

所有输入先转换为 `ProxyNode`，输出 renderer 不直接依赖原始 URI 或 Clash 字段。

实际支持范围以 `KERNEL_COMPATIBILITY.md` 为准。协议 parser 存在不等于对应
目标可用；每个协议、transport 和 TLS 组合必须标记为 `exact`、`lossy`、
`unsupported` 或 `unverified`。

```ts
type ProxyNode =
  | ShadowsocksNode
  | VMessNode
  | TrojanNode
  | VlessNode
  | Hysteria2Node
  | Socks5Node
  | AnyTlsNode
  | SnellNode;

interface BaseNode {
  name: string;
  protocol: string;
  endpoint: {
    host: string;
    port: number;
  };
  tls?: TlsOptions;
  transport?: TransportOptions;
}
```

协议认证信息和专属选项由各自的 discriminated union 成员持有。内部模型不得出现 `proxy-groups`、`outbounds`、`skip-cert-verify` 等输出平台字段。

TLS 模型必须分别保存证书指纹和 uTLS 客户端指纹；Transport 必须按协议限制，
不能允许 VMess、VLESS、Trojan 和 AnyTLS 任意组合所有 transport。

## 6. 转换流水线

```text
Validate request
  → normalize source
  → check blocked source
  → calculate source fingerprint
  → read KV cache
  → load source safely
  → detect subscription format
  → parse canonical nodes
  → validate nodes
  → remove duplicates
  → resolve duplicate names
  → select output target
  → render configuration
  → cache successful result
  → record redacted event
  → return response
```

所有 HTTP 入口和短链接解析共用一个转换函数：

```ts
async function convertSubscription(
  input: ConversionInput,
  dependencies: ConversionDependencies,
): Promise<ConversionResult>
```

转换引擎只接收普通 TypeScript 值，不依赖 Hono、React、D1 或 KV。

## 7. 输入识别

按确定性和成本排序：

1. 已支持的单个代理 URI。
2. HTTP 或 HTTPS 远程地址。
3. Clash YAML。
4. 多行代理 URI。
5. Base64 解码后重新识别。
6. 无法识别时返回稳定错误代码。

Base64 最多递归解码两层，避免恶意嵌套。GitHub Gist 分享地址转换为 raw 地址后复用普通 HTTP loader，不引入 GitHub API。

## 8. 协议解析

每种协议模块只承担识别和解析：

```ts
function matches(input: string): boolean;
function parse(input: string): ProxyNode;
```

实施顺序：

1. Shadowsocks。
2. VMess。
3. Trojan。
4. VLESS。
5. Hysteria 2。
6. SOCKS5。
7. AnyTLS。
8. Snell。

每增加一个协议，同时提交合法 fixture、非法 fixture、统一模型断言和对应 renderer 测试，不集中补测试。

## 9. 订阅解析

### 9.1 URI 列表

- 去除 BOM、空行和首尾空白。
- 每行独立解析。
- 保留有效节点并统计失败项。
- 全部失败时返回 `NO_VALID_NODES`。
- 部分失败时返回有效结果和警告摘要。

### 9.2 Base64

- 支持标准 Base64 和 URL-safe Base64。
- 支持有 padding 和无 padding。
- 解码后复用普通订阅识别流程。

### 9.3 Clash YAML

第一版只读取 `proxies`，忽略 `proxy-groups`、`rules`、DNS、TUN 和 rule providers。

## 10. 安全获取远程订阅

### 10.1 URL 边界

只允许 `http:` 和 `https:`，拒绝：

- URL credentials。
- localhost。
- 私有、回环、链路本地和保留字面 IP。
- `file:`、`ftp:`、`data:`、`javascript:`、`ws:` 等协议。

### 10.2 重定向与请求

- 手动处理重定向，每一跳重新验证 URL。
- 最多 3 次重定向。
- 不转发用户 Cookie 或 Authorization。
- 单次请求超时 10 秒。
- 整体转换超时 15 秒。
- 最多重试 1 次，只重试安全的临时网络错误。
- 响应体上限 10 MiB，流式计数并及时中止。

### 10.3 敏感数据

完整订阅 URL、query、fragment、密码、UUID 和认证 token 不得写入日志、D1、Analytics 或错误消息。

## 11. 去重与命名

节点指纹包含：

```text
protocol + host + port + authentication + TLS + transport
```

节点名不参与指纹。重复名称按原顺序改为：

```text
香港
香港 2
香港 3
```

## 12. 输出模块

统一接口：

```ts
interface Renderer {
  target: OutputTarget;
  render(nodes: ProxyNode[]): RenderedOutput;
}
```

### 12.1 Mihomo

`mihomo-provider` 只生成 `proxies`；`mihomo` 生成固定、最小且可用的
`proxies`、默认 `PROXY` 组和 `MATCH,PROXY` 规则。`clash` 仅作为
`mihomo` 的兼容别名。第一版不支持后台模板编辑。

### 12.2 sing-box

生成 JSON outbounds 和最小 route 配置。字段转换必须由 renderer 完成。

### 12.3 v2rayNG

将可表达的节点重新编码为 URI 列表，再输出 UTF-8 Base64。无法表达的协议必须明确报错或返回警告，不能生成伪成功结果。

### 12.4 浏览器预览

只返回节点名、协议、主机、端口、TLS 和 transport 摘要；隐藏密码、UUID、Reality key 和完整 URI。

## 13. HTTP 路由

### 页面

| Method | Path | 用途 |
| --- | --- | --- |
| GET | `/` | 公共转换页面 |
| GET | `/admin` | 管理后台 |
| GET | `/admin/*` | 管理后台 fallback |

### 公共 API

| Method | Path | 用途 |
| --- | --- | --- |
| GET | `/api/health` | 轻量健康检查 |
| GET | `/sub?url=...&target=...` | 转换订阅 |
| POST | `/api/links` | 创建或复用短链接 |
| GET | `/s/:id` | 解析短链接并转换 |

`target` 支持 `auto`、`mihomo`、`mihomo-provider`、`singbox`、`v2rayng`
和 `preview`；`clash` 是 `mihomo` 的兼容别名。

### 管理 API

- Overview 统计。
- Conversion events 分页。
- Short links 查询、启用、禁用和删除。
- Blocked sources 查询、添加和删除。
- Cache purge。
- Audit log 分页。

所有管理路由必须验证 Cloudflare Access JWT；写操作还必须验证同源 `Origin`。

## 14. 错误模型

使用稳定代码，不依赖错误消息匹配：

```text
INVALID_INPUT
UNSUPPORTED_SCHEME
BLOCKED_SOURCE
PRIVATE_ADDRESS
FETCH_TIMEOUT
FETCH_FAILED
TOO_MANY_REDIRECTS
BODY_TOO_LARGE
EMPTY_SUBSCRIPTION
INVALID_BASE64
INVALID_YAML
UNSUPPORTED_FORMAT
INVALID_NODE
NO_VALID_NODES
NO_RENDERABLE_NODES
UNSUPPORTED_TARGET
INTERNAL_ERROR
```

API 统一返回：

```json
{
  "error": {
    "code": "NO_VALID_NODES",
    "message": "没有找到支持的代理节点"
  }
}
```

生产响应不能包含原始异常堆栈。

## 15. KV 缓存

只缓存完整成功转换结果，默认 TTL 为 300 秒。部分成功结果第一版不缓存。
缓存键：

```text
conversion:{cacheSchemaVersion}:{sourceFingerprint}:{target}:{policyVersion}:{rendererVersion}
```

缓存键不能包含原始 URL。错误和部分生成失败结果不缓存。

## 16. D1 数据

### conversion_events

保存结果、输出格式、脱敏来源域名、来源 HMAC 指纹、客户端类型、节点数、耗时、错误代码和时间。不保存完整 URL 或 IP。

### short_links

保存短 ID、AES-GCM 加密后的目标、IV、HMAC 指纹、输出格式、启用状态、访问数和时间。

### blocked_sources

保存来源 HMAC 指纹、脱敏域名、原因、操作者和时间。

### admin_audit_log

保存管理员邮箱、操作、目标类型、目标 ID、脱敏 metadata 和时间。

### daily_stats

通过原子 SQL upsert 维护每日总量、成功、失败、缓存命中和节点数。

## 17. 加密与指纹

- 短链接目标使用 AES-GCM 加密。
- 每条记录使用随机 96-bit IV。
- URL 查重和封禁使用带密钥的 HMAC-SHA-256。
- AES 与 HMAC 使用不同 Wrangler secret。
- 不使用普通 SHA-256 哈希敏感 URL。

需要的 secrets：

```text
LINK_ENCRYPTION_KEY
SOURCE_HASH_KEY
CF_ACCESS_AUD
TURNSTILE_SECRET_KEY
```

## 18. 公共前端

页面以实际转换工具为主体，不做营销落地页。包含：

- 敏感订阅 URL 输入。
- 自动输出和手动输出选择。
- 转换按钮。
- 加载、成功、空结果和错误状态。
- 生成的订阅 URL。
- 复制地址、复制内容和下载操作。
- 可选短链接创建。
- 手机端可用且无横向页面溢出。

浏览器不得把订阅 URL 写入 localStorage、分析服务或前端日志。

## 19. 管理后台

### Overview

- 今日转换数、成功率、缓存命中率和平均耗时。
- 七天趋势、输出分布和常见错误。

### Conversions

- 时间、脱敏域名、指纹缩写、输出、客户端、结果、缓存、节点数、耗时和错误代码。

### Links

- 短 ID、脱敏来源、输出、访问数、状态和时间。
- 支持启用、禁用和删除。
- 默认不显示解密后的完整订阅 URL。

### Blocked Sources

- 从转换记录封禁。
- 输入 URL 后只保存指纹和脱敏域名。
- 支持解除封禁。

### Audit

- 展示管理员、操作、目标、脱敏 metadata 和时间。

## 20. 滥用防护

- `/sub` 和 `/s/:id` 供代理客户端调用，不要求 Turnstile。
- `/api/links` 使用 Turnstile。
- 转换接口起始限制建议为 60 次/分钟/IP。
- 短链接创建建议为 10 次/分钟/IP。
- 相同来源优先使用 KV，减少对上游的重复请求。
- 管理接口由 Cloudflare Access 保护。

限流值上线后根据真实流量调整，不提前构建复杂配额系统。

## 21. 安全响应头

统一设置：

```text
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
X-Frame-Options: DENY
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

公开页面与管理后台使用各自 CSP。Turnstile 所需的 `connect-src` 和 `frame-src` 只添加官方域名。

## 22. 测试计划

### 协议测试

每种协议覆盖最小合法 URI、完整 URI、IPv6、Unicode 名称、URL 编码、无效端口、缺少认证、无效 Base64 和不支持 transport。

### Golden Output

固定 `ProxyNode[]` 分别输出 Mihomo、Mihomo Provider、sing-box、v2rayNG 和
preview，完整对比 fixture。

Mihomo fixture 必须通过固定版本 `mihomo -t -f`。sing-box fixture 必须使用固定
的 1.13 版本执行 `sing-box format` 和 `sing-box check`。v2rayNG 输出必须使用
固定客户端版本执行导入 smoke test。仅 JSON/YAML 非空或 snapshot 一致不算有效。

### 订阅测试

覆盖 URI、列表、Base64、Clash YAML、空响应、超限、重定向、超时、私有地址和部分坏节点。

### 路由测试

覆盖健康检查、缺少参数、自动输出、缓存命中、短链接、Access、Origin 和错误脱敏。

### 浏览器测试

覆盖桌面、手机、复制、下载、短链接和关键管理操作，并进行键盘和可访问性检查。

## 23. Cloudflare 资源

需要创建：

```text
D1: submorph-db
KV: submorph-conversion-cache
Access Application: submorph-admin
Turnstile site
Workers Rate Limiting binding
Custom Domain: submorph.xqd.pp.ua
```

Custom Domain 配置：

```json
{
  "routes": [
    {
      "pattern": "submorph.xqd.pp.ua",
      "custom_domain": true
    }
  ]
}
```

## 24. 实施阶段

### 阶段 0：恢复部署基线

- 配置 `submorph.xqd.pp.ua` Custom Domain。
- 增加 `/api/health`。
- 验证 `/` 和 `/api/health` 返回 200。
- 运行 lint、类型检查、构建和部署预检。
- 不再为已确认的账户 `workers.dev` 故障修改业务代码。

### 阶段 1：最小转换闭环

只实现：

```text
Shadowsocks URI
  → ProxyNode
  → Clash YAML
  → GET /sub
```

暂不接入 D1、KV、短链接和管理后台。

### 阶段 2：安全远程订阅

- URL 和 SSRF 验证。
- 手动重定向、超时和大小限制。
- URI 列表、Base64 和 Clash YAML。
- 敏感信息脱敏。

### 阶段 3：核心协议

依次实现 VMess、Trojan、VLESS。每个协议同时完成 parser、fixture、模型断言和 Clash renderer。

### 阶段 4：其他输出

依次增加 preview、sing-box 和 v2rayNG，确保同一组 `ProxyNode[]` 能稳定输出四种格式。

### 阶段 5：公共界面

实现输入、输出选择、转换、复制、下载、错误状态和移动端布局，再统一应用 Kumo 样式。

### 阶段 6：缓存与统计

接入 URL HMAC 指纹、KV 缓存、D1 conversion events、daily stats 和缓存命中指标。

### 阶段 7：短链接

实现 AES-GCM、短 ID、创建、复用、访问、启停、删除、Turnstile 和限流。

### 阶段 8：管理后台

接入 Access JWT 验证并实现 Overview、Conversions、Links、Blocked、Audit 和 Cache purge。

### 阶段 9：补齐协议

增加 Hysteria 2、SOCKS5、AnyTLS 和 Snell，并验证目标客户端确实可以表达对应协议。

### 阶段 10：发布检查

- 全部单元和集成测试。
- 全新 D1 迁移测试。
- 桌面和手机浏览器测试。
- SSRF、限流和敏感信息扫描。
- Custom Domain 生产验证。
- Mihomo、sing-box、v2rayNG 真实客户端验证。

## 25. 版本里程碑

### v0.1.0：最小可用

- Shadowsocks、VMess、Trojan、VLESS。
- 远程 URL、URI 列表、Base64、Clash YAML。
- Mihomo、Mihomo Provider、sing-box 1.13、v2rayNG、preview。
- `/sub` 和公共转换页面。
- 基础安全限制和 KV 缓存。
- Custom Domain。

### v0.2.0：运营能力

- D1 转换记录。
- 加密短链接。
- 来源封禁。
- Cloudflare Access。
- 管理后台。
- Turnstile 和 Rate Limiting。

### v1.0.0：完整首发

- 计划中的八种协议；只承诺兼容矩阵标记为 `exact` 或批准为 `lossy` 的组合。
- Mihomo、Mihomo Provider、sing-box、v2rayNG 和 preview 五个目标。
- 完整安全检查。
- 完整管理后台和审计。
- 真实客户端和移动端验证。

## 26. 当前第一目标

第一轮只交付以下垂直切片：

```text
Custom Domain 可访问
  +
Shadowsocks URI
  → 统一节点模型
  → Clash YAML
  → GET /sub
```

该切片通过后再扩展协议、存储和后台，避免先建设尚未验证的外围系统。
