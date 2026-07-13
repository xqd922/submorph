const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface EncryptedValue { ciphertext: string; iv: string }

export async function encryptString(value: string, encodedKey: string): Promise<EncryptedValue> {
	const key = await importAesKey(encodedKey, ["encrypt"]);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(value));
	return { ciphertext: toBase64Url(new Uint8Array(ciphertext)), iv: toBase64Url(iv) };
}

export async function decryptString(value: EncryptedValue, encodedKey: string): Promise<string> {
	const key = await importAesKey(encodedKey, ["decrypt"]);
	const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64Url(value.iv) }, key, fromBase64Url(value.ciphertext));
	return decoder.decode(plaintext);
}

export async function fingerprintSource(source: string, secret: string): Promise<string> {
	if (!secret) throw new Error("SOURCE_HASH_KEY is required");
	const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(normalizeSource(source)));
	return toBase64Url(new Uint8Array(signature));
}

export function normalizeSource(source: string): string {
	const trimmed = source.trim();
	if (!/^https?:\/\//i.test(trimmed)) return trimmed;
	const url = new URL(trimmed);
	url.hash = "";
	return url.toString();
}

function importAesKey(encodedKey: string, usages: Array<"encrypt" | "decrypt">) {
	const bytes = fromBase64Url(encodedKey);
	if (bytes.byteLength !== 32) throw new Error("LINK_ENCRYPTION_KEY must encode exactly 32 bytes");
	return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, usages);
}

function toBase64Url(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
	const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
	const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
	let binary: string;
	try { binary = atob(padded); } catch { throw new Error("Invalid base64url value"); }
	return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
