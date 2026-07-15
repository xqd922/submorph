import { fingerprintSource } from "../platform/crypto";

export interface BlockedSource {
	id: number;
	sourceFingerprint: string;
	hostname?: string;
	reason?: string;
	actor: string;
	createdAt: string;
}

export interface BlockedSourceFilters { q?: string }

export async function blockSource(
	db: D1Database,
	sourceHashKey: string,
	input: { source: string; hostname?: string; reason?: string; actor: string },
): Promise<string> {
	const fingerprint = await fingerprintSource(input.source, sourceHashKey);
	await blockSourceFingerprint(db, { fingerprint, hostname: input.hostname, reason: input.reason, actor: input.actor });
	return fingerprint;
}

export async function blockSourceFingerprint(
	db: D1Database,
	input: { fingerprint: string; hostname?: string; reason?: string; actor: string },
): Promise<void> {
	await db.prepare(`INSERT INTO blocked_sources (source_fingerprint, hostname, reason, actor, created_at)
		VALUES (?, ?, ?, ?, ?) ON CONFLICT(source_fingerprint) DO UPDATE SET
		hostname = excluded.hostname, reason = excluded.reason, actor = excluded.actor, created_at = excluded.created_at`)
		.bind(input.fingerprint, input.hostname ?? null, input.reason ?? null, input.actor, new Date().toISOString()).run();
}

export async function getBlockedSource(db: D1Database, sourceHashKey: string, source: string): Promise<BlockedSource | null> {
	const fingerprint = await fingerprintSource(source, sourceHashKey);
	const row = await db.prepare(`SELECT id, source_fingerprint, hostname, reason, actor, created_at
		FROM blocked_sources WHERE source_fingerprint = ?`).bind(fingerprint).first<BlockedSourceRow>();
	return row ? mapRow(row) : null;
}

export async function unblockSource(db: D1Database, sourceFingerprint: string): Promise<boolean> {
	const result = await db.prepare("DELETE FROM blocked_sources WHERE source_fingerprint = ?").bind(sourceFingerprint).run();
	return result.meta.changes > 0;
}

export async function listBlockedSources(db: D1Database, limit = 100, offset = 0, filters: BlockedSourceFilters = {}): Promise<{ items: BlockedSource[]; total: number }> {
	const values: string[] = [];
	const where = filters.q ? " WHERE hostname LIKE ? OR source_fingerprint LIKE ? OR reason LIKE ? OR actor LIKE ?" : "";
	if (filters.q) { const q = `%${filters.q.slice(0, 100)}%`; values.push(q, q, q, q); }
	const count = await db.prepare(`SELECT COUNT(*) total FROM blocked_sources${where}`).bind(...values).first<{ total: number }>();
	const result = await db.prepare(`SELECT id, source_fingerprint, hostname, reason, actor, created_at
		FROM blocked_sources${where} ORDER BY id DESC LIMIT ? OFFSET ?`)
		.bind(...values, Math.min(500, Math.max(1, Math.trunc(limit))), Math.max(0, offset)).all<BlockedSourceRow>();
	return { items: result.results.map(mapRow), total: Number(count?.total ?? 0) };
}

interface BlockedSourceRow {
	id: number; source_fingerprint: string; hostname: string | null; reason: string | null; actor: string; created_at: string;
}

function mapRow(row: BlockedSourceRow): BlockedSource {
	return { id: row.id, sourceFingerprint: row.source_fingerprint, hostname: row.hostname ?? undefined,
		reason: row.reason ?? undefined, actor: row.actor, createdAt: row.created_at };
}
