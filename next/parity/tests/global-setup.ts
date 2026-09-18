import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';

const rootDir = process.cwd();
const defaultPort = Number(process.env.PORT ?? 3100);
const defaultBaseUrl = `http://127.0.0.1:${defaultPort}`;

let serverProcess: ChildProcess | null = null;

async function waitForServer(baseUrl: string, attempts = 60): Promise<void> {
	for (let attempt = 0; attempt < attempts; attempt += 1) {
		try {
			const response = await fetch(`${baseUrl}/status.php`);

			if (response.ok) {
				return;
			}
		} catch {
			// retry until the server is ready
		}

		await new Promise((resolve) => {
			setTimeout(resolve, 500);
		});
	}

	throw new Error(`Timed out waiting for Next.js server at ${baseUrl}`);
}

export async function setup(): Promise<void> {
	process.env.NC_PARITY_EXAPP = 'true';
	process.env.NC_PARITY_DETERMINISTIC_SHARE_TOKENS = 'true';

	if (process.env.NEW_BASE_URL?.trim()) {
		return;
	}

	process.env.NEW_BASE_URL = defaultBaseUrl;
	process.env.NC_PARITY_EXAPP = 'true';

	try {
		const probe = await fetch(`${defaultBaseUrl}/status.php`);
		const contentType = probe.headers.get('content-type');

		if (probe.ok && contentType === 'application/json') {
			return;
		}
	} catch {
		// start a local server for parity tests
	}

	if (serverProcess && !serverProcess.killed) {
		serverProcess.kill();
		serverProcess = null;
	}

	const nextBinary = path.join(rootDir, 'node_modules', '.bin', 'next');

	await new Promise<void>((resolve, reject) => {
		const build = spawn(nextBinary, ['build'], {
			cwd: rootDir,
			stdio: 'inherit',
		});

		build.on('exit', (code) => {
			if (code === 0) {
				resolve();
				return;
			}

			reject(new Error(`next build failed with exit code ${code ?? 'unknown'}`));
		});
	});

	serverProcess = spawn(nextBinary, ['start', '--port', String(defaultPort)], {
		cwd: rootDir,
		stdio: 'pipe',
		env: {
			...process.env,
			NC_PARITY_EXAPP: 'true',
			NC_PARITY_DETERMINISTIC_SHARE_TOKENS: 'true',
		},
	});

	await waitForServer(defaultBaseUrl);
}

export async function teardown(): Promise<void> {
	if (serverProcess && !serverProcess.killed) {
		serverProcess.kill();
		serverProcess = null;
	}
}
