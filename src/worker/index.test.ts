import { describe, expect, it } from "vitest";
import app from "./index";

const ss = "ss://YWVzLTI1Ni1nY206cGFzc3dvcmQ@ss.example.com:8388#Demo";

describe("worker routes", () => {
	it("reports health", async () => {
		const response = await app.request("/api/health");
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ status: "ok", version: "0.1.0" });
	});

	it("converts a proxy URI through GET /sub", async () => {
		const response = await app.request(`/sub?target=mihomo-provider&url=${encodeURIComponent(ss)}`);
		expect(response.status).toBe(200);
		expect(response.headers.get("x-submorph-rendered")).toBe("1");
		expect(await response.text()).toContain("type: ss");
	});

	it("converts pasted content through POST /api/convert", async () => {
		const response = await app.request("/api/convert", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ source: ss, target: "preview" }),
		});
		expect(response.status).toBe(200);
		const body = await response.json() as { count: number };
		expect(body.count).toBe(1);
	});
});
