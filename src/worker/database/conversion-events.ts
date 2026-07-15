export interface ConversionEventInput {
	sourceFingerprint: string;
	sourceHostname?: string;
	target: string;
	clientFamily?: string;
	success: boolean;
	cacheHit?: boolean;
	nodeCount?: number;
	durationMs: number;
	errorCode?: string;
	createdAt?: string;
}

export interface ConversionEvent extends ConversionEventInput {
	id: number;
	cacheHit: boolean;
	nodeCount: number;
	createdAt: string;
}

export interface ConversionEventFilters {
	q?: string;
	target?: string;
	success?: boolean;
	cacheHit?: boolean;
}

export async function recordConversionEvent(db: D1Database, input: ConversionEventInput): Promise<void> {
	await db.prepare(`INSERT INTO conversion_events
		(source_fingerprint, source_hostname, target, client_family, success, cache_hit, node_count, duration_ms, error_code, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
		input.sourceFingerprint,
		input.sourceHostname ?? null,
		input.target,
		input.clientFamily ?? null,
		input.success ? 1 : 0,
		input.cacheHit ? 1 : 0,
		input.nodeCount ?? 0,
		Math.round(input.durationMs),
		input.errorCode ?? null,
		input.createdAt ?? new Date().toISOString(),
	).run();
}


export async function listConversionEvents(db: D1Database, limit = 100, offset = 0, filters: ConversionEventFilters = {}): Promise<{ items: ConversionEvent[]; total: number }> {
	const conditions: string[] = [], values: Array<string | number> = [];
	if (filters.q) {
		conditions.push("(source_hostname LIKE ? OR source_fingerprint LIKE ? OR client_family LIKE ? OR error_code LIKE ?)");
		const q = `%${filters.q.slice(0, 100)}%`; values.push(q, q, q, q);
	}
	if (filters.target) { conditions.push("target = ?"); values.push(filters.target); }
	if (filters.success !== undefined) { conditions.push("success = ?"); values.push(filters.success ? 1 : 0); }
	if (filters.cacheHit !== undefined) { conditions.push("cache_hit = ?"); values.push(filters.cacheHit ? 1 : 0); }
	const where = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
	const count = await db.prepare(`SELECT COUNT(*) total FROM conversion_events${where}`).bind(...values).first<{ total: number }>();
	const result = await db.prepare(`SELECT id, source_fingerprint, source_hostname, target, client_family,
		success, cache_hit, node_count, duration_ms, error_code, created_at
		FROM conversion_events${where} ORDER BY id DESC LIMIT ? OFFSET ?`).bind(...values, clampLimit(limit), Math.max(0, offset)).all<ConversionEventRow>();
	return { items: result.results.map(mapRow), total: Number(count?.total ?? 0) };
}

interface ConversionEventRow {
	id: number;
	source_fingerprint: string;
	source_hostname: string | null;
	target: string;
	client_family: string | null;
	success: number;
	cache_hit: number;
	node_count: number;
	duration_ms: number;
	error_code: string | null;
	created_at: string;
}

function mapRow(row: ConversionEventRow): ConversionEvent {
	return {
		id: row.id,
		sourceFingerprint: row.source_fingerprint,
		sourceHostname: row.source_hostname ?? undefined,
		target: row.target,
		clientFamily: row.client_family ?? undefined,
		success: row.success === 1,
		cacheHit: row.cache_hit === 1,
		nodeCount: row.node_count,
		durationMs: row.duration_ms,
		errorCode: row.error_code ?? undefined,
		createdAt: row.created_at,
	};
}

function clampLimit(limit: number): number { return Math.min(500, Math.max(1, Math.trunc(limit))); }
