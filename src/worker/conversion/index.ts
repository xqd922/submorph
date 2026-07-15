import { parseSubscription } from "./parse";
import { render } from "./render";
import { ConversionError, type ConversionResult, type ConversionWarning, type OutputTarget, type ProxyNode } from "./types";
import { formatNodeNames } from "./naming";
export { ConversionError } from "./types";
export type { ConversionResult, OutputTarget, ProxyNode } from "./types";

export function convertSubscriptionText(input: string, target: OutputTarget, options: { formatNames?: boolean; isAirportSubscription?: boolean } = {}): ConversionResult {
	if (!input.trim()) throw new ConversionError("INVALID_INPUT", "Subscription content is empty");
	const parsed = parseSubscription(input), warnings: ConversionWarning[] = parsed.errors.map(({ index, message }) => ({ code: "INVALID_NODE", index, message }));
	const uniqueNodes = unique(parsed.nodes, warnings); if (!uniqueNodes.length) throw new ConversionError("NO_VALID_NODES", "No valid nodes", warnings);
	const nodes = options.formatNames ? formatNodeNames(uniqueNodes) : uniqueNodes;
	const output = render(nodes, target, options.isAirportSubscription); warnings.push(...output.skipped.map(({ node, message }) => ({ code: "UNSUPPORTED_TARGET" as const, name: node.name, message })));
	if (!output.nodes.length) throw new ConversionError("NO_RENDERABLE_NODES", `No nodes can be rendered as ${target}`, warnings);
	return { target, content: output.content, contentType: output.contentType, parsed: parsed.candidates.length, valid: nodes.length, rendered: output.nodes.length, skipped: parsed.candidates.length - output.nodes.length, warnings };
}
function unique(nodes: ProxyNode[], warnings: ConversionWarning[]): ProxyNode[] { const seen = new Set<string>(), names = new Map<string, number>(), result: ProxyNode[] = []; for (const node of nodes) { const key = JSON.stringify({ ...node, name: undefined }); if (seen.has(key)) { warnings.push({ code: "DUPLICATE_NODE", name: node.name, message: "Duplicate node skipped" }); continue; } seen.add(key); const base = node.name.trim() || `${node.protocol.toUpperCase()} ${node.server}`, count = (names.get(base) ?? 0) + 1; names.set(base, count); result.push({ ...node, name: count === 1 ? base : `${base} ${count}` }); } return result; }
