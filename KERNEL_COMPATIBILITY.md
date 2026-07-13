# SubMorph 内核兼容性与官方资料基线

状态：实施基线  
更新日期：2026-07-14

## 1. 目标

本文定义 SubMorph 面向 Mihomo、sing-box 和 v2rayNG/Xray 的实际兼容边界。协议“能够解析”不代表能够无损输出到所有目标；发布承诺必须以本文件的能力矩阵、固定内核版本和真实客户端验证为准。

状态含义：

| 状态 | 含义 |
| --- | --- |
| `exact` | 当前支持范围内可完整表达，且必须通过目标内核或客户端验证 |
| `lossy` | 可以生成可用结果，但会丢失明确列出的字段并返回警告 |
| `unsupported` | 语义无法安全表达，必须拒绝或跳过 |
| `unverified` | 尚未完成真实目标验证，不进入发布承诺 |

禁止把 `unsupported` 静默降级为其他协议、transport 或 TLS 模式。

## 2. 官方版本基线

调研时固定版本：

| 项目 | 发布版本 | 调研提交 |
| --- | --- | --- |
| Mihomo | `v1.19.28` | `008b91bfe8c0` |
| sing-box | `v1.13.14` | `81bfee7ef7d0` (`testing`) |
| v2rayNG | `2.2.6` | `06e512f5c5df` (`master`) |
| Xray-core | `v26.3.27` | `50231eaff98c` |
| V2Ray-core | `v5.51.2` | `bd9bdf73fec8` |

版本升级不能只更新文档数字。必须重新运行 golden tests、目标内核检查和真实客户端 smoke test。

## 3. 输出目标

| Target | 输出形态 | 用途 |
| --- | --- | --- |
| `mihomo-provider` | 仅含 `proxies` 的 YAML provider | 被现有 Mihomo 配置作为 proxy provider 引用 |
| `mihomo` | 带最小 selector/rules 的完整 YAML profile | 直接导入或作为完整配置使用 |
| `singbox` | 完整 sing-box JSON remote profile | 供 sing-box 客户端远程 profile 使用 |
| `v2rayng` | URI 列表经 UTF-8 标准 Base64 包装 | 供 v2rayNG 订阅导入 |
| `preview` | 脱敏 JSON 摘要 | 浏览器检查解析结果和警告 |

`clash` 仅作为 `mihomo` 的兼容别名。响应诊断应区分 `requestedTarget` 和 `resolvedTarget`。

Mihomo provider 的 YAML、明文 URI 列表和 Base64 URI 列表不能混写。sing-box remote profile 必须返回完整 JSON 配置，不能只返回 URI 列表或裸 `outbounds` 数组。

## 4. MVP 协议矩阵

### 4.1 基础变体

| 协议变体 | Mihomo | sing-box 1.13 | v2rayNG | 说明 |
| --- | --- | --- | --- | --- |
| SS 基础 SIP002 | `exact` | `exact` | `exact` | method、password、host、port、name |
| SS plugin | `unverified` | `lossy` | `lossy` | 仅白名单 plugin；未知参数不得静默删除 |
| VMess TCP | `exact` | `exact` | `exact` | 新配置使用 `alterId = 0` |
| VMess TLS | `exact` | `exact` | `exact` | 普通 TLS、SNI、ALPN、uTLS fingerprint |
| VMess WebSocket | `exact` | `exact` | `exact` | TLS SNI、WS Host、连接地址必须分离 |
| VMess gRPC | `exact` | `exact` | `exact` | service name 和 authority 分开建模 |
| VMess Reality | `unsupported` | `unsupported` | `unsupported` | 不生成伪 Reality VMess 分享链接 |
| VLESS TCP/TLS | `exact` | `exact` | `exact` | `encryption` 保留字符串语义 |
| VLESS WebSocket | `exact` | `exact` | `exact` | 仅表达已建模 headers/path |
| VLESS gRPC | `exact` | `exact` | `exact` | 严格验证 service name |
| VLESS Reality RAW | `unverified` | `unverified` | `unverified` | 需要固定 Xray/Mihomo/sing-box 实测语料 |
| VLESS Reality gRPC | `unverified` | `unverified` | `unverified` | 不在 MVP 发布承诺中 |
| VLESS XHTTP | `unverified` | `unsupported` | `lossy` | Mihomo/Xray 字段演进快；sing-box 无 XHTTP transport |
| Trojan TLS/TCP | `exact` | `exact` | `exact` | Trojan 默认 TLS 语义不能丢失 |
| Trojan WebSocket | `exact` | `exact` | `exact` | 普通 TLS 范围 |
| Trojan gRPC | `exact` | `exact` | `exact` | 普通 TLS 范围 |
| Trojan Reality | `unverified` | `unverified` | `unverified` | 完成真实客户端测试后再发布 |

### 4.2 后续协议

| 协议 | Mihomo | sing-box 1.13 | v2rayNG | 首次计划 |
| --- | --- | --- | --- | --- |
| Hysteria 2 | `unverified` | `unverified` | `unverified` | v1.0 候选 |
| SOCKS5 | `unverified` | `unverified` | `unverified` | v1.0 候选 |
| AnyTLS | `unverified` | `unverified` | `unverified` | v1.0 候选；Mihomo 不支持 AnyTLS + Reality |
| Snell | `unverified` | `unverified` | `unsupported` | v1.0 候选 |
| TUIC | `unverified` | `unverified` | `unverified` | 需求出现后评估 |
| HTTP proxy | `unverified` | `unverified` | `unverified` | 需求出现后评估 |

后续协议只有在 parser、目标 renderer、内核校验和真实客户端导入全部完成后才能从 `unverified` 升级。

## 5. 统一模型要求

### 5.1 TLS

```ts
interface TlsOptions {
  enabled: boolean;
  serverName?: string;
  alpn?: string[];
  skipCertificateVerify?: boolean;
  certificateFingerprint?: string;
  clientFingerprint?: string;
  clientCertificate?: string;
  clientPrivateKey?: string;
  reality?: RealityOptions;
  ech?: EchOptions;
}
```

必须区分：

- 证书指纹 `certificateFingerprint`。
- uTLS 客户端指纹 `clientFingerprint`。
- TLS SNI `serverName`。
- WebSocket Host header。
- 实际连接地址 `endpoint.host`。

Reality 内部字段使用中性语义，不绑定单一内核字段名：

```ts
interface RealityOptions {
  authentication: string;
  shortId: string;
  spiderX?: string;
  mldsa65Verify?: string;
}
```

Renderer 分别映射到 Mihomo、sing-box、v2rayNG 和 Xray 的字段名称。

### 5.2 Transport

Transport 必须按协议约束，不能使用所有协议共享的任意枚举：

```text
VMess: TCP, WS, HTTP, H2, gRPC；mKCP/Mekya 延后
VLESS: TCP, WS, HTTP, H2, gRPC, XHTTP
Trojan: TCP, WS, gRPC
sing-box: 普通 TCP 不生成 transport 对象
```

XHTTP 不能输出给 VMess、Trojan 或 sing-box。Reality 组合必须按目标内核官方限制验证。

## 6. Mihomo 输出规则

- 正式目标名使用 `mihomo`，不把 Mihomo 扩展字段宣传为旧 Clash 通用格式。
- `mihomo-provider` 只生成 `proxies`。
- `mihomo` 使用项目维护的最小固定 profile，不复制第三方规则模板。
- `sni` 与 `servername` 由 renderer 按协议选择。
- 不默认生成 `skip-cert-verify: true`、`client-fingerprint: random`、TFO、MPTCP、SMUX 或全局 padding。
- Mihomo 节点名称必须在目标清洗后再次确保唯一。
- 每个生成 fixture 使用固定 Mihomo 执行：

```bash
mihomo -t -f generated.yaml
```

Mihomo 没有足以替代真实解析器的完整官方 JSON Schema；最终校验以固定版本二进制为准。

## 7. sing-box 输出规则

- 首版锁定 `1.13.14`，不输出官网中标记为 1.14+ 的字段。
- 返回完整 JSON remote profile，至少包含节点 outbounds、selector 和 `route.final`。
- 禁止生成已移除或废弃的新配置：`block` outbound、`dns` outbound、旧 WireGuard outbound、`domain_strategy` 和 direct override 字段。
- Mihomo 字段必须转换为 sing-box 结构：

```text
skip-cert-verify     → tls.insecure
client-fingerprint   → tls.utls.fingerprint
servername/sni       → tls.server_name
reality-opts         → tls.reality
ws-opts/grpc-opts    → transport
```

- 普通 TCP 不生成 `{ "transport": { "type": "tcp" } }`。
- 不默认生成 `insecure`、uTLS fingerprint、`xudp`、multiplex、fragment、kTLS 或平台拨号字段。
- CI 固定执行：

```bash
sing-box format -c generated.json
sing-box check -c generated.json
```

`format` 只负责规范化，不能替代 `check`。

## 8. v2rayNG 输出规则

输出格式固定为：

```text
每行一个 URI
→ LF 连接
→ UTF-8
→ 标准 Base64
→ 保留 padding
→ 外层不换行
```

- VMess 使用传统 `vmess://BASE64(JSON v2)`，不以 URL 风格 VMess 作为主输出。
- VLESS 和 Trojan 使用 URL share link。
- SS 使用 SIP002 Base64URL user info，移除内部 padding。
- VMess Reality 必须拒绝。
- VLESS/Trojan Reality、XHTTP 和高级字段只有在矩阵标记 `exact` 后才能发布。
- URI 只能表达节点级连接参数，不能声称等价于完整 Xray/V2Ray JSON 配置。
- 不执行 Reality → TLS、XHTTP → WS、Vision → 普通 TCP 等静默降级。

## 9. 部分成功策略

第一版采用 `compatible` 策略：

1. 语法损坏或语义无效节点被跳过。
2. 目标无法表达的 `unsupported` 节点被跳过。
3. 至少有一个有效且可表达节点时返回结果。
4. 没有可输出节点时返回 `NO_RENDERABLE_NODES`。
5. 返回不含敏感信息的计数响应头：

```text
X-SubMorph-Parsed
X-SubMorph-Valid
X-SubMorph-Rendered
X-SubMorph-Skipped
X-SubMorph-Warnings
```

详细警告仅在 `preview` 或 JSON API 中返回。部分成功结果第一版不写入 KV 缓存，避免隐藏上游问题。

## 10. 三阶段验证

```text
Syntax validation
  → Canonical semantic validation
  → Target capability validation
```

- Syntax：URL、Base64、JSON、YAML 和 URI 结构。
- Canonical：Host、端口、认证、TLS、Reality、transport 和跨字段约束。
- Target：目标内核能否准确表达对应协议变体。

Renderer 只能接收已经通过目标能力验证的节点，不能在序列化过程中临时决定是否降级。

## 11. 版本与缓存

独立维护：

```text
apiVersion
modelVersion
parserVersion
policyVersion
mihomoRendererVersion
singBoxRendererVersion
v2rayNgRendererVersion
cacheSchemaVersion
```

缓存键必须包含 target、policy 和对应 renderer version。短链接保存创建时的 target、policyVersion 和 rendererVersion；默认使用 pinned 语义，避免 renderer 升级后同一短链接突然改变输出。

## 12. 发布门槛

一个协议变体进入发布支持必须同时满足：

1. 有匿名化合法和非法 fixture。
2. Parser 测试通过。
3. Canonical 模型断言通过。
4. Target capability 状态为 `exact` 或明确批准的 `lossy`。
5. Golden output 通过结构化重新解析。
6. Mihomo/sing-box 输出通过固定版本内核检查。
7. v2rayNG 输出经过固定版本客户端导入 smoke test。
8. 敏感信息扫描通过。

## 13. 官方资料

### Mihomo

```text
https://wiki.metacubex.one/en/config/
https://wiki.metacubex.one/en/config/proxies/
https://wiki.metacubex.one/en/config/proxies/tls/
https://wiki.metacubex.one/en/config/proxies/transport/
https://wiki.metacubex.one/en/config/proxy-providers/
https://wiki.metacubex.one/en/config/proxy-providers/content/
https://github.com/MetaCubeX/mihomo
https://github.com/MetaCubeX/mihomo/releases
```

### sing-box

```text
https://sing-box.sagernet.org/configuration/
https://sing-box.sagernet.org/configuration/outbound/
https://sing-box.sagernet.org/configuration/shared/tls/
https://sing-box.sagernet.org/configuration/shared/v2ray-transport/
https://sing-box.sagernet.org/migration/
https://sing-box.sagernet.org/clients/general/
https://github.com/SagerNet/sing-box
https://github.com/SagerNet/sing-box/releases
```

### v2rayNG / Xray / V2Ray

```text
https://github.com/2dust/v2rayNG
https://github.com/XTLS/Xray-core
https://xtls.github.io/en/config/transports/
https://xtls.github.io/en/config/outbounds/vless.html
https://xtls.github.io/en/config/outbounds/vmess.html
https://xtls.github.io/en/config/outbounds/trojan.html
https://github.com/v2fly/v2ray-core
https://www.v2fly.org/en_US/config/transport.html
```
