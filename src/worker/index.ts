import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { secureHeaders } from "hono/secure-headers";
import type { OutputTarget } from "./conversion/types";
import {
	createShortLink,
	blockSource,
	deleteShortLink,
	getBlockedSource,
	listAdminAudit,
	listBlockedSources,
	listConversionEvents,
	listShortLinks,
	recordAdminAudit,
	recordConversionEvent,
	recordShortLinkHit,
	resolveShortLink,
	setShortLinkEnabled,
} from "./database";
import { getCachedConversion, putCachedConversion } from "./platform/cache";
import { convertSubscription } from "./platform/conversion";
import { fingerprintSource } from "./platform/crypto";
import {
	authenticateAdmin,
	clearAdminSession,
	createAdminSession,
	enforceRateLimit,
	requireSameOrigin,
	SecurityError,
	type AdminIdentity,
	type SecurityBindings,
} from "./platform/security";
import { isRemoteSource, loadRemoteSubscription, SourceError, type SubscriptionProfile } from "./platform/source";

const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const TARGETS = new Set(["auto", "mihomo", "mihomo-provider", "clash", "singbox", "v2rayng", "preview"]);
const PROXY_URI = /^(ss|vmess|vless|trojan|hysteria2?|hy2|socks5?|anytls|snell):\/\//i;

type ConversionResult = {
	content: string;
	contentType: string;
	target: string;
	parsed: number;
	valid: number;
	rendered: number;
	skipped: number;
	warnings?: unknown[];
	filename?: string;
	profile?: SubscriptionProfile;
};

type Bindings = Env & SecurityBindings & {
	ASSETS?: Fetcher;
	DB?: D1Database;
	SUBMORPH_STORE?: KVNamespace;
	LINK_ENCRYPTION_KEY?: string;
	SOURCE_HASH_KEY?: string;
};

type Variables = { adminIdentity: AdminIdentity };
type AppEnv = { Bindings: Bindings; Variables: Variables };
const app = new Hono<AppEnv>();

app.use("*", secureHeaders({
	referrerPolicy: "no-referrer",
	xFrameOptions: "DENY",
	permissionsPolicy: { camera: [], microphone: [], geolocation: [] },
}));

app.get("/api/health", (context) => context.json({ status: "ok", version: "1.0.0" }));

app.use("/api/links", (context, next) => publicRateLimit(context, next, "links"));
app.use("/api/convert", (context, next) => publicRateLimit(context, next, "convert"));
app.use("/sub", (context, next) => publicRateLimit(context, next, "subscription"));
app.use("/s/*", (context, next) => publicRateLimit(context, next, "subscription"));

app.post("/api/links", async (context) => {
	const body = await readJsonObject(context);
	if (body instanceof Response) return body;
	const source = typeof body.source === "string" ? body.source.trim() : "";
	if (body.target !== undefined && typeof body.target !== "string")
		return errorResponse(context, "UNSUPPORTED_TARGET", "target must be a string", 400);
	const target = normalizeStoredTarget(typeof body.target === "string" ? body.target : undefined);
	if (!source) return errorResponse(context, "INVALID_INPUT", "source is required", 400);
	if (!target) return errorResponse(context, "UNSUPPORTED_TARGET", "Unsupported target", 400);
	const resources = storage(context);
	if (!resources) return errorResponse(context, "STORAGE_UNAVAILABLE", "Short links are not configured", 503);
	const link = await createShortLink(resources.db, resources, { source, outputTarget: target });
	return context.json({ id: link.id, url: `${new URL(context.req.url).origin}/s/${link.id}`, target: link.outputTarget });
});

app.get("/s/:id", async (context) => {
	const resources = storage(context);
	if (!resources) return errorResponse(context, "STORAGE_UNAVAILABLE", "Short links are not configured", 503);
	const resolved = await resolveShortLink(resources.db, resources.LINK_ENCRYPTION_KEY, context.req.param("id"));
	if (!resolved) return errorResponse(context, "LINK_NOT_FOUND", "Short link not found or disabled", 404);
	const response = await handleConversion(context, resolved.source, resolved.link.outputTarget);
	background(context, recordShortLinkHit(resources.db, resolved.link.id));
	return response;
});

app.use("/api/admin/login", (context, next) => publicRateLimit(context, next, "admin-login"));

app.use("/api/admin/*", async (context, next) => {
	if (!["GET", "HEAD", "OPTIONS"].includes(context.req.method)) {
		try { requireSameOrigin(context.req.raw); }
		catch (error) { return securityResponse(context, error); }
	}
	await next();
});

app.use("/api/admin/*", async (context, next) => {
	if (context.req.path === "/api/admin/login" || context.req.path === "/api/admin/logout") return next();
	try { context.set("adminIdentity", await authenticateAdmin(context.req.raw, context.env)); }
	catch (error) { return securityResponse(context, error); }
	await next();
});

app.post("/api/admin/login", async (context) => {
	const body = await readJsonObject(context); if (body instanceof Response) return body;
	try {
		const session = await createAdminSession(context.req.raw, context.env, body.username, body.password);
		context.header("Set-Cookie", session.cookie);
		return context.json({ user: { username: session.identity.username } });
	} catch (error) { return securityResponse(context, error); }
});

app.get("/api/admin/session", (context) => context.json({ user: { username: context.get("adminIdentity").username } }));

app.post("/api/admin/logout", (context) => {
	context.header("Set-Cookie", clearAdminSession(context.req.raw));
	return context.json({ success: true });
});

app.get("/api/admin/overview", async (context) => {
	const db = context.env.DB;
	if (!db) return errorResponse(context, "STORAGE_UNAVAILABLE", "Database is not configured", 503);
	const row = await db.prepare(`SELECT COUNT(*) total, SUM(success) successful,
		SUM(cache_hit) cache_hits, AVG(duration_ms) average_duration_ms,
		SUM(CASE WHEN created_at >= datetime('now', '-1 day') THEN 1 ELSE 0 END) today
		FROM conversion_events`).first<Record<string, number | null>>();
	const recent = await db.prepare(`SELECT substr(created_at, 1, 10) day, COUNT(*) value FROM conversion_events
		WHERE created_at >= datetime('now', '-7 day') GROUP BY day ORDER BY day`).all<{ day: string; value: number }>();
	const total = Number(row?.total ?? 0), successful = Number(row?.successful ?? 0), cacheHits = Number(row?.cache_hits ?? 0);
	return context.json({ todayConversions: Number(row?.today ?? 0), successRate: total ? Math.round(successful / total * 1000) / 10 : 0,
		cacheHitRate: total ? Math.round(cacheHits / total * 1000) / 10 : 0, averageDuration: Math.round(Number(row?.average_duration_ms ?? 0)), trend: recent.results });
});

app.get("/api/admin/conversions", async (context) => paged(context, await listConversionEvents(requireDb(context), pageSize(context), pageOffset(context))));
app.get("/api/admin/links", async (context) => paged(context, await listShortLinks(requireDb(context), pageSize(context), pageOffset(context))));
app.get("/api/admin/blocked-sources", async (context) => paged(context, await listBlockedSources(requireDb(context), pageSize(context), pageOffset(context))));
app.get("/api/admin/audit", async (context) => paged(context, await listAdminAudit(requireDb(context), pageSize(context), pageOffset(context))));

app.post("/api/admin/blocked-sources", async (context) => {
	const body = await readJsonObject(context); if (body instanceof Response) return body;
	const source = typeof body.source === "string" ? body.source.trim() : "";
	if (!source || !context.env.SOURCE_HASH_KEY) return errorResponse(context, "INVALID_INPUT", "source is required", 400);
	const fingerprint = await blockSource(requireDb(context), context.env.SOURCE_HASH_KEY, { source, hostname: hostname(source), reason: typeof body.reason === "string" ? body.reason : undefined, actor: context.get("adminIdentity").actor });
	await audit(context, "source.block", "blocked_source", fingerprint);
	return context.json({ success: true, fingerprint });
});

app.patch("/api/admin/links/:id", async (context) => {
	const body = await readJsonObject(context); if (body instanceof Response) return body;
	const changed = await setShortLinkEnabled(requireDb(context), context.req.param("id"), body.enabled === true);
	await audit(context, "link.update", "short_link", context.req.param("id"), { enabled: body.enabled === true });
	return context.json({ success: changed });
});

app.delete("/api/admin/links/:id", async (context) => {
	const changed = await deleteShortLink(requireDb(context), context.req.param("id"));
	await audit(context, "link.delete", "short_link", context.req.param("id"));
	return context.json({ success: changed });
});

app.delete("/api/admin/blocked-sources/:id", async (context) => {
	const result = await requireDb(context).prepare("DELETE FROM blocked_sources WHERE id = ?").bind(context.req.param("id")).run();
	await audit(context, "source.unblock", "blocked_source", context.req.param("id"));
	return context.json({ success: result.meta.changes > 0 });
});

app.get("/sub", async (context) => {
	const source = context.req.query("url")?.trim();
	if (!source) return errorResponse(context, "INVALID_INPUT", "Missing url parameter", 400);
	if (!isRemoteSource(source) && !PROXY_URI.test(source))
		return errorResponse(context, "INVALID_INPUT", "url must be HTTP, HTTPS, or a supported proxy URI", 400);
	return handleConversion(context, source, context.req.query("target"));
});

app.post("/api/convert", async (context) => {
	const declared = Number(context.req.header("Content-Length"));
	if (Number.isFinite(declared) && declared > MAX_SOURCE_BYTES)
		return errorResponse(context, "BODY_TOO_LARGE", "Request body exceeds 10 MiB", 413);

	let body: unknown;
	try {
		body = await context.req.json();
	} catch {
		return errorResponse(context, "INVALID_INPUT", "Request body must be valid JSON", 400);
	}
	if (!body || typeof body !== "object")
		return errorResponse(context, "INVALID_INPUT", "Request body must be an object", 400);
	const { source, target } = body as Record<string, unknown>;
	if (typeof source !== "string" || !source.trim())
		return errorResponse(context, "INVALID_INPUT", "source must be a non-empty string", 400);
	if (new TextEncoder().encode(source).byteLength > MAX_SOURCE_BYTES)
		return errorResponse(context, "BODY_TOO_LARGE", "source exceeds 10 MiB", 413);
	if (target !== undefined && typeof target !== "string")
		return errorResponse(context, "UNSUPPORTED_TARGET", "target must be a string", 400);
	return handleConversion(context, source.trim(), target as string | undefined);
});

app.notFound((context) => {
	if (context.req.path.startsWith("/api/") || context.req.path === "/sub")
		return errorResponse(context, "NOT_FOUND", "API route not found", 404);
	if (["GET", "HEAD"].includes(context.req.method) && context.env.ASSETS)
		return context.env.ASSETS.fetch(context.req.raw);
	return context.text("Not Found", 404);
});

app.onError((error, context) => {
	console.error("request_failed", { path: context.req.path, error: error instanceof Error ? error.name : "unknown" });
	return errorResponse(context, "INTERNAL_ERROR", "Internal server error", 500);
});

async function handleConversion(
	context: Context<AppEnv>,
	source: string,
	targetValue: string | undefined,
) {
	const startedAt = performance.now();
	const target = normalizeTarget(targetValue, context.req.header("User-Agent"));
	if (!target) return errorResponse(context, "UNSUPPORTED_TARGET", "Unsupported target", 400);

	try {
		if (context.env.DB && context.env.SOURCE_HASH_KEY && await getBlockedSource(context.env.DB, context.env.SOURCE_HASH_KEY, source))
			return errorResponse(context, "BLOCKED_SOURCE", "This subscription source is blocked", 403);
		const remote = isRemoteSource(source);
		const loaded = remote ? await loadRemoteSubscription(source) : { content: source, profile: { name: "Me", upload: "0", download: "0", total: "0", expire: "" } };
		const profile = { ...loaded.profile, homepage: loaded.profile.homepage || new URL(context.req.url).origin };
		const fingerprint = context.env.SOURCE_HASH_KEY ? await fingerprintSource(source, context.env.SOURCE_HASH_KEY) : "local";
		const cacheKey = { sourceFingerprint: fingerprint, target, policyVersion: "legacy-compatible-v2", rendererVersion: "legacy-profiles-v2" };
		const cached = context.env.SUBMORPH_STORE ? await getCachedConversion(context.env.SUBMORPH_STORE, cacheKey) : null;
		const result = (cached ?? { ...await convertSubscription({ source: loaded.content, target: target as OutputTarget, formatNames: remote, isAirportSubscription: remote }), profile }) as ConversionResult;
		if (!cached && context.env.SUBMORPH_STORE) background(context, putCachedConversion(context.env.SUBMORPH_STORE, cacheKey, { ...result, warnings: result.warnings ?? [] }));
		if (context.env.DB) background(context, recordConversionEvent(context.env.DB, {
			sourceFingerprint: fingerprint, sourceHostname: hostname(source), target, clientFamily: clientFamily(context.req.header("User-Agent")),
			success: true, cacheHit: Boolean(cached), nodeCount: result.rendered, durationMs: performance.now() - startedAt,
		}));
		return conversionResponse(context, result, performance.now() - startedAt);
	} catch (error) {
		if (context.env.DB && context.env.SOURCE_HASH_KEY) {
			const fingerprint = await fingerprintSource(source, context.env.SOURCE_HASH_KEY);
			background(context, recordConversionEvent(context.env.DB, { sourceFingerprint: fingerprint, sourceHostname: hostname(source), target,
				clientFamily: clientFamily(context.req.header("User-Agent")), success: false, durationMs: performance.now() - startedAt,
				errorCode: error instanceof SourceError || isConversionError(error) ? error.code : "INTERNAL_ERROR" }));
		}
		if (error instanceof SourceError) return errorResponse(context, error.code, error.message, error.status);
		if (isConversionError(error)) return errorResponse(context, error.code, error.message, error.status ?? 422);
		throw error;
	}
}

const SING_BOX_USER_AGENT = /sing-box|SFA|SFI|SFM|SFT/i;
const V2RAY_USER_AGENT = /v2ray(?:ng|n)|quantumult|shadowrocket|surge|loon/i;
const MIHOMO_USER_AGENT = /mihomo|clash(?:\.meta|x)?|stash/i;
const BROWSER_USER_AGENT = /mozilla|chrome|safari|firefox|edge/i;

export function targetForUserAgent(userAgent = ""): "singbox" | "v2rayng" | "mihomo" | "preview" {
	if (SING_BOX_USER_AGENT.test(userAgent)) return "singbox";
	if (V2RAY_USER_AGENT.test(userAgent)) return "v2rayng";
	if (BROWSER_USER_AGENT.test(userAgent) && !MIHOMO_USER_AGENT.test(userAgent)) return "preview";
	return "mihomo";
}

function normalizeTarget(target: string | undefined, userAgent = ""): string | null {
	const requested = (target?.trim() || "auto").toLowerCase();
	if (!TARGETS.has(requested)) return null;
	if (requested === "clash") return "mihomo";
	if (requested !== "auto") return requested;
	return targetForUserAgent(userAgent);
}

function normalizeStoredTarget(target: string | undefined): string | null {
	const requested = (target?.trim() || "auto").toLowerCase();
	if (!TARGETS.has(requested)) return null;
	return requested === "clash" ? "mihomo" : requested;
}

function conversionResponse(context: Context<AppEnv>, result: ConversionResult, duration: number) {
	context.header("Content-Type", result.contentType);
	context.header("Cache-Control", "private, no-store");
	context.header("X-SubMorph-Target", result.target);
	context.header("X-SubMorph-Parsed", String(result.parsed));
	context.header("X-SubMorph-Valid", String(result.valid));
	context.header("X-SubMorph-Rendered", String(result.rendered));
	context.header("X-SubMorph-Skipped", String(result.skipped));
	context.header("X-SubMorph-Warning-Count", String(result.warnings?.length ?? 0));
	context.header("X-SubMorph-Duration-Ms", String(Math.round(duration)));
	if (result.contentType !== "text/html; charset=utf-8" && result.profile) applyProfileHeaders(context, result.profile);
	else if (result.filename) context.header("Content-Disposition", 'inline; filename="' + result.filename.replace(/["\r\n]/g, "") + '"');
	return context.body(result.content);
}

function applyProfileHeaders(context: Context<AppEnv>, profile: SubscriptionProfile) {
	context.header("Content-Disposition", "attachment; filename*=UTF-8''" + encodeURIComponent(profile.name));
	context.header("Profile-Title", base64Utf8(profile.name));
	context.header("Profile-Update-Interval", String(profile.updateInterval ?? 24));
	if (profile.homepage) context.header("Profile-Web-Page-Url", safeHeaderUrl(profile.homepage));
	if (profile.expire) { context.header("Profile-Expire", profile.expire); context.header("Expires", profile.expire); }
	if ([profile.upload, profile.download, profile.total].some((value) => Number(value) > 0) || profile.expire)
		context.header("Subscription-Userinfo", "upload=" + profile.upload + "; download=" + profile.download + "; total=" + profile.total + "; expire=" + profile.expire);
}

function base64Utf8(value: string): string { const bytes = new TextEncoder().encode(value); let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary); }
function safeHeaderUrl(value: string): string { try { return new URL(value).toString(); } catch { return encodeURIComponent(value); } }

function errorResponse(context: Context<AppEnv>, code: string, message: string, status: number) {
	context.header("Cache-Control", "no-store");
	return context.json({ error: { code, message } }, status as ContentfulStatusCode);
}

function isConversionError(error: unknown): error is { code: string; message: string; status?: number } {
	return error instanceof Error && "code" in error && typeof (error as { code?: unknown }).code === "string";
}

function storage(context: Context<AppEnv>) {
	const { DB: db, LINK_ENCRYPTION_KEY, SOURCE_HASH_KEY } = context.env;
	return db && LINK_ENCRYPTION_KEY && SOURCE_HASH_KEY ? { db, LINK_ENCRYPTION_KEY, SOURCE_HASH_KEY } : null;
}

function requireDb(context: Context<AppEnv>): D1Database {
	if (!context.env.DB) throw new SourceError("STORAGE_UNAVAILABLE", "Database is not configured", 503);
	return context.env.DB;
}

async function readJsonObject(context: Context<AppEnv>): Promise<Record<string, unknown> | Response> {
	try { const value: unknown = await context.req.json(); return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : errorResponse(context, "INVALID_INPUT", "JSON object required", 400); }
	catch { return errorResponse(context, "INVALID_INPUT", "Valid JSON required", 400); }
}

function pageSize(context: Context<AppEnv>) { return Math.min(100, Math.max(1, Number(context.req.query("limit")) || 25)); }
function pageOffset(context: Context<AppEnv>) { return (Math.max(1, Number(context.req.query("page")) || 1) - 1) * pageSize(context); }
function paged(context: Context<AppEnv>, items: unknown[]) { const page = Math.max(1, Number(context.req.query("page")) || 1); return context.json({ items, page, totalPages: items.length < pageSize(context) ? page : page + 1, total: pageOffset(context) + items.length }); }
function hostname(source: string) { try { return new URL(source).hostname; } catch { return undefined; } }
function clientFamily(userAgent = "") { if (SING_BOX_USER_AGENT.test(userAgent)) return "sing-box"; if (V2RAY_USER_AGENT.test(userAgent)) return "v2rayNG"; if (MIHOMO_USER_AGENT.test(userAgent)) return "Mihomo"; return "unknown"; }
async function audit(context: Context<AppEnv>, action: string, targetType: string, targetId: string, metadata?: Record<string, unknown>) {
	if (context.env.DB) await recordAdminAudit(context.env.DB, { actorEmail: context.get("adminIdentity")?.actor ?? "unknown", action, targetType, targetId, metadata });
}
function background(context: Context<AppEnv>, promise: Promise<unknown>) {
	try { context.executionCtx.waitUntil(promise); } catch { void promise.catch(() => undefined); }
}

async function publicRateLimit(context: Context<AppEnv>, next: () => Promise<void>, bucket: string) {
	try { await enforceRateLimit(context.req.raw, context.env, bucket); }
	catch (error) { return securityResponse(context, error); }
	await next();
}

function securityResponse(context: Context<AppEnv>, error: unknown) {
	if (!(error instanceof SecurityError)) throw error;
	if (error.status === 429) context.header("Retry-After", "60");
	return errorResponse(context, error.code, error.message, error.status);
}

export default app;
