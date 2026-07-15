import { parse as parseYaml } from "yaml";
import type { ProxyNode, TlsOptions, Transport } from "./types";
import { parseAnyTls } from "./protocols/anytls";
import { parseHysteria2 } from "./protocols/hysteria2";
import { parseSnell } from "./protocols/snell";
import { parseSocks5 } from "./protocols/socks5";

const schemes = /^(ss|vmess|vless|trojan|hysteria2|hy2|socks5?|anytls|snell):\/\//i;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export interface Parsed { candidates: unknown[]; nodes: ProxyNode[]; errors: { index: number; message: string }[] }

export function parseSubscription(input: string): Parsed {
	const text = input.replace(/^\uFEFF/, "").trim();
	let candidates: unknown[] = [];
	try { const value: unknown = parseYaml(text, { maxAliasCount: 0, uniqueKeys: true }); if (record(value) && Array.isArray(value.proxies)) candidates = value.proxies; } catch { /* try text formats */ }
	if (!candidates.length) {
		const lines = split(text);
		if (lines.some((line) => schemes.test(line))) candidates = lines;
		else { const decoded = tryB64(text); if (decoded) candidates = split(decoded); }
	}
	if (!candidates.length) candidates = [text];
	const nodes: ProxyNode[] = [], errors: { index: number; message: string }[] = [];
	candidates.forEach((candidate, index) => { try { nodes.push(typeof candidate === "string" ? parseUri(candidate) : parseYamlNode(candidate)); } catch (error) { errors.push({ index, message: error instanceof Error ? error.message : "Invalid node" }); } });
	return { candidates, nodes, errors };
}

function parseUri(uri: string): ProxyNode {
	if (uri.startsWith("ss://")) return parseSs(uri);
	if (uri.startsWith("vmess://")) return parseVmess(uri);
	if (uri.startsWith("vless://")) return parseUrlNode(uri, "vless");
	if (uri.startsWith("trojan://")) return parseUrlNode(uri, "trojan");
	if (/^(hysteria2|hy2):\/\//i.test(uri)) return parseHysteria2(uri);
	if (/^socks5?:\/\//i.test(uri)) return parseSocks5(uri);
	if (/^anytls:\/\//i.test(uri)) return parseAnyTls(uri);
	if (/^snell:\/\//i.test(uri)) return parseSnell(uri);
	throw new Error("Unsupported URI");
}

function parseSs(uri: string): ProxyNode {
	const [raw, fragment = ""] = uri.slice(5).split("#", 2), [authority, query = ""] = (raw ?? "").split("?", 2);
	let value = authority ?? ""; if (!value.includes("@")) value = b64(value);
	const at = value.lastIndexOf("@"); if (at < 1) throw new Error("Invalid SS authority");
	let auth = value.slice(0, at); if (!auth.includes(":")) auth = b64(auth);
	const colon = auth.indexOf(":"), endpoint = parseEndpoint(value.slice(at + 1)); if (colon < 1) throw new Error("Invalid SS auth");
	return { protocol: "ss", name: decode(fragment) || "Shadowsocks", ...endpoint, method: decode(auth.slice(0, colon)), password: decode(auth.slice(colon + 1)), plugin: new URLSearchParams(query).get("plugin") ?? undefined, transport: { type: "tcp" } };
}

function parseVmess(uri: string): ProxyNode {
	let source: unknown; try { source = JSON.parse(b64(uri.slice(8))); } catch { throw new Error("Invalid VMess JSON") }
	if (!record(source)) throw new Error("Invalid VMess object"); const id = required(source.id, "uuid"); validUuid(id);
	return { protocol: "vmess", name: string(source.ps) || "VMess", server: required(source.add, "server"), port: port(source.port), uuid: id, alterId: integer(source.aid), security: string(source.scy) || "auto", transport: transport(string(source.net) || "tcp", string(source.path), string(source.host)), ...vmessTls(source) };
}

function parseUrlNode(uri: string, protocol: "vless" | "trojan"): ProxyNode {
	let url: URL; try { url = new URL(uri); } catch { throw new Error("Invalid URL") }
	const allowed = new Set(["encryption", "flow", "security", "sni", "fp", "alpn", "insecure", "allowInsecure", "pbk", "sid", "type", "host", "path", "serviceName"]);
	for (const key of url.searchParams.keys()) if (!allowed.has(key)) throw new Error(`Unsupported parameter: ${key}`);
	const base = { name: decode(url.hash.slice(1)) || protocol.toUpperCase(), server: url.hostname, port: port(url.port), transport: transport(url.searchParams.get("type") || "tcp", url.searchParams.get("path") || url.searchParams.get("serviceName") || undefined, url.searchParams.get("host") || undefined), ...urlTls(url.searchParams, protocol === "trojan") };
	if (protocol === "trojan") return { protocol, ...base, password: decode(url.username) };
	const id = decode(url.username); validUuid(id); return { protocol, ...base, uuid: id, encryption: url.searchParams.get("encryption") || "none", flow: url.searchParams.get("flow") || undefined };
}

function parseYamlNode(value: unknown): ProxyNode {
	if (!record(value)) throw new Error("Invalid YAML node"); const protocol = required(value.type, "type").toLowerCase();
	const base = { name: required(value.name, "name"), server: required(value.server, "server"), port: port(value.port), transport: yamlTransport(value), ...yamlTls(value, protocol) };
	if (protocol === "ss") return { protocol, ...base, method: required(value.cipher, "cipher"), password: required(value.password, "password"), plugin: string(value.plugin) };
	if (protocol === "vmess") { const id = required(value.uuid, "uuid"); validUuid(id); return { protocol, ...base, uuid: id, alterId: integer(value.alterId), security: string(value.cipher) || "auto" }; }
	if (protocol === "vless") { const id = required(value.uuid, "uuid"); validUuid(id); return { protocol, ...base, uuid: id, encryption: string(value.encryption) || "none", flow: string(value.flow) }; }
	if (protocol === "trojan") return { protocol, ...base, password: required(value.password, "password") };
	if (protocol === "hysteria2") return { protocol, name: required(value.name, "name"), server: required(value.server, "server"), port: port(value.port), password: required(value.password, "password"), ports: yamlPorts(value.ports ?? value.mport), up: yamlBandwidth(value.up), down: yamlBandwidth(value.down), obfs: value.obfs === "salamander" ? "salamander" : undefined, obfsPassword: string(value["obfs-password"]), transport: { type: "tcp" }, tls: { security: "tls", serverName: string(value.sni), insecure: value["skip-cert-verify"] === true } };
	throw new Error(`Unsupported proxy type: ${protocol}`);
}

function transport(type: string, path?: string, host?: string): Transport {
	if (type === "tcp" || type === "raw") return { type: "tcp" };
	if (["ws", "http", "h2", "xhttp"].includes(type)) return { type: type as "ws" | "http" | "h2" | "xhttp", path, host };
	if (type === "grpc") return { type, serviceName: path };
	throw new Error(`Unsupported transport: ${type}`);
}
function yamlTransport(value: Record<string, unknown>): Transport { const type = string(value.network) || "tcp", raw = value[`${type}-opts`], opts: Record<string, unknown> = record(raw) ? raw : {}, headers: Record<string, unknown> = record(opts.headers) ? opts.headers : {}; return transport(type, string(opts.path) || string(opts["grpc-service-name"]), string(headers.Host) || string(opts.host)); }
function urlTls(params: URLSearchParams, defaultTls: boolean): { tls?: TlsOptions } { const security = params.get("security") || (defaultTls ? "tls" : ""); if (!security || security === "none") return {}; if (security !== "tls" && security !== "reality") throw new Error(`Unsupported security: ${security}`); const publicKey = params.get("pbk") || undefined; if (security === "reality" && !publicKey) throw new Error("Reality public key required"); return { tls: { security, serverName: params.get("sni") || undefined, insecure: bool(params.get("insecure") ?? params.get("allowInsecure")), alpn: params.get("alpn")?.split(",").filter(Boolean), clientFingerprint: params.get("fp") || undefined, ...(security === "reality" ? { reality: { publicKey: publicKey!, shortId: params.get("sid") || undefined } } : {}) } }; }
function vmessTls(value: Record<string, unknown>): { tls?: TlsOptions } { if (!value.tls) return {}; if (value.tls !== "tls") throw new Error("VMess Reality unsupported"); return { tls: { security: "tls", serverName: string(value.sni), insecure: bool(string(value.insecure)), alpn: string(value.alpn)?.split(",").filter(Boolean), clientFingerprint: string(value.fp) } }; }
function yamlTls(value: Record<string, unknown>, protocol: string): { tls?: TlsOptions } { const reality = record(value["reality-opts"]) ? value["reality-opts"] : undefined; if (value.tls !== true && protocol !== "trojan" && !reality) return {}; return { tls: { security: reality ? "reality" : "tls", serverName: string(value.servername) || string(value.sni), insecure: value["skip-cert-verify"] === true, alpn: Array.isArray(value.alpn) ? value.alpn.filter((item): item is string => typeof item === "string") : undefined, clientFingerprint: string(value["client-fingerprint"]), ...(reality ? { reality: { publicKey: required(reality["public-key"], "public-key"), shortId: string(reality["short-id"]) } } : {}) } }; }
function parseEndpoint(value: string): { server: string; port: number } { const match = /^(?:\[([^\]]+)\]|([^:]+)):(\d+)$/.exec(value); if (!match) throw new Error("Invalid endpoint"); return { server: match[1] ?? match[2]!, port: port(match[3]) }; }
function port(value: unknown): number { const number = Number(value); if (!Number.isInteger(number) || number < 1 || number > 65535) throw new Error("Invalid port"); return number; }
function integer(value: unknown): number { if (value === undefined || value === "") return 0; const number = Number(value); if (!Number.isInteger(number) || number < 0) throw new Error("Invalid integer"); return number; }
function validUuid(value: string): void { if (!uuid.test(value)) throw new Error("Invalid UUID"); }
function required(value: unknown, field: string): string { const result = string(value); if (!result) throw new Error(`${field} required`); return result; }
function string(value: unknown): string | undefined { return typeof value === "string" ? value || undefined : typeof value === "number" ? `${value}` : undefined; }
function bool(value: string | null | undefined): boolean | undefined { if (!value) return undefined; if (["1", "true"].includes(value.toLowerCase())) return true; if (["0", "false"].includes(value.toLowerCase())) return false; throw new Error("Invalid boolean"); }
function yamlPorts(value: unknown): string[] | undefined { const values = Array.isArray(value) ? value : value === undefined ? [] : String(value).split(","); const result = values.map(String).map((item) => item.trim()).filter(Boolean); for (const item of result) { const match = /^(\d+)(?:-(\d+))?$/.exec(item); if (!match) throw new Error("Invalid Hysteria2 ports"); const start = port(match[1]), end = match[2] ? port(match[2]) : start; if (start > end) throw new Error("Invalid Hysteria2 port range"); } return result.length ? result : undefined; }
function yamlBandwidth(value: unknown): string | undefined { if (value === undefined || value === "") return undefined; const match = /^(\d+(?:\.\d+)?)\s*(?:mbps)?$/i.exec(String(value).trim()); if (!match || Number(match[1]) <= 0) throw new Error("Bandwidth must be a positive Mbps value"); return `${match[1]} Mbps`; }
function split(value: string): string[] { return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean); }
function tryB64(value: string): string | undefined { try { return b64(value); } catch { return undefined; } }
function b64(value: string): string { const normalized = value.replace(/-/g, "+").replace(/_/g, "/").replace(/\s/g, ""), padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="); return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(Uint8Array.from(atob(padded), (char) => char.charCodeAt(0))); }
function decode(value: string): string { try { return decodeURIComponent(value); } catch { throw new Error("Invalid URL encoding"); } }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
