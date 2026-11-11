/*
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { Locator, Page } from '@playwright/test'

import { expect } from '@playwright/test'

/**
 * The database engines offered by the installation wizard, keyed by their
 * visible (accessible) radio label.
 */
export type DatabaseName = 'SQLite' | 'MySQL/MariaDB' | 'PostgreSQL'

/** Connection details for a non-SQLite database backend. */
export interface DatabaseConnection {
	user: string
	password: string
	name: string
	host: string
}

/**
 * The Nextcloud installation wizard (`core/src/views/Setup.vue`).
 *
 * Locators are role/label based; the form container has no accessible
 * name, so it keeps its product-owned `data-cy` hook.
 */
export class SetupPage {
	constructor(private readonly page: Page) {}

	/** Open the installation wizard (served at the instance root when uninstalled). */
	async open(): Promise<void> {
		await this.page.goto('/')
		await this.form().waitFor({ state: 'visible' })
	}

	form(): Locator {
		return this.page.locator('[data-cy-setup-form]')
	}

	adminLoginField(): Locator {
		return this.page.getByRole('textbox', { name: 'Administration account name' })
	}

	adminPasswordField(): Locator {
		// A password <input> has no textbox role, so address it by its label
		return this.page.getByLabel('Administration account password')
	}

	dataFolderField(): Locator {
		return this.page.getByRole('textbox', { name: 'Data folder' })
	}

	databaseRadio(name: DatabaseName): Locator {
		return this.page.getByRole('radio', { name })
	}

	submitButton(): Locator {
		return this.page.getByRole('button', { name: 'Install' })
	}

	/** Select a database engine and confirm the radio actually toggled. */
	async selectDatabase(name: DatabaseName): Promise<void> {
		const radio = this.databaseRadio(name)
		// The radio input is visually hidden inside NcCheckboxRadioSwitch, so force it
		await radio.check({ force: true })
		await expect(radio).toBeChecked()
	}

	/** Fill the connection fields for a non-SQLite database backend. */
	async fillDatabaseConnection(connection: DatabaseConnection): Promise<void> {
		await this.page.getByRole('textbox', { name: 'Database user' }).fill(connection.user)
		await this.page.getByLabel('Database password').fill(connection.password)
		await this.page.getByRole('textbox', { name: 'Database name' }).fill(connection.name)
		await this.page.getByRole('textbox', { name: 'Database host' }).fill(connection.host)
	}

	/**
	 * Fill the administration account and submit the wizard, then wait for the
	 * install to finish and land on the default page.
	 */
	async install(adminUser: string, adminPassword: string): Promise<void> {
		await this.adminLoginField().fill(adminUser)
		await this.adminPasswordField().fill(adminPassword)
		await this.submitButton().click()

		await this.page.waitForURL(/\/apps\/(dashboard|files)\//)
	}
}
