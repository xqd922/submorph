import { useCallback, useEffect, useState } from "react";
import "./AdminApp.css";

type View = "overview" | "conversions" | "links" | "blocked" | "audit";
type Row = Record<string, unknown>;
type Page = { items: Row[]; page: number; totalPages: number; total: number };
const views: Array<{ id: View; label: string; description: string }> = [
	{ id: "overview", label: "概览", description: "查看服务运行情况与近期活动。" },
	{ id: "conversions", label: "转换记录", description: "检查每次转换的结果与耗时。" },
	{ id: "links", label: "短链接", description: "管理已经创建的订阅链接。" },
	{ id: "blocked", label: "拦截源", description: "查看和解除被拦截的订阅源。" },
	{ id: "audit", label: "审计日志", description: "追踪管理操作与安全事件。" },
];
const endpoints = { conversions: "/api/admin/conversions", links: "/api/admin/links", blocked: "/api/admin/blocked-sources", audit: "/api/admin/audit" } as const;
const object = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
function text(row: Row, ...keys: string[]) { for (const key of keys) { const value = row[key]; if (typeof value === "string" || typeof value === "number") return String(value); } return "-"; }
function num(row: Row, ...keys: string[]) { for (const key of keys) { const value = row[key]; if (typeof value === "number") return value; if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value); } return 0; }
function yes(row: Row, ...keys: string[]) { for (const key of keys) { const value = row[key]; if (typeof value === "boolean") return value; if (value === 1 || value === "1") return true; if (value === 0 || value === "0") return false; } return false; }
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
	if (!response.ok) { const root = object(payload), error = object(root.error); const message = text(error, "message") !== "-" ? text(error, "message") : text(root, "message", "error"); throw new Error(message !== "-" ? message : `请求失败（${response.status}）`); }
	return payload;
}
async function logout() { await fetch("/api/admin/logout", { method: "POST" }); location.reload(); }
function LoadingState() { return <div className="admin-state"><i className="admin-spinner" /><strong>正在加载工作区</strong><span>正在获取最新数据…</span></div>; }
function EmptyState({ label }: { label: string }) { return <div className="admin-state"><b>0</b><strong>暂无{label}</strong><span>产生新活动后会自动显示在这里。</span></div>; }
function ErrorState({ message, retry }: { message: string; retry: () => void }) { return <div className="admin-state error"><b>!</b><strong>无法加载当前视图</strong><span>{message}</span><button type="button" onClick={retry}>重试</button></div>; }
function Pagination({ data, onChange }: { data: Page; onChange: (page: number) => void }) { if (data.totalPages <= 1) return null; return <div className="admin-pagination"><span>共 {data.total.toLocaleString()} 条记录</span><div><button type="button" disabled={data.page <= 1} onClick={() => onChange(data.page - 1)}>上一页</button><b>{data.page} / {data.totalPages}</b><button type="button" disabled={data.page >= data.totalPages} onClick={() => onChange(data.page + 1)}>下一页</button></div></div>; }
function Table({ children }: { children: React.ReactNode }) { return <div className="admin-table-wrap"><table>{children}</table></div>; }

function Overview() {
	const [data, setData] = useState<Row | null>(null), [error, setError] = useState("");
	const load = useCallback(() => { request("/api/admin/overview").then((payload) => { setError(""); setData({ ...object(payload), ...object(object(payload).data) }); }).catch((reason: Error) => setError(reason.message)); }, []);
	useEffect(load, [load]);
	if (error) return <ErrorState message={error} retry={load} />; if (!data) return <LoadingState />;
	const cards = [["今日转换", num(data, "todayConversions", "conversionsToday", "totalToday"), "次"], ["成功率", num(data, "successRate"), "%"], ["缓存命中率", num(data, "cacheHitRate"), "%"], ["平均延迟", num(data, "averageDuration", "averageDurationMs", "avgDurationMs", "averageLatency"), "毫秒"]] as const;
	const rawTrend = data.trend ?? data.daily ?? data.lastSevenDays, trend = Array.isArray(rawTrend) ? rawTrend.map(object) : [], max = Math.max(1, ...trend.map((item) => num(item, "count", "total", "value")));
	const recent = Array.isArray(data.recentErrors) ? data.recentErrors.map(object) : [];
	return <><div className="metric-grid">{cards.map(([label, value, suffix]) => <article key={label}><span>{label}</span><strong>{value.toLocaleString()}<small>{suffix}</small></strong></article>)}</div><div className="overview-grid"><section className="admin-card"><header><div><span>转换活动</span><h2>最近 7 天</h2></div><em>实时</em></header>{trend.length ? <div className="mini-chart">{trend.map((item, index) => { const value = num(item, "count", "total", "value"); return <div key={`${text(item, "date", "label")}-${index}`}><span title={`${value} 次转换`} style={{ height: `${Math.max(8, value / max * 100)}%` }} /><small>{text(item, "label", "day", "date").slice(0, 5)}</small></div>; })}</div> : <EmptyState label="活动" />}</section><section className="admin-card"><header><div><span>运行状态</span><h2>近期错误</h2></div></header>{recent.length ? <div className="error-list">{recent.slice(0, 6).map((item, index) => <div key={`${text(item, "code")}-${index}`}><b>{text(item, "code", "errorCode")}</b><span>{num(item, "count").toLocaleString()}</span></div>)}</div> : <EmptyState label="错误" />}</section></div></>;
}

function PagedView({ view }: { view: Exclude<View, "overview"> }) {
	const [page, setPage] = useState(1), [data, setData] = useState<Page | null>(null), [error, setError] = useState(""), [working, setWorking] = useState("");
	const load = useCallback(() => { request(`${endpoints[view]}?page=${page}`).then((payload) => { setError(""); setData(readPage(payload, page)); }).catch((reason: Error) => setError(reason.message)); }, [page, view]);
	useEffect(load, [load]);
	async function mutate(id: string, path: string, init: RequestInit) { setWorking(id); setError(""); try { await request(path, init); load(); } catch (reason) { setError(reason instanceof Error ? reason.message : "操作失败"); } finally { setWorking(""); } }
	if (error && !data) return <ErrorState message={error} retry={load} />;
	if (!data) return <LoadingState />;
	if (!data.items.length) return <EmptyState label={views.find((item) => item.id === view)?.label ?? "记录"} />;
	return <>{error && <p className="admin-inline-error" role="alert">{error}</p>}
		{view === "conversions" && <Table><thead><tr><th>时间</th><th>订阅源</th><th>目标格式</th><th>结果</th><th>节点数</th><th>延迟</th></tr></thead><tbody>{data.items.map((row, index) => <tr key={text(row, "id") + index}><td>{date(text(row, "createdAt", "created_at", "time"))}</td><td><strong>{text(row, "sourceHostname", "source_hostname", "hostname")}</strong><small>{text(row, "sourceFingerprint", "source_fingerprint").slice(0, 12)}</small></td><td><code>{text(row, "target")}</code></td><td><span className={`status ${yes(row, "success") ? "good" : "bad"}`}>{yes(row, "success") ? "成功" : text(row, "errorCode", "error_code")}</span></td><td>{num(row, "nodeCount", "node_count")}</td><td>{num(row, "durationMs", "duration_ms")} 毫秒</td></tr>)}</tbody></Table>}
		{view === "links" && <Table><thead><tr><th>短链接</th><th>订阅源</th><th>目标格式</th><th>使用量</th><th>状态</th><th aria-label="操作" /></tr></thead><tbody>{data.items.map((row, index) => { const id = text(row, "id"), enabled = yes(row, "enabled"); return <tr key={id + index}><td><strong>/s/{id}</strong><small>{date(text(row, "createdAt", "created_at"))}</small></td><td>{text(row, "hostname", "sourceHostname", "source_hostname")}</td><td><code>{text(row, "target")}</code></td><td>{num(row, "hitCount", "hit_count").toLocaleString()} 次</td><td><span className={`status ${enabled ? "good" : "muted"}`}>{enabled ? "启用" : "暂停"}</span></td><td><div className="row-actions"><button type="button" disabled={working === id} onClick={() => mutate(id, `/api/admin/links/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ enabled: !enabled }) })}>{enabled ? "暂停" : "启用"}</button><button className="danger" type="button" disabled={working === id} onClick={() => confirm(`确认删除短链接 ${id}？`) && mutate(id, `/api/admin/links/${encodeURIComponent(id)}`, { method: "DELETE" })}>删除</button></div></td></tr>; })}</tbody></Table>}
		{view === "blocked" && <Table><thead><tr><th>订阅源</th><th>指纹</th><th>原因</th><th>操作人</th><th aria-label="操作" /></tr></thead><tbody>{data.items.map((row, index) => { const id = text(row, "id"); return <tr key={id + index}><td><strong>{text(row, "hostname", "sourceHostname", "source_hostname")}</strong><small>{date(text(row, "createdAt", "created_at"))}</small></td><td><code>{text(row, "sourceFingerprint", "source_fingerprint").slice(0, 16)}</code></td><td>{text(row, "reason")}</td><td>{text(row, "actor", "actorEmail", "actor_email")}</td><td><div className="row-actions"><button className="danger" type="button" disabled={working === id} onClick={() => confirm("确认解除对这个订阅源的拦截？") && mutate(id, `/api/admin/blocked-sources/${encodeURIComponent(id)}`, { method: "DELETE" })}>解除拦截</button></div></td></tr>; })}</tbody></Table>}
		{view === "audit" && <Table><thead><tr><th>时间</th><th>操作人</th><th>操作</th><th>目标</th><th>详情</th></tr></thead><tbody>{data.items.map((row, index) => <tr key={text(row, "id") + index}><td>{date(text(row, "createdAt", "created_at"))}</td><td><strong>{text(row, "actorEmail", "actor_email", "actor")}</strong></td><td><span className="status muted">{text(row, "action")}</span></td><td>{text(row, "targetType", "target_type")} / {text(row, "targetId", "target_id")}</td><td className="metadata">{text(row, "metadata", "details")}</td></tr>)}</tbody></Table>}
		<Pagination data={data} onChange={setPage} /></>;
}

export function AdminApp() {
	const [view, setView] = useState<View>("overview"), current = views.find((item) => item.id === view) ?? views[0];
	return <div className="admin-shell"><aside className="admin-sidebar"><a className="admin-brand" href="/">SubMorph <span>管理</span></a><nav aria-label="管理导航">{views.map((item) => <button type="button" className={view === item.id ? "active" : ""} aria-current={view === item.id ? "page" : undefined} key={item.id} onClick={() => setView(item.id)}><span>{item.label}</span></button>)}</nav><div className="admin-identity"><i>管</i><span><strong>管理员</strong><small>安全会话</small></span><button type="button" onClick={logout} aria-label="退出登录">退出</button></div></aside><main className="admin-main"><header className="admin-header"><div><small>SUBMORPH / 管理后台</small><h1>{current.label}</h1><p>{current.description}</p></div><a href="/" target="_blank" rel="noreferrer">打开转换器</a></header><section className="admin-content">{view === "overview" ? <Overview /> : <PagedView view={view} />}</section></main></div>;
}
export default AdminApp;
