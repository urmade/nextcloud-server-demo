<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2016-2024 Nextcloud GmbH and Nextcloud contributors
 * SPDX-FileCopyrightText: 2016 ownCloud, Inc.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace Test\Template;

use OC\Template\ResourceLocator;
use OC\Template\ResourceNotFoundException;
use OCP\IConfig;
use PHPUnit\Framework\MockObject\MockObject;
use Psr\Log\LoggerInterface;

class ResourceLocatorTest extends \Test\TestCase {
	private LoggerInterface&MockObject $logger;
	private IConfig&MockObject $config;

	#[\Override]
	protected function setUp(): void {
		parent::setUp();
		$this->logger = $this->createMock(LoggerInterface::class);
		$this->config = $this->createMock(IConfig::class);
	}

	public function getResourceLocator(): ResourceLocator&MockObject {
		return $this->getMockBuilder(ResourceLocator::class)
			->onlyMethods(['doFind', 'doFindTheme'])
			->setConstructorArgs(
				[$this->logger, $this->config],
				'', true, true, true, []
			)
			->getMock();
	}

	public function testFind(): void {
		$locator = $this->getResourceLocator();
		$locator->expects($this->once())
			->method('doFind')
			->with('foo');
		$locator->find(['foo']);
	}

	public function testFindIgnoresConfiguredTheme(): void {
		$this->config
			->method('getSystemValueString')
			->with('theme', '')
			->willReturn('theme');
		$locator = $this->getResourceLocator();
		$locator->expects($this->once())
			->method('doFind')
			->with('foo');
		$locator->expects($this->never())
			->method('doFindTheme');
		$locator->find(['foo']);
	}

	public function testFindNotFound(): void {
		$locator = $this->getResourceLocator();
		$locator->expects($this->once())
			->method('doFind')
			->with('foo')
			->willThrowException(new ResourceNotFoundException('foo', 'map'));
		$locator->expects($this->never())
			->method('doFindTheme');
		$this->logger->expects($this->once())
			->method('debug')
			->with($this->stringContains('map/foo'));
		$locator->find(['foo']);
	}

	public function testAppendIfExist(): void {
		$locator = $this->getResourceLocator();
		$method = new \ReflectionMethod($locator, 'appendIfExist');

		$method->invoke($locator, __DIR__, basename(__FILE__), 'webroot');
		$resource1 = [__DIR__, 'webroot', basename(__FILE__)];
		$this->assertEquals([$resource1], $locator->getResources());

		$method->invoke($locator, __DIR__, 'does-not-exist');
		$this->assertEquals([$resource1], $locator->getResources());
	}
}
