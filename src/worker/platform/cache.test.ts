import { describe, expect, it, vi } from "vitest";
import { purgeConversionCache } from "./cache";

describe("conversion cache administration", () => {
	it("deletes every conversion cache page", async () => {
		const list = vi.fn()
			.mockResolvedValueOnce({ keys: [{ name: "conversion:a" }, { name: "conversion:b" }], list_complete: false, cursor: "next" })
			.mockResolvedValueOnce({ keys: [{ name: "conversion:c" }], list_complete: true });
		const remove = vi.fn().mockResolvedValue(undefined);
		const deleted = await purgeConversionCache({ list, delete: remove } as unknown as KVNamespace);

		expect(deleted).toBe(3);
		expect(list).toHaveBeenNthCalledWith(1, { prefix: "conversion:", cursor: undefined, limit: 1000 });
		expect(list).toHaveBeenNthCalledWith(2, { prefix: "conversion:", cursor: "next", limit: 1000 });
		expect(remove.mock.calls.flat()).toEqual(["conversion:a", "conversion:b", "conversion:c"]);
	});
});
