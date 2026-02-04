/**
 * URL utility functions for handling S3 pre-signed URL expiration.
 * @module urlUtils
 */

const { URL } = require('node:url');

/**
 * Default threshold in minutes before expiration to consider a URL as "expiring soon".
 * Set to 5 minutes to provide a safety buffer.
 * @type {number}
 */
const DEFAULT_EXPIRATION_THRESHOLD_MINUTES = 5;

/**
 * Parses an S3 pre-signed URL to extract expiration information.
 * Pre-signed URLs contain X-Amz-Date (signing time) and X-Amz-Expires (validity in seconds).
 *
 * @param   {string}      url - The S3 pre-signed URL to parse.
 * @returns {object|null}     - Object with signedAt (Date), expiresInSeconds (number),
 *                            and expiresAt (Date), or null if parsing fails.
 * @example
 * const info = parseS3UrlExpiration('https://...?X-Amz-Date=20240115T120000Z&X-Amz-Expires=7200...');
 * // Returns: { signedAt: Date, expiresInSeconds: 7200, expiresAt: Date }
 */
function parseS3UrlExpiration(url) {
  try {
    const urlObj = new URL(url);
    const params = urlObj.searchParams;

    const amzDate = params.get('X-Amz-Date');
    const amzExpires = params.get('X-Amz-Expires');

    if (!amzDate || !amzExpires) {
      return null;
    }

    // Parse X-Amz-Date format: YYYYMMDDTHHMMSSZ
    const year = amzDate.slice(0, 4);
    const month = amzDate.slice(4, 6);
    const day = amzDate.slice(6, 8);
    const hour = amzDate.slice(9, 11);
    const minute = amzDate.slice(11, 13);
    const second = amzDate.slice(13, 15);

    const signedAt = new Date(
      `${year}-${month}-${day}T${hour}:${minute}:${second}Z`,
    );
    const expiresInSeconds = Number.parseInt(amzExpires, 10);
    const expiresAt = new Date(signedAt.getTime() + expiresInSeconds * 1000);

    return {
      signedAt,
      expiresInSeconds,
      expiresAt,
    };
  } catch {
    return null;
  }
}

/**
 * Checks if an S3 pre-signed URL is expiring soon or has already expired.
 *
 * @param   {string}  url                - The S3 pre-signed URL to check.
 * @param   {number}  [thresholdMinutes] - Minutes before expiration to consider "expiring soon".
 *                                       Defaults to 5 minutes.
 * @returns {boolean}                    - True if the URL is expired or expiring within the threshold.
 * @example
 * if (isUrlExpiringSoon(downloadUrl)) {
 *   // Refresh the URL
 * }
 */
function isUrlExpiringSoon(
  url,
  thresholdMinutes = DEFAULT_EXPIRATION_THRESHOLD_MINUTES,
) {
  const expirationInfo = parseS3UrlExpiration(url);

  if (!expirationInfo) {
    // If we can't parse the URL, assume it might be expiring to be safe
    return true;
  }

  const now = new Date();
  const thresholdMs = thresholdMinutes * 60 * 1000;
  const expirationWithBuffer = new Date(
    expirationInfo.expiresAt.getTime() - thresholdMs,
  );

  return now >= expirationWithBuffer;
}

/**
 * Gets the remaining time until a URL expires.
 *
 * @param   {string}      url - The S3 pre-signed URL.
 * @returns {number|null}     - Remaining time in seconds, or null if parsing fails.
 *                            Negative values indicate the URL has already expired.
 */
function getUrlRemainingTime(url) {
  const expirationInfo = parseS3UrlExpiration(url);

  if (!expirationInfo) {
    return null;
  }

  const now = new Date();
  const remainingMs = expirationInfo.expiresAt.getTime() - now.getTime();

  return Math.floor(remainingMs / 1000);
}

/**
 * Formats remaining time in a human-readable format.
 *
 * @param   {number} seconds - Remaining time in seconds.
 * @returns {string}         - Formatted string like "1h 30m" or "5m 30s".
 */
function formatRemainingTime(seconds) {
  if (seconds < 0) {
    return 'expired';
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

module.exports = {
  parseS3UrlExpiration,
  isUrlExpiringSoon,
  getUrlRemainingTime,
  formatRemainingTime,
  DEFAULT_EXPIRATION_THRESHOLD_MINUTES,
};
