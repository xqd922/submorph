export const DEFAULT_CACHE_TTL = 300;

export interface ConversionCacheKey {
	sourceFingerprint: string;
	target: string;
	policyVersion: string;
	rendererVersion: string;
	cacheSchemaVersion?: string;
}

export interface CachedConversion {
	content: string;
	contentType: string;
	target: string;
	parsed: number;
	valid: number;
	rendered: number;
	skipped: number;
	warnings: unknown[];
	filename?: string;
}

export function conversionCacheKey(input: ConversionCacheKey): string {
	return ["conversion", input.cacheSchemaVersion ?? "v1", input.sourceFingerprint, input.target, input.policyVersion, input.rendererVersion].join(":");
}

export async function getCachedConversion(store: KVNamespace, key: ConversionCacheKey): Promise<CachedConversion | null> {
	const value = await store.get<unknown>(conversionCacheKey(key), "json");
	return isCachedConversion(value) ? value : null;
}

export async function putCachedConversion(store: KVNamespace, key: ConversionCacheKey, result: CachedConversion, ttl = DEFAULT_CACHE_TTL): Promise<boolean> {
	if (!isCompleteSuccess(result)) return false;
	await store.put(conversionCacheKey(key), JSON.stringify(result), { expirationTtl: ttl });
	return true;
}

export function isCompleteSuccess(result: CachedConversion): boolean {
	return result.valid > 0 && result.rendered === result.valid && result.skipped === 0;
}

function isCachedConversion(value: unknown): value is CachedConversion {
	if (!value || typeof value !== "object") return false;
	const item = value as Partial<CachedConversion>;
	return typeof item.content === "string" && typeof item.contentType === "string" && typeof item.target === "string"
		&& [item.parsed, item.valid, item.rendered, item.skipped].every((count) => typeof count === "number") && Array.isArray(item.warnings);
}
