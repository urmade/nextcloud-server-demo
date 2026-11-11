/*
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { Page } from '@playwright/test'
import type { DatabaseConnection } from '../../support/sections/SetupPage.ts'

import { runExec } from '@nextcloud/e2e-test-server/docker'
import { test as base, expect } from '@playwright/test'
import { SetupPage } from '../../support/sections/SetupPage.ts'

/**
 * Installation-wizard tests. They repeatedly UN-INSTALL the shared server (so it
 * can be set up again from scratch) and the non-SQLite cases need reachable
 * database containers, so they run only in the dedicated setup job —
 * isolated in the `setup` Playwright project.
 * They are tagged `@setup` for selective runs.
 */
const test = base.extend<{ setupPage: SetupPage }>({
	setupPage: async ({ page }, use) => {
		await use(new SetupPage(page))
	},
})

const MYSQL: DatabaseConnection = { user: 'root', password: 'rootpassword', name: 'nextcloud', host: 'mysql:3306' }
const MARIADB: DatabaseConnection = { user: 'root', password: 'rootpassword', name: 'nextcloud', host: 'mariadb:3306' }
const POSTGRES: DatabaseConnection = { user: 'root', password: 'rootpassword', name: 'nextcloud', host: 'postgres:5432' }

/** A unique administration account name (also used as the password). */
function randomAdmin(): string {
	return `admin-${crypto.randomUUID().slice(0, 10)}`
}

/** Drive the admin creation + submit and assert the instance lands on a working default page. */
async function completeSetup(page: Page, setupPage: SetupPage): Promise<void> {
	const admin = randomAdmin()
	await setupPage.install(admin, admin)

	await page.goto('apps/files/')
	await expect(page.locator('[data-cy-files-content]')).toBeVisible()
}

test.describe('Nextcloud installation wizard', { tag: '@setup' }, () => {
	test.beforeEach(async () => {
		// Reset the instance to an uninstalled state so the wizard is served again
		await runExec(['rm', '-f', 'config/config.php'], { failOnError: false })
		await runExec(['rm', '-f', 'data/owncloud.db'], { failOnError: false })
	})

	test.describe('SQLite', { tag: '@db_sqlite' }, () => {
		test('installs with SQLite', async ({ page, setupPage }) => {
			test.slow()
			await setupPage.open()

			await expect(setupPage.adminLoginField()).toBeVisible()
			await expect(setupPage.adminPasswordField()).toBeVisible()
			await expect(setupPage.dataFolderField()).toHaveValue('/var/www/html/data')

			await setupPage.selectDatabase('SQLite')
			await completeSetup(page, setupPage)
		})
	})

	test('installs with MySQL', { tag: '@db_mysql' }, async ({ page, setupPage }) => {
		test.slow()
		await setupPage.open()

		await setupPage.selectDatabase('MySQL/MariaDB')
		await setupPage.fillDatabaseConnection(MYSQL)
		await completeSetup(page, setupPage)
	})

	test('installs with MariaDB', { tag: '@db_mariadb' }, async ({ page, setupPage }) => {
		test.slow()
		await setupPage.open()

		await setupPage.selectDatabase('MySQL/MariaDB')
		await setupPage.fillDatabaseConnection(MARIADB)
		await completeSetup(page, setupPage)
	})

	test('installs with PostgreSQL', { tag: '@db_postgres' }, async ({ page, setupPage }) => {
		test.slow()
		await setupPage.open()

		await setupPage.selectDatabase('PostgreSQL')
		await setupPage.fillDatabaseConnection(POSTGRES)
		await completeSetup(page, setupPage)
	})
})
