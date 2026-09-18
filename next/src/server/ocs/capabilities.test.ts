import { describe, expect, it } from 'vitest';
import { getCapabilitiesDocument, getPublicCoreCapabilities } from './capabilities';
import { buildOcsSuccessEnvelope } from './envelope';

describe('OCS capabilities', () => {
	it('returns public core capabilities when unauthenticated', () => {
		const document = getCapabilitiesDocument(false);

		expect(document.capabilities.core).toEqual(getPublicCoreCapabilities());
		expect(document.capabilities.core.user).toBeUndefined();
	});

	it('adds authenticated core fields when requested', () => {
		const document = getCapabilitiesDocument(true);

		expect(document.capabilities.core.user).toEqual({
			language: 'en',
			locale: 'en',
			timezone: 'UTC',
		});
		expect(document.capabilities.core['can-create-app-token']).toBe(true);
	});

	it('builds v1 and v2 success envelopes', () => {
		const data = getCapabilitiesDocument(false);
		const v1 = buildOcsSuccessEnvelope(data, 1);
		const v2 = buildOcsSuccessEnvelope(data, 2);

		expect(v1.ocs.meta.statuscode).toBe(100);
		expect(v2.ocs.meta.statuscode).toBe(200);
	});
});
