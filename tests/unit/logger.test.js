const createLogger = require('../../js/logger.cjs');
const winston = require('winston');
const path = require('node:path');
const fs = require('node:fs/promises');

describe('logger', () => {
  describe('createLogger', () => {
    afterEach(async () => {
      const testLogFile = path.join(process.cwd(), 'test.log');
      try {
        await fs.unlink(testLogFile);
      } catch {
        // Ignore if file doesn't exist
      }
    });

    test('should create logger with console transport by default', () => {
      const logger = createLogger({ loglevel: 'info' });

      expect(logger).toBeDefined();
      expect(logger.transports).toHaveLength(1);
      expect(logger.transports[0]).toBeInstanceOf(winston.transports.Console);
    });

    test('should create logger with specified log level', () => {
      const logger = createLogger({ loglevel: 'debug' });

      expect(logger.level).toBe('debug');
    });

    test('should add file transport when logfile is specified', () => {
      const logger = createLogger({
        loglevel: 'info',
        logfile: 'test.log',
      });

      expect(logger.transports).toHaveLength(2);
      expect(logger.transports[0]).toBeInstanceOf(winston.transports.Console);
      expect(logger.transports[1]).toBeInstanceOf(winston.transports.File);
      expect(logger.transports[1].filename).toBe('test.log');
    });

    test('should format log messages with timestamp, level, and message', () => {
      const logger = createLogger({ loglevel: 'info' });

      const formatted = logger.format.transform({
        timestamp: '2025-01-15T10:30:00.000Z',
        level: 'info',
        message: 'Test message',
      });

      expect(formatted[Symbol.for('message')]).toMatch(
        /2025-01-15T10:30:00.000Z \[info\]: Test message/,
      );
    });

    test('should return Winston logger instance', () => {
      const logger = createLogger({ loglevel: 'info' });

      expect(logger).toBeInstanceOf(winston.Logger);
      expect(logger.info).toBeInstanceOf(Function);
      expect(logger.error).toBeInstanceOf(Function);
      expect(logger.warn).toBeInstanceOf(Function);
      expect(logger.debug).toBeInstanceOf(Function);
    });

    test('should create logger with different log levels', () => {
      const levels = ['error', 'warn', 'info', 'debug', 'verbose', 'silly'];

      for (const level of levels) {
        const logger = createLogger({ loglevel: level });
        expect(logger.level).toBe(level);
      }
    });

    test('should create functional logger that writes to console', () => {
      const logger = createLogger({ loglevel: 'info' });
      const consoleSpy = jest
        .spyOn(logger.transports[0], 'log')
        .mockImplementation(() => {});

      logger.info('Test info message');

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    test('should create logger without logfile when not specified', () => {
      const logger = createLogger({ loglevel: 'info' });

      const fileTransports = logger.transports.filter(
        (t) => t instanceof winston.transports.File,
      );
      expect(fileTransports).toHaveLength(0);
    });
  });
});
