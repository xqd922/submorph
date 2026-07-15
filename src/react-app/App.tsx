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

	return <div className="page" id="top">
		<section className="cover">
			<header className="site-header">
				<a className="brand" href="#top">SubMorph<span>_</span></a>
				<span className="edition">PUBLIC TOOL / 2026</span>
				<nav aria-label="Primary navigation"><a href="#converter">Converter</a><a href="#principles">Principles</a><span className={`health ${health}`}><i />{health}</span></nav>
			</header>
			<div className="cover-body">
				<div className="cover-context"><span>PRIVATE INPUT</span><span>AUTOMATIC OUTPUT</span><span>UNIVERSAL LINK</span></div>
				<div className="hero">
					<p>Cloudflare-native subscription engineering.</p>
					<h1><span>One</span> subscription.<br /><em>Ready everywhere.</em><i aria-hidden="true">_</i></h1>
				</div>
				<div className="cover-summary"><p>Create one encrypted subscription link. SubMorph serves the right format when Mihomo, sing-box or v2rayNG asks for it.</p><a href="#converter">Begin conversion <span aria-hidden="true">&#8595;</span></a></div>
			</div>
		</section>

		<main className="paper">
			<section className="converter-section" id="converter">
				<header className="section-heading"><div><span>01</span><small>CONVERTER</small></div><h2>Source in.<br /><em>Private link out.</em></h2><p>The browser never displays your node details. Input is encrypted at rest and the resulting link adapts to the requesting client.</p></header>
				<div className="workspace">
					<form className="panel form-panel" onSubmit={convert}>
						<div className="title-row"><div><small>01.1 / INPUT</small><h3>Add your subscription</h3></div><div className="tabs" role="tablist" aria-label="Input mode"><button type="button" role="tab" aria-selected={mode === "url"} onClick={() => changeMode("url")}>URL</button><button type="button" role="tab" aria-selected={mode === "content"} onClick={() => changeMode("content")}>Paste</button></div></div>
						<label htmlFor="source">{mode === "url" ? "Subscription URL or proxy URI" : "Subscription content"}</label>
						{mode === "url" ? <input id="source" value={source} onChange={(event) => setSource(event.target.value)} placeholder="https://example.com/subscription" autoComplete="off" spellCheck="false" /> : <textarea id="source" value={source} onChange={(event) => setSource(event.target.value)} placeholder="Paste URI list, Base64 or Mihomo YAML..." rows={8} spellCheck="false" />}
						<div className="assurances"><p><span aria-hidden="true">01</span><strong>Encrypted source</strong><small>The source is encrypted before storage.</small></p><p><span aria-hidden="true">02</span><strong>Automatic format</strong><small>One link works across supported clients.</small></p></div>
						{error && <p className="error" role="alert">{error}</p>}
						<button className="primary" disabled={busy}><span>{busy ? "Creating private link..." : "Create subscription link"}</span>{busy ? <i className="spinner" /> : <b aria-hidden="true">&#8594;</b>}</button>
					</form>
					<aside className="panel result-panel" aria-live="polite">
						<div className="title-row"><div><small>01.2 / OUTPUT</small><h3>{subscriptionUrl ? "Ready to import" : "Waiting for input"}</h3></div><b className={`ready ${subscriptionUrl ? "visible" : ""}`}>{subscriptionUrl ? "READY" : "IDLE"}</b></div>
						{subscriptionUrl ? <div className="subscription-result"><p>Use this URL directly in your subscription client.</p><a className="subscription-url" href={subscriptionUrl} target="_blank" rel="noreferrer">{subscriptionUrl}</a><div className="tools"><span>ENCRYPTED / AUTO-DETECTING</span><div><button type="button" onClick={copy}>{copied ? "Copied" : "Copy URL"}</button><a href={subscriptionUrl} target="_blank" rel="noreferrer">Open &#8599;</a></div></div></div> : <div className="empty"><div className="signal" aria-hidden="true"><i /><i /><i /><i /></div><div><span>OUTPUT CHANNEL / STANDBY</span><h4>Your private link appears here.</h4><p>No node details or configuration content are exposed in the browser.</p></div></div>}
					</aside>
				</div>
			</section>

			<section className="principles" id="principles">
				<header className="section-heading"><div><span>02</span><small>PRINCIPLES</small></div><h2>One link.<br /><em>The right format.</em></h2><p>Three guarantees define every conversion. They are product rules, not optional presentation details.</p></header>
				<div className="principle-list"><article><b>01</b><div><h3>Automatic fit</h3><p>The requesting client determines its output format automatically.</p></div><span>CLIENT &#8594; FORMAT</span></article><article><b>02</b><div><h3>Encrypted source</h3><p>The original subscription is encrypted inside SubMorph storage.</p></div><span>SOURCE &#8594; CIPHER</span></article><article><b>03</b><div><h3>No node exposure</h3><p>The public interface returns only the converted subscription link.</p></div><span>INPUT &#8594; LINK</span></article></div>
			</section>
		</main>
		<footer><a className="brand" href="#top">SubMorph<span>_</span></a><p>Private subscription conversion.</p><span>Cloudflare Workers / Edge runtime</span></footer>
	</div>;
}

export default App;
