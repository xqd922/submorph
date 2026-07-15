import type { ProxyNode } from "./types";

interface RegionData { name: string; chinese: string[]; aliases?: string[] }
interface RegionInfo { flag: string; code: string; name: string }

const REGIONS: Record<string, RegionData> = {

  'HK': { name: 'Hong Kong', chinese: ['香港', '港'], aliases: ['HKG'] },
  'TW': { name: 'Taiwan', chinese: ['台湾', '台'], aliases: ['TWN'] },
  'MO': { name: 'Macao', chinese: ['澳门'] },
  'JP': { name: 'Japan', chinese: ['日本'], aliases: ['JPN'] },
  'KR': { name: 'South Korea', chinese: ['韩国', '南韩'], aliases: ['KOR'] },

  'SG': { name: 'Singapore', chinese: ['新加坡', '狮城', '坡'], aliases: ['SGP'] },
  'MY': { name: 'Malaysia', chinese: ['马来西亚', '马来', '大马'], aliases: ['MYS'] },
  'ID': { name: 'Indonesia', chinese: ['印尼', '印度尼西亚'], aliases: ['IDN'] },
  'TH': { name: 'Thailand', chinese: ['泰国', '泰'], aliases: ['THA'] },
  'VN': { name: 'Vietnam', chinese: ['越南', '越'], aliases: ['VNM'] },
  'PH': { name: 'Philippines', chinese: ['菲律宾', '菲'], aliases: ['PHL'] },
  'KH': { name: 'Cambodia', chinese: ['柬埔寨'], aliases: ['KHM'] },

  'IN': { name: 'India', chinese: ['印度'], aliases: ['IND'] },
  'PK': { name: 'Pakistan', chinese: ['巴基斯坦'], aliases: ['PAK'] },

  'GB': { name: 'United Kingdom', chinese: ['英国', '英'], aliases: ['GBR', 'UK'] },
  'DE': { name: 'Germany', chinese: ['德国', '德'], aliases: ['DEU'] },
  'FR': { name: 'France', chinese: ['法国', '法'], aliases: ['FRA'] },
  'IT': { name: 'Italy', chinese: ['意大利', '意'], aliases: ['ITA'] },
  'ES': { name: 'Spain', chinese: ['西班牙'], aliases: ['ESP'] },
  'NL': { name: 'Netherlands', chinese: ['荷兰'], aliases: ['NLD'] },
  'PL': { name: 'Poland', chinese: ['波兰'], aliases: ['POL'] },
  'UA': { name: 'Ukraine', chinese: ['乌克兰'], aliases: ['UKR'] },
  'CH': { name: 'Switzerland', chinese: ['瑞士'] },
  'SE': { name: 'Sweden', chinese: ['瑞典'], aliases: ['SWE'] },
  'NO': { name: 'Norway', chinese: ['挪威'], aliases: ['NOR'] },
  'FI': { name: 'Finland', chinese: ['芬兰'], aliases: ['FIN'] },
  'DK': { name: 'Denmark', chinese: ['丹麦'], aliases: ['DNK'] },
  'IS': { name: 'Iceland', chinese: ['冰岛'], aliases: ['ISL'] },
  'AT': { name: 'Austria', chinese: ['奥地利'], aliases: ['AUT'] },
  'IE': { name: 'Ireland', chinese: ['爱尔兰'], aliases: ['IRL'] },
  'HU': { name: 'Hungary', chinese: ['匈牙利'], aliases: ['HUN'] },
  'BG': { name: 'Bulgaria', chinese: ['保加利亚'], aliases: ['BGR'] },
  'MD': { name: 'Moldova', chinese: ['摩尔多瓦'], aliases: ['MDA'] },
  'RO': { name: 'Romania', chinese: ['罗马尼亚'], aliases: ['ROU'] },
  'CZ': { name: 'Czech Republic', chinese: ['捷克'], aliases: ['CZE'] },
  'PT': { name: 'Portugal', chinese: ['葡萄牙'], aliases: ['PRT'] },
  'BE': { name: 'Belgium', chinese: ['比利时'], aliases: ['BEL'] },
  'GR': { name: 'Greece', chinese: ['希腊'], aliases: ['GRC'] },

  'US': { name: 'United States', chinese: ['美国', '美'], aliases: ['USA'] },
  'CA': { name: 'Canada', chinese: ['加拿大'], aliases: ['CAN'] },
  'MX': { name: 'Mexico', chinese: ['墨西哥'], aliases: ['MEX'] },

  'BR': { name: 'Brazil', chinese: ['巴西'], aliases: ['BRA'] },
  'AR': { name: 'Argentina', chinese: ['阿根廷'], aliases: ['ARG'] },
  'CL': { name: 'Chile', chinese: ['智利'], aliases: ['CHL'] },
  'PE': { name: 'Peru', chinese: ['秘鲁'], aliases: ['PER'] },
  'CO': { name: 'Colombia', chinese: ['哥伦比亚'], aliases: ['COL'] },

  'AU': { name: 'Australia', chinese: ['澳大利亚', '澳洲', '澳'], aliases: ['AUS'] },
  'NZ': { name: 'New Zealand', chinese: ['新西兰'], aliases: ['NZL'] },

  'RU': { name: 'Russia', chinese: ['俄罗斯', '俄'], aliases: ['RUS'] },
  'TR': { name: 'Turkey', chinese: ['土耳其'], aliases: ['TUR'] },
  'KZ': { name: 'Kazakhstan', chinese: ['哈萨克斯坦', '哈萨克', '哈国'], aliases: ['KAZ'] },
  'IL': { name: 'Israel', chinese: ['以色列'], aliases: ['ISR'] },
  'AE': { name: 'United Arab Emirates', chinese: ['阿联酋'], aliases: ['UAE'] },
  'SA': { name: 'Saudi Arabia', chinese: ['沙特', '沙特阿拉伯'], aliases: ['SAU'] },
  'IQ': { name: 'Iraq', chinese: ['伊拉克'], aliases: ['IRQ'] },

  'ZA': { name: 'South Africa', chinese: ['南非'] },
  'NG': { name: 'Nigeria', chinese: ['尼日利亚'], aliases: ['NGA'] },
  'EG': { name: 'Egypt', chinese: ['埃及'], aliases: ['EGY'] },
}

const CHINESE_TO_ISO: Record<string, string> = {};
const ENGLISH_TO_ISO: Record<string, string> = {};
for (const [code, data] of Object.entries(REGIONS)) {
	for (const name of data.chinese) CHINESE_TO_ISO[name] = code;
	for (const name of [code, data.name, ...(data.aliases ?? [])]) ENGLISH_TO_ISO[name] = code;
}
const CHINESE_KEYS = Object.keys(CHINESE_TO_ISO).sort((a, b) => b.length - a.length);
const ENGLISH_KEYS = Object.keys(ENGLISH_TO_ISO).sort((a, b) => b.length - a.length);
const FLAG_OVERRIDES: Record<string, string> = { TW: "🇨🇳" };

export function formatNodeNames(nodes: ProxyNode[]): ProxyNode[] {
	const counters: Record<string, number> = {};
	return nodes.map((node) => {
		const region = detectRegion(node.name);
		if (!region) return node;
		const count = (counters[region.name] ?? 0) + 1;
		counters[region.name] = count;
		const tags: string[] = [];
		if (/ipv6|ip6|v6|双栈/i.test(node.name)) tags.push("IPv6");
		const multiplier = extractMultiplier(node.name);
		if (multiplier !== undefined && multiplier !== 1) tags.push(`${multiplier}x`);
		return { ...node, name: `${region.flag} ${region.name} ${String(count).padStart(2, "0")}${tags.length ? ` [${tags.join("·")}]` : ""}` };
	});
}

export function detectRegion(name: string): RegionInfo | null {
	const flag = name.match(/[\u{1F1E6}-\u{1F1FF}]{2}/u)?.[0];
	const flagCode = flag ? flagToCode(flag) : undefined;
	if (flagCode && REGIONS[flagCode]) return info(flagCode);
	for (const key of CHINESE_KEYS) if (name.includes(key)) return info(CHINESE_TO_ISO[key]);
	for (const key of ENGLISH_KEYS) if (new RegExp(`(^|[^A-Za-z])${escapeRegex(key)}([^A-Za-z]|$)`, "i").test(name)) return info(ENGLISH_TO_ISO[key]);
	return null;
}

function info(code: string | undefined): RegionInfo | null {
	if (!code || !REGIONS[code]) return null;
	return { flag: FLAG_OVERRIDES[code] ?? isoToFlag(code), code, name: REGIONS[code].name };
}

function isoToFlag(code: string): string {
	return String.fromCodePoint(...code.toUpperCase().split("").map((value) => 127397 + value.charCodeAt(0)));
}

function flagToCode(flag: string): string | undefined {
	const points = [...flag].map((value) => value.codePointAt(0));
	return points.length === 2 && points.every((value) => value !== undefined) ? points.map((value) => String.fromCharCode(value! - 127397)).join("") : undefined;
}

function extractMultiplier(name: string): number | undefined {
	for (const pattern of [/倍率[：:](\d+\.?\d*)/, /[【[(](\d+\.?\d*)[xX×][】\])]/, /(\d+\.?\d*)[xX×倍]/, /[xX×*](\d+\.?\d*)/]) {
		const match = name.match(pattern);
		if (match?.[1]) return Number(match[1]);
	}
}

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
