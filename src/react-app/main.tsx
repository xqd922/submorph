import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { AdminApp } from "./admin";

function AdminGate() {
	const existing = sessionStorage.getItem("submorph-admin-token") ?? "";
	if (existing) return <AdminApp />;
	return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#f5f7f2" }}>
		<form onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); sessionStorage.setItem("submorph-admin-token", String(data.get("token") ?? "")); location.reload(); }} style={{ width: "min(420px, 100%)", padding: 32, border: "1px solid #dce3da", borderRadius: 24, background: "white", boxShadow: "0 20px 60px #16382418" }}>
			<p style={{ color: "#169557", fontWeight: 800, letterSpacing: ".12em" }}>SUBMORPH ADMIN</p><h1>Administrator access</h1><p>Enter the deployment administrator token.</p>
			<label htmlFor="admin-token">Token</label><input id="admin-token" name="token" type="password" required autoFocus style={{ width: "100%", boxSizing: "border-box", margin: "10px 0 18px", padding: 14, border: "1px solid #cfd8cf", borderRadius: 12 }} />
			<button style={{ width: "100%", padding: 14, border: 0, borderRadius: 12, color: "white", background: "#149654", fontWeight: 800 }}>Open dashboard</button>
		</form>
	</main>;
}

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		{location.pathname.startsWith("/admin") ? <AdminGate /> : <App />}
	</StrictMode>,
);
