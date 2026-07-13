export interface AnyTlsNode {
  protocol: "anytls"; name: string; server: string; port: number; password: string;
  tls: { serverName?: string; insecure?: boolean; alpn?: string[]; clientFingerprint?: string };
  idleSessionCheckInterval?: number; idleSessionTimeout?: number; minIdleSession?: number;
}

export function parseAnyTls(uri: string): AnyTlsNode {
  let url: URL; try { url = new URL(uri); } catch { throw new Error("Invalid AnyTLS URL"); }
  if (url.protocol !== "anytls:") throw new Error("Invalid AnyTLS scheme");
  const allowed = new Set(["security", "sni", "fp", "alpn", "insecure", "allowInsecure", "idle-session-check-interval", "idle-session-timeout", "min-idle-session"]);
  for (const key of url.searchParams.keys()) if (!allowed.has(key)) throw new Error(`Unsupported AnyTLS parameter: ${key}`);
  const security = url.searchParams.get("security") ?? "tls";
  if (security === "reality") throw new Error("AnyTLS does not support Reality");
  if (security !== "tls") throw new Error(`Unsupported AnyTLS security: ${security}`);
  const password = decode(url.username); if (!password) throw new Error("AnyTLS password required"); if (!url.hostname) throw new Error("AnyTLS server required");
  return { protocol: "anytls", name: decode(url.hash.slice(1)) || "AnyTLS", server: url.hostname, port: port(url.port), password,
    tls: { serverName: url.searchParams.get("sni") || undefined, insecure: boolean(url.searchParams.get("insecure") ?? url.searchParams.get("allowInsecure")), alpn: list(url.searchParams.get("alpn")), clientFingerprint: url.searchParams.get("fp") || undefined },
    idleSessionCheckInterval: integer(url.searchParams.get("idle-session-check-interval")), idleSessionTimeout: integer(url.searchParams.get("idle-session-timeout")), minIdleSession: integer(url.searchParams.get("min-idle-session")) };
}

export function renderAnyTlsMihomo(node: AnyTlsNode): Record<string, unknown> {
  return compact({ name: node.name, type: "anytls", server: node.server, port: node.port, password: node.password, sni: node.tls.serverName, "skip-cert-verify": node.tls.insecure, alpn: node.tls.alpn, "client-fingerprint": node.tls.clientFingerprint, "idle-session-check-interval": node.idleSessionCheckInterval, "idle-session-timeout": node.idleSessionTimeout, "min-idle-session": node.minIdleSession });
}

export function renderAnyTlsSingBox(node: AnyTlsNode): Record<string, unknown> {
  return compact({ type: "anytls", tag: node.name, server: node.server, server_port: node.port, password: node.password, idle_session_check_interval: node.idleSessionCheckInterval, idle_session_timeout: node.idleSessionTimeout, min_idle_session: node.minIdleSession, tls: compact({ enabled: true, server_name: node.tls.serverName, insecure: node.tls.insecure, alpn: node.tls.alpn, utls: node.tls.clientFingerprint ? { enabled: true, fingerprint: node.tls.clientFingerprint } : undefined }) });
}

export function renderAnyTlsUri(node: AnyTlsNode): string {
  const params = new URLSearchParams({ security: "tls" });
  if (node.tls.serverName) params.set("sni", node.tls.serverName); if (node.tls.clientFingerprint) params.set("fp", node.tls.clientFingerprint); if (node.tls.alpn?.length) params.set("alpn", node.tls.alpn.join(",")); if (node.tls.insecure !== undefined) params.set("insecure", node.tls.insecure ? "1" : "0");
  if (node.idleSessionCheckInterval !== undefined) params.set("idle-session-check-interval", `${node.idleSessionCheckInterval}`); if (node.idleSessionTimeout !== undefined) params.set("idle-session-timeout", `${node.idleSessionTimeout}`); if (node.minIdleSession !== undefined) params.set("min-idle-session", `${node.minIdleSession}`);
  return `anytls://${encodeURIComponent(node.password)}@${host(node.server)}:${node.port}?${params}#${encodeURIComponent(node.name)}`;
}

function port(value: string): number { const number = Number(value); if (!Number.isInteger(number) || number < 1 || number > 65535) throw new Error("Invalid AnyTLS port"); return number; }
function integer(value: string | null): number | undefined { if (value === null) return undefined; const number = Number(value); if (!Number.isInteger(number) || number < 0) throw new Error("Invalid AnyTLS session value"); return number; }
function boolean(value: string | null): boolean | undefined { if (value === null) return undefined; if (["1", "true"].includes(value.toLowerCase())) return true; if (["0", "false"].includes(value.toLowerCase())) return false; throw new Error("Invalid AnyTLS boolean"); }
function list(value: string | null): string[] | undefined { const values = value?.split(",").map((item) => item.trim()).filter(Boolean); return values?.length ? values : undefined; }
function decode(value: string): string { try { return decodeURIComponent(value); } catch { throw new Error("Invalid AnyTLS URL encoding"); } }
function host(value: string): string { return value.includes(":") ? `[${value}]` : value; }
function compact(value: Record<string, unknown>): Record<string, unknown> { return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)); }
