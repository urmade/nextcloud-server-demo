let runtimeEnforced: boolean | undefined;

export function isMandatoryTwoFactorEnforced(_userId: string): boolean {
	if (runtimeEnforced !== undefined) {
		return runtimeEnforced;
	}

	const raw = process.env.NC_PARITY_TWO_FACTOR_ENFORCED?.trim();

	return raw === 'true' || raw === '1';
}

export function setMandatoryTwoFactorEnforced(enforced: boolean): void {
	runtimeEnforced = enforced;
}

export function resetMandatoryTwoFactorEnforcement(): void {
	runtimeEnforced = undefined;
}
