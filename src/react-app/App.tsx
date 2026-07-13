import { FormEvent, useEffect, useState } from "react";
import "./App.css";

type Target = "mihomo" | "mihomo-provider" | "singbox" | "v2rayng" | "preview";
type Stats = { parsed: number; valid: number; output: number; skipped: number };
type ApiResult = { content?: string; result?: string; data?: string; warnings?: string[]; stats?: Partial<Stats>; nodeCount?: number; error?: string | { message?: string } };
const targets: Array<[Target, string, string]> = [["mihomo", "Mihomo", "YAML profile"], ["mihomo-provider", "Mihomo Provider", "Proxy nodes"], ["singbox", "sing-box", "JSON profile"], ["v2rayng", "v2rayNG", "Base64 feed"], ["preview", "Preview", "Redacted summary"]];
const emptyStats: Stats = { parsed: 0, valid: 0, output: 0, skipped: 0 };

function App() {
	const [mode, setMode] = useState<"url" | "content">("url");
	const [source, setSource] = useState("");
	const [target, setTarget] = useState<Target>("mihomo");
	const [result, setResult] = useState("");
	const [stats, setStats] = useState(emptyStats);
	const [warnings, setWarnings] = useState<string[]>([]);
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const [copied, setCopied] = useState(false);
	const [health, setHealth] = useState("checking");
	const targetLabel = targets.find(([value]) => value === target)?.[1] ?? target;

	useEffect(() => {
		const controller = new AbortController();
		fetch("/api/health", { signal: controller.signal }).then((response) => setHealth(response.ok ? "online" : "offline")).catch(() => setHealth("offline"));
		return () => controller.abort();
	}, []);

	async function convert(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const input = source.trim();
		if (!input) return setError("Please enter a subscription URL or paste subscription content.");
		setBusy(true); setError(""); setWarnings([]); setCopied(false);
		try {
			const response = mode === "url" ? await fetch(`/sub?url=${encodeURIComponent(input)}&target=${target}`) : await fetch("/api/convert", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: input, target }) });
			if ((response.headers.get("content-type") ?? "").includes("application/json")) {
				const body = await response.json() as ApiResult;
				if (!response.ok || body.error) throw new Error(typeof body.error === "string" ? body.error : body.error?.message || `Conversion failed (${response.status})`);
				setResult(body.content ?? body.result ?? body.data ?? JSON.stringify(body, null, 2));
				setWarnings(body.warnings ?? []);
				setStats({ parsed: body.stats?.parsed ?? body.nodeCount ?? 0, valid: body.stats?.valid ?? body.nodeCount ?? 0, output: body.stats?.output ?? body.nodeCount ?? 0, skipped: body.stats?.skipped ?? 0 });
			} else {
				const body = await response.text();
				if (!response.ok) throw new Error(body || `Conversion failed (${response.status})`);
				const parsed = Number(response.headers.get("x-submorph-parsed")) || 0;
				const valid = Number(response.headers.get("x-submorph-valid")) || 0;
				const output = Number(response.headers.get("x-submorph-rendered")) || 0;
				const skipped = Number(response.headers.get("x-submorph-skipped")) || 0;
				setResult(body); setStats({ parsed, valid, output, skipped });
			}
		} catch (caught) { setResult(""); setStats(emptyStats); setError(caught instanceof Error ? caught.message : "Conversion failed."); }
		finally { setBusy(false); }
	}

	async function copy() { await navigator.clipboard.writeText(result); setCopied(true); window.setTimeout(() => setCopied(false), 1600); }
	function download() { const extension = target === "singbox" || target === "preview" ? "json" : target === "v2rayng" ? "txt" : "yaml"; const url = URL.createObjectURL(new Blob([result])); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `submorph-${target}.${extension}`; anchor.click(); URL.revokeObjectURL(url); }

	return <div className="page">
		<header><a className="brand" href="#top"><i />SubMorph</a><nav><a href="#converter">Converter</a><a href="#features">Features</a><span className={`health ${health}`}><i />{health}</span></nav></header>
		<main id="top">
			<section className="hero"><p className="kicker">Cloudflare-native subscription converter</p><h1>One subscription.<br /><em>Every client.</em></h1><p>Convert safely between Mihomo, sing-box and v2rayNG. No account, no browser storage, no silent downgrade.</p></section>
			<section className="workspace" id="converter">
				<form className="panel form-panel" onSubmit={convert}>
					<div className="title-row"><div><small>01 / INPUT</small><h2>Choose your source</h2></div><div className="tabs" role="tablist" aria-label="Input mode"><button type="button" role="tab" aria-selected={mode === "url"} onClick={() => setMode("url")}>URL</button><button type="button" role="tab" aria-selected={mode === "content"} onClick={() => setMode("content")}>Paste</button></div></div>
					<label htmlFor="source">{mode === "url" ? "Subscription URL or proxy URI" : "Subscription content"}</label>
					{mode === "url" ? <input id="source" value={source} onChange={(event) => setSource(event.target.value)} placeholder="https://example.com/subscription" autoComplete="off" spellCheck="false" /> : <textarea id="source" value={source} onChange={(event) => setSource(event.target.value)} placeholder="Paste URI list, Base64 or Mihomo YAML..." rows={8} spellCheck="false" />}
					<p className="privacy"><span aria-hidden="true">◆</span><strong>Privacy first.</strong> Input is used only for this conversion and never stored in your browser.</p>
					<hr /><small>02 / OUTPUT</small><h2>Choose target format</h2>
					<div className="targets" role="radiogroup" aria-label="Target format">{targets.map(([value, name, detail]) => <label className={target === value ? "selected" : ""} key={value}><input type="radio" checked={target === value} onChange={() => setTarget(value)} /><i /><span><strong>{name}</strong><small>{detail}</small></span></label>)}</div>
					{error && <p className="error" role="alert">{error}</p>}
					<button className="primary" disabled={busy}>{busy ? <i className="spinner" /> : <span aria-hidden="true">→</span>}{busy ? "Converting..." : `Convert to ${targetLabel}`}</button>
				</form>
				<aside className="panel result-panel" aria-live="polite">
					<div className="title-row"><div><small>03 / RESULT</small><h2>{result ? "Ready to use" : "Waiting for input"}</h2></div>{result && <b className="ready">Ready</b>}</div>
					{result ? <><div className="stats">{Object.entries(stats).map(([name, value]) => <div key={name}><strong>{value}</strong><span>{name}</span></div>)}</div>{warnings.length > 0 && <div className="warning"><strong>Conversion notes</strong>{warnings.map((warning, index) => <span key={index}>{warning}</span>)}</div>}<div className="tools"><span>{targetLabel} / {result.length.toLocaleString()} chars</span><div><button type="button" onClick={copy}>{copied ? "Copied" : "Copy"}</button><button type="button" onClick={download}>Download</button></div></div><pre tabIndex={0}>{result}</pre></> : <div className="empty"><div className="sheets"><i /><i /><i /></div><h3>Your converted profile appears here</h3><p>Enter a source and choose a target. The result stays ready to copy or download.</p></div>}
				</aside>
			</section>
			<section className="features" id="features"><small>WHY SUBMORPH</small><h2>Simple by design.<br />Honest by default.</h2><div><article><b>01</b><h3>Kernel-aware</h3><p>Each target is rendered for its actual capabilities instead of receiving guessed fields.</p></article><article><b>02</b><h3>Private by default</h3><p>No local storage and no third-party analytics receive your subscription content.</p></article><article><b>03</b><h3>Visible outcomes</h3><p>Parsed, output and skipped counts make partial conversion immediately clear.</p></article></div></section>
		</main><footer><a className="brand" href="#top"><i />SubMorph</a><p>Clean, safe subscription conversion.</p><span>Powered by Cloudflare Workers</span></footer>
	</div>;
}
export default App;
