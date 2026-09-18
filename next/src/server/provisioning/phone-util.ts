import {
	type CountryCode,
	getCountryCallingCode,
	parsePhoneNumberWithError,
} from 'libphonenumber-js';

function asCountryCode(regionCode: string): CountryCode | null {
	if (!/^[A-Z]{2}$/.test(regionCode)) {
		return null;
	}

	return regionCode as CountryCode;
}

export function getCountryCodeForRegion(regionCode: string): number | null {
	const region = asCountryCode(regionCode);

	if (!region) {
		return null;
	}

	try {
		const countryCode = Number.parseInt(getCountryCallingCode(region), 10);

		return countryCode === 0 ? null : countryCode;
	} catch {
		return null;
	}
}

export function convertToStandardFormat(input: string, defaultRegion: string): string | null {
	const region = asCountryCode(defaultRegion);

	if (!region) {
		return null;
	}

	try {
		const phoneNumber = parsePhoneNumberWithError(input, region);

		if (phoneNumber.isValid()) {
			return phoneNumber.format('E.164');
		}
	} catch {
		// Invalid numbers are ignored, matching PHP PhoneNumberUtil.
	}

	return null;
}
