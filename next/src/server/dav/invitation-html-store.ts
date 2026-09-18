export interface CalendarInvitation {
	token: string;
	uid: string;
	recurrenceid: string | null;
	attendee: string;
	organizer: string;
	sequence: number;
	expiration: number;
}

const invitationsByToken = new Map<string, CalendarInvitation>();

export function resetInvitationHtmlStore(): void {
	invitationsByToken.clear();
}

export function seedCalendarInvitation(invitation: CalendarInvitation): void {
	invitationsByToken.set(invitation.token, invitation);
}

export function getValidCalendarInvitation(token: string, nowSeconds = Math.floor(Date.now() / 1000)): CalendarInvitation | null {
	const row = invitationsByToken.get(token);

	if (!row || row.expiration < nowSeconds) {
		return null;
	}

	return row;
}

export function processInvitationResponse(invitation: CalendarInvitation, partStat: string): '1.2' | null {
	void invitation;
	void partStat;

	return '1.2';
}
