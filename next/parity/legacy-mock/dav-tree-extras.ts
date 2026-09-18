import { isTreeExtrasDavPath } from '@/src/server/dav/tree-extras';

const TREE_EXTRAS_METHODS = new Set([
	'GET',
	'HEAD',
	'PROPFIND',
	'PUT',
	'REPORT',
	'OPTIONS',
	'MKCOL',
	'DELETE',
	'PROPPATCH',
]);

export function isTreeExtrasMockPath(pathname: string): boolean {
	if (!pathname.startsWith('/remote.php/dav/')) {
		return false;
	}

	const davPath = pathname.slice('/remote.php/dav/'.length).replace(/^\//, '').replace(/\/$/, '');

	return isTreeExtrasDavPath(davPath);
}

export function isTreeExtrasMockMethod(method: string): boolean {
	return TREE_EXTRAS_METHODS.has(method.toUpperCase());
}
