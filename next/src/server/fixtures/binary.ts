import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../parity/fixtures/binary');

const ONE_BY_ONE_PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
	'base64',
);

const TWO_BY_TWO_PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR42mNk+M9Qz0AEYBxVSF+FABJUGQeJm3H/AAAAAElFTkSuQmCC',
	'base64',
);

function loadFixture(name: string): Buffer {
	return readFileSync(path.join(fixturesDir, name));
}

function ensureFixture(name: string, bytes: Buffer): Buffer {
	const filePath = path.join(fixturesDir, name);

	try {
		return readFileSync(filePath);
	} catch {
		return bytes;
	}
}

export function getAvatarFixture(userId: string, size: number, dark = false): Buffer | null {
	const normalizedSize = size <= 64 ? 64 : 512;
	const suffix = dark ? '-dark' : '';

	if (userId === 'admin') {
		return ensureFixture(`avatar-admin-${normalizedSize}${suffix}.png`, ONE_BY_ONE_PNG);
	}

	if (userId === 'alice') {
		return ensureFixture(`avatar-alice-${normalizedSize}${suffix}.png`, TWO_BY_TWO_PNG);
	}

	return null;
}

export function getGuestAvatarFixture(dark = false): Buffer {
	const name = dark ? 'guest-avatar-64-dark.png' : 'guest-avatar-64.png';

	return ensureFixture(name, dark ? TWO_BY_TWO_PNG : ONE_BY_ONE_PNG);
}

export function getPreviewFixture(): Buffer {
	return ensureFixture('preview-welcome.png', ONE_BY_ONE_PNG);
}

export function getReferencePreviewFixture(): Buffer {
	return ensureFixture('reference-parity.png', TWO_BY_TWO_PNG);
}

export function getTextToImageFixture(): Uint8Array {
	return new Uint8Array(ensureFixture('text2image-parity.png', TWO_BY_TWO_PNG));
}
