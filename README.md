# SubMorph

Cloudflare-native proxy subscription converter for Mihomo, sing-box, and v2rayNG.

Production: `https://submorph.xqd.pp.ua`

## Current Features

- Parse Shadowsocks, VMess, VLESS, Trojan, Hysteria2, SOCKS5, AnyTLS, and Snell share links.
- Read plain URI lists, Base64 URI lists, and Mihomo YAML `proxies`.
- Render Mihomo profiles, Mihomo providers, sing-box 1.13 profiles, v2rayNG subscriptions, and redacted previews.
- Convert remote HTTP/HTTPS subscriptions with redirect, timeout, UTF-8, private-address, and 10 MiB limits.
- Minimal responsive React interface that creates one encrypted, auto-detecting subscription link.
- Encrypted reusable short links backed by D1 and Web Crypto AES-GCM.
- Five-view administration dashboard for events, links, blocked sources, and audit records.
- Five-minute KV cache for complete successful conversions.
- No browser persistence and no silent protocol downgrade.

## API

```text
GET  /api/health
GET  /sub?url=...
POST /api/convert
POST /api/links
GET  /s/:id
GET  /api/admin/*
```

`POST /api/convert` body:

```json
{
  "source": "ss://..."
}
```

The Worker selects Mihomo, sing-box, or v2rayNG from the subscription client's
User-Agent. Automatic short links can therefore be used by different clients
without choosing a format in the browser.

Advanced API callers may still request an explicit target:

```text
mihomo
mihomo-provider
singbox
v2rayng
preview
```

`auto` is the default, and `clash` remains an alias for `mihomo`.

## Development

```powershell
pnpm install
Copy-Item .dev.vars.example .dev.vars
pnpm run dev
pnpm run test
pnpm run lint
pnpm run check
```

## Production Security

Set the administrator username and password as Worker secrets:

```powershell
pnpm exec wrangler secret put ADMIN_USERNAME
pnpm exec wrangler secret put ADMIN_PASSWORD
```

Successful login creates a signed, `HttpOnly`, `SameSite=Strict` session cookie
that expires after 12 hours. Login attempts are limited to five per minute;
public conversion routes are limited to 30 requests per minute. Mutating
administration requests also require a same-origin `Origin` header.

## Deployment

```powershell
pnpm run deploy
```

The Worker deploys to the Custom Domain configured in `wrangler.json`.

## Project Documents

- `SPEC.md` — product specification.
- `OUTLINE.md` — implementation roadmap.
- `KERNEL_COMPATIBILITY.md` — pinned kernel versions and compatibility matrix.
- `TEST_LOG.md` — deployment and troubleshooting record.
