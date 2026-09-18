export interface TransferOwnershipRow {
	id: number;
	sourceUser: string;
	targetUser: string;
	fileId: number;
	nodeName: string;
}

let nextTransferId = 1;
const rows: TransferOwnershipRow[] = [];
const queuedJobIds: number[] = [];

export function insertTransferOwnership(row: Omit<TransferOwnershipRow, 'id'>): TransferOwnershipRow {
	const created: TransferOwnershipRow = {
		id: nextTransferId,
		...row,
	};

	nextTransferId += 1;
	rows.push(created);

	return created;
}

export function getTransferOwnershipById(id: number): TransferOwnershipRow | null {
	return rows.find((row) => row.id === id) ?? null;
}

export function deleteTransferOwnership(id: number): boolean {
	const index = rows.findIndex((row) => row.id === id);

	if (index < 0) {
		return false;
	}

	rows.splice(index, 1);

	return true;
}

export function queueTransferOwnershipJob(id: number): void {
	queuedJobIds.push(id);
}

export function getQueuedTransferOwnershipJobs(): number[] {
	return [...queuedJobIds];
}

export function getLatestTransferOwnershipId(): number | null {
	if (rows.length === 0) {
		return null;
	}

	return rows[rows.length - 1].id;
}

export function resetTransferOwnershipStore(): void {
	nextTransferId = 1;
	rows.length = 0;
	queuedJobIds.length = 0;
}
