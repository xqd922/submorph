import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { AdminApp } from "./admin";

function AdminGate() {
	const existing = sessionStorage.getItem("submorph-admin-token") ?? "";
	if (existing) return <AdminApp />;
	return <main className="access-gate">
		<section className="access-cover" aria-label="SubMorph administrator portal">
			<a href="/" className="access-wordmark">SubMorph<span>_</span></a>
			<div><p>Private infrastructure<br />for universal subscriptions.</p><strong>Administration<br /><em>Console</em></strong></div>
			<small>SUBMORPH / SYSTEM ACCESS / 2026</small>
		</section>
		<section className="access-panel">
			<form onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); sessionStorage.setItem("submorph-admin-token", String(data.get("token") ?? "")); location.reload(); }}>
				<p className="eyebrow">00 / AUTHENTICATION</p>
				<h1>Administrator<br />access</h1>
				<p>Enter the deployment token to open the operational workspace.</p>
				<label htmlFor="admin-token">Deployment token</label>
				<input id="admin-token" name="token" type="password" required autoFocus autoComplete="current-password" />
				<button>Open dashboard <span aria-hidden="true">&#8594;</span></button>
				<small>Credentials remain in this browser session only.</small>
			</form>
		</section>
	</main>;
}

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		{location.pathname.startsWith("/admin") ? <AdminGate /> : <App />}
	</StrictMode>,
);
