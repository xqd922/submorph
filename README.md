# SubMorph

Cloudflare-native proxy subscription converter for Mihomo, sing-box, and v2rayNG.

Production: `https://submorph.xqd.pp.ua`

## Current Features

- Parse Shadowsocks, VMess, VLESS, and Trojan share links.
- Read plain URI lists, Base64 URI lists, and Mihomo YAML `proxies`.
- Render Mihomo profiles, Mihomo providers, sing-box 1.13 profiles, v2rayNG subscriptions, and redacted previews.
- Convert remote HTTP/HTTPS subscriptions with redirect, timeout, UTF-8, private-address, and 10 MiB limits.
- Responsive React interface with copy, download, statistics, and warning states.
- Encrypted reusable short links backed by D1 and Web Crypto AES-GCM.
- Five-view administration dashboard for events, links, blocked sources, and audit records.
- Five-minute KV cache for complete successful conversions.
- No browser persistence and no silent protocol downgrade.

## API

```text
GET  /api/health
GET  /sub?url=...&target=mihomo
POST /api/convert
POST /api/links
GET  /s/:id
GET  /api/admin/*
```

`POST /api/convert` body:

```json
{
  "source": "ss://...",
  "target": "preview"
}
```

Targets:

```text
mihomo
mihomo-provider
singbox
v2rayng
preview
```

`clash` remains an alias for `mihomo` on `GET /sub`.

## Development

```powershell
pnpm install
pnpm run dev
pnpm run test
pnpm run lint
pnpm run check
```

## Deployment

```powershell
pnpm run deploy
```

The Worker deploys to the Custom Domain configured in `wrangler.json`. The
administrator token is stored outside the repository in
`%USERPROFILE%\.submorph\admin-token.txt` on the deployment machine.

## Project Documents

- `SPEC.md` — product specification.
- `OUTLINE.md` — implementation roadmap.
- `KERNEL_COMPATIBILITY.md` — pinned kernel versions and compatibility matrix.
- `TEST_LOG.md` — deployment and troubleshooting record.
