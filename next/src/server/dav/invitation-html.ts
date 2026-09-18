import {
	getValidCalendarInvitation,
	processInvitationResponse,
} from './invitation-html-store';

const HTML_CONTENT_TYPE = 'text/html; charset=UTF-8';
const VALID_PART_STATS = new Set(['ACCEPTED', 'DECLINED', 'TENTATIVE']);

function htmlResponse(html: string): Response {
	return new Response(html, {
		status: 200,
		headers: {
			'content-type': HTML_CONTENT_TYPE,
		},
	});
}

function buildSuccessHtml(): string {
	return `<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8" />
	<title>Calendar invitation</title>
</head>
<body class="guest">
<div class="guest-box" data-template="schedule-response-success">
	<div class="icon icon-checkmark"></div>
	<p class="message">Your attendance was updated successfully.</p>
</div>
</body>
</html>`;
}

function buildErrorHtml(organizer?: string): string {
	const organizerLink = organizer
		? `<p><a href="${organizer}">${organizer.slice(7)}</a></p>`
		: '';

	return `<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8" />
	<title>Calendar invitation</title>
</head>
<body class="guest">
<div class="guest-box" data-template="schedule-response-error">
	<div class="notecard error">
		<p>There was an error updating your attendance status.</p>
		<p>Please contact the organizer directly.</p>
		${organizerLink}
	</div>
</div>
</body>
</html>`;
}

function buildOptionsHtml(token: string): string {
	return `<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8" />
	<title>Calendar invitation</title>
</head>
<body class="guest">
<div class="guest-box" data-template="schedule-response-options">
	<form action="" method="post">
		<fieldset id="partStat">
			<h2>Are you accepting the invitation?</h2>
			<div id="selectPartStatForm">
				<input type="radio" id="partStatAccept" name="partStat" value="ACCEPTED" checked />
				<label for="partStatAccept">
					<span>Accept</span>
				</label>

				<input type="radio" id="partStatTentative" name="partStat" value="TENTATIVE" />
				<label for="partStatTentative">
					<span>Tentative</span>
				</label>

				<input type="radio" class="declined" id="partStatDeclined" name="partStat" value="DECLINED" />
				<label for="partStatDeclined">
					<span>Decline</span>
				</label>
			</div>
		</fieldset>
		<fieldset>
			<input type="submit" value="Save">
		</fieldset>
	</form>
</div>
</body>
</html>`;
}

function respondFromPartStat(token: string, partStat: string): Response {
	const row = getValidCalendarInvitation(token);

	if (!row) {
		return htmlResponse(buildErrorHtml());
	}

	const scheduleStatus = processInvitationResponse(row, partStat);

	if (scheduleStatus === '1.2') {
		return htmlResponse(buildSuccessHtml());
	}

	return htmlResponse(buildErrorHtml(row.organizer));
}

async function readPartStat(request: Request): Promise<string | null> {
	const url = new URL(request.url);
	const queryValue = url.searchParams.get('partStat');

	if (queryValue !== null) {
		return queryValue;
	}

	const bodyText = await request.text();

	if (!bodyText) {
		return null;
	}

	return new URLSearchParams(bodyText).get('partStat');
}

export function handleInvitationAccept(token: string): Response {
	return respondFromPartStat(token, 'ACCEPTED');
}

export function handleInvitationDecline(token: string): Response {
	return respondFromPartStat(token, 'DECLINED');
}

export function handleInvitationOptions(token: string): Response {
	return htmlResponse(buildOptionsHtml(token));
}

export async function handleInvitationProcessMoreOptions(request: Request, token: string): Promise<Response> {
	const partStat = await readPartStat(request);

	if (!partStat || !VALID_PART_STATS.has(partStat)) {
		return htmlResponse(buildErrorHtml());
	}

	return respondFromPartStat(token, partStat);
}
