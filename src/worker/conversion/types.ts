export type OutputTarget = "mihomo" | "mihomo-provider" | "singbox" | "v2rayng" | "preview";

export type Transport = { type: "tcp" } | { type: "ws" | "http" | "h2" | "xhttp"; path?: string; host?: string } | { type: "grpc"; serviceName?: string };
export interface TlsOptions { security: "tls" | "reality"; serverName?: string; insecure?: boolean; alpn?: string[]; clientFingerprint?: string; reality?: { publicKey: string; shortId?: string } }
interface BaseNode { name: string; server: string; port: number; transport: Transport; tls?: TlsOptions }
export interface ShadowsocksNode extends BaseNode { protocol: "ss"; method: string; password: string; plugin?: string }
export interface VmessNode extends BaseNode { protocol: "vmess"; uuid: string; alterId: number; security: string }
export interface VlessNode extends BaseNode { protocol: "vless"; uuid: string; encryption: string; flow?: string }
export interface TrojanNode extends BaseNode { protocol: "trojan"; password: string }
export type ProxyNode = ShadowsocksNode | VmessNode | VlessNode | TrojanNode | Hy2Node | Socks5Node | AnyTlsNode | SnellNode;
export interface ConversionWarning { code: "INVALID_NODE" | "DUPLICATE_NODE" | "UNSUPPORTED_TARGET"; message: string; index?: number; name?: string }
export interface ConversionResult { target: OutputTarget; content: string; contentType: string; parsed: number; valid: number; rendered: number; skipped: number; warnings: ConversionWarning[] }
export class ConversionError extends Error {
	constructor(public readonly code: "INVALID_INPUT" | "UNSUPPORTED_FORMAT" | "NO_VALID_NODES" | "NO_RENDERABLE_NODES", message: string, public readonly warnings: ConversionWarning[] = []) { super(message); this.name = "ConversionError" }
}
import type { AnyTlsNode } from "./protocols/anytls";
import type { Hy2Node } from "./protocols/hysteria2";
import type { SnellNode } from "./protocols/snell";
import type { Socks5Node } from "./protocols/socks5";
