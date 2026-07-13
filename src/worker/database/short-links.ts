import { decryptString, encryptString, fingerprintSource } from "../platform/crypto";

export interface ShortLinkSecrets { LINK_ENCRYPTION_KEY: string; SOURCE_HASH_KEY: string }
export interface ShortLink {
	id: string;
	targetFingerprint: string;
	outputTarget: string;
	enabled: boolean;
	hitCount: number;
	createdAt: string;
	lastAccessedAt?: string;
}

export async function createShortLink(
	db: D1Database,
	secrets: ShortLinkSecrets,
	input: { source: string; outputTarget: string; id?: string },
): Promise<ShortLink> {
	const targetFingerprint = await fingerprintSource(input.source, secrets.SOURCE_HASH_KEY);
	const existing = await findShortLink(db, targetFingerprint, input.outputTarget);
	if (existing) return mapRow(existing);
	const encrypted = await encryptString(input.source, secrets.LINK_ENCRYPTION_KEY);
	const row: ShortLinkRow = {
		id: input.id ?? createShortId(), encrypted_target: encrypted.ciphertext, encryption_iv: encrypted.iv,
		target_fingerprint: targetFingerprint, output_target: input.outputTarget, enabled: 1, hit_count: 0,
		created_at: new Date().toISOString(), last_accessed_at: null,
	};
	await db.prepare(`INSERT INTO short_links
		(id, encrypted_target, encryption_iv, target_fingerprint, output_target, enabled, hit_count, created_at)
		VALUES (?, ?, ?, ?, ?, 1, 0, ?)`).bind(
		row.id, row.encrypted_target, row.encryption_iv, row.target_fingerprint, row.output_target, row.created_at,
	).run();
	return mapRow(row);
}

export async function resolveShortLink(
	db: D1Database,
	encryptionKey: string,
	id: string,
): Promise<{ link: ShortLink; source: string } | null> {
	const row = await getRow(db, id);
	if (!row || row.enabled !== 1) return null;
	return {
		link: mapRow(row),
		source: await decryptString({ ciphertext: row.encrypted_target, iv: row.encryption_iv }, encryptionKey),
	};
}

export async function recordShortLinkHit(db: D1Database, id: string): Promise<void> {
	await db.prepare("UPDATE short_links SET hit_count = hit_count + 1, last_accessed_at = ? WHERE id = ?")
		.bind(new Date().toISOString(), id).run();
}

export async function setShortLinkEnabled(db: D1Database, id: string, enabled: boolean): Promise<boolean> {
	const result = await db.prepare("UPDATE short_links SET enabled = ? WHERE id = ?").bind(enabled ? 1 : 0, id).run();
	return result.meta.changes > 0;
}

export async function deleteShortLink(db: D1Database, id: string): Promise<boolean> {
	const result = await db.prepare("DELETE FROM short_links WHERE id = ?").bind(id).run();
	return result.meta.changes > 0;
}

export async function listShortLinks(db: D1Database, limit = 100, offset = 0): Promise<ShortLink[]> {
	const result = await db.prepare(`SELECT id, encrypted_target, encryption_iv, target_fingerprint, output_target,
		enabled, hit_count, created_at, last_accessed_at FROM short_links ORDER BY created_at DESC LIMIT ? OFFSET ?`)
		.bind(Math.min(500, Math.max(1, Math.trunc(limit))), Math.max(0, offset)).all<ShortLinkRow>();
	return result.results.map(mapRow);
}

async function findShortLink(db: D1Database, fingerprint: string, outputTarget: string): Promise<ShortLinkRow | null> {
	return db.prepare(`SELECT id, encrypted_target, encryption_iv, target_fingerprint, output_target,
		enabled, hit_count, created_at, last_accessed_at FROM short_links WHERE target_fingerprint = ? AND output_target = ?`)
		.bind(fingerprint, outputTarget).first<ShortLinkRow>();
}

function getRow(db: D1Database, id: string): Promise<ShortLinkRow | null> {
	return db.prepare(`SELECT id, encrypted_target, encryption_iv, target_fingerprint, output_target,
		enabled, hit_count, created_at, last_accessed_at FROM short_links WHERE id = ?`).bind(id).first<ShortLinkRow>();
}

interface ShortLinkRow {
	id: string; encrypted_target: string; encryption_iv: string; target_fingerprint: string; output_target: string;
	enabled: number; hit_count: number; created_at: string; last_accessed_at: string | null;
}

function mapRow(row: ShortLinkRow): ShortLink {
	return { id: row.id, targetFingerprint: row.target_fingerprint, outputTarget: row.output_target,
		enabled: row.enabled === 1, hitCount: row.hit_count, createdAt: row.created_at, lastAccessedAt: row.last_accessed_at ?? undefined };
}

function createShortId(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(9));
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
