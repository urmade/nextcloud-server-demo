export type OcsApiVersion = 1 | 2;

export interface OcsMeta {
	status: 'ok' | 'failure';
	statuscode: number;
	message: string;
	totalitems?: string;
	itemsperpage?: string;
}

export interface OcsEnvelope<TData> {
	ocs: {
		meta: OcsMeta;
		data: TData;
	};
}

export function buildOcsSuccessEnvelope<TData>(
	data: TData,
	ocsVersion: OcsApiVersion,
): OcsEnvelope<TData> {
	const statuscode = ocsVersion === 1 ? 100 : 200;

	return {
		ocs: {
			meta: {
				status: 'ok',
				statuscode,
				message: 'OK',
				...(ocsVersion === 1 ? { totalitems: '', itemsperpage: '' } : {}),
			},
			data,
		},
	};
}

export function buildOcsFailureEnvelope(
	ocsVersion: OcsApiVersion,
	statuscode: number,
	message: string,
): OcsEnvelope<Record<string, never>> {
	return {
		ocs: {
			meta: {
				status: 'failure',
				statuscode,
				message,
				...(ocsVersion === 1 ? { totalitems: '', itemsperpage: '' } : {}),
			},
			data: {},
		},
	};
}

export function getOcsHttpStatus(ocsVersion: OcsApiVersion, ocsStatuscode: number): number {
	if (ocsVersion === 1) {
		return ocsStatuscode === 997 ? 401 : 200;
	}

	if (ocsStatuscode === 997) {
		return 401;
	}

	if (ocsStatuscode === 998) {
		return 404;
	}

	if (ocsStatuscode === 996 || ocsStatuscode === 999) {
		return 500;
	}

	if (ocsStatuscode < 200 || ocsStatuscode > 600) {
		return 400;
	}

	return ocsStatuscode;
}
