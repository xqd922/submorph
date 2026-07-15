import { afterEach, describe, expect, it, vi } from "vitest";
import { authenticateAdmin, clearAdminSession, createAdminSession } from "./security";

const env = { ADMIN_USERNAME: "seven", ADMIN_PASSWORD: "correct horse battery staple" };

afterEach(() => vi.useRealTimers());

describe("administrator sessions", () => {
	it("creates and verifies a signed HttpOnly session cookie", async () => {
		const login = await createAdminSession(new Request("https://submorph.example/api/admin/login"), env, "seven", "correct horse battery staple");
		expect(login.cookie).toContain("HttpOnly");
		expect(login.cookie).toContain("SameSite=Strict");
		expect(login.cookie).toContain("Secure");
		const cookie = login.cookie.split(";", 1)[0];
		await expect(authenticateAdmin(new Request("https://submorph.example/api/admin/session", { headers: { Cookie: cookie } }), env))
			.resolves.toEqual({ actor: "seven", username: "seven" });
	});

	it("rejects an incorrect username or password", async () => {
		await expect(createAdminSession(new Request("https://submorph.example/api/admin/login"), env, "seven", "wrong"))
			.rejects.toMatchObject({ code: "INVALID_CREDENTIALS", status: 401 });
		await expect(createAdminSession(new Request("https://submorph.example/api/admin/login"), env, "other", "correct horse battery staple"))
			.rejects.toMatchObject({ code: "INVALID_CREDENTIALS", status: 401 });
	});

	it("rejects a tampered session", async () => {
		const login = await createAdminSession(new Request("https://submorph.example/api/admin/login"), env, "seven", "correct horse battery staple");
		const cookie = `${login.cookie.split(";", 1)[0]}x`;
		await expect(authenticateAdmin(new Request("https://submorph.example/api/admin/session", { headers: { Cookie: cookie } }), env))
			.rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
	});

	it("expires sessions after twelve hours", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-07-15T00:00:00Z"));
		const login = await createAdminSession(new Request("https://submorph.example/api/admin/login"), env, "seven", "correct horse battery staple");
		vi.setSystemTime(new Date("2026-07-15T13:00:00Z"));
		await expect(authenticateAdmin(new Request("https://submorph.example/api/admin/session", { headers: { Cookie: login.cookie.split(";", 1)[0] } }), env))
			.rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401 });
	});

	it("clears the session cookie", () => {
		expect(clearAdminSession(new Request("https://submorph.example/api/admin/logout"))).toContain("Max-Age=0");
	});
});
