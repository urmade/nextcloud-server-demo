let unifiedApiEnabled = false;
let shareApiEnabled = true;

export function resetSharingV1Config(): void {
	unifiedApiEnabled = false;
	shareApiEnabled = true;
}

export function isSharingV1ApiEnabled(): boolean {
	return shareApiEnabled && unifiedApiEnabled;
}

export function setUnifiedApiEnabled(enabled: boolean): void {
	unifiedApiEnabled = enabled;
}

export function setShareApiEnabled(enabled: boolean): void {
	shareApiEnabled = enabled;
}
