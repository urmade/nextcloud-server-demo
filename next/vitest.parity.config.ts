import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
	root: __dirname,
	esbuild: {
		tsconfigRaw: {
			compilerOptions: {
				target: 'ES2022',
				strict: true,
			},
		},
	},
	test: {
		environment: 'node',
		include: ['parity/tests/**/*.parity.test.ts'],
		setupFiles: ['parity/tests/setup.ts'],
		testTimeout: 30_000,
		hookTimeout: 30_000,
	},
	resolve: {
		alias: {
			'@': path.resolve(__dirname, '.'),
		},
	},
});
