import { afterEach, describe, expect, it, vi } from "vitest";
import app, { targetForUserAgent } from "./index";

const ss = "ss://YWVzLTI1Ni1nY206cGFzc3dvcmQ@ss.example.com:8388#Demo";

afterEach(() => vi.unstubAllGlobals());

function shortLinkEnvironment() {
	let stored: Record<string, unknown> | null = null;
	const db = {
		prepare(query: string) {
			let values: unknown[] = [];
			const statement = {
				bind(...bound: unknown[]) { values = bound; return statement; },
				async first() {
					if (query.includes("WHERE target_fingerprint")) return null;
					if (query.includes("WHERE id = ?")) return stored;
					return null;
				},
				async run() {
					if (query.includes("INSERT INTO short_links")) stored = {
						id: values[0], encrypted_target: values[1], encryption_iv: values[2], target_fingerprint: values[3],
						output_target: values[4], enabled: 1, hit_count: 0, created_at: values[5], last_accessed_at: null,
					};
					return { meta: { changes: 1 } };
				},
			};
			return statement;
		},
	} as unknown as D1Database;
	const key = btoa(String.fromCharCode(...new Uint8Array(32))).replace(/=+$/, "");
	return { DB: db, LINK_ENCRYPTION_KEY: key, SOURCE_HASH_KEY: "test-source-key" };
}

describe("worker routes", () => {
	it("reports health", async () => {
		const response = await app.request("/api/health", undefined, {});
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ status: "ok", version: "1.0.0" });
	});

	it("serves frontend routes through the static asset fallback", async () => {
		const fetch = vi.fn().mockResolvedValue(new Response("<!doctype html><title>SubMorph</title>", { headers: { "Content-Type": "text/html" } }));
		const response = await app.request("/admin", undefined, { ASSETS: { fetch } as unknown as Fetcher });
		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toContain("text/html");
		expect(fetch).toHaveBeenCalledOnce();
	});

	it("converts a proxy URI through GET /sub", async () => {
		const response = await app.request(`/sub?target=mihomo-provider&url=${encodeURIComponent(ss)}`, undefined, {});
		expect(response.status).toBe(200);
		expect(response.headers.get("x-submorph-rendered")).toBe("1");
		expect(await response.text()).toContain("type: ss");
	});

	it.each([
		["sing-box/1.13.14", "singbox"],
		["SFA/1.12", "singbox"],
		["SFI/1.12", "singbox"],
		["v2rayNG/1.10.0", "v2rayng"],
		["Shadowrocket/2.2", "v2rayng"],
		["v2rayN/7.0", "v2rayng"],
		["Mihomo/1.19", "mihomo"],
		["Clash.Meta/1.18", "mihomo"],
		["ClashX Pro/1.0", "mihomo"],
		["Stash/2.6", "mihomo"],
		["Mozilla/5.0", "preview"],
		["", "mihomo"],
	])("selects an automatic target for %s", (userAgent, target) => {
		expect(targetForUserAgent(userAgent)).toBe(target);
	});

	it.each([
		["sing-box/1.13.14", "singbox"],
		["v2rayN/7.0", "v2rayng"],
		["Clash.Meta/1.18", "mihomo"],
		["Unknown/1.0", "mihomo"],
	])("uses the User-Agent when target is omitted", async (userAgent, target) => {
		const response = await app.request(`/sub?url=${encodeURIComponent(ss)}`, { headers: { "User-Agent": userAgent } }, {});
		expect(response.status).toBe(200);
		expect(response.headers.get("x-submorph-target")).toBe(target);
	});

	it("keeps an explicit target ahead of User-Agent detection", async () => {
		const response = await app.request(`/sub?target=preview&url=${encodeURIComponent(ss)}`, { headers: { "User-Agent": "sing-box/1.13.14" } }, {});
		expect(response.status).toBe(200);
		expect(response.headers.get("x-submorph-target")).toBe("preview");
	});

	it("keeps the clash target alias compatible", async () => {
		const response = await app.request(`/sub?target=clash&url=${encodeURIComponent(ss)}`, undefined, {});
		expect(response.status).toBe(200);
		expect(response.headers.get("x-submorph-target")).toBe("mihomo");
	});

	it("stores omitted short-link targets as auto and resolves them at access time", async () => {
		const environment = shortLinkEnvironment();
		const created = await app.request("/api/links", {
			method: "POST",
			headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
			body: JSON.stringify({ source: ss }),
		}, environment);
		expect(created.status).toBe(200);
		const link = await created.json() as { id: string; target: string };
		expect(link.target).toBe("auto");

		const resolved = await app.request(`/s/${link.id}`, { headers: { "User-Agent": "v2rayN/7.0" } }, environment);
		expect(resolved.status).toBe(200);
		expect(resolved.headers.get("x-submorph-target")).toBe("v2rayng");
	});

	it("rejects a non-string short-link target instead of treating it as auto", async () => {
		const response = await app.request("/api/links", {
			method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: ss, target: 1 }),
		}, shortLinkEnvironment());
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: { code: "UNSUPPORTED_TARGET", message: "target must be a string" } });
	});

	it("rejects public conversions when the rate limit is exhausted", async () => {
		const RATE_LIMITER = { limit: vi.fn().mockResolvedValue({ success: false }) } as unknown as RateLimit;
		const response = await app.request(`/sub?url=${encodeURIComponent(ss)}`, undefined, { RATE_LIMITER });
		expect(response.status).toBe(429);
		expect(response.headers.get("Retry-After")).toBe("60");
	});

	it("rate limits administrator login attempts", async () => {
		const LOGIN_RATE_LIMITER = { limit: vi.fn().mockResolvedValue({ success: false }) } as unknown as RateLimit;
		const response = await app.request("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost" }, body: JSON.stringify({ username: "admin", password: "password" }) }, { LOGIN_RATE_LIMITER, ADMIN_PASSWORD: "password" });
		expect(response.status).toBe(429);
	});

	it("uses a signed session and requires same-origin administration mutations", async () => {
		const environment = { ...shortLinkEnvironment(), ADMIN_USERNAME: "admin", ADMIN_PASSWORD: "password" };
		const login = await app.request("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost" }, body: JSON.stringify({ username: "admin", password: "password" }) }, environment);
		expect(login.status).toBe(200);
		const cookie = login.headers.get("Set-Cookie")?.split(";", 1)[0] ?? "";
		const session = await app.request("/api/admin/session", { headers: { Cookie: cookie } }, environment);
		expect(session.status).toBe(200);
		const headers = { "Content-Type": "application/json", Cookie: cookie };
		const rejected = await app.request("/api/admin/links/demo", { method: "PATCH", headers, body: JSON.stringify({ enabled: false }) }, environment);
		expect(rejected.status).toBe(403);
		const accepted = await app.request("/api/admin/links/demo", { method: "PATCH", headers: { ...headers, Origin: "http://localhost" }, body: JSON.stringify({ enabled: false }) }, environment);
		expect(accepted.status).toBe(200);
		const logout = await app.request("/api/admin/logout", { method: "POST", headers: { Cookie: cookie, Origin: "http://localhost" } }, environment);
		expect(logout.headers.get("Set-Cookie")).toContain("Max-Age=0");
	});

	it("converts pasted content through POST /api/convert", async () => {
		const response = await app.request("/api/convert", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ source: ss, target: "preview" }),
		}, {});
		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toContain("text/html");
		const body = await response.text();
		expect(body).toContain("Clash / Mihomo");
		expect(body).toContain("sing-box");
	});

	it("accepts a remote Mihomo YAML subscription on GET /sub", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(`proxies:\n  - name: 香港 0.2x\n    type: trojan\n    server: remote.example.com\n    port: 443\n    password: secret\n`, { headers: { "Content-Disposition": "attachment; filename*=UTF-8''%E6%B5%8B%E8%AF%95%E8%AE%A2%E9%98%85", "Subscription-Userinfo": "upload=1; download=2; total=3; expire=4", "Profile-Web-Page-Url": "https://example.com/home", "Profile-Update-Interval": "12" } })));
		const response = await app.request("/sub?url=https%3A%2F%2Fexample.com%2Fsubscription&target=mihomo-provider", {}, {});
		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Disposition")).toContain(encodeURIComponent("测试订阅"));
		expect(response.headers.get("Subscription-Userinfo")).toContain("download=2");
		expect(response.headers.get("Profile-Update-Interval")).toBe("12");
		expect(await response.text()).toContain("🇭🇰 Hong Kong 01 [0.2x]");
	});
});
