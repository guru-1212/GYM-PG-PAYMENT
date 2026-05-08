/**
 * Device information utility for audit logging.
 * Captures browser and device details from the client side.
 */

/**
 * Device information captured from the browser.
 */
export interface DeviceInfo {
  /** Full user agent string */
  userAgent: string;
  /** Operating system/platform (e.g., Windows, Mac, Android, iOS) */
  platform: string;
  /** Browser name (e.g., Chrome, Firefox, Safari) */
  browser: string;
  /** Screen resolution */
  screenResolution: string;
  /** Browser language/locale */
  language: string;
}

/**
 * Extract device information from the browser.
 * Returns null if running in a non-browser environment (SSR).
 */
export function getDeviceInfo(): DeviceInfo | null {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') {
    return null;
  }

  const userAgent = navigator.userAgent;
  const platform = navigator.platform || 'Unknown';
  const language = navigator.language || 'en-US';
  const screenResolution = `${window.screen.width}x${window.screen.height}`;

  // Parse browser name from user agent
  let browser = 'Unknown';
  if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) {
    browser = 'Chrome';
  } else if (userAgent.includes('Firefox')) {
    browser = 'Firefox';
  } else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
    browser = 'Safari';
  } else if (userAgent.includes('Edg')) {
    browser = 'Edge';
  } else if (userAgent.includes('Opera') || userAgent.includes('OPR')) {
    browser = 'Opera';
  }

  // Normalize platform for better readability
  let normalizedPlatform = platform;
  if (platform.includes('Win')) {
    normalizedPlatform = 'Windows';
  } else if (platform.includes('Mac')) {
    normalizedPlatform = 'macOS';
  } else if (platform.includes('Linux')) {
    normalizedPlatform = 'Linux';
  } else if (platform.includes('iPhone') || platform.includes('iPad') || platform.includes('iPod')) {
    normalizedPlatform = 'iOS';
  } else if (platform.includes('Android')) {
    normalizedPlatform = 'Android';
  }

  return {
    userAgent: userAgent.slice(0, 500), // Limit length
    platform: normalizedPlatform,
    browser,
    screenResolution,
    language,
  };
}

/**
 * Convert device info to a meta object for audit logging.
 * Returns a Record<string, string> suitable for the audit log's meta field.
 */
export function deviceInfoToMeta(info: DeviceInfo | null): Record<string, string> {
  if (!info) {
    return {};
  }

  return {
    platform: info.platform,
    browser: info.browser,
    screenResolution: info.screenResolution,
    language: info.language,
    userAgent: info.userAgent,
  };
}
