export interface AdminAuditInput {
	actorEmail: string;
	action: string;
	targetType: string;
	targetId?: string;
	metadata?: Record<string, unknown>;
	createdAt?: string;
}

export interface AdminAuditRecord extends AdminAuditInput { id: number; createdAt: string }

export async function recordAdminAudit(db: D1Database, input: AdminAuditInput): Promise<void> {
	await db.prepare(`INSERT INTO admin_audit_log
		(actor_email, action, target_type, target_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
		.bind(input.actorEmail, input.action, input.targetType, input.targetId ?? null,
			input.metadata ? JSON.stringify(input.metadata) : null, input.createdAt ?? new Date().toISOString()).run();
}

export async function listAdminAudit(db: D1Database, limit = 100, offset = 0): Promise<AdminAuditRecord[]> {
	const result = await db.prepare(`SELECT id, actor_email, action, target_type, target_id, metadata, created_at
		FROM admin_audit_log ORDER BY id DESC LIMIT ? OFFSET ?`)
		.bind(Math.min(500, Math.max(1, Math.trunc(limit))), Math.max(0, offset)).all<AdminAuditRow>();
	return result.results.map((row) => ({
		id: row.id, actorEmail: row.actor_email, action: row.action, targetType: row.target_type,
		targetId: row.target_id ?? undefined, metadata: parseMetadata(row.metadata), createdAt: row.created_at,
	}));
}

interface AdminAuditRow {
	id: number; actor_email: string; action: string; target_type: string; target_id: string | null; metadata: string | null; created_at: string;
}

function parseMetadata(value: string | null): Record<string, unknown> | undefined {
	if (!value) return undefined;
	try {
		const parsed: unknown = JSON.parse(value);
		return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined;
	} catch { return undefined; }
}
