import { stringify as yaml } from "yaml";
import type { OutputTarget, ProxyNode, TlsOptions, Transport } from "./types";

export interface Rendered { content: string; contentType: string; nodes: ProxyNode[]; skipped: { node: ProxyNode; message: string }[] }
export function render(nodes: ProxyNode[], target: OutputTarget): Rendered {
	const accepted: ProxyNode[] = [], skipped: { node: ProxyNode; message: string }[] = [];
	for (const node of nodes) {
		const reason = unsupported(node, target);
		if (reason) skipped.push({ node, message: reason });
		else accepted.push(node);
	}
	if (target === "preview") return json(accepted, skipped, { count: accepted.length, nodes: accepted.map((node) => ({ name: node.name, protocol: node.protocol, server: node.server, port: node.port, tls: node.tls?.security ?? false, transport: node.transport.type })) });
	if (target === "v2rayng") return { content: base64(accepted.map(uri).join("\n")), contentType: "text/plain; charset=utf-8", nodes: accepted, skipped };
	if (target === "singbox") return json(accepted, skipped, { outbounds: [{ type: "selector", tag: "proxy", outbounds: accepted.map((node) => node.name), ...(accepted[0] ? { default: accepted[0].name } : {}) }, ...accepted.map(singbox), { type: "direct", tag: "direct" }], route: { final: "proxy" } });
	const proxies = accepted.map(mihomo), value = target === "mihomo-provider" ? { proxies } : { proxies, "proxy-groups": [{ name: "PROXY", type: "select", proxies: [...accepted.map((node) => node.name), "DIRECT"] }], rules: ["MATCH,PROXY"] };
	return { content: yaml(value), contentType: "text/yaml; charset=utf-8", nodes: accepted, skipped };
}

function unsupported(node: ProxyNode, target: OutputTarget): string | undefined {
	if (target === "preview") return undefined;
	if (node.transport.type === "xhttp" && node.protocol !== "vless") return "XHTTP only supports VLESS";
	if (node.transport.type === "xhttp" && target === "singbox") return "sing-box 1.13 cannot express XHTTP";
	if (target === "singbox" && node.protocol === "vless" && node.encryption !== "none") return "sing-box 1.13 cannot express VLESS encryption";
	return undefined;
}

function mihomo(node: ProxyNode): Record<string, unknown> {
	const result: Record<string, unknown> = { name: node.name, type: node.protocol, server: node.server, port: node.port };
	if (node.protocol === "ss") Object.assign(result, { cipher: node.method, password: node.password }, plugin(node.plugin));
	if (node.protocol === "vmess") Object.assign(result, { uuid: node.uuid, alterId: node.alterId, cipher: node.security });
	if (node.protocol === "vless") Object.assign(result, { uuid: node.uuid, encryption: node.encryption }, node.flow ? { flow: node.flow } : {});
	if (node.protocol === "trojan") result.password = node.password;
	return Object.assign(result, mihomoTls(node), mihomoTransport(node.transport));
}
function mihomoTls(node: ProxyNode): Record<string, unknown> { const tls = node.tls; if (!tls) return {}; const key = node.protocol === "vmess" || node.protocol === "vless" ? "servername" : "sni"; return { tls: true, ...(tls.serverName ? { [key]: tls.serverName } : {}), ...(tls.insecure !== undefined ? { "skip-cert-verify": tls.insecure } : {}), ...(tls.alpn ? { alpn: tls.alpn } : {}), ...(tls.clientFingerprint ? { "client-fingerprint": tls.clientFingerprint } : {}), ...(tls.reality ? { "reality-opts": { "public-key": tls.reality.publicKey, ...(tls.reality.shortId ? { "short-id": tls.reality.shortId } : {}) } } : {}) }; }
function mihomoTransport(value: Transport): Record<string, unknown> { if (value.type === "tcp") return {}; if (value.type === "grpc") return { network: "grpc", "grpc-opts": value.serviceName ? { "grpc-service-name": value.serviceName } : {} }; const options = { ...(value.path ? { path: value.path } : {}), ...(value.host ? { headers: { Host: value.host }, host: value.host } : {}) }; return { network: value.type, [`${value.type}-opts`]: options }; }

function singbox(node: ProxyNode): Record<string, unknown> {
	const result: Record<string, unknown> = { type: node.protocol === "ss" ? "shadowsocks" : node.protocol, tag: node.name, server: node.server, server_port: node.port };
	if (node.protocol === "ss") Object.assign(result, { method: node.method, password: node.password }, singboxPlugin(node.plugin));
	if (node.protocol === "vmess") Object.assign(result, { uuid: node.uuid, alter_id: node.alterId, security: node.security });
	if (node.protocol === "vless") Object.assign(result, { uuid: node.uuid }, node.flow ? { flow: node.flow } : {});
	if (node.protocol === "trojan") result.password = node.password;
	if (node.tls) result.tls = singboxTls(node.tls); const transport = singboxTransport(node.transport); if (transport) result.transport = transport; return result;
}
function singboxTls(tls: TlsOptions): Record<string, unknown> { return { enabled: true, ...(tls.serverName ? { server_name: tls.serverName } : {}), ...(tls.insecure !== undefined ? { insecure: tls.insecure } : {}), ...(tls.alpn ? { alpn: tls.alpn } : {}), ...(tls.clientFingerprint ? { utls: { enabled: true, fingerprint: tls.clientFingerprint } } : {}), ...(tls.reality ? { reality: { enabled: true, public_key: tls.reality.publicKey, ...(tls.reality.shortId ? { short_id: tls.reality.shortId } : {}) } } : {}) }; }
function singboxTransport(value: Transport): Record<string, unknown> | undefined { if (value.type === "tcp") return undefined; if (value.type === "grpc") return { type: "grpc", ...(value.serviceName ? { service_name: value.serviceName } : {}) }; if (value.type === "xhttp") throw new Error("XHTTP unsupported"); return { type: value.type === "h2" ? "http" : value.type, ...(value.path ? { path: value.path } : {}), ...(value.host ? { host: value.type === "http" || value.type === "h2" ? [value.host] : value.host, headers: value.type === "ws" ? { Host: value.host } : undefined } : {}) }; }

function uri(node: ProxyNode): string {
	if (node.protocol === "ss") return `ss://${base64url(`${node.method}:${node.password}`)}@${host(node.server)}:${node.port}${node.plugin ? `?plugin=${encodeURIComponent(node.plugin)}` : ""}#${encodeURIComponent(node.name)}`;
	if (node.protocol === "vmess") { const transport = uriTransport(node.transport); return `vmess://${base64(JSON.stringify({ v: "2", ps: node.name, add: node.server, port: `${node.port}`, id: node.uuid, aid: `${node.alterId}`, scy: node.security, net: transport.type, type: "none", host: transport.host || "", path: transport.path || "", tls: node.tls ? "tls" : "", sni: node.tls?.serverName || "", alpn: node.tls?.alpn?.join(",") || "", fp: node.tls?.clientFingerprint || "", insecure: node.tls?.insecure ? "1" : "0" }))}`; }
	const params = new URLSearchParams(), transport = uriTransport(node.transport); params.set("type", transport.type); if (transport.host) params.set("host", transport.host); if (transport.path) params.set(transport.type === "grpc" ? "serviceName" : "path", transport.path); if (node.protocol === "vless") { params.set("encryption", node.encryption); if (node.flow) params.set("flow", node.flow); } if (node.tls) { params.set("security", node.tls.security); if (node.tls.serverName) params.set("sni", node.tls.serverName); if (node.tls.clientFingerprint) params.set("fp", node.tls.clientFingerprint); if (node.tls.alpn) params.set("alpn", node.tls.alpn.join(",")); if (node.tls.insecure !== undefined) params.set("insecure", node.tls.insecure ? "1" : "0"); if (node.tls.reality) { params.set("pbk", node.tls.reality.publicKey); if (node.tls.reality.shortId) params.set("sid", node.tls.reality.shortId); } }
	const credential = node.protocol === "vless" ? node.uuid : node.password; return `${node.protocol}://${encodeURIComponent(credential)}@${host(node.server)}:${node.port}?${params}#${encodeURIComponent(node.name)}`;
}
function uriTransport(value: Transport): { type: string; host?: string; path?: string } { return value.type === "grpc" ? { type: "grpc", path: value.serviceName } : value.type === "tcp" ? { type: "tcp" } : value; }
function plugin(value?: string): Record<string, unknown> { if (!value) return {}; const [name, ...parts] = value.split(";"); return { plugin: name, ...(parts.length ? { "plugin-opts": Object.fromEntries(parts.map((part) => { const index = part.indexOf("="); return index < 0 ? [part, true] : [part.slice(0, index), part.slice(index + 1)]; })) } : {}) }; }
function singboxPlugin(value?: string): Record<string, unknown> { if (!value) return {}; const [name, ...parts] = value.split(";"); return { plugin: name, ...(parts.length ? { plugin_opts: parts.join(";") } : {}) }; }
function json(nodes: ProxyNode[], skipped: { node: ProxyNode; message: string }[], value: unknown): Rendered { return { content: JSON.stringify(value, null, 2), contentType: "application/json; charset=utf-8", nodes, skipped }; }
function host(value: string): string { return value.includes(":") ? `[${value}]` : value; }
function base64(value: string): string { const bytes = new TextEncoder().encode(value); let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary); }
function base64url(value: string): string { return base64(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
