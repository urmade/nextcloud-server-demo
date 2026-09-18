export interface TemplateFileCreator {
	app: string;
	label: string;
	extension: string;
	iconClass: string | null;
	iconSvgInline: string | null;
	mimetypes: string[];
	ratio: number | null;
	actionLabel: string;
}

export interface TemplateField {
	index: string;
	type: string;
	alias: string | null;
	tag: string | null;
	id: number | null;
	content?: string;
	checked?: boolean;
}

export interface TemplateFile {
	basename: string;
	etag: string;
	fileid: number;
	filename: string | null;
	lastmod: number;
	mime: string;
	size: number;
	type: string;
	hasPreview: boolean;
	permissions: number;
}

let templateDirectoryPath = '';

const templateFieldsByFileId = new Map<number, TemplateField[]>();

export function listTemplateCreators(): TemplateFileCreator[] {
	return [];
}

export function listTemplatesWithNested(): Array<TemplateFileCreator & { templates: unknown[] }> {
	return listTemplateCreators().map((creator) => ({
		...creator,
		templates: [],
	}));
}

export function getTemplateFields(fileId: number): TemplateField[] {
	return templateFieldsByFileId.get(fileId) ?? [];
}

export function getTemplateDirectoryPath(): string {
	return templateDirectoryPath;
}

export function setTemplateDirectoryPath(path: string): void {
	templateDirectoryPath = path;
}

export function resetTemplateStore(): void {
	templateDirectoryPath = '';
	templateFieldsByFileId.clear();
}
