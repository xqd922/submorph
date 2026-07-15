import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { AdminApp } from "./admin";

function AdminGate() {
	const existing = sessionStorage.getItem("submorph-admin-token") ?? "";
	if (existing) return <AdminApp />;
	return <main className="access-gate">
		<section className="access-cover" aria-label="SubMorph 管理入口">
			<a href="/" className="access-wordmark">SubMorph<span>_</span></a>
			<div><p>私密基础设施<br />通用订阅服务</p><strong>管理<br /><em>控制台</em></strong></div>
			<small>SUBMORPH / 系统访问 / 2026</small>
		</section>
		<section className="access-panel">
			<form onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); sessionStorage.setItem("submorph-admin-token", String(data.get("token") ?? "")); location.reload(); }}>
				<p className="eyebrow">00 / 身份验证</p>
				<h1>管理员<br />访问</h1>
				<p>输入部署令牌，进入运营管理工作区。</p>
				<label htmlFor="admin-token">部署令牌</label>
				<input id="admin-token" name="token" type="password" required autoFocus autoComplete="current-password" />
				<button>打开控制台 <span aria-hidden="true">&#8594;</span></button>
				<small>凭据仅保留在当前浏览器会话中。</small>
			</form>
		</section>
	</main>;
}

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		{location.pathname.startsWith("/admin") ? <AdminGate /> : <App />}
	</StrictMode>,
);
