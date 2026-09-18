export interface PreviewFile {
	id: number;
	path: string;
	mime: string;
	readable: boolean;
}

const DEFAULT_FILES: PreviewFile[] = [
	{
		id: 100,
		path: 'welcome.png',
		mime: 'image/png',
		readable: true,
	},
];

export function getPreviewFileById(fileId: number): PreviewFile | undefined {
	return getPreviewFiles().find((file) => file.id === fileId);
}

export function getPreviewFileByPath(path: string): PreviewFile | undefined {
	const normalized = path.replace(/^\/+/, '');

	return getPreviewFiles().find((file) => file.path === normalized);
}

function getPreviewFiles(): PreviewFile[] {
	const raw = process.env.NC_PARITY_PREVIEW_FILES?.trim();

	if (!raw) {
		return DEFAULT_FILES;
	}

	try {
		const parsed = JSON.parse(raw) as PreviewFile[];

		if (!Array.isArray(parsed) || parsed.length === 0) {
			return DEFAULT_FILES;
		}

		return parsed;
	} catch {
		return DEFAULT_FILES;
	}
}
