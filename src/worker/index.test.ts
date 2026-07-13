import { describe, expect, it } from "vitest";
import app, { targetForUserAgent } from "./index";

const ss = "ss://YWVzLTI1Ni1nY206cGFzc3dvcmQ@ss.example.com:8388#Demo";

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

	it("converts a proxy URI through GET /sub", async () => {
		const response = await app.request(`/sub?target=mihomo-provider&url=${encodeURIComponent(ss)}`, undefined, {});
		expect(response.status).toBe(200);
		expect(response.headers.get("x-submorph-rendered")).toBe("1");
		expect(await response.text()).toContain("type: ss");
	});

	it.each([
		["sing-box/1.13.14", "singbox"],
		["v2rayNG/1.10.0", "v2rayng"],
		["v2rayN/7.0", "v2rayng"],
		["Mihomo/1.19", "mihomo"],
		["Clash.Meta/1.18", "mihomo"],
		["ClashX Pro/1.0", "mihomo"],
		["Stash/2.6", "mihomo"],
		["Mozilla/5.0", "mihomo"],
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

	it("converts pasted content through POST /api/convert", async () => {
		const response = await app.request("/api/convert", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ source: ss, target: "preview" }),
		}, {});
		expect(response.status).toBe(200);
		const body = await response.json() as { count: number };
		expect(body.count).toBe(1);
	});
});
