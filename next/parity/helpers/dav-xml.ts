export interface DavInfosetEntry {
	name: string;
	text?: string;
}

const DEFAULT_PREFIXES: Record<string, string> = {
	d: 'DAV:',
	cal: 'urn:ietf:params:xml:ns:caldav',
	card: 'urn:ietf:params:xml:ns:carddav',
	oc: 'http://owncloud.org/ns',
	nc: 'http://nextcloud.org/ns',
	s: 'http://sabredav.org/ns',
};

function collectNamespaceMap(xml: string): Record<string, string> {
	const prefixes = { ...DEFAULT_PREFIXES };
	const xmlnsRegex = /xmlns(?::([A-Za-z0-9_-]+))?="([^"]+)"/g;

	for (const match of xml.matchAll(xmlnsRegex)) {
		const prefix = match[1] ?? 'd';
		prefixes[prefix] = match[2];
	}

	return prefixes;
}

function qName(prefixes: Record<string, string>, prefix: string | undefined, localName: string): string {
	if (!prefix) {
		return localName;
	}

	const namespaceUri = prefixes[prefix] ?? prefix;

	return `{${namespaceUri}}${localName}`;
}

export function normalizeDavXmlInfoset(xml: string): DavInfosetEntry[] {
	const trimmed = xml.trim();

	if (!trimmed) {
		return [];
	}

	const prefixes = collectNamespaceMap(trimmed);
	const entries: DavInfosetEntry[] = [];
	const tagRegex = /<([A-Za-z0-9_-]+):([A-Za-z0-9_-]+)(?:\s[^>/]*)?(\/>|>([\s\S]*?)<\/\1:\2>)/g;

	for (const match of trimmed.matchAll(tagRegex)) {
		const name = qName(prefixes, match[1], match[2]);
		const text = match[4]?.trim();

		if (text && !text.includes('<')) {
			entries.push({ name, text });
			continue;
		}

		entries.push({ name });
	}

	return entries.sort((left, right) => left.name.localeCompare(right.name) || (left.text ?? '').localeCompare(right.text ?? ''));
}

export function davInfosetsEqual(left: string, right: string): boolean {
	const leftEntries = normalizeDavXmlInfoset(left);
	const rightEntries = normalizeDavXmlInfoset(right);

	return JSON.stringify(leftEntries) === JSON.stringify(rightEntries);
}
