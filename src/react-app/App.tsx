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
		if (!input) return setError("请输入订阅地址，或粘贴订阅内容。");
		setBusy(true); setError(""); setCopied(false); setSubscriptionUrl("");
		try {
			const response = await fetch("/api/links", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ source: input, target: "auto" }),
			});
			const body = await response.json() as LinkResponse;
			if (!response.ok || !body.url) throw new Error(body.error?.message || "无法创建订阅链接。");
			setSubscriptionUrl(body.url);
			try { await navigator.clipboard.writeText(body.url); setCopied(true); window.setTimeout(() => setCopied(false), 1600); } catch { /* manual copy remains available */ }
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "无法创建订阅链接。");
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
		<header className="site-header">
			<a className="brand" href="#top">SubMorph<span>_</span></a>
			<span className="product-label">订阅转换</span>
			<div className="header-actions"><a href="/admin">管理</a><span className={`health ${health}`}><i />{health === "checking" ? "检查中" : health === "online" ? "服务正常" : "服务异常"}</span></div>
		</header>

		<main className="main-shell">
			<section className="intro" aria-labelledby="intro-title">
				<div><p className="eyebrow">SUBMORPH / 通用订阅</p><h1 id="intro-title">一个订阅，<br /><em>处处可用。</em></h1></div>
				<div className="intro-copy"><p>输入订阅地址或内容，生成一个加密链接。Mihomo、sing-box 与 v2rayNG 会自动获得适合自己的格式。</p><span>加密存储 · 自动识别 · 不展示节点</span></div>
			</section>

			<section className="workspace" id="converter" aria-label="订阅转换器">
				<form className="panel form-panel" onSubmit={convert}>
					<div className="title-row"><div><small>输入</small><h2>创建订阅链接</h2></div><div className="tabs" role="tablist" aria-label="输入方式"><button type="button" role="tab" aria-selected={mode === "url"} onClick={() => changeMode("url")}>地址</button><button type="button" role="tab" aria-selected={mode === "content"} onClick={() => changeMode("content")}>粘贴内容</button></div></div>
					<label htmlFor="source">{mode === "url" ? "订阅地址或代理 URI" : "订阅内容"}</label>
					{mode === "url" ? <input id="source" value={source} onChange={(event) => setSource(event.target.value)} placeholder="https://example.com/subscription" autoComplete="off" spellCheck="false" /> : <textarea id="source" value={source} onChange={(event) => setSource(event.target.value)} placeholder="粘贴 URI 列表、Base64 或 Mihomo YAML…" rows={7} spellCheck="false" />}
					<p className="form-note">内容会加密保存，页面不会显示节点详情。</p>
					{error && <p className="error" role="alert">{error}</p>}
					<button className="primary" disabled={busy}><span>{busy ? "正在创建…" : "创建订阅链接"}</span>{busy ? <i className="spinner" /> : <b aria-hidden="true">&#8594;</b>}</button>
				</form>
				<aside className="panel result-panel" aria-live="polite">
					<div className="title-row"><div><small>输出</small><h2>订阅链接</h2></div><b className={`ready ${subscriptionUrl ? "visible" : ""}`}>{subscriptionUrl ? "就绪" : "待生成"}</b></div>
					{subscriptionUrl ? <div className="subscription-result"><p>复制到你的订阅客户端即可使用。</p><a className="subscription-url" href={subscriptionUrl} target="_blank" rel="noreferrer">{subscriptionUrl}</a><div className="tools"><span>已加密 / 自动适配</span><div><button type="button" onClick={copy}>{copied ? "已复制" : "复制地址"}</button><a href={subscriptionUrl} target="_blank" rel="noreferrer">打开 &#8599;</a></div></div></div> : <div className="empty"><span aria-hidden="true">&#8594;</span><div><h3>链接会显示在这里</h3><p>先在左侧输入订阅，然后创建一个通用链接。</p></div></div>}
				</aside>
			</section>

			<div className="support-row"><span>支持 URI、Base64 与 Mihomo YAML</span><span>运行于 Cloudflare 边缘网络</span></div>
		</main>
		<footer><a className="brand" href="#top">SubMorph<span>_</span></a><span>私密、简单、自动适配。</span></footer>
	</div>;
}

export default App;
