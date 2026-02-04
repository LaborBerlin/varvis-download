const {
  parseS3UrlExpiration,
  isUrlExpiringSoon,
  getUrlRemainingTime,
  formatRemainingTime,
  DEFAULT_EXPIRATION_THRESHOLD_MINUTES,
} = require('../../js/urlUtils.cjs');

describe('urlUtils', () => {
  describe('parseS3UrlExpiration', () => {
    test('should parse valid S3 pre-signed URL', () => {
      // URL signed at 2024-01-15T12:00:00Z with 7200 seconds (2 hours) expiration
      const url =
        'https://bucket.s3.amazonaws.com/file.bam?X-Amz-Date=20240115T120000Z&X-Amz-Expires=7200&X-Amz-Signature=abc123';

      const result = parseS3UrlExpiration(url);

      expect(result).not.toBeNull();
      expect(result.signedAt).toEqual(new Date('2024-01-15T12:00:00Z'));
      expect(result.expiresInSeconds).toBe(7200);
      expect(result.expiresAt).toEqual(new Date('2024-01-15T14:00:00Z'));
    });

    test('should return null for URL without X-Amz-Date', () => {
      const url =
        'https://bucket.s3.amazonaws.com/file.bam?X-Amz-Expires=7200&X-Amz-Signature=abc123';

      const result = parseS3UrlExpiration(url);

      expect(result).toBeNull();
    });

    test('should return null for URL without X-Amz-Expires', () => {
      const url =
        'https://bucket.s3.amazonaws.com/file.bam?X-Amz-Date=20240115T120000Z&X-Amz-Signature=abc123';

      const result = parseS3UrlExpiration(url);

      expect(result).toBeNull();
    });

    test('should return null for invalid URL', () => {
      const result = parseS3UrlExpiration('not-a-valid-url');

      expect(result).toBeNull();
    });

    test('should return null for non-S3 URL', () => {
      const url = 'https://example.com/file.bam';

      const result = parseS3UrlExpiration(url);

      expect(result).toBeNull();
    });

    test('should handle different expiration times', () => {
      // 1 hour expiration
      const url1Hour =
        'https://bucket.s3.amazonaws.com/file.bam?X-Amz-Date=20240115T120000Z&X-Amz-Expires=3600';
      const result1Hour = parseS3UrlExpiration(url1Hour);

      expect(result1Hour.expiresInSeconds).toBe(3600);
      expect(result1Hour.expiresAt).toEqual(new Date('2024-01-15T13:00:00Z'));

      // 24 hour expiration
      const url24Hours =
        'https://bucket.s3.amazonaws.com/file.bam?X-Amz-Date=20240115T120000Z&X-Amz-Expires=86400';
      const result24Hours = parseS3UrlExpiration(url24Hours);

      expect(result24Hours.expiresInSeconds).toBe(86400);
      expect(result24Hours.expiresAt).toEqual(new Date('2024-01-16T12:00:00Z'));
    });
  });

  describe('isUrlExpiringSoon', () => {
    test('should return true for already expired URL', () => {
      // URL signed 3 hours ago with 2 hour expiration
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
      const amzDate = formatAmzDate(threeHoursAgo);
      const url = `https://bucket.s3.amazonaws.com/file.bam?X-Amz-Date=${amzDate}&X-Amz-Expires=7200`;

      expect(isUrlExpiringSoon(url)).toBe(true);
    });

    test('should return true for URL expiring within default threshold', () => {
      // URL signed 1 hour 58 minutes ago with 2 hour expiration (2 minutes remaining)
      const almostTwoHoursAgo = new Date(Date.now() - 118 * 60 * 1000);
      const amzDate = formatAmzDate(almostTwoHoursAgo);
      const url = `https://bucket.s3.amazonaws.com/file.bam?X-Amz-Date=${amzDate}&X-Amz-Expires=7200`;

      expect(isUrlExpiringSoon(url)).toBe(true);
    });

    test('should return false for URL with plenty of time remaining', () => {
      // URL signed now with 2 hour expiration
      const now = new Date();
      const amzDate = formatAmzDate(now);
      const url = `https://bucket.s3.amazonaws.com/file.bam?X-Amz-Date=${amzDate}&X-Amz-Expires=7200`;

      expect(isUrlExpiringSoon(url)).toBe(false);
    });

    test('should respect custom threshold', () => {
      // URL signed 1 hour 50 minutes ago with 2 hour expiration (10 minutes remaining)
      const almostTwoHoursAgo = new Date(Date.now() - 110 * 60 * 1000);
      const amzDate = formatAmzDate(almostTwoHoursAgo);
      const url = `https://bucket.s3.amazonaws.com/file.bam?X-Amz-Date=${amzDate}&X-Amz-Expires=7200`;

      // With 5-minute threshold (default), should be fine
      expect(isUrlExpiringSoon(url, 5)).toBe(false);

      // With 15-minute threshold, should be expiring soon
      expect(isUrlExpiringSoon(url, 15)).toBe(true);
    });

    test('should return true for unparseable URL (fail-safe)', () => {
      expect(isUrlExpiringSoon('not-a-valid-url')).toBe(true);
      expect(isUrlExpiringSoon('https://example.com/file.bam')).toBe(true);
    });
  });

  describe('getUrlRemainingTime', () => {
    test('should return positive seconds for valid non-expired URL', () => {
      // URL signed now with 2 hour expiration
      const now = new Date();
      const amzDate = formatAmzDate(now);
      const url = `https://bucket.s3.amazonaws.com/file.bam?X-Amz-Date=${amzDate}&X-Amz-Expires=7200`;

      const remaining = getUrlRemainingTime(url);

      // Should be close to 7200 seconds (allow 10 second tolerance for test execution)
      expect(remaining).toBeGreaterThan(7190);
      expect(remaining).toBeLessThanOrEqual(7200);
    });

    test('should return negative seconds for expired URL', () => {
      // URL signed 3 hours ago with 2 hour expiration
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
      const amzDate = formatAmzDate(threeHoursAgo);
      const url = `https://bucket.s3.amazonaws.com/file.bam?X-Amz-Date=${amzDate}&X-Amz-Expires=7200`;

      const remaining = getUrlRemainingTime(url);

      expect(remaining).toBeLessThan(0);
    });

    test('should return null for unparseable URL', () => {
      expect(getUrlRemainingTime('not-a-valid-url')).toBeNull();
      expect(getUrlRemainingTime('https://example.com/file.bam')).toBeNull();
    });
  });

  describe('formatRemainingTime', () => {
    test('should format hours and minutes', () => {
      expect(formatRemainingTime(5400)).toBe('1h 30m'); // 1.5 hours
      expect(formatRemainingTime(7200)).toBe('2h 0m'); // 2 hours
      expect(formatRemainingTime(3661)).toBe('1h 1m'); // 1 hour 1 minute 1 second
    });

    test('should format minutes and seconds when less than 1 hour', () => {
      expect(formatRemainingTime(300)).toBe('5m 0s'); // 5 minutes
      expect(formatRemainingTime(65)).toBe('1m 5s'); // 1 minute 5 seconds
      expect(formatRemainingTime(150)).toBe('2m 30s'); // 2.5 minutes
    });

    test('should format seconds when less than 1 minute', () => {
      expect(formatRemainingTime(30)).toBe('30s');
      expect(formatRemainingTime(1)).toBe('1s');
      expect(formatRemainingTime(0)).toBe('0s');
    });

    test('should return "expired" for negative values', () => {
      expect(formatRemainingTime(-1)).toBe('expired');
      expect(formatRemainingTime(-3600)).toBe('expired');
    });
  });

  describe('DEFAULT_EXPIRATION_THRESHOLD_MINUTES', () => {
    test('should be 5 minutes', () => {
      expect(DEFAULT_EXPIRATION_THRESHOLD_MINUTES).toBe(5);
    });
  });
});

/**
 * Helper function to format a Date as X-Amz-Date format (YYYYMMDDTHHMMSSZ)
 * @param   {Date}   date - The date to format
 * @returns {string}      - Formatted date string
 */
function formatAmzDate(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hour = String(date.getUTCHours()).padStart(2, '0');
  const minute = String(date.getUTCMinutes()).padStart(2, '0');
  const second = String(date.getUTCSeconds()).padStart(2, '0');

  return `${year}${month}${day}T${hour}${minute}${second}Z`;
}
