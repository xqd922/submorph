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
		<section className="cover">
			<header className="site-header">
				<a className="brand" href="#top">SubMorph<span>_</span></a>
				<span className="edition">公共工具 / 2026</span>
				<nav aria-label="主导航"><a href="#converter">转换器</a><a href="#principles">设计原则</a><span className={`health ${health}`}><i />{health === "checking" ? "检查中" : health === "online" ? "在线" : "离线"}</span></nav>
			</header>
			<div className="cover-body">
				<div className="cover-context"><span>私密输入</span><span>自动输出</span><span>通用链接</span></div>
				<div className="hero">
					<p>基于 Cloudflare 的订阅转换工具</p>
					<h1><span>一个订阅。</span><br /><em>处处可用。</em><i aria-hidden="true">_</i></h1>
				</div>
				<div className="cover-summary"><p>生成一个加密订阅链接。当 Mihomo、sing-box 或 v2rayNG 请求时，SubMorph 会自动返回正确格式。</p><a href="#converter">开始转换 <span aria-hidden="true">&#8595;</span></a></div>
			</div>
		</section>

		<main className="paper">
			<section className="converter-section" id="converter">
				<header className="section-heading"><div><span>01</span><small>订阅转换</small></div><h2>输入订阅。<br /><em>生成私密链接。</em></h2><p>浏览器不会显示节点详情。输入内容会加密存储，生成的链接会自动适配发起请求的客户端。</p></header>
				<div className="workspace">
					<form className="panel form-panel" onSubmit={convert}>
						<div className="title-row"><div><small>01.1 / 输入</small><h3>添加你的订阅</h3></div><div className="tabs" role="tablist" aria-label="输入方式"><button type="button" role="tab" aria-selected={mode === "url"} onClick={() => changeMode("url")}>地址</button><button type="button" role="tab" aria-selected={mode === "content"} onClick={() => changeMode("content")}>粘贴</button></div></div>
						<label htmlFor="source">{mode === "url" ? "订阅地址或代理 URI" : "订阅内容"}</label>
						{mode === "url" ? <input id="source" value={source} onChange={(event) => setSource(event.target.value)} placeholder="https://example.com/subscription" autoComplete="off" spellCheck="false" /> : <textarea id="source" value={source} onChange={(event) => setSource(event.target.value)} placeholder="粘贴 URI 列表、Base64 或 Mihomo YAML…" rows={8} spellCheck="false" />}
						<div className="assurances"><p><span aria-hidden="true">01</span><strong>加密源地址</strong><small>源内容在存储前会进行加密。</small></p><p><span aria-hidden="true">02</span><strong>自动选择格式</strong><small>一个链接适配所有受支持客户端。</small></p></div>
						{error && <p className="error" role="alert">{error}</p>}
						<button className="primary" disabled={busy}><span>{busy ? "正在创建私密链接…" : "创建订阅链接"}</span>{busy ? <i className="spinner" /> : <b aria-hidden="true">&#8594;</b>}</button>
					</form>
					<aside className="panel result-panel" aria-live="polite">
						<div className="title-row"><div><small>01.2 / 输出</small><h3>{subscriptionUrl ? "可以导入了" : "等待输入"}</h3></div><b className={`ready ${subscriptionUrl ? "visible" : ""}`}>{subscriptionUrl ? "就绪" : "待机"}</b></div>
						{subscriptionUrl ? <div className="subscription-result"><p>在订阅客户端中直接使用这个地址。</p><a className="subscription-url" href={subscriptionUrl} target="_blank" rel="noreferrer">{subscriptionUrl}</a><div className="tools"><span>已加密 / 自动识别</span><div><button type="button" onClick={copy}>{copied ? "已复制" : "复制地址"}</button><a href={subscriptionUrl} target="_blank" rel="noreferrer">打开 &#8599;</a></div></div></div> : <div className="empty"><div className="signal" aria-hidden="true"><i /><i /><i /><i /></div><div><span>输出通道 / 待机</span><h4>私密链接将在这里出现。</h4><p>浏览器不会暴露任何节点详情或配置内容。</p></div></div>}
					</aside>
				</div>
			</section>

			<section className="principles" id="principles">
				<header className="section-heading"><div><span>02</span><small>设计原则</small></div><h2>一个链接。<br /><em>自动适配格式。</em></h2><p>每次转换都遵循三项保证。它们是产品规则，而不是可有可无的展示细节。</p></header>
				<div className="principle-list"><article><b>01</b><div><h3>自动适配</h3><p>根据发起请求的客户端，自动确定输出格式。</p></div><span>客户端 &#8594; 格式</span></article><article><b>02</b><div><h3>源内容加密</h3><p>原始订阅内容在 SubMorph 中加密存储。</p></div><span>订阅源 &#8594; 密文</span></article><article><b>03</b><div><h3>不暴露节点</h3><p>公共界面只返回转换后的订阅链接。</p></div><span>输入 &#8594; 链接</span></article></div>
			</section>
		</main>
		<footer><a className="brand" href="#top">SubMorph<span>_</span></a><p>私密订阅转换工具</p><span>Cloudflare Workers / 边缘运行时</span></footer>
	</div>;
}

export default App;
