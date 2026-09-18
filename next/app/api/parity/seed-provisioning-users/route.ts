import {
	setDelegatedUsersAdmin,
	setProvisioningSubadminGroups,
	setProvisioningUserEnabled,
	setProvisioningUserLastLogin,
} from '@/src/server/provisioning/store';

export async function POST(request: Request) {
	if (process.env.NC_PARITY_EXAPP !== 'true') {
		return new Response(null, { status: 404 });
	}

	const body = await request.json() as {
		subadminUserId?: string;
		subadminGroups?: string[];
		delegatedUserId?: string;
		delegatedUsers?: boolean;
		disabledUserId?: string;
		disabled?: boolean;
		lastLoginUserId?: string;
		lastLoginTimestamp?: number;
	};

	if (body.subadminUserId && Array.isArray(body.subadminGroups)) {
		setProvisioningSubadminGroups(body.subadminUserId, body.subadminGroups);
	}

	if (body.delegatedUserId && typeof body.delegatedUsers === 'boolean') {
		setDelegatedUsersAdmin(body.delegatedUserId, body.delegatedUsers);
	}

	if (body.disabledUserId && typeof body.disabled === 'boolean') {
		setProvisioningUserEnabled(body.disabledUserId, !body.disabled);
	}

	if (body.lastLoginUserId && typeof body.lastLoginTimestamp === 'number') {
		setProvisioningUserLastLogin(body.lastLoginUserId, body.lastLoginTimestamp);
	}

	return new Response(null, { status: 204 });
}
