import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { secureHeaders } from "hono/secure-headers";
import type { OutputTarget } from "./conversion/types";
import { convertSubscription } from "./platform/conversion";
import { isRemoteSource, loadRemoteSource, SourceError } from "./platform/source";

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
};

const app = new Hono<{ Bindings: Env }>();

app.use("*", secureHeaders({
	referrerPolicy: "no-referrer",
	xFrameOptions: "DENY",
	permissionsPolicy: { camera: [], microphone: [], geolocation: [] },
}));

app.get("/api/health", (context) => context.json({ status: "ok", version: "0.1.0" }));

app.get("/sub", async (context) => {
	const source = context.req.query("url")?.trim();
	if (!source) return errorResponse(context, "INVALID_INPUT", "Missing url parameter", 400);
	if (!isRemoteSource(source) && !PROXY_URI.test(source))
		return errorResponse(context, "INVALID_INPUT", "url must be HTTP, HTTPS, or a supported proxy URI", 400);
	return handleConversion(context, source, context.req.query("target"), false);
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
	return handleConversion(context, source.trim(), target as string | undefined, true);
});

app.notFound((context) => {
	if (context.req.path.startsWith("/api/") || context.req.path === "/sub")
		return errorResponse(context, "NOT_FOUND", "API route not found", 404);
	return context.notFound();
});

app.onError((error, context) => {
	console.error("request_failed", { path: context.req.path, error: error instanceof Error ? error.name : "unknown" });
	return errorResponse(context, "INTERNAL_ERROR", "Internal server error", 500);
});

async function handleConversion(
	context: Context,
	source: string,
	targetValue: string | undefined,
	allowPastedContent: boolean,
) {
	const startedAt = performance.now();
	const target = normalizeTarget(targetValue, context.req.header("User-Agent"));
	if (!target) return errorResponse(context, "UNSUPPORTED_TARGET", "Unsupported target", 400);

	try {
		const content = isRemoteSource(source) ? await loadRemoteSource(source) : source;
		if (!allowPastedContent && !PROXY_URI.test(content))
			return errorResponse(context, "INVALID_INPUT", "GET /sub accepts one proxy URI or a remote URL", 400);
		const result = await convertSubscription({ source: content, target: target as OutputTarget }) as ConversionResult;
		return conversionResponse(context, result, performance.now() - startedAt);
	} catch (error) {
		if (error instanceof SourceError) return errorResponse(context, error.code, error.message, error.status);
		if (isConversionError(error)) return errorResponse(context, error.code, error.message, error.status ?? 422);
		throw error;
	}
}

function normalizeTarget(target: string | undefined, userAgent = ""): string | null {
	const requested = (target || "auto").toLowerCase();
	if (!TARGETS.has(requested)) return null;
	if (requested === "clash") return "mihomo";
	if (requested !== "auto") return requested;
	if (/sing-box/i.test(userAgent)) return "singbox";
	if (/v2rayng/i.test(userAgent)) return "v2rayng";
	return "mihomo";
}

function conversionResponse(context: Context, result: ConversionResult, duration: number) {
	context.header("Content-Type", result.contentType);
	context.header("Cache-Control", "private, no-store");
	context.header("X-SubMorph-Target", result.target);
	context.header("X-SubMorph-Parsed", String(result.parsed));
	context.header("X-SubMorph-Valid", String(result.valid));
	context.header("X-SubMorph-Rendered", String(result.rendered));
	context.header("X-SubMorph-Skipped", String(result.skipped));
	context.header("X-SubMorph-Warning-Count", String(result.warnings?.length ?? 0));
	context.header("X-SubMorph-Duration-Ms", String(Math.round(duration)));
	if (result.filename) context.header("Content-Disposition", `inline; filename="${result.filename.replace(/["\r\n]/g, "")}"`);
	return context.body(result.content);
}

function errorResponse(context: Context, code: string, message: string, status: number) {
	context.header("Cache-Control", "no-store");
	return context.json({ error: { code, message } }, status as ContentfulStatusCode);
}

function isConversionError(error: unknown): error is { code: string; message: string; status?: number } {
	return error instanceof Error && "code" in error && typeof (error as { code?: unknown }).code === "string";
}

export default app;
