# SubMorph Specification

Status: Draft for implementation
Date: 2026-07-13

## 1. Product

SubMorph is a Cloudflare-native full-stack application that converts proxy
subscriptions into client-ready configurations. It includes:

- A public subscription conversion interface.
- A client-facing conversion endpoint.
- Stable short links for converted subscriptions.
- An authenticated administration panel.

The application is one repository, one Cloudflare Worker, and one deployment.

## 2. Goals

- Rebuild the conversion engine without importing code from the legacy project.
- Run directly on Cloudflare Workers without Next.js or OpenNext.
- Use Cloudflare's official full-stack Vite template as the starting point.
- Keep the conversion domain independent of Hono, React, D1, and KV.
- Support public and administration interfaces in the same application.
- Preserve the existing `/sub?url=...` client contract.
- Treat subscription URLs and their tokens as sensitive data.

## 3. Non-goals

- Multi-tenant accounts or public user registration.
- A custom administrator password or session system.
- External short-link providers such as Bitly or TinyURL.
- An ORM, generic repository layer, or plugin framework.
- Importing legacy analytics during the first release.
- Editing generated Clash or sing-box templates in the administration panel.

## 4. Technology

| Area | Choice |
| --- | --- |
| Runtime | Cloudflare Workers |
| Server framework | Hono |
| Frontend | React 19 + TypeScript |
| Components | `@cloudflare/kumo` |
| Icons | `@phosphor-icons/react` |
| Styling | Tailwind CSS 4 + Kumo design tokens |
| Build | `@cloudflare/vite-plugin` + Vite |
| Database | Cloudflare D1 |
| Cache | Cloudflare KV |
| Admin authentication | Cloudflare Access |
| Abuse prevention | Turnstile + Workers Rate Limiting |
| Package manager | pnpm |
| Tests | Vitest + Cloudflare Workers test integration |
| Deployment | Wrangler / Workers Builds |

The initial scaffold command is:

```bash
pnpm create cloudflare@latest submorph \
  --template=cloudflare/templates/vite-react-template
```

Hono is used only at the HTTP boundary. The conversion engine accepts plain
TypeScript values and returns plain TypeScript values.

## 5. Project Layout

```text
submorph/
  src/
    worker/
      index.ts
      routes/
        public.ts
        admin.ts
      conversion/
        model.ts
        convert.ts
        source.ts
        subscription.ts
        protocols/
        outputs/
        policies/
      database/
        conversions.ts
        links.ts
        blocked.ts
        audit.ts
      platform/
        cache.ts
        crypto.ts
        fetch.ts
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
  vite.config.ts
  wrangler.jsonc
  package.json
```

The public converter and administration panel must be separate frontend entry
chunks. Public visitors must not download administration tables or charts.

## 6. HTTP Routes

### Pages

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/` | Public conversion tool |
| GET | `/admin` | Administration application |
| GET | `/admin/*` | Administration application fallback |

### Public API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/sub?url=...&target=...` | Convert a subscription |
| POST | `/api/links` | Create or reuse a short link |
| GET | `/s/:id` | Resolve and convert a short link |
| GET | `/api/health` | Return service health |

`target` may be `auto`, `clash`, `singbox`, `v2rayng`, or `preview`. When it is
absent or `auto`, the server selects an output from the request User-Agent.

### Administration API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/admin/overview` | Dashboard statistics |
| GET | `/api/admin/conversions` | Paginated conversion events |
| GET | `/api/admin/links` | Paginated short links |
| POST | `/api/admin/links/:id/disable` | Disable a short link |
| POST | `/api/admin/links/:id/enable` | Enable a short link |
| DELETE | `/api/admin/links/:id` | Delete a short link |
| GET | `/api/admin/blocked` | List blocked sources |
| POST | `/api/admin/blocked` | Block a source |
| DELETE | `/api/admin/blocked/:id` | Unblock a source |
| POST | `/api/admin/cache/purge` | Purge conversion cache |
| GET | `/api/admin/audit` | Paginated administration audit log |

All administration routes require Cloudflare Access. Mutating requests also
require a same-origin `Origin` header.

## 7. Conversion Model

The canonical node model must not contain Clash or sing-box field names.
Internal names use camelCase and represent protocol concepts.

```text
ProxyNode
  name
  protocol
  endpoint { host, port }
  authentication
  tls
  transport
  protocolOptions
```

`ProxyNode` is a discriminated union. Each protocol owns its authentication
and protocol-specific options. Renderers map the canonical model to each
external client schema.

Supported protocols for the first release:

- Shadowsocks
- VMess
- Trojan
- VLESS
- Hysteria 2
- SOCKS5
- AnyTLS
- Snell

Supported subscription inputs:

- A remote HTTP or HTTPS subscription.
- A single supported proxy URI.
- Plain-text lists of proxy URIs.
- Base64-encoded URI lists.
- Clash-compatible YAML subscriptions.
- GitHub Gist documents containing supported sources.

Supported outputs:

- Mihomo / Clash YAML.
- sing-box JSON.
- v2rayNG-compatible Base64 subscription.
- Browser preview.

## 8. Conversion Pipeline

```text
Validate input
  -> load source safely
  -> parse subscription
  -> normalize nodes
  -> validate nodes
  -> remove duplicates
  -> apply naming policy
  -> select output
  -> render configuration
  -> cache successful result
  -> record redacted event
  -> return response
```

Every stage before HTTP response construction must be independently testable.
Parsing and rendering errors use stable error codes rather than message matching.

## 9. Data

### D1 tables

`conversion_events`

- Result, output target, source hostname, source fingerprint, client family,
  node count, duration, error code, and timestamp.
- Never stores a full subscription URL or client IP.

`daily_stats`

- Date, total, successful, failed, cache hits, and total nodes.
- Updated with atomic SQL upserts.

`short_links`

- ID, encrypted target, encryption IV, target fingerprint, enabled state, hit
  count, creation time, and last access time.

`blocked_sources`

- ID, source fingerprint, redacted hostname, reason, actor, and timestamp.

`admin_audit_log`

- Actor email, action, target type, target ID, redacted metadata, and timestamp.

### KV

KV stores only successful rendered conversion responses. Cache keys include the
source fingerprint, requested target, output policy version, and renderer
version. Default TTL is five minutes. Errors are not cached.

## 10. Security

- Permit only HTTP, HTTPS, and explicitly supported proxy URI schemes.
- Reject source URLs containing credentials, localhost names, private literal
  IPs, link-local IPs, and unsupported schemes.
- Follow redirects manually and validate every redirect target.
- Limit remote bodies to 10 MiB while streaming, not only after reading.
- Apply request deadlines and bounded retries with native `AbortSignal`.
- Redact URL query values, fragments, credentials, UUIDs, and passwords in logs.
- Encrypt persisted short-link targets with AES-GCM using a Wrangler secret.
- Fingerprint normalized source URLs with keyed HMAC for lookups and blocking.
- Protect `/admin*` and `/api/admin*` with Cloudflare Access and verify its JWT.
- Protect public write endpoints with Turnstile and rate limiting.
- Set CSP, `X-Content-Type-Options`, `Referrer-Policy`, and frame restrictions.

Required secrets and bindings:

```text
DB                       D1 database
CONVERSION_CACHE         KV namespace
LINK_ENCRYPTION_KEY      Wrangler secret
SOURCE_HASH_KEY          Wrangler secret
CF_ACCESS_AUD            Wrangler secret
TURNSTILE_SECRET_KEY     Wrangler secret
RATE_LIMITER             Rate Limiting binding
ASSETS                   Workers Assets binding
```

## 11. User Interface

### Public converter

The root page is the working converter, not a marketing landing page. It has:

- A sensitive subscription URL input.
- An output selector with automatic detection as the default.
- A convert command.
- A generated subscription URL with copy action.
- Optional short-link creation after conversion.
- Clear loading, success, empty, and error states.

### Administration panel

The administration panel is a dense operational interface with:

- Overview metrics and conversion trends.
- Conversion event filters and pagination.
- Short-link management.
- Blocked-source management.
- Cache purge controls.
- Administration audit history.

Kumo components are imported through granular paths. ECharts is loaded only on
the overview page. Tables, toolbars, filters, and dialogs must be accessible by
keyboard and usable on mobile without horizontal page overflow.

## 12. Testing

- Protocol fixture tests for parsing and canonical models.
- Golden-output tests for every supported renderer.
- Subscription tests for plain text, Base64, YAML, remote responses, and size
  limits.
- Pipeline tests with injected source loaders and caches.
- Hono route tests using in-memory requests.
- D1 migration and query tests in the Workers test environment.
- Browser tests for the public workflow and critical administration actions.
- Desktop and mobile screenshot checks before release.

No real subscription credentials are committed as fixtures.

## 13. Acceptance Criteria

- `pnpm test`, `pnpm typecheck`, and `pnpm build` pass.
- All eight protocols parse valid fixtures and reject invalid fixtures.
- All four outputs render valid non-empty configurations.
- `/sub?url=...` remains compatible with existing client links.
- Public and administration frontend chunks are separate.
- Administration APIs are unreachable without Cloudflare Access.
- Full subscription URLs do not appear in conversion events or logs.
- D1 migrations apply locally and to a clean remote database.
- The application deploys as one Worker with Workers Assets.

## 14. Implementation Order

1. Generate the official Cloudflare full-stack template and add Kumo.
2. Configure D1, KV, Access settings, secrets, and local development bindings.
3. Implement the canonical model and a Shadowsocks-to-Clash vertical slice.
4. Add remaining protocols with fixtures.
5. Add subscription loaders, policies, and remaining renderers.
6. Build the public converter workflow.
7. Add persistence, short links, and administration APIs.
8. Build the administration panel.
9. Run compatibility, security, browser, and deployment checks.

The legacy project is a behavioral reference only. New SubMorph modules must
not import from it.
