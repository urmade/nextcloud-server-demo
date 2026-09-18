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
			{
				source: '/index.php/avatar/:path*',
				destination: '/avatar/:path*',
			},
			{
				source: '/index.php/core/:path*',
				destination: '/core/:path*',
			},
			{
				source: '/index.php/login/v2/:path*',
				destination: '/login/v2/:path*',
			},
			{
				source: '/index.php/login/v2',
				destination: '/login/v2',
			},
			{
				source: '/index.php/login/confirm',
				destination: '/login/confirm',
			},
			{
				source: '/index.php/csrftoken',
				destination: '/csrftoken',
			},
			{
				source: '/index.php/heartbeat',
				destination: '/heartbeat',
			},
			{
				source: '/index.php/lostpassword/email',
				destination: '/lostpassword/email',
			},
			{
				source: '/index.php/lostpassword/reset/form/:token/:userId',
				destination: '/lostpassword/reset/form/:token/:userId',
			},
			{
				source: '/index.php/lostpassword/set/:token/:userId',
				destination: '/lostpassword/set/:token/:userId',
			},
		];
	},
};

export default nextConfig;
