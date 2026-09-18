import { describe, expect, it } from 'vitest';
import { getStatusPayload } from './status';

describe('getStatusPayload', () => {
	it('returns the documented status.php shape', () => {
		const payload = getStatusPayload();

		expect(payload).toEqual({
			installed: true,
			maintenance: false,
			needsDbUpgrade: false,
			version: '36.0.0',
			versionstring: '36.0.0 dev',
			edition: '',
			productname: 'Nextcloud',
			extendedSupport: false,
		});
	});
});
