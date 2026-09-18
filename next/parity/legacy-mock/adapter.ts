import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getGuestAvatarResponse } from '@/src/server/avatar/guest';
import { getUserAvatarResponse } from '@/src/server/avatar/user';
import { requireLoggedInUser } from '@/src/server/http/auth';
import { getMimeIconRedirect, getPreviewByFileIdResponse, getPreviewByPathResponse } from '@/src/server/preview/handlers';
import { getReferencePreviewResponse } from '@/src/server/reference/preview';
import { SECURITY_TXT_BODY } from '@/src/server/well-known/handlers';
import { generateNavigationETag, getAppsNavigation, getSettingsNavigation } from '@/src/server/ocs/navigation';
import { handleAppPasswordMock } from './app-password';
import { handleLegacyMockAuth, parseCookiesFromOptions } from './auth';
import { handleLoginFlowV1Mock } from './login-flow-v1';
import { handleLoginFlowV2Mock } from './login-flow-v2';
import { handleLostPasswordMock, isLostPasswordPath } from './lost-password';
import { handleReferenceMock } from './reference';
import { handleTaskProcessingMock } from './task-processing';
import { handleTextProcessingMock } from './text-processing';
import { handleTextToImageMock } from './text-to-image';
import { handleTranslationMock } from './translation';
import { handleCollaborationResourcesMock } from './collaboration-resources';
import { handleTeamsMock } from './teams';
import { handleTwoFactorMock } from './two-factor';
import { handleTwoFactorChallengeMock, isTwoFactorChallengePath } from './two-factor-challenge';
import { handleWebAuthnMock, isWebAuthnPath } from './webauthn';
import { handleUnifiedSearchMock } from './unified-search';
import { handleAvatarWriteMock } from './avatar-write';
import { handleContactsMenuMock } from './contactsmenu';
import { handlePublicLeftoversMock, isPublicLeftoversMockPath } from './public-leftovers';
import { handleWebUpdaterMock, isWebUpdaterMockPath } from './web-updater';
import { handleWipeMock } from './wipe';
import { handleDavMock, isDavMockMethod } from './dav';
import { handleDavDirectMock, isDavDirectMockPath } from './dav-direct';
import { handleDavOutOfOfficeMock, isDavOutOfOfficeMockPath } from './dav-out-of-office';
import { handleDavCalContactsIoMock, isDavCalContactsIoMockPath } from './dav-cal-contacts-io';
import { handleDavCalOcsMock, isDavCalOcsMockPath } from './dav-cal-ocs';
import { handleDavInvitationHtmlMock, isDavInvitationHtmlMockPath } from './dav-invitation-html';
import { handleDavBirthdayMock, isDavBirthdayMockPath } from './dav-birthday';
import { handleDavExampleContentMock, isDavExampleContentMockPath } from './dav-example-content';
import { handleFilesApiMock, isFilesApiPath, isFilesApiWritePath } from './files';
import { handleFilesDirectEditingMock, isFilesDirectEditingMockPath } from './files-direct-editing';
import { handleFilesFilenamesMock, isFilesFilenamesMockPath } from './files-filenames';
import { handleFilesRemainingOcsMock, isFilesRemainingOcsMockPath } from './files-remaining-ocs';
import { handleFilesSharingAcceptMock, isFilesSharingAcceptMockPath } from './files-sharing-accept';
import { handleFilesSharingExternalSharesMock, isFilesSharingExternalSharesMockPath } from './files-sharing-external-shares';
import { handleFilesSharingOcsMock, isFilesSharingOcsMockPath } from './files-sharing-ocs';
import { handleFilesSharingPublicLinkMock, isFilesSharingPublicLinkMockPath } from './files-sharing-public-link';
import { handleFilesSharingPublicPreviewMock, isFilesSharingPublicPreviewMockPath } from './files-sharing-public-preview';
import { handleFilesSharingPublicDavMock, isPublicDavMockMethod, isPublicDavMockPath } from './files-sharing-public-dav';
import { handleFilesSharingShareInfoMock, isFilesSharingShareInfoMockPath } from './files-sharing-shareinfo';
import { handleSharingV1Mock, isSharingV1MockPath } from './sharing-v1';
import { handleFilesTemplatesMock, isFilesTemplatesMockPath } from './files-templates';
import { handleFilesViewMock, isFilesViewMockPath } from './files-view';
import { snapshotResponse } from '../compare';
import type { ParityRequestOptions, ParityResponseSnapshot } from '../types';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/legacy');

function loadFixture(name: string): unknown {
	const filePath = path.join(fixturesDir, name);

	return JSON.parse(readFileSync(filePath, 'utf8'));
}

function hasValidBasicAuth(headers?: Record<string, string>): boolean {
	const authorization = headers?.authorization ?? headers?.Authorization;

	if (!authorization) {
		return false;
	}

	const expectedUser = process.env.NC_ADMIN_USER?.trim() || 'admin';
	const expectedPassword = process.env.NC_ADMIN_PASSWORD?.trim() || 'parity-test-password';
	const match = /^Basic\s+(.+)$/i.exec(authorization.trim());

	if (!match) {
		return false;
	}

	try {
		const decoded = Buffer.from(match[1], 'base64').toString('utf8');
		const separatorIndex = decoded.indexOf(':');

		if (separatorIndex < 0) {
			return false;
		}

		return decoded.slice(0, separatorIndex) === expectedUser
			&& decoded.slice(separatorIndex + 1) === expectedPassword;
	} catch {
		return false;
	}
}

function isMockAuthenticated(options: ParityRequestOptions): boolean {
	if (hasValidBasicAuth(options.headers)) {
		return true;
	}

	const cookies = parseCookiesFromOptions(options);

	return Boolean(cookies.nc_username);
}

function jsonSnapshot(
	status: number,
	body: unknown,
	contentType = 'application/json; charset=utf-8',
	extraHeaders: Record<string, string> = {},
): ParityResponseSnapshot {
	const rawBody = JSON.stringify(body);

	return snapshotResponse(
		new Response(rawBody, {
			status,
			headers: {
				'content-type': contentType,
				...extraHeaders,
			},
		}),
		rawBody,
	);
}

function textSnapshot(status: number, body: string, extraHeaders: Record<string, string> = {}): ParityResponseSnapshot {
	return snapshotResponse(
		new Response(body, {
			status,
			headers: {
				'content-type': 'text/plain; charset=UTF-8',
				...extraHeaders,
			},
		}),
		body,
	);
}

function redirectSnapshot(
	location: string,
	extraHeaders: Record<string, string> = {},
	status = 303,
): ParityResponseSnapshot {
	return snapshotResponse(
		new Response(null, {
			status,
			headers: {
				location,
				...extraHeaders,
			},
		}),
		'',
	);
}

function unauthorizedSnapshot(): ParityResponseSnapshot {
	return jsonSnapshot(401, loadFixture('ocs-v2-unauthorized.json'));
}

function handleWellKnownMock(pathname: string, options: ParityRequestOptions): ParityResponseSnapshot | null {
	if (pathname === '/.well-known/change-password') {
		return redirectSnapshot('http://127.0.0.1:3100/index.php/settings/user/security', {
			'x-nextcloud-well-known': '1',
		});
	}

	if (pathname === '/.well-known/security.txt') {
		return textSnapshot(200, SECURITY_TXT_BODY, {
			'x-nextcloud-well-known': '1',
		});
	}

	if (pathname === '/.well-known/caldav' || pathname === '/.well-known/carddav') {
		return redirectSnapshot('http://127.0.0.1:3100/remote.php/dav/', {}, 301);
	}

	if (pathname.startsWith('/.well-known/')) {
		const service = pathname.slice('/.well-known/'.length);

		return jsonSnapshot(404, { message: `${service} not supported` }, 'application/json', {
			'x-nextcloud-well-known': '1',
		});
	}

	return null;
}

function handleOcsProviderMock(pathname: string): ParityResponseSnapshot | null {
	if (pathname === '/ocs-provider/' || pathname === '/ocs-provider') {
		return jsonSnapshot(200, loadFixture('ocs-provider.json'));
	}

	return null;
}

function handleNavigationMock(fullPath: string, options: ParityRequestOptions): ParityResponseSnapshot | null {
	const origin = 'http://127.0.0.1:3100';
	const pathname = fullPath.split('?')[0];
	const url = new URL(`${origin}${fullPath.startsWith('/') ? fullPath : `/${fullPath}`}`);

	if (pathname.startsWith('/ocs/v2.php/core/navigation/apps')) {
		if (!isMockAuthenticated(options)) {
			return unauthorizedSnapshot();
		}

		const absolute = url.searchParams.get('absolute') === 'true';
		const navigation = getAppsNavigation(absolute, origin);
		const etag = generateNavigationETag(navigation);
		const ifNoneMatch = options.headers?.['if-none-match'] ?? options.headers?.['If-None-Match'];

		if (ifNoneMatch === etag) {
			return snapshotResponse(new Response(null, { status: 304 }), '');
		}

		return jsonSnapshot(200, loadFixture('ocs-v2-navigation-apps.json'), 'application/json; charset=utf-8', {
			etag,
		});
	}

	if (pathname.startsWith('/ocs/v2.php/core/navigation/settings')) {
		if (!isMockAuthenticated(options)) {
			return unauthorizedSnapshot();
		}

		const absolute = url.searchParams.get('absolute') === 'true';
		const navigation = getSettingsNavigation(absolute, origin);
		const etag = generateNavigationETag(navigation);
		const ifNoneMatch = options.headers?.['if-none-match'] ?? options.headers?.['If-None-Match'];

		if (ifNoneMatch === etag) {
			return snapshotResponse(new Response(null, { status: 304 }), '');
		}

		return jsonSnapshot(200, loadFixture('ocs-v2-navigation-settings.json'), 'application/json; charset=utf-8', {
			etag,
		});
	}

	return null;
}

function handleAutocompleteMock(fullPath: string, options: ParityRequestOptions): ParityResponseSnapshot | null {
	const pathname = fullPath.split('?')[0];

	if (!pathname.startsWith('/ocs/v2.php/core/autocomplete/get')) {
		return null;
	}

	if (!isMockAuthenticated(options)) {
		return unauthorizedSnapshot();
	}

	const url = new URL(`http://127.0.0.1:3100${fullPath.startsWith('/') ? fullPath : `/${fullPath}`}`);
	const limit = Number.parseInt(url.searchParams.get('limit') ?? '10', 10);

	if (Number.isNaN(limit) || limit < 1) {
		return jsonSnapshot(400, loadFixture('ocs-v2-autocomplete-limit-invalid.json'));
	}

	return jsonSnapshot(200, loadFixture('ocs-v2-autocomplete-alice.json'));
}

async function responseToSnapshot(response: Response): Promise<ParityResponseSnapshot> {
	const rawBody = Buffer.from(await response.arrayBuffer()).toString('latin1');

	return snapshotResponse(response, rawBody);
}

function handleAvatarMock(pathname: string, search: string): Promise<ParityResponseSnapshot> | null {
	const guestDarkMatch = /^\/(?:index\.php\/)?avatar\/guest\/([^/]+)\/(\d+)\/dark$/.exec(pathname);

	if (guestDarkMatch) {
		return responseToSnapshot(getGuestAvatarResponse(decodeURIComponent(guestDarkMatch[1]), Number.parseInt(guestDarkMatch[2], 10), true));
	}

	const guestMatch = /^\/(?:index\.php\/)?avatar\/guest\/([^/]+)\/(\d+)$/.exec(pathname);

	if (guestMatch) {
		const params = new URLSearchParams(search);
		const darkTheme = params.get('darkTheme') === 'true';

		return responseToSnapshot(getGuestAvatarResponse(decodeURIComponent(guestMatch[1]), Number.parseInt(guestMatch[2], 10), darkTheme));
	}

	const userDarkMatch = /^\/(?:index\.php\/)?avatar\/([^/]+)\/(\d+)\/dark$/.exec(pathname);

	if (userDarkMatch) {
		const params = new URLSearchParams(search);
		const guestFallback = params.get('guestFallback') === 'true';

		return responseToSnapshot(getUserAvatarResponse(decodeURIComponent(userDarkMatch[1]), Number.parseInt(userDarkMatch[2], 10), true, guestFallback));
	}

	const userMatch = /^\/(?:index\.php\/)?avatar\/([^/]+)\/(\d+)$/.exec(pathname);

	if (userMatch) {
		const params = new URLSearchParams(search);
		const guestFallback = params.get('guestFallback') === 'true';

		return responseToSnapshot(getUserAvatarResponse(decodeURIComponent(userMatch[1]), Number.parseInt(userMatch[2], 10), false, guestFallback));
	}

	return null;
}

function handlePreviewMock(pathname: string, search: string, options: ParityRequestOptions): Promise<ParityResponseSnapshot> | null {
	const origin = 'http://127.0.0.1:3100';
	const params = new URLSearchParams(search);

	if (pathname === '/index.php/core/mimeicon' || pathname === '/core/mimeicon') {
		const mime = params.get('mime') ?? 'application/octet-stream';

		return responseToSnapshot(getMimeIconRedirect(mime, origin));
	}

	const referenceMatch = /^\/(?:index\.php\/)?core\/references\/preview\/([^/]+)$/.exec(pathname);

	if (referenceMatch) {
		return responseToSnapshot(getReferencePreviewResponse(decodeURIComponent(referenceMatch[1])));
	}

	if (pathname === '/index.php/core/preview.png' || pathname === '/core/preview.png') {
		const request = new Request(`${origin}${pathname}?${params.toString()}`, {
			headers: options.headers,
		});
		const auth = requireLoggedInUser(request);

		if (auth instanceof Response) {
			return responseToSnapshot(auth);
		}

		const file = params.get('file') ?? '';
		const x = Number.parseInt(params.get('x') ?? '32', 10);
		const y = Number.parseInt(params.get('y') ?? '32', 10);
		const mimeFallback = params.get('mimeFallback') === 'true';

		return responseToSnapshot(getPreviewByPathResponse(file, x, y, origin, mimeFallback));
	}

	if (pathname === '/index.php/core/preview' || pathname === '/core/preview') {
		const request = new Request(`${origin}${pathname}?${params.toString()}`, {
			headers: options.headers,
		});
		const auth = requireLoggedInUser(request);

		if (auth instanceof Response) {
			return responseToSnapshot(auth);
		}

		const fileId = Number.parseInt(params.get('fileId') ?? '', 10);
		const x = Number.parseInt(params.get('x') ?? '32', 10);
		const y = Number.parseInt(params.get('y') ?? '32', 10);
		const mimeFallback = params.get('mimeFallback') === 'true';

		return responseToSnapshot(getPreviewByFileIdResponse(Number.isNaN(fileId) ? 0 : fileId, x, y, origin, mimeFallback));
	}

	return null;
}

function handleHoverCardMock(pathname: string, options: ParityRequestOptions): ParityResponseSnapshot | null {
	const match = /^\/ocs\/v2\.php\/hovercard\/v1\/([^/]+)$/.exec(pathname);

	if (!match) {
		return null;
	}

	if (!isMockAuthenticated(options)) {
		return unauthorizedSnapshot();
	}

	const userId = decodeURIComponent(match[1]);

	if (userId === 'admin') {
		return jsonSnapshot(200, loadFixture('ocs-v2-hovercard-admin.json'));
	}

	return jsonSnapshot(404, loadFixture('ocs-v2-hovercard-not-found.json'));
}

export async function fetchLegacyMockSnapshot(fullPath: string, options: ParityRequestOptions = {}): Promise<ParityResponseSnapshot> {
	const method = (options.method ?? 'GET').toUpperCase();
	const [pathname, search = ''] = fullPath.split('?');
	const authResponse = handleLegacyMockAuth(pathname, options);

	if (authResponse) {
		return authResponse;
	}

	const twoFactorChallenge = await handleTwoFactorChallengeMock(pathname, search, options);

	if (twoFactorChallenge) {
		return twoFactorChallenge;
	}

	const webauthn = await handleWebAuthnMock(pathname, options);

	if (webauthn) {
		return webauthn;
	}

	const loginFlowV1 = await handleLoginFlowV1Mock(pathname, search, options);

	if (loginFlowV1) {
		return loginFlowV1;
	}

	const loginFlowV2 = await handleLoginFlowV2Mock(pathname, search, options);

	if (loginFlowV2) {
		return loginFlowV2;
	}

	const lostPassword = await handleLostPasswordMock(pathname, options);

	if (lostPassword) {
		return lostPassword;
	}

	const publicDav = await handleFilesSharingPublicDavMock(pathname, options);

	if (publicDav) {
		return publicDav;
	}

	const dav = await handleDavMock(pathname, options);

	if (dav) {
		return dav;
	}

	const davDirect = await handleDavDirectMock(pathname, search, options);

	if (davDirect) {
		return davDirect;
	}

	const davOutOfOffice = await handleDavOutOfOfficeMock(pathname, search, options);

	if (davOutOfOffice) {
		return davOutOfOffice;
	}

	const davCalOcs = await handleDavCalOcsMock(pathname, search, options);

	if (davCalOcs) {
		return davCalOcs;
	}

	const davCalContactsIo = await handleDavCalContactsIoMock(pathname, search, options);

	if (davCalContactsIo) {
		return davCalContactsIo;
	}

	const davInvitationHtml = await handleDavInvitationHtmlMock(pathname, search, options);

	if (davInvitationHtml) {
		return davInvitationHtml;
	}

	const davBirthday = await handleDavBirthdayMock(pathname, search, options);

	if (davBirthday) {
		return davBirthday;
	}

	const davExampleContent = await handleDavExampleContentMock(pathname, search, options);

	if (davExampleContent) {
		return davExampleContent;
	}

	const filesApi = await handleFilesApiMock(fullPath, options);

	if (filesApi) {
		return filesApi;
	}

	const filesFilenames = await handleFilesFilenamesMock(pathname, search, options);

	if (filesFilenames) {
		return filesFilenames;
	}

	const filesDirectEditing = await handleFilesDirectEditingMock(pathname, search, options);

	if (filesDirectEditing) {
		return filesDirectEditing;
	}

	const filesTemplates = await handleFilesTemplatesMock(pathname, search, options);

	if (filesTemplates) {
		return filesTemplates;
	}

	const filesRemainingOcs = await handleFilesRemainingOcsMock(pathname, search, options);

	if (filesRemainingOcs) {
		return filesRemainingOcs;
	}

	const filesSharingOcs = await handleFilesSharingOcsMock(pathname, search, options);

	if (filesSharingOcs) {
		return filesSharingOcs;
	}

	const sharingV1 = await handleSharingV1Mock(pathname, search, options);

	if (sharingV1) {
		return sharingV1;
	}

	const filesSharingPublicLink = await handleFilesSharingPublicLinkMock(pathname, search, options);

	if (filesSharingPublicLink) {
		return filesSharingPublicLink;
	}

	const filesSharingPublicPreview = await handleFilesSharingPublicPreviewMock(pathname, search, options);

	if (filesSharingPublicPreview) {
		return filesSharingPublicPreview;
	}

	const filesSharingAccept = await handleFilesSharingAcceptMock(pathname, search, options);

	if (filesSharingAccept) {
		return filesSharingAccept;
	}

	const filesSharingExternalShares = await handleFilesSharingExternalSharesMock(pathname, search, options);

	if (filesSharingExternalShares) {
		return filesSharingExternalShares;
	}

	const filesSharingShareInfo = await handleFilesSharingShareInfoMock(pathname, search, options);

	if (filesSharingShareInfo) {
		return filesSharingShareInfo;
	}

	const filesView = await handleFilesViewMock(fullPath, options);

	if (filesView) {
		return filesView;
	}

	if (method === 'PUT' && pathname.includes('/cloud/capabilities')) {
		const isV1 = pathname.includes('/ocs/v1.php/');

		return jsonSnapshot(isV1 ? 200 : 405, {
			ocs: {
				meta: {
					status: 'failure',
					statuscode: 405,
					message: 'Method not allowed',
					...(isV1 ? { totalitems: '', itemsperpage: '' } : {}),
				},
				data: {},
			},
		});
	}

	const appPassword = await handleAppPasswordMock(pathname, search, options);

	if (appPassword) {
		return appPassword;
	}

	if (method !== 'GET' && method !== 'POST' && method !== 'PUT' && method !== 'DELETE' && method !== 'PROPFIND' && method !== 'OPTIONS') {
		return jsonSnapshot(404, { message: `Legacy mock has no fixture for ${method} ${pathname}` });
	}

	const wellKnown = handleWellKnownMock(pathname, options);

	if (wellKnown) {
		return wellKnown;
	}

	const ocsProvider = handleOcsProviderMock(pathname);

	if (ocsProvider) {
		return ocsProvider;
	}

	const navigation = handleNavigationMock(fullPath, options);

	if (navigation) {
		return navigation;
	}

	const autocomplete = handleAutocompleteMock(fullPath, options);

	if (autocomplete) {
		return autocomplete;
	}

	const hoverCard = handleHoverCardMock(pathname, options);

	if (hoverCard) {
		return hoverCard;
	}

	const unifiedSearch = handleUnifiedSearchMock(fullPath, options, isMockAuthenticated(options), unauthorizedSnapshot);

	if (unifiedSearch) {
		return unifiedSearch;
	}

	const reference = await handleReferenceMock(pathname, search, options);

	if (reference) {
		return reference;
	}

	const taskProcessing = await handleTaskProcessingMock(pathname, search, options);

	if (taskProcessing) {
		return taskProcessing;
	}

	const textProcessing = await handleTextProcessingMock(pathname, search, options);

	if (textProcessing) {
		return textProcessing;
	}

	const textToImage = await handleTextToImageMock(pathname, search, options);

	if (textToImage) {
		return textToImage;
	}

	const translation = await handleTranslationMock(pathname, search, options);

	if (translation) {
		return translation;
	}

	const twoFactor = await handleTwoFactorMock(pathname, search, options);

	if (twoFactor) {
		return twoFactor;
	}

	const collaborationResources = await handleCollaborationResourcesMock(pathname, search, options);

	if (collaborationResources) {
		return collaborationResources;
	}

	const teams = await handleTeamsMock(pathname, search, options);

	if (teams) {
		return teams;
	}

	const wipe = await handleWipeMock(pathname, options);

	if (wipe) {
		return wipe;
	}

	const avatarWrite = await handleAvatarWriteMock(pathname, options);

	if (avatarWrite) {
		return avatarWrite;
	}

	const contactsMenu = await handleContactsMenuMock(pathname, search, options);

	if (contactsMenu) {
		return contactsMenu;
	}

	const publicLeftovers = await handlePublicLeftoversMock(pathname, search, options);

	if (publicLeftovers) {
		return publicLeftovers;
	}

	const webUpdater = await handleWebUpdaterMock(pathname, options);

	if (webUpdater) {
		return webUpdater;
	}

	const avatar = handleAvatarMock(pathname, search);

	if (avatar) {
		return avatar;
	}

	const preview = handlePreviewMock(pathname, search, options);

	if (preview) {
		return preview;
	}

	if (pathname === '/status.php') {
		return jsonSnapshot(200, loadFixture('status.json'), 'application/json', {
			'access-control-allow-origin': '*',
		});
	}

	if (pathname.startsWith('/ocs/v2.php/cloud/capabilities')) {
		const fixture = hasValidBasicAuth(options.headers)
			? 'ocs-v2-capabilities-authenticated.json'
			: 'ocs-v2-capabilities-public.json';

		return jsonSnapshot(200, loadFixture(fixture));
	}

	if (pathname.startsWith('/ocs/v1.php/cloud/capabilities')) {
		const fixture = hasValidBasicAuth(options.headers)
			? 'ocs-v1-capabilities-authenticated.json'
			: 'ocs-v1-capabilities-public.json';

		return jsonSnapshot(200, loadFixture(fixture));
	}

	return jsonSnapshot(404, { message: `Legacy mock has no fixture for ${method} ${pathname}` });
}

export function usesLegacyMock(): boolean {
	return !process.env.LEGACY_BASE_URL?.trim();
}

const MOCKED_GET_PREFIXES = [
	'/.well-known/',
	'/ocs-provider',
	'/ocs/v2.php/core/navigation/',
	'/ocs/v2.php/core/autocomplete/',
	'/ocs/v2.php/search/providers',
	'/ocs/v2.php/hovercard/v1/',
	'/avatar/',
	'/index.php/avatar/',
	'/core/',
	'/index.php/core/',
];

const MOCKED_GET_ROUTES = new Set([
	'/status.php',
	'/ocs/v1.php/cloud/capabilities',
	'/ocs/v2.php/cloud/capabilities',
	'/csrftoken',
	'/index.php/csrftoken',
	'/heartbeat',
	'/index.php/heartbeat',
	'/login',
	'/logout',
]);

export function hasLegacyMockFixture(pathname: string, method = 'GET'): boolean {
	const normalizedMethod = method.toUpperCase();

	if (normalizedMethod === 'PUT' && pathname.includes('/cloud/capabilities')) {
		return true;
	}

	if (normalizedMethod === 'POST' && (
		pathname === '/login'
		|| pathname === '/login/confirm'
		|| pathname === '/index.php/login/confirm'
		|| isLostPasswordPath(pathname, normalizedMethod)
		|| isTwoFactorChallengePath(pathname)
		|| isWebAuthnPath(pathname)
	)) {
		return true;
	}

	if (pathname === '/login/flow'
		|| pathname === '/index.php/login/flow'
		|| pathname === '/login/flow/grant'
		|| pathname === '/login/flow/apptoken'
		|| pathname === '/login/v2'
		|| pathname === '/index.php/login/v2'
		|| pathname === '/login/v2/poll'
		|| pathname === '/index.php/login/v2/poll'
		|| pathname === '/login/v2/flow'
		|| pathname === '/login/v2/grant'
		|| pathname === '/login/v2/apptoken'
		|| /^\/login\/v2\/flow\/[^/]+$/.test(pathname)
		|| isTwoFactorChallengePath(pathname)
		|| isLostPasswordPath(pathname, normalizedMethod)) {
		return true;
	}

	if (pathname.startsWith('/ocs/v2.php/core/getapppassword')
		|| pathname.startsWith('/ocs/v2.php/core/apppassword')
		|| pathname.startsWith('/ocs/v2.php/search/providers')
		|| pathname.startsWith('/ocs/v2.php/references/')
		|| pathname.startsWith('/ocs/v2.php/taskprocessing/')
		|| pathname.startsWith('/ocs/v2.php/textprocessing/')
		|| pathname.startsWith('/ocs/v2.php/text2image/')
		|| pathname.startsWith('/ocs/v2.php/translation/')
		|| pathname.startsWith('/ocs/v2.php/twofactor/')
		|| pathname.startsWith('/ocs/v2.php/webauthn/')
		|| pathname.startsWith('/ocs/v2.php/collaboration/resources/')
		|| pathname.startsWith('/ocs/v2.php/teams/')) {
		return true;
	}

	if (normalizedMethod === 'POST' && pathname.startsWith('/ocs/v2.php/twofactor/')) {
		return true;
	}

	if (normalizedMethod === 'POST' && (
		pathname === '/index.php/core/wipe/check'
		|| pathname === '/core/wipe/check'
		|| pathname === '/index.php/core/wipe/success'
		|| pathname === '/core/wipe/success'
		|| pathname === '/avatar'
		|| pathname === '/avatar/'
		|| pathname === '/index.php/avatar'
		|| pathname === '/index.php/avatar/'
	)) {
		return true;
	}

	if (normalizedMethod === 'DELETE' && (
		pathname === '/avatar'
		|| pathname === '/avatar/'
		|| pathname === '/index.php/avatar'
		|| pathname === '/index.php/avatar/'
	)) {
		return true;
	}

	if (isDavDirectMockPath(pathname, normalizedMethod)) {
		return true;
	}

	if (isDavOutOfOfficeMockPath(pathname)) {
		return true;
	}

	if (isDavCalOcsMockPath(pathname)) {
		return true;
	}

	if (isDavCalContactsIoMockPath(pathname, normalizedMethod)) {
		return true;
	}

	if (isDavInvitationHtmlMockPath(pathname, normalizedMethod)) {
		return true;
	}

	if (isDavBirthdayMockPath(pathname, normalizedMethod)) {
		return true;
	}

	if (isDavExampleContentMockPath(pathname)) {
		return true;
	}

	if (pathname.startsWith('/remote.php/dav')
		|| pathname.startsWith('/remote.php/webdav')
		|| pathname.startsWith('/remote.php/files')) {
		return isDavMockMethod(normalizedMethod);
	}

	if (normalizedMethod === 'GET' && isFilesApiPath(pathname)) {
		return true;
	}

	if (isFilesApiWritePath(pathname, normalizedMethod)) {
		return true;
	}

	if (isFilesFilenamesMockPath(pathname)) {
		return true;
	}

	if (isFilesDirectEditingMockPath(pathname, normalizedMethod)) {
		return true;
	}

	if (isFilesTemplatesMockPath(pathname, normalizedMethod)) {
		return true;
	}

	if (isFilesRemainingOcsMockPath(pathname, normalizedMethod)) {
		return true;
	}

	if (isFilesSharingOcsMockPath(pathname, normalizedMethod)) {
		return true;
	}

	if (isSharingV1MockPath(pathname, normalizedMethod)) {
		return true;
	}

	if (isFilesSharingPublicLinkMockPath(pathname, normalizedMethod)) {
		return true;
	}

	if (isFilesSharingPublicPreviewMockPath(pathname, normalizedMethod)) {
		return true;
	}

	if (isFilesSharingAcceptMockPath(pathname, normalizedMethod)) {
		return true;
	}

	if (isFilesSharingExternalSharesMockPath(pathname, normalizedMethod)) {
		return true;
	}

	if (isFilesSharingShareInfoMockPath(pathname, normalizedMethod)) {
		return true;
	}

	if (isPublicDavMockPath(pathname) && isPublicDavMockMethod(normalizedMethod)) {
		return true;
	}

	if (isFilesViewMockPath(pathname, normalizedMethod)) {
		return true;
	}

	if (isPublicLeftoversMockPath(pathname, normalizedMethod)) {
		return true;
	}

	if (isWebUpdaterMockPath(pathname, normalizedMethod)) {
		return true;
	}

	if (normalizedMethod !== 'GET' && normalizedMethod !== 'DELETE' && normalizedMethod !== 'PROPFIND' && normalizedMethod !== 'OPTIONS') {
		return false;
	}

	if (MOCKED_GET_ROUTES.has(pathname)) {
		return true;
	}

	return MOCKED_GET_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
