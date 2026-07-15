import { FormEvent, useEffect, useState } from "react";
import "./App.css";

type LinkResponse = { url?: string; error?: { message?: string } };

function App() {
	const [mode, setMode] = useState<"url" | "content">("url");
	const [source, setSource] = useState("");
	const [subscriptionUrl, setSubscriptionUrl] = useState("");
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const [copied, setCopied] = useState(false);
	const [health, setHealth] = useState("checking");

	useEffect(() => {
		const controller = new AbortController();
		fetch("/api/health", { signal: controller.signal }).then((response) => setHealth(response.ok ? "online" : "offline")).catch(() => setHealth("offline"));
		return () => controller.abort();
	}, []);

	async function convert(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const input = source.trim();
		if (!input) return setError("Please enter a subscription URL or paste subscription content.");
		setBusy(true); setError(""); setCopied(false); setSubscriptionUrl("");
		try {
			const response = await fetch("/api/links", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ source: input, target: "auto" }),
			});
			const body = await response.json() as LinkResponse;
			if (!response.ok || !body.url) throw new Error(body.error?.message || "Could not create subscription link.");
			setSubscriptionUrl(body.url);
			try { await navigator.clipboard.writeText(body.url); setCopied(true); window.setTimeout(() => setCopied(false), 1600); } catch { /* manual copy remains available */ }
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "Could not create subscription link.");
		} finally {
			setBusy(false);
		}
	}

	async function copy() {
		await navigator.clipboard.writeText(subscriptionUrl);
		setCopied(true);
		window.setTimeout(() => setCopied(false), 1600);
	}

	function changeMode(nextMode: "url" | "content") {
		setMode(nextMode); setSource(""); setSubscriptionUrl(""); setError("");
	}

	return <div className="page">
		<header><a className="brand" href="#top"><i />SubMorph</a><nav><a href="#converter">Converter</a><a href="#features">Features</a><span className={`health ${health}`}><i />{health}</span></nav></header>
		<main id="top">
			<section className="hero"><p className="kicker">Cloudflare-native subscription converter</p><h1>One subscription.<br /><em>Ready everywhere.</em></h1><p>Create one private subscription link. SubMorph selects the correct format when Mihomo, sing-box or v2rayNG requests it.</p></section>
			<section className="workspace" id="converter">
				<form className="panel form-panel" onSubmit={convert}>
					<div className="title-row"><div><small>01 / INPUT</small><h2>Add your subscription</h2></div><div className="tabs" role="tablist" aria-label="Input mode"><button type="button" role="tab" aria-selected={mode === "url"} onClick={() => changeMode("url")}>URL</button><button type="button" role="tab" aria-selected={mode === "content"} onClick={() => changeMode("content")}>Paste</button></div></div>
					<label htmlFor="source">{mode === "url" ? "Subscription URL or proxy URI" : "Subscription content"}</label>
					{mode === "url" ? <input id="source" value={source} onChange={(event) => setSource(event.target.value)} placeholder="https://example.com/subscription" autoComplete="off" spellCheck="false" /> : <textarea id="source" value={source} onChange={(event) => setSource(event.target.value)} placeholder="Paste URI list, Base64 or Mihomo YAML..." rows={8} spellCheck="false" />}
					<p className="privacy"><span aria-hidden="true">◆</span><strong>Private link.</strong> The source is encrypted before it is stored.</p>
					<p className="automatic"><span aria-hidden="true">✓</span><span><strong>Automatic format.</strong> The same link works with Mihomo, sing-box and v2rayNG.</span></p>
					{error && <p className="error" role="alert">{error}</p>}
					<button className="primary" disabled={busy}>{busy ? <i className="spinner" /> : <span aria-hidden="true">→</span>}{busy ? "Creating..." : "Create subscription link"}</button>
				</form>
				<aside className="panel result-panel" aria-live="polite">
					<div className="title-row"><div><small>02 / SUBSCRIPTION</small><h2>{subscriptionUrl ? "Ready to import" : "Waiting for input"}</h2></div>{subscriptionUrl && <b className="ready">Ready</b>}</div>
					{subscriptionUrl ? <div className="subscription-result"><p>Use this URL directly in your subscription client.</p><a className="subscription-url" href={subscriptionUrl} target="_blank" rel="noreferrer">{subscriptionUrl}</a><div className="tools"><span>Auto-detecting encrypted subscription</span><div><button type="button" onClick={copy}>{copied ? "Copied" : "Copy"}</button><a href={subscriptionUrl} target="_blank" rel="noreferrer">Open</a></div></div></div> : <div className="empty"><div className="sheets"><i /><i /><i /></div><h3>Your subscription link appears here</h3><p>No node details or configuration content will be shown in the browser.</p></div>}
				</aside>
			</section>
			<section className="features" id="features"><small>WHY SUBMORPH</small><h2>One link.<br />The right format.</h2><div><article><b>01</b><h3>Automatic fit</h3><p>The requesting client determines the output format automatically.</p></article><article><b>02</b><h3>Encrypted source</h3><p>The original subscription is encrypted inside SubMorph storage.</p></article><article><b>03</b><h3>No node exposure</h3><p>The public interface only displays the converted subscription link.</p></article></div></section>
		</main><footer><a className="brand" href="#top"><i />SubMorph</a><p>Private subscription conversion.</p><span>Powered by Cloudflare Workers</span></footer>
	</div>;
}

export default App;
