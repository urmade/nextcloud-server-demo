export interface TeamProviderPayload {
	id: string;
	name: string;
	icon: string;
}

export interface TeamResourcePayload {
	id: string;
	label: string;
	url: string;
	iconSvg: string | null;
	iconURL: string | null;
	iconEmoji: string | null;
	provider: TeamProviderPayload;
}

export interface TeamPayload {
	teamId: string;
	displayName: string;
	link: string | null;
}

export interface TeamWithResourcesPayload extends TeamPayload {
	resources: TeamResourcePayload[];
}
