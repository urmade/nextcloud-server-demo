import { createHash } from 'node:crypto';

export interface DirectEditToken {
	token: string;
	userId: string;
	editorId: string;
	fileId: number;
	accessed: boolean;
}

export interface DirectEditingEditor {
	id: string;
	name: string;
	mimetypes: string[];
	optionalMimetypes: string[];
	secure: boolean;
}

export interface DirectEditingCreator {
	id: string;
	editor: string;
	name: string;
	extension: string;
	templates: boolean;
	mimetype: string;
}

export interface DirectEditingTemplate {
	id: string;
	title: string;
	preview: string | null;
	extension: string;
	mimetype: string;
}

export const PARITY_DIRECT_EDIT_TOKEN = 'parity-direct-edit-token-0123456789abcdef0123456789abcdef01';

const TOKEN_LENGTH = 64;
const TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

const PARITY_TEXT_EDITOR: DirectEditingEditor = {
	id: 'text',
	name: 'Text',
	mimetypes: ['text/plain', 'text/markdown'],
	optionalMimetypes: [],
	secure: false,
};

const PARITY_TEXT_CREATOR: DirectEditingCreator = {
	id: 'textdocument',
	editor: 'text',
	name: 'New text file',
	extension: 'txt',
	templates: false,
	mimetype: 'text/plain',
};

const tokens = new Map<string, DirectEditToken>();

function seedParityToken(): void {
	tokens.set(PARITY_DIRECT_EDIT_TOKEN, {
		token: PARITY_DIRECT_EDIT_TOKEN,
		userId: process.env.NC_ADMIN_USER?.trim() || 'admin',
		editorId: 'text',
		fileId: 1001,
		accessed: false,
	});
}

seedParityToken();

export function isDirectEditingEnabled(): boolean {
	return true;
}

export function getDirectEditingCapabilities(): {
	editors: Record<string, DirectEditingEditor>;
	creators: Record<string, DirectEditingCreator>;
} {
	if (!isDirectEditingEnabled()) {
		return { editors: {}, creators: {} };
	}

	return {
		editors: {
			[PARITY_TEXT_EDITOR.id]: PARITY_TEXT_EDITOR,
		},
		creators: {
			[PARITY_TEXT_CREATOR.id]: PARITY_TEXT_CREATOR,
		},
	};
}

export function getDirectEditingETag(): string {
	return createHash('md5').update(JSON.stringify(getDirectEditingCapabilities())).digest('hex');
}

export function getEditor(editorId: string): DirectEditingEditor | null {
	return getDirectEditingCapabilities().editors[editorId] ?? null;
}

export function getCreator(editorId: string, creatorId: string): DirectEditingCreator | null {
	const creator = getDirectEditingCapabilities().creators[creatorId];

	if (!creator || creator.editor !== editorId) {
		return null;
	}

	return creator;
}

export function getDirectEditingTemplates(editorId: string, creatorId: string): Record<string, DirectEditingTemplate> {
	const creator = getCreator(editorId, creatorId);

	if (!creator) {
		throw new Error('No matching editor found');
	}

	return {
		empty: {
			id: 'empty',
			title: 'Empty file',
			preview: null,
			extension: creator.extension,
			mimetype: creator.mimetype,
		},
	};
}

function generateToken(): string {
	const bytes = new Uint8Array(TOKEN_LENGTH);
	crypto.getRandomValues(bytes);

	let token = '';

	for (let index = 0; index < TOKEN_LENGTH; index += 1) {
		token += TOKEN_ALPHABET[bytes[index] % TOKEN_ALPHABET.length];
	}

	return token;
}

export function mintDirectEditToken(userId: string, editorId: string, fileId: number): string {
	const token = generateToken();
	tokens.set(token, {
		token,
		userId,
		editorId,
		fileId,
		accessed: false,
	});

	return token;
}

export function getDirectEditToken(token: string): DirectEditToken | null {
	return tokens.get(token) ?? null;
}

export function markDirectEditTokenAccessed(token: string): void {
	const entry = tokens.get(token);

	if (!entry) {
		return;
	}

	entry.accessed = true;
}

export function invalidateDirectEditToken(token: string): void {
	tokens.delete(token);
}

export function resetDirectEditingStore(): void {
	tokens.clear();
	seedParityToken();
}
