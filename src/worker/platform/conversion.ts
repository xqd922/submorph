import { convertSubscriptionText, type OutputTarget } from "../conversion";

export const convertSubscription = ({ source, target }: { source: string; target: OutputTarget }) =>
	convertSubscriptionText(source, target);
