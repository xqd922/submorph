const SESSION_COOKIE = "submorph_admin";
const SESSION_SECONDS = 12 * 60 * 60;

export type SecurityBindings = {
	ADMIN_USERNAME?: string;
	ADMIN_PASSWORD?: string;
	RATE_LIMITER?: RateLimit;
	LOGIN_RATE_LIMITER?: RateLimit;
};

export type AdminIdentity = { actor: string; username: string };

export class SecurityError extends Error {
	constructor(public readonly code: string, message: string, public readonly status: number) {
		super(message);
		this.name = "SecurityError";
	}
}

export async function createAdminSession(
	request: Request,
	env: SecurityBindings,
	username: unknown,
	password: unknown,
): Promise<{ cookie: string; identity: AdminIdentity }> {
	const configuredPassword = env.ADMIN_PASSWORD;
	if (!configuredPassword)
		throw new SecurityError("ADMIN_NOT_CONFIGURED", "Administrator password is not configured", 503);
	const configuredUsername = env.ADMIN_USERNAME?.trim() || "admin";
	const suppliedUsername = typeof username === "string" ? username.trim() : "";
	const suppliedPassword = typeof password === "string" ? password : "";
	const [usernameMatches, passwordMatches] = await Promise.all([
		equal(suppliedUsername, configuredUsername),
		equal(suppliedPassword, configuredPassword),
	]);
	if (!usernameMatches || !passwordMatches)
		throw new SecurityError("INVALID_CREDENTIALS", "用户名或密码错误", 401);
	const token = await signSession({ username: configuredUsername, expiresAt: Date.now() + SESSION_SECONDS * 1_000 }, configuredPassword);
	return { cookie: serializeCookie(request, token, SESSION_SECONDS), identity: { actor: configuredUsername, username: configuredUsername } };
}

export async function authenticateAdmin(request: Request, env: SecurityBindings): Promise<AdminIdentity> {
	const configuredPassword = env.ADMIN_PASSWORD;
	if (!configuredPassword)
		throw new SecurityError("ADMIN_NOT_CONFIGURED", "Administrator password is not configured", 503);
	const token = readCookie(request, SESSION_COOKIE);
	if (!token) throw new SecurityError("UNAUTHORIZED", "Administrator session required", 401);
	const session = await verifySession(token, configuredPassword);
	const configuredUsername = env.ADMIN_USERNAME?.trim() || "admin";
	if (!session || session.username !== configuredUsername || session.expiresAt <= Date.now())
		throw new SecurityError("UNAUTHORIZED", "Administrator session invalid or expired", 401);
	return { actor: session.username, username: session.username };
}

export function clearAdminSession(request: Request): string {
	return serializeCookie(request, "", 0);
}

export function requireSameOrigin(request: Request): void {
	const origin = request.headers.get("Origin");
	if (!origin) throw new SecurityError("ORIGIN_REQUIRED", "Origin header required", 403);
	let supplied: string;
	try { supplied = new URL(origin).origin; }
	catch { throw new SecurityError("ORIGIN_INVALID", "Invalid Origin header", 403); }
	if (supplied !== new URL(request.url).origin)
		throw new SecurityError("ORIGIN_MISMATCH", "Cross-origin administration request rejected", 403);
}

export async function enforceRateLimit(request: Request, env: SecurityBindings, bucket: string): Promise<void> {
	const limiter = bucket === "admin-login" ? env.LOGIN_RATE_LIMITER : env.RATE_LIMITER;
	if (!limiter) {
		if (isLoopback(request)) return;
		throw new SecurityError("RATE_LIMIT_NOT_CONFIGURED", "Rate limiting is not configured", 503);
	}
	const actor = request.headers.get("CF-Connecting-IP") ?? "unknown";
	const { success } = await limiter.limit({ key: `${bucket}:${actor}` });
	if (!success) throw new SecurityError("RATE_LIMITED", "Too many requests", 429);
}

type Session = { username: string; expiresAt: number };

async function signSession(session: Session, password: string): Promise<string> {
	const payload = base64url(new TextEncoder().encode(JSON.stringify(session)));
	return `${payload}.${base64url(new Uint8Array(await crypto.subtle.sign("HMAC", await sessionKey(password), new TextEncoder().encode(payload))))}`;
}

async function verifySession(token: string, password: string): Promise<Session | null> {
	const [payload, signature, extra] = token.split(".");
	if (!payload || !signature || extra) return null;
	let supplied: Uint8Array;
	try { supplied = fromBase64url(signature); }
	catch { return null; }
	const valid = await crypto.subtle.verify("HMAC", await sessionKey(password), supplied, new TextEncoder().encode(payload));
	if (!valid) return null;
	try {
		const parsed: unknown = JSON.parse(new TextDecoder().decode(fromBase64url(payload)));
		if (!parsed || typeof parsed !== "object") return null;
		const value = parsed as Record<string, unknown>;
		return typeof value.username === "string" && typeof value.expiresAt === "number" ? { username: value.username, expiresAt: value.expiresAt } : null;
	} catch { return null; }
}

async function sessionKey(password: string): Promise<CryptoKey> {
	const material = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`submorph-admin-session-v1:${password}`));
	return crypto.subtle.importKey("raw", material, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

function serializeCookie(request: Request, value: string, maxAge: number): string {
	return `${SESSION_COOKIE}=${value}; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}

function readCookie(request: Request, name: string): string | undefined {
	for (const item of (request.headers.get("Cookie") ?? "").split(";")) {
		const index = item.indexOf("=");
		if (index > 0 && item.slice(0, index).trim() === name) return item.slice(index + 1).trim();
	}
}

function base64url(value: Uint8Array): string {
	let binary = "";
	for (const byte of value) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64url(value: string): Uint8Array {
	const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "="));
	return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function isLoopback(request: Request): boolean {
	const hostname = new URL(request.url).hostname.replace(/^\[|\]$/g, "");
	return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

async function equal(left: string, right: string): Promise<boolean> {
	const [a, b] = await Promise.all([left, right].map((value) => crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
	const x = new Uint8Array(a), y = new Uint8Array(b);
	let difference = 0;
	for (let index = 0; index < x.length; index++) difference |= x[index] ^ y[index];
	return difference === 0;
}
