export interface SnellNode {
  protocol: "snell"; name: string; server: string; port: number; psk: string; version: 1 | 2 | 3 | 4 | 5;
  obfs?: { mode: "http" | "tls"; host?: string };
}

export function parseSnell(uri: string): SnellNode {
  let url: URL; try { url = new URL(uri); } catch { throw new Error("Invalid Snell URL"); }
  if (url.protocol !== "snell:") throw new Error("Invalid Snell scheme");
  const allowed = new Set(["version", "obfs", "obfs-host"]);
  for (const key of url.searchParams.keys()) if (!allowed.has(key)) throw new Error(`Unsupported Snell parameter: ${key}`);
  const psk = decode(url.username); if (!psk) throw new Error("Snell PSK required"); if (!url.hostname) throw new Error("Snell server required");
  const port = Number(url.port); if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid Snell port");
  const version = Number(url.searchParams.get("version") ?? "3"); if (![1, 2, 3, 4, 5].includes(version)) throw new Error("Unsupported Snell version");
  const rawMode = url.searchParams.get("obfs"); if (rawMode !== null && rawMode !== "http" && rawMode !== "tls") throw new Error("Unsupported Snell obfs");
  const mode = rawMode as "http" | "tls" | null;
  return { protocol: "snell", name: decode(url.hash.slice(1)) || "Snell", server: url.hostname, port, psk, version: version as SnellNode["version"], obfs: mode ? { mode, host: url.searchParams.get("obfs-host") || undefined } : undefined };
}

export function renderSnellMihomo(node: SnellNode): Record<string, unknown> {
  return compact({ name: node.name, type: "snell", server: node.server, port: node.port, psk: node.psk, version: node.version, "obfs-opts": node.obfs ? compact({ mode: node.obfs.mode, host: node.obfs.host }) : undefined });
}

export function renderSnellSingBox(node: SnellNode): Record<string, unknown> {
  return compact({ type: "snell", tag: node.name, server: node.server, server_port: node.port, psk: node.psk, version: node.version, obfs: node.obfs?.mode, obfs_host: node.obfs?.host });
}

export function renderSnellUri(node: SnellNode): string {
  const params = new URLSearchParams({ version: `${node.version}` });
  if (node.obfs) { params.set("obfs", node.obfs.mode); if (node.obfs.host) params.set("obfs-host", node.obfs.host); }
  return `snell://${encodeURIComponent(node.psk)}@${host(node.server)}:${node.port}?${params}#${encodeURIComponent(node.name)}`;
}

function decode(value: string): string { try { return decodeURIComponent(value); } catch { throw new Error("Invalid Snell URL encoding"); } }
function host(value: string): string { return value.includes(":") ? `[${value}]` : value; }
function compact(value: Record<string, unknown>): Record<string, unknown> { return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)); }
