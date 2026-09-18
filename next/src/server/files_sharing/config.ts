let incomingServer2ServerShareEnabled = true;

export function resetFilesSharingConfig(): void {
	incomingServer2ServerShareEnabled = true;
}

export function isIncomingServer2ServerShareEnabled(): boolean {
	return incomingServer2ServerShareEnabled;
}

export function setIncomingServer2ServerShareEnabled(enabled: boolean): void {
	incomingServer2ServerShareEnabled = enabled;
}
