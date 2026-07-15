import { useCallback, useEffect, useState } from "react";
import "./AdminApp.css";

type View = "overview" | "conversions" | "links" | "blocked" | "audit";
type Row = Record<string, unknown>;
type Page = { items: Row[]; page: number; totalPages: number; total: number };
const views: Array<{ id: View; label: string; mark: string }> = [
	{ id: "overview", label: "Overview", mark: "O" }, { id: "conversions", label: "Conversions", mark: "C" },
	{ id: "links", label: "Short links", mark: "L" }, { id: "blocked", label: "Blocked sources", mark: "B" }, { id: "audit", label: "Audit log", mark: "A" },
];
const endpoints = { conversions: "/api/admin/conversions", links: "/api/admin/links", blocked: "/api/admin/blocked-sources", audit: "/api/admin/audit" } as const;
const object = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
function text(row: Row, ...keys: string[]) { for (const key of keys) { const value = row[key]; if (typeof value === "string" || typeof value === "number") return String(value); } return "-"; }
function num(row: Row, ...keys: string[]) { for (const key of keys) { const value = row[key]; if (typeof value === "number") return value; if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value); } return 0; }
function yes(row: Row, ...keys: string[]) { for (const key of keys) { const value = row[key]; if (typeof value === "boolean") return value; if (value === 1 || value === "1") return true; if (value === 0 || value === "0") return false; } return false; }
function date(value: string) { if (value === "-") return value; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(parsed); }
function readPage(payload: unknown, requestedPage: number): Page {
	const root = object(payload), data = object(root.data);
	const items = [root.items, root.events, root.links, root.sources, root.audit, data.items, data.events, data.links, data.sources, data.audit, root.data].find(Array.isArray) as Row[] | undefined;
	const meta = { ...object(root.pagination), ...object(data.pagination), ...root, ...data };
	return { items: items ?? [], page: num(meta, "page", "currentPage") || requestedPage, totalPages: Math.max(1, num(meta, "totalPages", "pages", "pageCount") || 1), total: num(meta, "total", "count") || items?.length || 0 };
}
async function request(path: string, init?: RequestInit) {
	const token = sessionStorage.getItem("submorph-admin-token") ?? "";
	const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init?.headers } });
	if (response.status === 401) { sessionStorage.removeItem("submorph-admin-token"); location.reload(); }
	const payload: unknown = await response.json().catch(() => ({}));
	if (!response.ok) { const root = object(payload), error = object(root.error); const message = text(error, "message") !== "-" ? text(error, "message") : text(root, "message", "error"); throw new Error(message !== "-" ? message : `Request failed (${response.status})`); }
	return payload;
}
function LoadingState() { return <div className="admin-state"><i className="admin-spinner" /><strong>Loading workspace</strong><span>Fetching the latest data...</span></div>; }
function EmptyState({ label }: { label: string }) { return <div className="admin-state"><b>0</b><strong>No {label} yet</strong><span>New activity will appear here automatically.</span></div>; }
function ErrorState({ message, retry }: { message: string; retry: () => void }) { return <div className="admin-state error"><b>!</b><strong>Could not load this view</strong><span>{message}</span><button type="button" onClick={retry}>Try again</button></div>; }
function Pagination({ data, onChange }: { data: Page; onChange: (page: number) => void }) { if (data.totalPages <= 1) return null; return <div className="admin-pagination"><span>{data.total.toLocaleString()} records</span><div><button type="button" disabled={data.page <= 1} onClick={() => onChange(data.page - 1)}>Previous</button><b>{data.page} / {data.totalPages}</b><button type="button" disabled={data.page >= data.totalPages} onClick={() => onChange(data.page + 1)}>Next</button></div></div>; }
function Table({ children }: { children: React.ReactNode }) { return <div className="admin-table-wrap"><table>{children}</table></div>; }

function Overview() {
	const [data, setData] = useState<Row | null>(null), [error, setError] = useState("");
	const load = useCallback(() => { request("/api/admin/overview").then((payload) => { setError(""); setData({ ...object(payload), ...object(object(payload).data) }); }).catch((reason: Error) => setError(reason.message)); }, []);
	useEffect(load, [load]);
	if (error) return <ErrorState message={error} retry={load} />; if (!data) return <LoadingState />;
	const cards = [["Conversions today", num(data, "todayConversions", "conversionsToday", "totalToday"), "requests"], ["Success rate", num(data, "successRate"), "%"], ["Cache hit rate", num(data, "cacheHitRate"), "%"], ["Average latency", num(data, "averageDurationMs", "avgDurationMs", "averageLatency"), "ms"]] as const;
	const rawTrend = data.trend ?? data.daily ?? data.lastSevenDays, trend = Array.isArray(rawTrend) ? rawTrend.map(object) : [], max = Math.max(1, ...trend.map((item) => num(item, "count", "total", "value")));
	const recent = Array.isArray(data.recentErrors) ? data.recentErrors.map(object) : [];
	return <><div className="metric-grid">{cards.map(([label, value, suffix]) => <article key={label}><span>{label}</span><strong>{value.toLocaleString()}<small>{suffix}</small></strong><i /></article>)}</div><div className="overview-grid"><section className="admin-card"><header><div><span>Activity</span><h2>Last 7 days</h2></div><em>Live</em></header>{trend.length ? <div className="mini-chart">{trend.map((item, index) => { const value = num(item, "count", "total", "value"); return <div key={`${text(item, "date", "label")}-${index}`}><span title={`${value} conversions`} style={{ height: `${Math.max(8, value / max * 100)}%` }} /><small>{text(item, "label", "day", "date").slice(0, 5)}</small></div>; })}</div> : <EmptyState label="activity" />}</section><section className="admin-card"><header><div><span>Health</span><h2>Recent errors</h2></div></header>{recent.length ? <div className="error-list">{recent.slice(0, 6).map((item, index) => <div key={`${text(item, "code")}-${index}`}><b>{text(item, "code", "errorCode")}</b><span>{num(item, "count").toLocaleString()}</span></div>)}</div> : <EmptyState label="errors" />}</section></div></>;
}

function PagedView({ view }: { view: Exclude<View, "overview"> }) {
	const [page, setPage] = useState(1), [data, setData] = useState<Page | null>(null), [error, setError] = useState(""), [working, setWorking] = useState("");
	const load = useCallback(() => { request(`${endpoints[view]}?page=${page}`).then((payload) => { setError(""); setData(readPage(payload, page)); }).catch((reason: Error) => setError(reason.message)); }, [page, view]);
	useEffect(load, [load]);
	async function mutate(id: string, path: string, init: RequestInit) { setWorking(id); setError(""); try { await request(path, init); load(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Action failed"); } finally { setWorking(""); } }
	if (error && !data) return <ErrorState message={error} retry={load} />;
	if (!data) return <LoadingState />;
	if (!data.items.length) return <EmptyState label={views.find((item) => item.id === view)?.label.toLowerCase() ?? "records"} />;
	return <>{error && <p className="admin-inline-error" role="alert">{error}</p>}
		{view === "conversions" && <Table><thead><tr><th>Time</th><th>Source</th><th>Target</th><th>Outcome</th><th>Nodes</th><th>Latency</th></tr></thead><tbody>{data.items.map((row, index) => <tr key={text(row, "id") + index}><td>{date(text(row, "createdAt", "created_at", "time"))}</td><td><strong>{text(row, "sourceHostname", "source_hostname", "hostname")}</strong><small>{text(row, "sourceFingerprint", "source_fingerprint").slice(0, 12)}</small></td><td><code>{text(row, "target")}</code></td><td><span className={`status ${yes(row, "success") ? "good" : "bad"}`}>{yes(row, "success") ? "Success" : text(row, "errorCode", "error_code")}</span></td><td>{num(row, "nodeCount", "node_count")}</td><td>{num(row, "durationMs", "duration_ms")} ms</td></tr>)}</tbody></Table>}
		{view === "links" && <Table><thead><tr><th>Short link</th><th>Source</th><th>Target</th><th>Usage</th><th>Status</th><th aria-label="Actions" /></tr></thead><tbody>{data.items.map((row, index) => { const id = text(row, "id"), enabled = yes(row, "enabled"); return <tr key={id + index}><td><strong>/s/{id}</strong><small>{date(text(row, "createdAt", "created_at"))}</small></td><td>{text(row, "hostname", "sourceHostname", "source_hostname")}</td><td><code>{text(row, "target")}</code></td><td>{num(row, "hitCount", "hit_count").toLocaleString()} hits</td><td><span className={`status ${enabled ? "good" : "muted"}`}>{enabled ? "Active" : "Paused"}</span></td><td><div className="row-actions"><button type="button" disabled={working === id} onClick={() => mutate(id, `/api/admin/links/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ enabled: !enabled }) })}>{enabled ? "Pause" : "Enable"}</button><button className="danger" type="button" disabled={working === id} onClick={() => confirm(`Delete short link ${id}?`) && mutate(id, `/api/admin/links/${encodeURIComponent(id)}`, { method: "DELETE" })}>Delete</button></div></td></tr>; })}</tbody></Table>}
		{view === "blocked" && <Table><thead><tr><th>Source</th><th>Fingerprint</th><th>Reason</th><th>Blocked by</th><th aria-label="Actions" /></tr></thead><tbody>{data.items.map((row, index) => { const id = text(row, "id"); return <tr key={id + index}><td><strong>{text(row, "hostname", "sourceHostname", "source_hostname")}</strong><small>{date(text(row, "createdAt", "created_at"))}</small></td><td><code>{text(row, "sourceFingerprint", "source_fingerprint").slice(0, 16)}</code></td><td>{text(row, "reason")}</td><td>{text(row, "actor", "actorEmail", "actor_email")}</td><td><div className="row-actions"><button className="danger" type="button" disabled={working === id} onClick={() => confirm("Unblock this source?") && mutate(id, `/api/admin/blocked-sources/${encodeURIComponent(id)}`, { method: "DELETE" })}>Unblock</button></div></td></tr>; })}</tbody></Table>}
		{view === "audit" && <Table><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Target</th><th>Details</th></tr></thead><tbody>{data.items.map((row, index) => <tr key={text(row, "id") + index}><td>{date(text(row, "createdAt", "created_at"))}</td><td><strong>{text(row, "actorEmail", "actor_email", "actor")}</strong></td><td><span className="status muted">{text(row, "action")}</span></td><td>{text(row, "targetType", "target_type")} / {text(row, "targetId", "target_id")}</td><td className="metadata">{text(row, "metadata", "details")}</td></tr>)}</tbody></Table>}
		<Pagination data={data} onChange={setPage} /></>;
}

export function AdminApp() {
	const [view, setView] = useState<View>("overview"), current = views.find((item) => item.id === view) ?? views[0];
	return <div className="admin-shell"><aside className="admin-sidebar"><a className="admin-brand" href="/"><i />SubMorph <span>Admin</span></a><nav aria-label="Admin navigation">{views.map((item) => <button type="button" className={view === item.id ? "active" : ""} aria-current={view === item.id ? "page" : undefined} key={item.id} onClick={() => setView(item.id)}><b aria-hidden="true">{item.mark}</b><span>{item.label}</span></button>)}</nav><div className="admin-identity"><i>AD</i><span><strong>Administrator</strong><small>Cloudflare Access</small></span><a href="/cdn-cgi/access/logout" aria-label="Sign out">Exit</a></div></aside><main className="admin-main"><header className="admin-header"><div><small>SUBMORPH / ADMIN</small><h1>{current.label}</h1><p>Monitor conversions and manage service access.</p></div><a href="/" target="_blank" rel="noreferrer">Open converter</a></header><section className="admin-content">{view === "overview" ? <Overview /> : <PagedView view={view} />}</section></main></div>;
}
export default AdminApp;
