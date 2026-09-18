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
		include: ['src/**/*.test.ts', 'parity/helpers/**/*.test.ts', 'parity/compare.test.ts'],
	},
	resolve: {
		alias: {
			'@': path.resolve(__dirname, '.'),
		},
	},
});
