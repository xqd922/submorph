export interface Socks5Node {
	protocol: "socks5";
	name: string;
	server: string;
	port: number;
	username?: string;
	password?: string;
	transport: { type: "tcp" };
}

export function parseSocks5(uri: string): Socks5Node {
	let url: URL;
	try {
		url = new URL(uri);
	} catch {
		throw new Error("Invalid SOCKS5 URI");
	}
	if (url.protocol !== "socks:" && url.protocol !== "socks5:") throw new Error("Unsupported SOCKS5 scheme");
	if (url.search || (url.pathname && url.pathname !== "/")) throw new Error("Unsupported SOCKS5 URI options");

	const server = url.hostname.replace(/^\[|\]$/g, "");
	const port = Number(url.port);
	if (!server) throw new Error("SOCKS5 server required");
	if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid SOCKS5 port");

	const credentials = parseCredentials(uri);
	return {
		protocol: "socks5",
		name: decode(url.hash.slice(1)) || "SOCKS5",
		server,
		port,
		...credentials,
		transport: { type: "tcp" },
	};
}

export function mihomoSocks5(node: Socks5Node): Record<string, unknown> {
	validate(node);
	return {
		name: node.name,
		type: "socks5",
		server: node.server,
		port: node.port,
		...authentication(node),
	};
}

export function singboxSocks5(node: Socks5Node): Record<string, unknown> {
	validate(node);
	return {
		type: "socks",
		tag: node.name,
		server: node.server,
		server_port: node.port,
		...authentication(node),
	};
}

export function socks5Uri(node: Socks5Node): string {
	validate(node);
	const credentials = base64url(`${node.username ?? ""}:${node.password ?? ""}`);
	return `socks://${credentials}@${host(node.server)}:${node.port}#${encodeURIComponent(node.name)}`;
}

function parseCredentials(uri: string): Pick<Socks5Node, "username" | "password"> {
	const authority = uri.slice(uri.indexOf("//") + 2).split(/[/?#]/, 1)[0] ?? "";
	const at = authority.lastIndexOf("@");
	if (at < 0) return {};

	const userInfo = decode(authority.slice(0, at));
	const credentials = userInfo.includes(":") ? userInfo : decodeBase64url(userInfo);
	const colon = credentials.indexOf(":");
	if (colon < 0) throw new Error("Invalid SOCKS5 credentials");
	return { username: credentials.slice(0, colon), password: credentials.slice(colon + 1) };
}

function authentication(node: Socks5Node): Record<string, string> {
	if (node.username === undefined && node.password === undefined) return {};
	return { username: node.username ?? "", password: node.password ?? "" };
}

function validate(node: Socks5Node): void {
	if (!node.name) throw new Error("SOCKS5 name required");
	if (!node.server) throw new Error("SOCKS5 server required");
	if (!Number.isInteger(node.port) || node.port < 1 || node.port > 65535) throw new Error("Invalid SOCKS5 port");
}

function host(value: string): string {
	return value.includes(":") ? `[${value}]` : value;
}

function decode(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		throw new Error("Invalid SOCKS5 encoding");
	}
}

function decodeBase64url(value: string): string {
	try {
		const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
		const bytes = Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0));
		return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
	} catch {
		throw new Error("Invalid SOCKS5 credentials");
	}
}

function base64url(value: string): string {
	const bytes = new TextEncoder().encode(value);
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
