import { afterEach, describe, expect, it, vi } from "vitest";
import { loadRemoteSource } from "./source";

afterEach(() => vi.unstubAllGlobals());

describe("loadRemoteSource", () => {
	it("identifies as a subscription client upstream", async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response("ss://example"));
		vi.stubGlobal("fetch", fetchMock);

		expect(await loadRemoteSource("https://example.com/sub")).toBe("ss://example");
		expect(fetchMock).toHaveBeenCalledWith(new URL("https://example.com/sub"), expect.objectContaining({
			headers: { "User-Agent": "clash.meta", Accept: "application/json, text/plain, */*" },
		}));
	});
});
