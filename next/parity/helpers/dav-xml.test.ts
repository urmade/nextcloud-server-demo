import { describe, expect, it } from 'vitest';
import { davInfosetsEqual, normalizeDavXmlInfoset } from './dav-xml';

describe('normalizeDavXmlInfoset', () => {
	it('treats prefix differences as equal when namespace URI matches', () => {
		const left = '<?xml version="1.0"?><d:prop xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:getetag>"abc"</d:getetag><oc:fileid>1</oc:fileid></d:prop>';
		const right = '<?xml version="1.0"?><D:prop xmlns:D="DAV:" xmlns:OC="http://owncloud.org/ns"><D:getetag>"abc"</D:getetag><OC:fileid>1</OC:fileid></D:prop>';

		expect(davInfosetsEqual(left, right)).toBe(true);
		expect(normalizeDavXmlInfoset(left)).toEqual(normalizeDavXmlInfoset(right));
	});
});
