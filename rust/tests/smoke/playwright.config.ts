/*
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { defineConfig } from '@playwright/test'

// The same specs run against PHP directly and through the gateway; only the
// base URL differs.
const baseURL = process.env.NC_TEST_BASE_URL ?? 'http://localhost:8080'

export default defineConfig({
	testDir: '.',
	testMatch: '**/*.spec.ts',
	fullyParallel: false,
	workers: 1,
	forbidOnly: !!process.env.CI,
	retries: 0,
	timeout: 60_000,
	reporter: process.env.CI ? [['list'], ['github']] : 'list',
	use: {
		baseURL,
		extraHTTPHeaders: {
			'OCS-APIRequest': 'true',
		},
	},
})
