import type { ParityMismatch } from '../types';

export type BinarySizeClass = 'empty' | 'small' | 'medium' | 'large';

export interface BinaryParitySnapshot {
	status: number;
	contentType: string | null;
	sizeClass: BinarySizeClass;
	bodyLength: number;
}

export function classifyBinarySize(bytes: number): BinarySizeClass {
	if (bytes === 0) {
		return 'empty';
	}

	if (bytes < 1024) {
		return 'small';
	}

	if (bytes < 64 * 1024) {
		return 'medium';
	}

	return 'large';
}

export async function snapshotBinaryResponse(response: Response): Promise<BinaryParitySnapshot> {
	const buffer = Buffer.from(await response.arrayBuffer());

	return {
		status: response.status,
		contentType: response.headers.get('content-type'),
		sizeClass: classifyBinarySize(buffer.length),
		bodyLength: buffer.length,
	};
}

export function compareBinarySnapshots(
	legacy: BinaryParitySnapshot,
	newResponse: BinaryParitySnapshot,
	contractHeaders: string[] = [],
	legacyHeaders: Record<string, string> = {},
	newHeaders: Record<string, string> = {},
): ParityMismatch[] {
	const mismatches: ParityMismatch[] = [];

	if (legacy.status !== newResponse.status) {
		mismatches.push({
			path: 'status',
			legacy: legacy.status,
			new: newResponse.status,
			message: 'HTTP status codes differ',
		});
	}

	const legacyType = legacy.contentType?.split(';')[0].trim().toLowerCase() ?? null;
	const newType = newResponse.contentType?.split(';')[0].trim().toLowerCase() ?? null;

	if (legacyType !== newType) {
		mismatches.push({
			path: 'content-type',
			legacy: legacyType,
			new: newType,
			message: 'Content-Type values differ',
		});
	}

	if (legacy.sizeClass !== newResponse.sizeClass) {
		mismatches.push({
			path: 'body.sizeClass',
			legacy: legacy.sizeClass,
			new: newResponse.sizeClass,
			message: 'Binary payload size class differs (exact bytes not compared)',
		});
	}

	for (const headerName of contractHeaders) {
		const normalized = headerName.toLowerCase();
		const legacyValue = legacyHeaders[normalized] ?? null;
		const newValue = newHeaders[normalized] ?? null;

		if (legacyValue !== newValue) {
			mismatches.push({
				path: `headers.${normalized}`,
				legacy: legacyValue,
				new: newValue,
				message: 'Contract header values differ',
			});
		}
	}

	return mismatches;
}
