const MAX_REDIRECTS = 3;
const MAX_BYTES = 10 * 1024 * 1024;
const TIMEOUT_MS = 10_000;
const UPSTREAM_HEADERS = { "User-Agent": "clash.meta", Accept: "application/json, text/plain, */*" };

export class SourceError extends Error {
	constructor(public code: string, message: string, public status: number) {
		super(message);
	}
}

export const isRemoteSource = (source: string) => /^https?:\/\//i.test(source);

export interface SubscriptionProfile { name: string; upload: string; download: string; total: string; expire: string; homepage?: string; updateInterval?: number }
export interface LoadedSubscription { content: string; profile: SubscriptionProfile }

export async function loadRemoteSource(source: string): Promise<string> {
	return (await loadRemoteSubscription(source)).content;
}

export async function loadRemoteSubscription(source: string): Promise<LoadedSubscription> {
	let url = validateUrl(source);
	for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
		let response: Response;
		try {
			response = await fetch(url, { headers: UPSTREAM_HEADERS, redirect: "manual", signal: controller.signal });
		} catch (error) {
			if (error instanceof DOMException && error.name === "AbortError")
				throw new SourceError("FETCH_TIMEOUT", "Upstream subscription timed out", 504);
			throw new SourceError("FETCH_FAILED", "Unable to fetch upstream subscription", 502);
		} finally {
			clearTimeout(timeout);
		}

		if (response.status >= 300 && response.status < 400) {
			if (redirects === MAX_REDIRECTS)
				throw new SourceError("TOO_MANY_REDIRECTS", "Too many upstream redirects", 502);
			const location = response.headers.get("Location");
			if (!location) throw new SourceError("FETCH_FAILED", "Redirect has no location", 502);
			url = validateUrl(new URL(location, url).toString());
			continue;
		}
		if (!response.ok) throw new SourceError("FETCH_FAILED", `Upstream returned HTTP ${response.status}`, 502);
		return { content: await readLimitedText(response), profile: subscriptionProfile(response) };
	}
	throw new SourceError("FETCH_FAILED", "Unable to fetch upstream subscription", 502);
}

function subscriptionProfile(response: Response): SubscriptionProfile {
	const disposition = response.headers.get("Content-Disposition") ?? "";
	const userInfo = response.headers.get("Subscription-Userinfo") ?? "";
	const homepage = response.headers.get("Profile-Web-Page-Url") ?? response.headers.get("Web-Page-Url") ?? response.headers.get("Homepage") ?? response.headers.get("Website") ?? undefined;
	const interval = Number(response.headers.get("Profile-Update-Interval"));
	return {
		name: filename(disposition),
		upload: userInfo.match(/upload=(\d+)/i)?.[1] ?? "0",
		download: userInfo.match(/download=(\d+)/i)?.[1] ?? "0",
		total: userInfo.match(/total=(\d+)/i)?.[1] ?? "0",
		expire: userInfo.match(/expire=(\d+)/i)?.[1] ?? response.headers.get("Profile-Expire") ?? response.headers.get("Expires") ?? "",
		...(homepage ? { homepage: decodeHeader(homepage) } : {}),
		...(Number.isFinite(interval) && interval > 0 ? { updateInterval: interval } : {}),
	};
}

function filename(value: string): string {
	const encoded = value.match(/filename\*=UTF-8''([^;\s]+)/i)?.[1];
	if (encoded) { try { return decodeURIComponent(encoded); } catch { return encoded; } }
	return value.match(/filename="([^"]+)"/i)?.[1] ?? value.match(/filename=([^;\s]+)/i)?.[1] ?? "Sub";
}

function decodeHeader(value: string): string {
	try { return decodeURIComponent(value); } catch { return value; }
}

function validateUrl(source: string): URL {
	let url: URL;
	try {
		url = new URL(source);
	} catch {
		throw new SourceError("INVALID_INPUT", "Invalid subscription URL", 400);
	}
	if (!["http:", "https:"].includes(url.protocol))
		throw new SourceError("UNSUPPORTED_SCHEME", "Only HTTP and HTTPS URLs are supported", 400);
	if (url.username || url.password)
		throw new SourceError("INVALID_INPUT", "Subscription URL must not contain credentials", 400);
	if (isBlockedHost(url.hostname))
		throw new SourceError("PRIVATE_ADDRESS", "Local and private addresses are not allowed", 403);
	return url;
}

function isBlockedHost(hostname: string): boolean {
	const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
	if (host === "localhost" || host.endsWith(".localhost") || host === "::" || host === "::1") return true;
	const parts = /^\d+\.\d+\.\d+\.\d+$/.test(host) ? host.split(".").map(Number) : null;
	if (parts?.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
		const [a, b] = parts;
		return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) ||
			(a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
			(a === 192 && (b === 0 || b === 168)) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
	}
	return host.includes(":") && (/^(fc|fd|ff)/.test(host) || /^fe[89ab]/.test(host) || host.startsWith("2001:db8:"));
}

async function readLimitedText(response: Response): Promise<string> {
	const declared = Number(response.headers.get("Content-Length"));
	if (Number.isFinite(declared) && declared > MAX_BYTES)
		throw new SourceError("BODY_TOO_LARGE", "Upstream subscription exceeds 10 MiB", 413);
	if (!response.body) return "";

	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.byteLength;
		if (size > MAX_BYTES) {
			await reader.cancel();
			throw new SourceError("BODY_TOO_LARGE", "Upstream subscription exceeds 10 MiB", 413);
		}
		chunks.push(value);
	}
	const bytes = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	try {
		return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
	} catch {
		throw new SourceError("INVALID_INPUT", "Upstream subscription is not valid UTF-8", 422);
	}
}
