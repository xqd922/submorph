export interface Hy2Node {
	protocol: "hysteria2";
	name: string;
	server: string;
	port: number;
	ports?: string[];
	password: string;
	transport: { type: "tcp" };
	tls: { security: "tls"; serverName?: string; insecure?: boolean };
	obfs?: "salamander";
	obfsPassword?: string;
	up?: string;
	down?: string;
}

export function parseHysteria2(uri: string): Hy2Node {
	let url: URL;
	try { url = new URL(uri); } catch { throw new Error("Invalid Hysteria2 URL"); }
	if (url.protocol !== "hysteria2:" && url.protocol !== "hy2:") throw new Error("Unsupported Hysteria2 scheme");
	for (const key of url.searchParams.keys()) if (!["sni", "insecure", "obfs", "obfs-password", "up", "down"].includes(key)) throw new Error(`Unsupported parameter: ${key}`);
	const password = decode(url.username);
	if (!password) throw new Error("password required");
	if (!url.hostname) throw new Error("server required");
	const port = Number(url.port);
	if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid port");
	const rawObfs = url.searchParams.get("obfs") || undefined;
	if (rawObfs && rawObfs !== "salamander") throw new Error(`Unsupported Hysteria2 obfs: ${rawObfs}`);
	const obfs = rawObfs === "salamander" ? rawObfs : undefined;
	const obfsPassword = url.searchParams.get("obfs-password") || undefined;
	if (obfsPassword && !obfs) throw new Error("obfs required when obfs-password is set");
	return {
		protocol: "hysteria2", name: decode(url.hash.slice(1)) || "Hysteria2", server: url.hostname, port, password,
		transport: { type: "tcp" },
		tls: { security: "tls", serverName: url.searchParams.get("sni") || undefined, insecure: boolean(url.searchParams.get("insecure")) },
		obfs, obfsPassword, up: bandwidth(url.searchParams.get("up")), down: bandwidth(url.searchParams.get("down")),
	};
}

export function mihomoHysteria2(node: Hy2Node): Record<string, unknown> {
	return {
		name: node.name, type: "hysteria2", server: node.server, port: node.port, password: node.password,
		...(node.ports ? { ports: node.ports.join(",") } : {}),
		...(node.up ? { up: node.up } : {}), ...(node.down ? { down: node.down } : {}),
		...(node.obfs ? { obfs: node.obfs } : {}), ...(node.obfsPassword ? { "obfs-password": node.obfsPassword } : {}),
		...(node.tls.serverName ? { sni: node.tls.serverName } : {}), ...(node.tls.insecure !== undefined ? { "skip-cert-verify": node.tls.insecure } : {}),
	};
}

export function singboxHysteria2(node: Hy2Node): Record<string, unknown> {
	return {
		type: "hysteria2", tag: node.name, server: node.server,
		...(node.ports ? { server_ports: node.ports.map((value) => value.replace("-", ":")) } : { server_port: node.port }),
		password: node.password,
		...(node.up ? { up_mbps: mbps(node.up) } : {}), ...(node.down ? { down_mbps: mbps(node.down) } : {}),
		...(node.obfs ? { obfs: { type: node.obfs, ...(node.obfsPassword ? { password: node.obfsPassword } : {}) } } : {}),
		tls: { enabled: true, ...(node.tls.serverName ? { server_name: node.tls.serverName } : {}), ...(node.tls.insecure !== undefined ? { insecure: node.tls.insecure } : {}) },
	};
}

export function hysteria2Uri(node: Hy2Node): string {
	const params = new URLSearchParams();
	if (node.tls.serverName) params.set("sni", node.tls.serverName);
	if (node.tls.insecure !== undefined) params.set("insecure", node.tls.insecure ? "1" : "0");
	if (node.obfs) params.set("obfs", node.obfs);
	if (node.obfsPassword) params.set("obfs-password", node.obfsPassword);
	if (node.up) params.set("up", node.up);
	if (node.down) params.set("down", node.down);
	return `hysteria2://${encodeURIComponent(node.password)}@${host(node.server)}:${node.port}${params.size ? `?${params}` : ""}#${encodeURIComponent(node.name)}`;
}

function bandwidth(value: string | null): string | undefined {
	if (!value) return undefined;
	const match = /^(\d+(?:\.\d+)?)\s*(?:mbps)?$/i.exec(value.trim());
	if (!match || Number(match[1]) <= 0) throw new Error("Bandwidth must be a positive Mbps value");
	return `${match[1]} Mbps`;
}

function mbps(value: string): number { return Number(value.slice(0, -5).trim()); }
function boolean(value: string | null): boolean | undefined {
	if (value === null || value === "") return undefined;
	if (value === "1" || value.toLowerCase() === "true") return true;
	if (value === "0" || value.toLowerCase() === "false") return false;
	throw new Error("Invalid boolean");
}
function decode(value: string): string { try { return decodeURIComponent(value); } catch { throw new Error("Invalid URL encoding"); } }
function host(value: string): string { return value.includes(":") ? `[${value}]` : value; }
