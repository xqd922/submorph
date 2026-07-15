import { FormEvent, StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { AdminApp } from "./admin";

function AdminGate() {
	const [authenticated, setAuthenticated] = useState<boolean | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	useEffect(() => {
		const controller = new AbortController();
		fetch("/api/admin/session", { signal: controller.signal }).then((response) => setAuthenticated(response.ok)).catch(() => setAuthenticated(false));
		return () => controller.abort();
	}, []);

	async function login(event: FormEvent<HTMLFormElement>) {
		event.preventDefault(); setBusy(true); setError("");
		const data = new FormData(event.currentTarget);
		try {
			const response = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: data.get("username"), password: data.get("password") }) });
			const body = await response.json() as { error?: { message?: string } };
			if (!response.ok) throw new Error(body.error?.message || "登录失败");
			setAuthenticated(true);
		} catch (reason) { setError(reason instanceof Error ? reason.message : "登录失败"); }
		finally { setBusy(false); }
	}

	if (authenticated) return <AdminApp />;
	return <main className="access-gate">
		<section className="access-cover" aria-label="SubMorph 管理入口">
			<a href="/" className="access-wordmark">SubMorph<span>_</span></a>
			<div><p>私密基础设施<br />通用订阅服务</p><strong>管理<br /><em>控制台</em></strong></div>
			<small>SUBMORPH / 系统访问 / 2026</small>
		</section>
		<section className="access-panel">
			<form onSubmit={login} aria-busy={busy || authenticated === null}>
				<p className="eyebrow">00 / 身份验证</p>
				<h1>管理员<br />访问</h1>
				<p>输入管理员账号和密码，进入运营管理工作区。</p>
				<label htmlFor="admin-username">用户名</label>
				<input id="admin-username" name="username" required autoFocus autoComplete="username" disabled={authenticated === null || busy} />
				<label htmlFor="admin-password">密码</label>
				<input id="admin-password" name="password" type="password" required autoComplete="current-password" disabled={authenticated === null || busy} />
				{error && <p className="access-error" role="alert">{error}</p>}
				<button disabled={authenticated === null || busy}>{authenticated === null ? "正在验证会话…" : busy ? "正在登录…" : "登录控制台"} <span aria-hidden="true">&#8594;</span></button>
				<small>登录状态通过安全的 HttpOnly Cookie 保存 12 小时。</small>
			</form>
		</section>
	</main>;
}

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		{location.pathname.startsWith("/admin") ? <AdminGate /> : <App />}
	</StrictMode>,
);
