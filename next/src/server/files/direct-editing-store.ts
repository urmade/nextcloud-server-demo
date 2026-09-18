export interface DirectEditToken {
	token: string;
	userId: string;
	editorId: string;
	fileId: number;
	accessed: boolean;
}

export const PARITY_DIRECT_EDIT_TOKEN = 'parity-direct-edit-token-0123456789abcdef0123456789abcdef01';

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
