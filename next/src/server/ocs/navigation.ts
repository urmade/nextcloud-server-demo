import { createHash } from 'node:crypto';

export interface NavigationEntry {
	id: string;
	href: string;
	icon: string;
	type: string;
	name: string;
	active: boolean;
	classes: string;
	unread: number;
	order?: number;
	app?: string;
	default?: boolean;
}

export interface SettingsNavigationEntry extends NavigationEntry {
	type: 'settings';
}

const APPS_NAVIGATION: NavigationEntry[] = [
	{
		id: 'files',
		href: '/index.php/apps/files/',
		icon: '/apps/files/img/app.svg',
		type: 'link',
		name: 'Files',
		active: false,
		classes: '',
		unread: 0,
		order: 0,
		app: 'files',
	},
	{
		id: 'photos',
		href: '/index.php/apps/photos/',
		icon: '/apps/photos/img/app.svg',
		type: 'link',
		name: 'Photos',
		active: false,
		classes: '',
		unread: 0,
		order: 1,
		app: 'photos',
	},
	{
		id: 'logout',
		href: '/index.php/logout?requesttoken=mock-token',
		icon: '/core/img/actions/logout.svg',
		type: 'link',
		name: 'Log out',
		active: false,
		classes: '',
		unread: 0,
		order: 100,
	},
];

const SETTINGS_NAVIGATION: SettingsNavigationEntry[] = [
	{
		id: 'settings',
		href: '/index.php/settings/user',
		icon: '/core/img/settings.svg',
		type: 'settings',
		name: 'Personal settings',
		active: false,
		classes: '',
		unread: 0,
		order: 0,
	},
	{
		id: 'settings_admin',
		href: '/index.php/settings/admin',
		icon: '/core/img/settings.svg',
		type: 'settings',
		name: 'Administration settings',
		active: false,
		classes: '',
		unread: 0,
		order: 1,
	},
];

function rewriteToAbsoluteUrls<T extends NavigationEntry>(entries: T[], origin: string): T[] {
	return entries.map((entry) => {
		const hrefUrl = new URL(entry.href, origin);
		const iconUrl = entry.icon.startsWith('http') ? entry.icon : new URL(entry.icon, origin).href;

		return {
			...entry,
			href: hrefUrl.href,
			icon: iconUrl,
		};
	});
}

export function generateNavigationETag(entries: NavigationEntry[]): string {
	const normalized = entries.map((entry) => (
		entry.id === 'logout'
			? { ...entry, href: 'logout' }
			: entry
	));

	return `"${createHash('md5').update(JSON.stringify(normalized)).digest('hex')}"`;
}

export function getAppsNavigation(absolute: boolean, origin: string): NavigationEntry[] {
	const entries = APPS_NAVIGATION.map((entry) => ({ ...entry }));

	return absolute ? rewriteToAbsoluteUrls(entries, origin) : entries;
}

export function getSettingsNavigation(absolute: boolean, origin: string): SettingsNavigationEntry[] {
	const entries = SETTINGS_NAVIGATION.map((entry) => ({ ...entry }));

	return absolute ? rewriteToAbsoluteUrls(entries, origin) : entries;
}

export function etagMatches(ifNoneMatch: string | null, etag: string): boolean {
	if (!ifNoneMatch) {
		return false;
	}

	return ifNoneMatch.split(',').map((value) => value.trim()).includes(etag);
}
