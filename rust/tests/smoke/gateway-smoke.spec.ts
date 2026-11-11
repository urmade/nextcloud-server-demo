/*
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { createHash, randomBytes } from 'node:crypto'
import { expect, test } from '@playwright/test'

const admin = { user: 'admin', password: 'admin' }
const basicAuth = `Basic ${Buffer.from(`${admin.user}:${admin.password}`).toString('base64')}`
const davRoot = `/remote.php/dav/files/${admin.user}`
const baseURL = process.env.NC_TEST_BASE_URL ?? 'http://localhost:8080'

function destination(name: string) {
	return new URL(`${davRoot}/${name}`, baseURL).href
}

function unique(name: string) {
	return `gateway-smoke-${Date.now()}-${randomBytes(3).toString('hex')}-${name}`
}

test.describe('status and login page', () => {
	test('status.php reports an installed instance with the documented key order', async ({ request }) => {
		const response = await request.get('/status.php')
		expect(response.status()).toBe(200)
		expect(response.headers()['content-type']).toContain('application/json')
		const text = await response.text()
		const status = JSON.parse(text)
		expect(status.installed).toBe(true)
		expect(status.maintenance).toBe(false)
		expect(Object.keys(status).slice(0, 6)).toEqual([
			'installed',
			'maintenance',
			'needsDbUpgrade',
			'version',
			'versionstring',
			'edition',
		])
	})

	test('responses carry a request id', async ({ request }) => {
		const response = await request.get('/index.php/login', { headers: { 'X-Request-Id': unique('request-id') } })
		expect(response.headers()['x-request-id']).toMatch(/^[A-Za-z0-9_.:-]{1,128}$/)
	})

	test('the login page sets several cookies and a request token', async ({ request }) => {
		const response = await request.get('/index.php/login')
		expect(response.status()).toBe(200)
		expect(await response.text()).toMatch(/data-requesttoken="[^"]+"/)
		const cookies = response.headersArray().filter(({ name }) => name.toLowerCase() === 'set-cookie')
		expect(cookies.length).toBeGreaterThanOrEqual(2)
	})
})

test.describe('authentication', () => {
	test('basic auth reaches the OCS API', async ({ request }) => {
		const response = await request.get('/ocs/v1.php/cloud/capabilities?format=json', {
			headers: { Authorization: basicAuth },
		})
		expect(response.status()).toBe(200)
		const body = await response.json()
		expect(body.ocs.meta.statuscode).toBe(100)
		expect(typeof body.ocs.data.version.major).toBe('number')
	})

	test('bad credentials are rejected the same way PHP rejects them', async ({ request }) => {
		const response = await request.get('/ocs/v2.php/cloud/user?format=json', {
			headers: { Authorization: `Basic ${Buffer.from('admin:wrong-password').toString('base64')}` },
		})
		expect(response.status()).toBe(401)
	})

	test('a browser style login establishes a session', async ({ request }) => {
		const loginPage = await (await request.get('/index.php/login')).text()
		const token = /data-requesttoken="([^"]+)"/.exec(loginPage)?.[1]
		expect(token).toBeTruthy()

		const login = await request.post('/index.php/login', {
			form: { user: admin.user, password: admin.password, timezone: 'UTC', timezone_offset: '0', requesttoken: token! },
			headers: { Origin: new URL(baseURL).origin },
			maxRedirects: 0,
		})
		expect(login.status()).toBe(303)
		expect(login.headers().location).not.toContain('/login')

		const me = await request.get('/ocs/v2.php/cloud/user?format=json')
		expect(me.status()).toBe(200)
		expect((await me.json()).ocs.data.id).toBe(admin.user)
	})
})

test.describe('WebDAV', () => {
	test('a file round trip with ranges, properties, copy, move, and delete', async ({ request }) => {
		const headers = { Authorization: basicAuth }
		const name = unique('file.txt')
		const url = `${davRoot}/${name}`
		const content = '0123456789abcdef'

		const put = await request.put(url, { headers, data: content })
		expect(put.status()).toBe(201)
		expect(put.headers().etag).toBeTruthy()

		const get = await request.get(url, { headers })
		expect(get.status()).toBe(200)
		expect(await get.text()).toBe(content)

		const ranged = await request.get(url, { headers: { ...headers, Range: 'bytes=2-4' } })
		expect(ranged.status()).toBe(206)
		expect(ranged.headers()['content-range']).toBe('bytes 2-4/16')
		expect(await ranged.text()).toBe('234')

		const propfind = await request.fetch(davRoot, {
			method: 'PROPFIND',
			headers: { ...headers, Depth: '1' },
			data: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:getetag/><d:getcontentlength/></d:prop></d:propfind>',
		})
		expect(propfind.status()).toBe(207)
		expect(await propfind.text()).toContain(name)

		const copyName = unique('copy.txt')
		const copy = await request.fetch(url, {
			method: 'COPY',
			headers: { ...headers, Destination: destination(copyName) },
		})
		expect(copy.status()).toBe(201)

		const movedName = unique('moved.txt')
		const move = await request.fetch(`${davRoot}/${copyName}`, {
			method: 'MOVE',
			headers: { ...headers, Destination: destination(movedName) },
		})
		expect(move.status()).toBe(201)

		for (const path of [name, movedName]) {
			const deleted = await request.delete(`${davRoot}/${path}`, { headers })
			expect(deleted.status()).toBe(204)
		}
		const gone = await request.get(url, { headers })
		expect(gone.status()).toBe(404)
	})

	test('collections can be created and removed', async ({ request }) => {
		const headers = { Authorization: basicAuth }
		const folder = `${davRoot}/${unique('folder')}`
		expect((await request.fetch(folder, { method: 'MKCOL', headers })).status()).toBe(201)
		expect((await request.fetch(folder, { method: 'MKCOL', headers })).status()).toBe(405)
		expect((await request.delete(folder, { headers })).status()).toBe(204)
	})

	test('a multi-megabyte upload and download keeps every byte', async ({ request }) => {
		const headers = { Authorization: basicAuth }
		const url = `${davRoot}/${unique('large.bin')}`
		const data = randomBytes(12 * 1024 * 1024)

		expect((await request.put(url, { headers, data })).status()).toBe(201)
		const download = await request.get(url, { headers })
		expect(download.status()).toBe(200)
		const body = await download.body()
		expect(body.length).toBe(data.length)
		expect(createHash('sha256').update(body).digest('hex')).toBe(createHash('sha256').update(data).digest('hex'))
		expect((await request.delete(url, { headers })).status()).toBe(204)
	})

	test('a missing file is a 404 with a DAV error body', async ({ request }) => {
		const response = await request.get(`${davRoot}/${unique('absent')}`, { headers: { Authorization: basicAuth } })
		expect(response.status()).toBe(404)
	})
})
