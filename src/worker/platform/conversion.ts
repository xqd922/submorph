import { convertSubscriptionText, type OutputTarget } from "../conversion";

export const convertSubscription = ({ source, target, formatNames, isAirportSubscription }: { source: string; target: OutputTarget; formatNames?: boolean; isAirportSubscription?: boolean }) =>
	convertSubscriptionText(source, target, { formatNames, isAirportSubscription });
