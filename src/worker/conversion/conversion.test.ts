import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { convertSubscriptionText, ConversionError } from "./index";

const vmess = `vmess://${btoa(JSON.stringify({
	v: "2",
	ps: "VMess WS",
	add: "vm.example.com",
	port: "443",
	id: "00000000-0000-4000-8000-000000000001",
	aid: "0",
	scy: "auto",
	net: "ws",
	host: "cdn.example.com",
	path: "/ws",
	tls: "tls",
	sni: "vm.example.com",
}))}`;

const lines = [
	"ss://YWVzLTI1Ni1nY206cGFzc3dvcmQ@ss.example.com:8388#Shadowsocks",
	vmess,
	"vless://00000000-0000-4000-8000-000000000002@vl.example.com:443?encryption=none&security=tls&type=grpc&serviceName=edge&sni=vl.example.com#VLESS",
	"trojan://secret@tr.example.com:443?security=tls&type=ws&path=%2Fsocket&sni=tr.example.com#Trojan",
];

describe("convertSubscriptionText", () => {
	it("renders four core protocols as a Mihomo provider", () => {
		const result = convertSubscriptionText(lines.join("\n"), "mihomo-provider");
		expect(result.rendered).toBe(4);
		expect(result.content).toContain("type: ss");
		expect(result.content).toContain("type: vmess");
		expect(result.content).toContain("type: vless");
		expect(result.content).toContain("type: trojan");
	});

	it("accepts a Base64-wrapped URI list for v2rayNG", () => {
		const source = btoa(lines.slice(0, 2).join("\n"));
		const result = convertSubscriptionText(source, "v2rayng");
		expect(atob(result.content)).toContain("ss://");
		expect(atob(result.content)).toContain("vmess://");
	});

	it("reads the proxies root from Mihomo YAML", () => {
		const result = convertSubscriptionText(`proxies:\n  - name: YAML SS\n    type: ss\n    server: yaml.example.com\n    port: 443\n    cipher: aes-128-gcm\n    password: secret\n`, "preview");
		expect(result.rendered).toBe(1);
		expect(result.content).toContain("Clash / Mihomo");
		expect(result.content).toContain("type: ss");
		expect(result.content).toContain("sing-box");
	});

	it("restores the full Clash and sing-box profiles", () => {
		const clash = convertSubscriptionText(lines.join("\n"), "mihomo").content;
		expect(clash).toContain("mixed-port: 7890");
		expect(clash).toContain("name: Manual");
		expect(clash).toContain("rule-providers:");
		const singbox = convertSubscriptionText(lines.join("\n"), "singbox").content;
		expect(singbox).toContain('"dns"');
		expect(singbox).toContain('"inbounds"');
		expect(singbox).toContain('"experimental"');
	});

	it("formats remote subscription node names like the previous project", () => {
		const source = `proxies:\n  - name: 香港 IPLC 0.2x\n    type: ss\n    server: hk1.example.com\n    port: 443\n    cipher: aes-128-gcm\n    password: secret\n  - name: 香港 IPv6\n    type: ss\n    server: hk2.example.com\n    port: 443\n    cipher: aes-128-gcm\n    password: secret\n`;
		const result = convertSubscriptionText(source, "mihomo-provider", { formatNames: true, isAirportSubscription: true });
		const proxies = (parseYaml(result.content) as { proxies: Array<{ name: string }> }).proxies;
		expect(proxies.map((proxy) => proxy.name)).toEqual(["🇭🇰 Hong Kong 01 [0.2x]", "🇭🇰 Hong Kong 02 [IPv6]"]);
	});

	it("preserves Hysteria2 port hopping from Mihomo YAML", () => {
		const source = `proxies:\n  - name: YAML HY2\n    type: hysteria2\n    server: hy.example.com\n    port: 443\n    ports: 20000-30000\n    password: secret\n    sni: hy.example.com\n`;
		expect(convertSubscriptionText(source, "mihomo-provider").content).toContain("ports: 20000-30000");
		expect(convertSubscriptionText(source, "singbox").content).toContain('"server_ports": [');
		expect(convertSubscriptionText(source, "singbox").content).toContain('"20000:30000"');
	});

	it("rejects XHTTP when the target cannot express it", () => {
		const source = "vless://00000000-0000-4000-8000-000000000003@x.example.com:443?encryption=none&security=tls&type=xhttp&path=%2F&sni=x.example.com#XHTTP";
		expect(() => convertSubscriptionText(source, "singbox")).toThrowError(ConversionError);
	});

	it.each([
		["Hysteria2", "hysteria2://secret@hy.example.com:443?sni=hy.example.com&obfs=salamander&obfs-password=mask&up=50&down=200#HY2", "hysteria2", "hysteria2"],
		["SOCKS5", "socks5://user:pass@socks.example.com:1080#SOCKS", "socks5", "socks"],
		["AnyTLS", "anytls://secret@any.example.com:443?security=tls&sni=any.example.com#AnyTLS", "anytls", "anytls"],
		["Snell", "snell://secret@snell.example.com:443?version=4&obfs=tls&obfs-host=cdn.example.com#Snell", "snell", "snell"],
	])("renders %s to Mihomo and sing-box", (_name, source, mihomoType, singboxType) => {
		const mihomo = convertSubscriptionText(source, "mihomo-provider");
		const singbox = convertSubscriptionText(source, "singbox");
		expect(mihomo.content).toContain(`type: ${mihomoType}`);
		expect(singbox.content).toContain(`"type": "${singboxType}"`);
	});

	it("does not claim v2rayNG support for unverified v1 protocols", () => {
		expect(() => convertSubscriptionText("anytls://secret@any.example.com:443?security=tls&sni=any.example.com#AnyTLS", "v2rayng"))
			.toThrowError(ConversionError);
	});
});
