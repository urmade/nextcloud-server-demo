export type ParsedImage = {
	bytes: Buffer;
	mimeType: 'image/jpeg' | 'image/png';
	width: number;
	height: number;
};

const MAX_BYTES = 20 * 1024 * 1024;

function readPngDimensions(bytes: Buffer): { width: number; height: number } | null {
	if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) {
		return null;
	}

	return {
		width: bytes.readUInt32BE(16),
		height: bytes.readUInt32BE(20),
	};
}

function readJpegDimensions(bytes: Buffer): { width: number; height: number } | null {
	if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
		return null;
	}

	let offset = 2;

	while (offset + 9 < bytes.length) {
		if (bytes[offset] !== 0xff) {
			offset += 1;
			continue;
		}

		const marker = bytes[offset + 1];

		if (marker === 0xd9 || marker === 0xda) {
			break;
		}

		const segmentLength = bytes.readUInt16BE(offset + 2);

		if (segmentLength < 2 || offset + 2 + segmentLength > bytes.length) {
			break;
		}

		if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
			return {
				height: bytes.readUInt16BE(offset + 5),
				width: bytes.readUInt16BE(offset + 7),
			};
		}

		offset += 2 + segmentLength;
	}

	return null;
}

export function detectImageMimeType(bytes: Buffer): 'image/jpeg' | 'image/png' | null {
	if (bytes.length >= 8
		&& bytes[0] === 0x89
		&& bytes[1] === 0x50
		&& bytes[2] === 0x4e
		&& bytes[3] === 0x47) {
		return 'image/png';
	}

	if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) {
		return 'image/jpeg';
	}

	return null;
}

export function parseImage(bytes: Buffer): ParsedImage | null {
	const mimeType = detectImageMimeType(bytes);

	if (!mimeType) {
		return null;
	}

	const dimensions = mimeType === 'image/png'
		? readPngDimensions(bytes)
		: readJpegDimensions(bytes);

	if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
		return null;
	}

	return {
		bytes,
		mimeType,
		width: dimensions.width,
		height: dimensions.height,
	};
}

export function isWithinAvatarSizeLimit(bytes: Buffer): boolean {
	return bytes.length <= MAX_BYTES;
}

export function toDataUrl(image: ParsedImage): string {
	return `data:${image.mimeType};base64,${image.bytes.toString('base64')}`;
}
