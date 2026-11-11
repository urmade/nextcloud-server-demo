<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2017 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace Test\Template;

use OC\App\AppManager;
use OC\AppConfig;
use OC\Files\AppData\AppData;
use OC\Files\AppData\Factory;
use OC\Template\CSSResourceLocator;
use OCA\Theming\ThemingDefaults;
use OCP\App\IAppManager;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\Files\IAppData;
use OCP\ICacheFactory;
use OCP\IConfig;
use OCP\IURLGenerator;
use OCP\Server;
use PHPUnit\Framework\MockObject\MockObject;
use Psr\Log\LoggerInterface;

class CSSResourceLocatorTest extends \Test\TestCase {
	private IAppData&MockObject $appData;
	private IURLGenerator&MockObject $urlGenerator;
	private IConfig&MockObject $config;
	private ThemingDefaults&MockObject $themingDefaults;
	private ICacheFactory&MockObject $cacheFactory;
	private LoggerInterface&MockObject $logger;
	private ITimeFactory&MockObject $timeFactory;
	private AppConfig&MockObject $appConfig;

	#[\Override]
	protected function setUp(): void {
		parent::setUp();

		$this->logger = $this->createMock(LoggerInterface::class);
		$this->appData = $this->createMock(AppData::class);
		$this->urlGenerator = $this->createMock(IURLGenerator::class);
		$this->config = $this->createMock(IConfig::class);
		$this->cacheFactory = $this->createMock(ICacheFactory::class);
		$this->themingDefaults = $this->createMock(ThemingDefaults::class);
		$this->timeFactory = $this->createMock(ITimeFactory::class);
		$this->appConfig = $this->createMock(AppConfig::class);
	}

	private function cssResourceLocator() {
		/** @var Factory|\PHPUnit\Framework\MockObject\MockObject $factory */
		$factory = $this->createMock(Factory::class);
		$factory->method('get')->with('css')->willReturn($this->appData);
		return new CSSResourceLocator(
			$this->logger,
			$this->createMock(IConfig::class),
			Server::get(IAppManager::class),
			'theme',
			['core' => 'map'],
			['3rd' => 'party'],
		);
	}

	public function testFindWithAppPathSymlink(): void {
		$link = sys_get_temp_dir() . '/' . sha1(random_bytes(10));
		symlink(\OC::$SERVERROOT . '/apps', $link);

		$originalRoots = \OC::$APPSROOTS;
		\OC::$APPSROOTS = [[
			'path' => $link,
			'url' => '/css-apps-test',
			'writable' => false,
		]];
		$dirCache = new \ReflectionProperty(AppManager::class, 'appsDirCache');
		$appManager = Server::get(IAppManager::class);
		$originalDirCache = $dirCache->getValue($appManager);
		$dirCache->setValue($appManager, []);

		try {
			$locator = $this->cssResourceLocator();
			$locator->find(['theming/css/default']);

			$resources = $locator->getResources();
			$this->assertCount(1, $resources);
			$this->assertCount(3, $resources[0]);
			[$root, $webRoot, $file] = $resources[0];

			$this->assertEquals(\OC::$SERVERROOT . '/apps/theming', $root,
				'Ensure the app path symlink is resolved into the real path');
			$this->assertEquals(\OC::$WEBROOT . '/css-apps-test/theming', $webRoot);
			$this->assertEquals('css/default.css', $file);
		} finally {
			\OC::$APPSROOTS = $originalRoots;
			$dirCache->setValue($appManager, $originalDirCache);
			unlink($link);
		}
	}
}
