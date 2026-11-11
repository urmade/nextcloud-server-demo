<?php

/**
 * SPDX-FileCopyrightText: 2016-2024 Nextcloud GmbH and Nextcloud contributors
 * SPDX-FileCopyrightText: 2016 ownCloud, Inc.
 * SPDX-License-Identifier: AGPL-3.0-only
 */
use OCP\IConfig;
use OCP\IURLGenerator;
use OCP\L10N\IFactory;
use OCP\Server;
use OCP\ServerVersion;
use OCP\Util;

class OC_Defaults {
	private $defaultEntity;
	private $defaultName;
	private $defaultTitle;
	private $defaultBaseUrl;
	private $defaultSyncClientUrl;
	private $defaultiOSClientUrl;
	private $defaultiTunesAppId;
	private $defaultAndroidClientUrl;
	private $defaultFDroidClientUrl;
	private $defaultDocBaseUrl;
	private $defaultDocVersion;
	private $defaultSlogan;
	private $defaultColorBackground;
	private $defaultColorPrimary;
	private $defaultTextColorPrimary;
	private $defaultProductName;

	public function __construct() {
		$config = Server::get(IConfig::class);
		$serverVersion = Server::get(ServerVersion::class);

		$this->defaultEntity = 'Nextcloud'; /* e.g. company name, used for footers and copyright notices */
		$this->defaultName = 'Nextcloud'; /* short name, used when referring to the software */
		$this->defaultTitle = 'Nextcloud'; /* can be a longer name, for titles */
		$this->defaultBaseUrl = 'https://nextcloud.com';
		$this->defaultSyncClientUrl = $config->getSystemValue('customclient_desktop', 'https://nextcloud.com/install/#install-clients');
		$this->defaultiOSClientUrl = $config->getSystemValue('customclient_ios', 'https://geo.itunes.apple.com/us/app/nextcloud/id1125420102?mt=8');
		$this->defaultiTunesAppId = $config->getSystemValue('customclient_ios_appid', '1125420102');
		$this->defaultAndroidClientUrl = $config->getSystemValue('customclient_android', 'https://play.google.com/store/apps/details?id=com.nextcloud.client');
		$this->defaultFDroidClientUrl = $config->getSystemValue('customclient_fdroid', 'https://f-droid.org/packages/com.nextcloud.client/');
		$this->defaultDocBaseUrl = 'https://docs.nextcloud.com';
		$this->defaultDocVersion = $serverVersion->getMajorVersion(); // used to generate doc links
		$this->defaultColorBackground = '#00679e';
		$this->defaultColorPrimary = '#00679e';
		$this->defaultTextColorPrimary = '#ffffff';
		$this->defaultProductName = 'Nextcloud';
	}

	/**
	 * Returns the base URL
	 * @return string URL
	 */
	public function getBaseUrl() {
		return $this->defaultBaseUrl;
	}

	/**
	 * Returns the URL where the sync clients are listed
	 * @return string URL
	 */
	public function getSyncClientUrl() {
		return $this->defaultSyncClientUrl;
	}

	/**
	 * Returns the URL to the App Store for the iOS Client
	 * @return string URL
	 */
	public function getiOSClientUrl() {
		return $this->defaultiOSClientUrl;
	}

	/**
	 * Returns the AppId for the App Store for the iOS Client
	 * @return string AppId
	 */
	public function getiTunesAppId() {
		return $this->defaultiTunesAppId;
	}

	/**
	 * Returns the URL to Google Play for the Android Client
	 * @return string URL
	 */
	public function getAndroidClientUrl() {
		return $this->defaultAndroidClientUrl;
	}

	/**
	 * Returns the URL to Google Play for the Android Client
	 * @return string URL
	 */
	public function getFDroidClientUrl() {
		return $this->defaultFDroidClientUrl;
	}

	/**
	 * Returns the documentation URL
	 * @return string URL
	 */
	public function getDocBaseUrl() {
		return $this->defaultDocBaseUrl;
	}

	/**
	 * Returns the title
	 * @return string title
	 */
	public function getTitle() {
		return $this->defaultTitle;
	}

	/**
	 * Returns the short name of the software
	 * @return string title
	 */
	public function getName() {
		return $this->defaultName;
	}

	/**
	 * Returns the short name of the software containing HTML strings
	 * @return string title
	 */
	public function getHTMLName() {
		return $this->defaultName;
	}

	/**
	 * Returns entity (e.g. company name) - used for footer, copyright
	 * @return string entity name
	 */
	public function getEntity() {
		return $this->defaultEntity;
	}

	/**
	 * Returns slogan
	 * @return string slogan
	 */
	public function getSlogan(?string $lang = null) {
		if ($this->defaultSlogan === null) {
			$l10n = Server::get(IFactory::class)->get('lib', $lang);
			$this->defaultSlogan = $l10n->t('a safe home for all your data');
		}
		return $this->defaultSlogan;
	}

	/**
	 * Returns short version of the footer
	 * @return string short footer
	 */
	public function getShortFooter() {
		return '<a href="' . $this->getBaseUrl() . '" target="_blank"'
			. ' rel="noreferrer noopener">' . $this->getEntity() . '</a>'
			. ' – ' . $this->getSlogan();
	}

	/**
	 * Returns long version of the footer
	 * @return string long footer
	 */
	public function getLongFooter() {
		return $this->getShortFooter();
	}

	/**
	 * @param string $key
	 * @return string URL to doc with key
	 */
	public function buildDocLinkToKey($key) {
		return $this->getDocBaseUrl() . '/server/' . $this->defaultDocVersion . '/go.php?to=' . $key;
	}

	/**
	 * Returns primary color
	 * @return string
	 */
	public function getColorPrimary() {
		return $this->defaultColorPrimary;
	}

	/**
	 * Returns primary color
	 * @return string
	 */
	public function getColorBackground() {
		return $this->defaultColorBackground;
	}

	/**
	 * @return array scss variables to overwrite
	 */
	public function getScssVariables() {
		return [];
	}

	public function shouldReplaceIcons() {
		return false;
	}

	/**
	 * Themed logo url
	 *
	 * @param bool $useSvg Whether to point to the SVG image or a fallback
	 * @return string
	 */
	public function getLogo($useSvg = true) {
		if ($useSvg) {
			$logo = Server::get(IURLGenerator::class)->imagePath('core', 'logo/logo.svg');
		} else {
			$logo = Server::get(IURLGenerator::class)->imagePath('core', 'logo/logo.png');
		}
		return $logo . '?v=' . hash('sha1', implode('.', Util::getVersion()));
	}

	/**
	 * Raw logo image data (raster, not SVG) for embedding directly into emails,
	 * so mail clients don't have to fetch it from the internet.
	 *
	 * @return array{content: string, mimeType: string}|null null when unavailable
	 */
	public function getLogoImage(): ?array {
		$content = @file_get_contents(\OC::$SERVERROOT . '/core/img/logo/logo.png');
		if ($content === false) {
			return null;
		}
		return ['content' => $content, 'mimeType' => 'image/png'];
	}

	public function getTextColorPrimary() {
		return $this->defaultTextColorPrimary;
	}

	public function getProductName() {
		return $this->defaultProductName;
	}
}
