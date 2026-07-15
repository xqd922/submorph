import { FormEvent, useCallback, useEffect, useState } from "react";
import "./AdminApp.css";

type View = "overview" | "conversions" | "links" | "blocked" | "audit";
type Row = Record<string, unknown>;
type Page = { items: Row[]; page: number; totalPages: number; total: number };
type Filters = { q: string; status: string; target: string; cache: string };

const emptyFilters: Filters = { q: "", status: "", target: "", cache: "" };
const targets = ["auto", "mihomo", "mihomo-provider", "singbox", "v2rayng", "preview"];
const views: Array<{ id: View; label: string; description: string }> = [
	{ id: "overview", label: "概览", description: "查看服务运行情况与近期活动。" },
	{ id: "conversions", label: "转换记录", description: "检查、筛选并拦截异常订阅源。" },
	{ id: "links", label: "短链接", description: "搜索、复制、暂停或删除订阅链接。" },
	{ id: "blocked", label: "拦截源", description: "新增、搜索和解除订阅源拦截。" },
	{ id: "audit", label: "审计日志", description: "追踪管理操作与安全事件。" },
];
const endpoints = { conversions: "/api/admin/conversions", links: "/api/admin/links", blocked: "/api/admin/blocked-sources", audit: "/api/admin/audit" } as const;

const object = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
function text(row: Row, ...keys: string[]) { for (const key of keys) { const value = row[key]; if (typeof value === "string" || typeof value === "number") return String(value); } return "-"; }
function num(row: Row, ...keys: string[]) { for (const key of keys) { const value = row[key]; if (typeof value === "number") return value; if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value); } return 0; }
function yes(row: Row, ...keys: string[]) { for (const key of keys) { const value = row[key]; if (typeof value === "boolean") return value; if (value === 1 || value === "1") return true; if (value === 0 || value === "0") return false; } return false; }
function details(row: Row, key: string) { const value = row[key]; if (typeof value === "string") return value; if (value && typeof value === "object") return JSON.stringify(value); return "-"; }
function date(value: string) { if (value === "-") return value; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(parsed); }

function readPage(payload: unknown, requestedPage: number): Page {
	const root = object(payload), data = object(root.data);
	const items = [root.items, root.events, root.links, root.sources, root.audit, data.items, data.events, data.links, data.sources, data.audit, root.data].find(Array.isArray) as Row[] | undefined;
	const meta = { ...object(root.pagination), ...object(data.pagination), ...root, ...data };
	return { items: items ?? [], page: num(meta, "page", "currentPage") || requestedPage, totalPages: Math.max(1, num(meta, "totalPages", "pages", "pageCount") || 1), total: num(meta, "total", "count") || items?.length || 0 };
}

async function request(path: string, init?: RequestInit) {
	const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
	if (response.status === 401) location.reload();
	const payload: unknown = await response.json().catch(() => ({}));
	if (!response.ok) {
		const root = object(payload), error = object(root.error);
		const message = text(error, "message") !== "-" ? text(error, "message") : text(root, "message", "error");
		throw new Error(message !== "-" ? message : `请求失败（${response.status}）`);
	}
	return payload;
}

async function logout() { await fetch("/api/admin/logout", { method: "POST" }); location.reload(); }
function LoadingState() { return <div className="admin-state"><i className="admin-spinner" /><strong>正在加载</strong><span>正在获取最新数据…</span></div>; }
function EmptyState({ label }: { label: string }) { return <div className="admin-state"><b>0</b><strong>暂无{label}</strong><span>新数据产生后会显示在这里。</span></div>; }
function ErrorState({ message, retry }: { message: string; retry: () => void }) { return <div className="admin-state error"><b>!</b><strong>无法加载当前视图</strong><span>{message}</span><button type="button" onClick={retry}>重试</button></div>; }
function Pagination({ data, onChange }: { data: Page; onChange: (page: number) => void }) { if (data.totalPages <= 1) return null; return <div className="admin-pagination"><span>共 {data.total.toLocaleString()} 条记录</span><div><button type="button" disabled={data.page <= 1} onClick={() => onChange(data.page - 1)}>上一页</button><b>{data.page} / {data.totalPages}</b><button type="button" disabled={data.page >= data.totalPages} onClick={() => onChange(data.page + 1)}>下一页</button></div></div>; }
function Table({ children }: { children: React.ReactNode }) { return <div className="admin-table-wrap"><table>{children}</table></div>; }

function Overview() {
	const [data, setData] = useState<Row | null>(null), [error, setError] = useState(""), [purging, setPurging] = useState(false), [notice, setNotice] = useState("");
	const load = useCallback(() => { request("/api/admin/overview").then((payload) => { setError(""); setData({ ...object(payload), ...object(object(payload).data) }); }).catch((reason: Error) => setError(reason.message)); }, []);
	useEffect(load, [load]);
	async function purge() {
		if (!confirm("确认清理全部转换缓存？新的请求会重新生成缓存。")) return;
		setPurging(true); setNotice("");
		try { const payload = object(await request("/api/admin/cache/purge", { method: "POST" })); setNotice(`已清理 ${num(payload, "deleted").toLocaleString()} 条缓存`); }
		catch (reason) { setError(reason instanceof Error ? reason.message : "缓存清理失败"); }
		finally { setPurging(false); }
	}
	if (error && !data) return <ErrorState message={error} retry={load} />;
	if (!data) return <LoadingState />;
	const cards = [["今日转换", num(data, "todayConversions"), "次"], ["成功率", num(data, "successRate"), "%"], ["缓存命中率", num(data, "cacheHitRate"), "%"], ["平均延迟", num(data, "averageDuration"), "毫秒"]] as const;
	const rawTrend = data.trend, trend = Array.isArray(rawTrend) ? rawTrend.map(object) : [], max = Math.max(1, ...trend.map((item) => num(item, "value", "count")));
	const rawOutputs = data.outputDistribution, outputs = Array.isArray(rawOutputs) ? rawOutputs.map(object) : [];
	const rawErrors = data.recentErrors, recentErrors = Array.isArray(rawErrors) ? rawErrors.map(object) : [];
	return <>
		<div className="overview-toolbar"><div><strong>转换缓存</strong><span>成功结果默认缓存 5 分钟。</span></div><div>{notice && <em>{notice}</em>}<button type="button" disabled={purging} onClick={purge}>{purging ? "正在清理…" : "清理缓存"}</button></div></div>
		{error && <p className="admin-inline-error" role="alert">{error}</p>}
		<div className="metric-grid">{cards.map(([label, value, suffix]) => <article key={label}><span>{label}</span><strong>{value.toLocaleString()}<small>{suffix}</small></strong></article>)}</div>
		<div className="overview-grid">
			<section className="admin-card chart-card"><header><div><span>转换活动</span><h2>最近 7 天</h2></div><em>实时</em></header>{trend.length ? <div className="mini-chart">{trend.map((item, index) => { const value = num(item, "value", "count"); return <div key={`${text(item, "day", "date")}-${index}`}><span title={`${value} 次转换`} style={{ height: `${Math.max(8, value / max * 100)}%` }} /><small>{text(item, "day", "date").slice(5)}</small></div>; })}</div> : <EmptyState label="活动" />}</section>
			<section className="admin-card"><header><div><span>格式</span><h2>输出分布</h2></div></header>{outputs.length ? <div className="breakdown-list">{outputs.map((item) => <div key={text(item, "target")}><b>{text(item, "target")}</b><span>{num(item, "count").toLocaleString()}</span></div>)}</div> : <EmptyState label="输出" />}</section>
			<section className="admin-card"><header><div><span>运行状态</span><h2>常见错误</h2></div></header>{recentErrors.length ? <div className="breakdown-list">{recentErrors.map((item) => <div key={text(item, "code")}><b>{text(item, "code")}</b><span>{num(item, "count").toLocaleString()}</span></div>)}</div> : <EmptyState label="错误" />}</section>
		</div>
	</>;
}

function FilterBar({ view, draft, applied, onDraft, onApply, onClear }: { view: Exclude<View, "overview">; draft: Filters; applied: Filters; onDraft: (filters: Filters) => void; onApply: (event: FormEvent<HTMLFormElement>) => void; onClear: () => void }) {
	const hasFilters = Object.values(applied).some(Boolean) || Object.values(draft).some(Boolean);
	return <form className="admin-filters" onSubmit={onApply}>
		<input aria-label="搜索" value={draft.q} onChange={(event) => onDraft({ ...draft, q: event.target.value })} placeholder={view === "links" ? "搜索短 ID 或指纹" : view === "audit" ? "搜索操作、目标或管理员" : "搜索域名、指纹或错误"} />
		{(view === "conversions" || view === "links") && <select aria-label="输出格式" value={draft.target} onChange={(event) => onDraft({ ...draft, target: event.target.value })}><option value="">全部格式</option>{targets.map((target) => <option key={target}>{target}</option>)}</select>}
		{view === "conversions" && <select aria-label="转换结果" value={draft.status} onChange={(event) => onDraft({ ...draft, status: event.target.value })}><option value="">全部结果</option><option value="success">成功</option><option value="failed">失败</option></select>}
		{view === "conversions" && <select aria-label="缓存状态" value={draft.cache} onChange={(event) => onDraft({ ...draft, cache: event.target.value })}><option value="">全部缓存</option><option value="hit">命中</option><option value="miss">未命中</option></select>}
		{view === "links" && <select aria-label="链接状态" value={draft.status} onChange={(event) => onDraft({ ...draft, status: event.target.value })}><option value="">全部状态</option><option value="enabled">启用</option><option value="disabled">暂停</option></select>}
		<button type="submit">筛选</button>{hasFilters && <button className="quiet" type="button" onClick={onClear}>清除</button>}
	</form>;
}

function PagedView({ view }: { view: Exclude<View, "overview"> }) {
	const [page, setPage] = useState(1), [data, setData] = useState<Page | null>(null), [error, setError] = useState(""), [working, setWorking] = useState(""), [copied, setCopied] = useState("");
	const [draft, setDraft] = useState<Filters>(emptyFilters), [filters, setFilters] = useState<Filters>(emptyFilters);
	const [newSource, setNewSource] = useState(""), [newReason, setNewReason] = useState("");
	const load = useCallback(() => {
		const query = new URLSearchParams({ page: String(page), limit: "25" });
		for (const [key, value] of Object.entries(filters)) if (value) query.set(key, value);
		return request(`${endpoints[view]}?${query}`).then((payload) => { setError(""); setData(readPage(payload, page)); }).catch((reason: Error) => setError(reason.message));
	}, [filters, page, view]);
	useEffect(() => { void load(); }, [load]);

	async function mutate(id: string, path: string, init: RequestInit) {
		setWorking(id); setError("");
		try { await request(path, init); await load(); return true; }
		catch (reason) { setError(reason instanceof Error ? reason.message : "操作失败"); return false; }
		finally { setWorking(""); }
	}
	async function addBlocked(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const success = await mutate("new", "/api/admin/blocked-sources", { method: "POST", body: JSON.stringify({ source: newSource, reason: newReason }) });
		if (success) { setNewSource(""); setNewReason(""); setPage(1); }
	}
	async function copyLink(id: string) {
		try { await navigator.clipboard.writeText(`${location.origin}/s/${id}`); setCopied(id); window.setTimeout(() => setCopied((current) => current === id ? "" : current), 1600); }
		catch { setError("无法访问剪贴板，请手动复制链接。"); }
	}
	function apply(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setPage(1); setFilters({ ...draft }); }
	function clear() { setDraft(emptyFilters); setFilters(emptyFilters); setPage(1); }

	if (error && !data) return <ErrorState message={error} retry={() => void load()} />;
	if (!data) return <LoadingState />;
	return <>
		{view === "blocked" && <form className="admin-create-form" onSubmit={addBlocked}><div><label htmlFor="blocked-source">订阅地址或代理 URI</label><input id="blocked-source" value={newSource} onChange={(event) => setNewSource(event.target.value)} placeholder="https://example.com/subscription" required /></div><div><label htmlFor="blocked-reason">原因（可选）</label><input id="blocked-reason" value={newReason} onChange={(event) => setNewReason(event.target.value)} placeholder="例如：滥用或异常流量" /></div><button disabled={working === "new"}>{working === "new" ? "正在添加…" : "添加拦截"}</button></form>}
		<FilterBar view={view} draft={draft} applied={filters} onDraft={setDraft} onApply={apply} onClear={clear} />
		{error && <p className="admin-inline-error" role="alert">{error}</p>}
		{!data.items.length ? <EmptyState label={views.find((item) => item.id === view)?.label ?? "记录"} /> : <>
			{view === "conversions" && <Table><thead><tr><th>时间</th><th>订阅源</th><th>输出 / 客户端</th><th>结果</th><th>缓存</th><th>节点 / 延迟</th><th aria-label="操作" /></tr></thead><tbody>{data.items.map((row, index) => { const id = text(row, "id"), fingerprint = text(row, "sourceFingerprint", "source_fingerprint"), hostname = text(row, "sourceHostname", "source_hostname", "hostname"), success = yes(row, "success"); return <tr key={id + index}><td>{date(text(row, "createdAt", "created_at", "time"))}</td><td><strong>{hostname}</strong><small>{fingerprint.slice(0, 14)}</small></td><td><code>{text(row, "target")}</code><small>{text(row, "clientFamily", "client_family")}</small></td><td><span className={`status ${success ? "good" : "bad"}`}>{success ? "成功" : "失败"}</span>{!success && <small>{text(row, "errorCode", "error_code")}</small>}</td><td><span className={`status ${yes(row, "cacheHit", "cache_hit") ? "good" : "muted"}`}>{yes(row, "cacheHit", "cache_hit") ? "命中" : "未命中"}</span></td><td><strong>{num(row, "nodeCount", "node_count")} 个节点</strong><small>{num(row, "durationMs", "duration_ms")} 毫秒</small></td><td><div className="row-actions"><button className="danger" type="button" disabled={working === id} onClick={() => confirm(`确认拦截 ${hostname}？`) && mutate(id, "/api/admin/blocked-sources", { method: "POST", body: JSON.stringify({ fingerprint, hostname, reason: "从转换记录拦截" }) })}>拦截</button></div></td></tr>; })}</tbody></Table>}
			{view === "links" && <Table><thead><tr><th>短链接</th><th>来源指纹</th><th>输出格式</th><th>使用量</th><th>状态</th><th aria-label="操作" /></tr></thead><tbody>{data.items.map((row, index) => { const id = text(row, "id"), enabled = yes(row, "enabled"); return <tr key={id + index}><td><strong>/s/{id}</strong><small>{date(text(row, "createdAt", "created_at"))}</small></td><td><code>{text(row, "targetFingerprint", "target_fingerprint").slice(0, 18)}</code></td><td><code>{text(row, "outputTarget", "output_target", "target")}</code></td><td>{num(row, "hitCount", "hit_count").toLocaleString()} 次</td><td><span className={`status ${enabled ? "good" : "muted"}`}>{enabled ? "启用" : "暂停"}</span></td><td><div className="row-actions"><button type="button" onClick={() => copyLink(id)}>{copied === id ? "已复制" : "复制"}</button><button type="button" disabled={working === id} onClick={() => mutate(id, `/api/admin/links/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ enabled: !enabled }) })}>{enabled ? "暂停" : "启用"}</button><button className="danger" type="button" disabled={working === id} onClick={() => confirm(`确认删除短链接 ${id}？`) && mutate(id, `/api/admin/links/${encodeURIComponent(id)}`, { method: "DELETE" })}>删除</button></div></td></tr>; })}</tbody></Table>}
			{view === "blocked" && <Table><thead><tr><th>订阅源</th><th>指纹</th><th>原因</th><th>操作人</th><th aria-label="操作" /></tr></thead><tbody>{data.items.map((row, index) => { const id = text(row, "id"); return <tr key={id + index}><td><strong>{text(row, "hostname", "sourceHostname")}</strong><small>{date(text(row, "createdAt", "created_at"))}</small></td><td><code>{text(row, "sourceFingerprint", "source_fingerprint").slice(0, 18)}</code></td><td>{text(row, "reason")}</td><td>{text(row, "actor", "actorEmail")}</td><td><div className="row-actions"><button className="danger" type="button" disabled={working === id} onClick={() => confirm("确认解除这个订阅源的拦截？") && mutate(id, `/api/admin/blocked-sources/${encodeURIComponent(id)}`, { method: "DELETE" })}>解除拦截</button></div></td></tr>; })}</tbody></Table>}
			{view === "audit" && <Table><thead><tr><th>时间</th><th>操作人</th><th>操作</th><th>目标</th><th>详情</th></tr></thead><tbody>{data.items.map((row, index) => { const metadata = details(row, "metadata"); return <tr key={text(row, "id") + index}><td>{date(text(row, "createdAt", "created_at"))}</td><td><strong>{text(row, "actorEmail", "actor_email", "actor")}</strong></td><td><span className="status muted">{text(row, "action")}</span></td><td>{text(row, "targetType", "target_type")} / {text(row, "targetId", "target_id")}</td><td className="metadata" title={metadata}>{metadata}</td></tr>; })}</tbody></Table>}
			<Pagination data={data} onChange={setPage} />
		</>}
	</>;
}

export function AdminApp() {
	const [view, setView] = useState<View>("overview"), current = views.find((item) => item.id === view) ?? views[0];
	return <div className="admin-shell"><aside className="admin-sidebar"><a className="admin-brand" href="/">SubMorph <span>管理</span></a><nav aria-label="管理导航">{views.map((item) => <button type="button" className={view === item.id ? "active" : ""} aria-current={view === item.id ? "page" : undefined} key={item.id} onClick={() => setView(item.id)}><span>{item.label}</span></button>)}</nav><div className="admin-identity"><i>管</i><span><strong>管理员</strong><small>安全会话</small></span><button type="button" onClick={logout} aria-label="退出登录">退出</button></div></aside><main className="admin-main"><header className="admin-header"><div><small>SUBMORPH / 管理后台</small><h1>{current.label}</h1><p>{current.description}</p></div><a href="/" target="_blank" rel="noreferrer">打开转换器</a></header><section className="admin-content">{view === "overview" ? <Overview /> : <PagedView key={view} view={view} />}</section></main></div>;
}

export default AdminApp;
