import type { NextConfig } from 'next';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
	reactStrictMode: true,
	outputFileTracingRoot: rootDir,
	skipTrailingSlashRedirect: true,
	eslint: {
		ignoreDuringBuilds: true,
	},
	async rewrites() {
		return [
			{
				source: '/.well-known/change-password',
				destination: '/well-known/change-password',
			},
			{
				source: '/.well-known/security.txt',
				destination: '/well-known/security.txt',
			},
			{
				source: '/.well-known/:service',
				destination: '/well-known/:service',
			},
			{
				source: '/ocs-provider/',
				destination: '/ocs-provider',
			},
		];
	},
};

export default nextConfig;
