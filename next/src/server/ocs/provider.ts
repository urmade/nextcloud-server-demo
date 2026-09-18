function isAppEnabled(appId: string): boolean {
	const envKey = `NC_APP_${appId.toUpperCase().replaceAll('-', '_')}_ENABLED`;
	const value = process.env[envKey]?.trim().toLowerCase();

	if (value === undefined) {
		return true;
	}

	return value === 'true' || value === '1';
}

export interface OcsProviderCatalog {
	version: number;
	services: Record<string, {
		version: number;
		endpoints: Record<string, string>;
	}>;
}

export function buildOcsProviderCatalog(): OcsProviderCatalog {
	const services: OcsProviderCatalog['services'] = {
		PRIVATE_DATA: {
			version: 1,
			endpoints: {
				store: '/ocs/v2.php/privatedata/setattribute',
				read: '/ocs/v2.php/privatedata/getattribute',
				delete: '/ocs/v2.php/privatedata/deleteattribute',
			},
		},
	};

	if (isAppEnabled('files_sharing')) {
		services.SHARING = {
			version: 1,
			endpoints: {
				share: '/ocs/v2.php/apps/files_sharing/api/v1/shares',
			},
		};

		services.FEDERATED_SHARING = {
			version: 1,
			endpoints: {
				share: '/ocs/v2.php/cloud/shares',
				webdav: '/public.php/webdav/',
			},
		};
	}

	if (isAppEnabled('federation')) {
		if (services.FEDERATED_SHARING) {
			services.FEDERATED_SHARING.endpoints['shared-secret'] = '/ocs/v2.php/cloud/shared-secret';
			services.FEDERATED_SHARING.endpoints['system-address-book'] = '/remote.php/dav/addressbooks/system/system/system';
			services.FEDERATED_SHARING.endpoints['carddav-user'] = 'system';
		} else {
			services.FEDERATED_SHARING = {
				version: 1,
				endpoints: {
					'shared-secret': '/ocs/v2.php/cloud/shared-secret',
					'system-address-book': '/remote.php/dav/addressbooks/system/system/system',
					'carddav-user': 'system',
				},
			};
		}
	}

	if (isAppEnabled('activity')) {
		services.ACTIVITY = {
			version: 1,
			endpoints: {
				list: '/ocs/v2.php/cloud/activity',
			},
		};
	}

	if (isAppEnabled('provisioning_api')) {
		services.PROVISIONING = {
			version: 1,
			endpoints: {
				user: '/ocs/v2.php/cloud/users',
				groups: '/ocs/v2.php/cloud/groups',
				apps: '/ocs/v2.php/cloud/apps',
			},
		};
	}

	return {
		version: 2,
		services,
	};
}
