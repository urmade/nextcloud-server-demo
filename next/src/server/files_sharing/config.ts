let incomingServer2ServerShareEnabled = true;
let outgoingServer2ServerShareEnabled = true;

export function resetFilesSharingConfig(): void {
	incomingServer2ServerShareEnabled = true;
	outgoingServer2ServerShareEnabled = true;
}

export function isIncomingServer2ServerShareEnabled(): boolean {
	return incomingServer2ServerShareEnabled;
}

export function setIncomingServer2ServerShareEnabled(enabled: boolean): void {
	incomingServer2ServerShareEnabled = enabled;
}

export function isOutgoingServer2ServerShareEnabled(): boolean {
	return outgoingServer2ServerShareEnabled;
}

export function setOutgoingServer2ServerShareEnabled(enabled: boolean): void {
	outgoingServer2ServerShareEnabled = enabled;
}
