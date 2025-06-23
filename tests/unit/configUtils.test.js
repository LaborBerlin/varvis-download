const fs = require('fs');
const path = require('path');
const {
  loadConfig,
  loadLogo,
  getLastModifiedDate,
} = require('../../js/configUtils');

// Mock the fs module
jest.mock('fs');

describe('configUtils', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  describe('loadConfig', () => {
    test('should load and parse configuration file when it exists', () => {
      const mockConfig = { apiUrl: 'https://example.com', timeout: 5000 };
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));

      const result = loadConfig('/path/to/config.json');

      expect(fs.existsSync).toHaveBeenCalledWith('/path/to/config.json');
      expect(fs.readFileSync).toHaveBeenCalledWith(
        '/path/to/config.json',
        'utf-8',
      );
      expect(result).toEqual(mockConfig);
    });

    test('should return empty object when config file does not exist', () => {
      fs.existsSync.mockReturnValue(false);

      const result = loadConfig('/path/to/nonexistent.json');

      expect(fs.existsSync).toHaveBeenCalledWith('/path/to/nonexistent.json');
      expect(fs.readFileSync).not.toHaveBeenCalled();
      expect(result).toEqual({});
    });

    test('should throw error if JSON is invalid', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('invalid json');

      expect(() => loadConfig('/path/to/invalid.json')).toThrow(SyntaxError);
    });
  });

  describe('loadLogo', () => {
    test('should load logo from file when it exists', () => {
      const mockLogo = 'ASCII ART LOGO';
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(mockLogo);

      const result = loadLogo();

      expect(fs.existsSync).toHaveBeenCalledWith(
        expect.stringContaining('assets/logo.txt'),
      );
      expect(fs.readFileSync).toHaveBeenCalledWith(
        expect.stringContaining('assets/logo.txt'),
        'utf-8',
      );
      expect(result).toBe(mockLogo);
    });

    test('should return empty string when logo file does not exist', () => {
      fs.existsSync.mockReturnValue(false);

      const result = loadLogo();

      expect(fs.existsSync).toHaveBeenCalledWith(
        expect.stringContaining('assets/logo.txt'),
      );
      expect(fs.readFileSync).not.toHaveBeenCalled();
      expect(result).toBe('');
    });
  });

  describe('getLastModifiedDate', () => {
    test('should return last modified date in YYYY-MM-DD format', () => {
      const mockDate = new Date('2024-01-15T10:30:00.000Z');
      const mockStats = {
        mtime: mockDate,
      };
      fs.statSync.mockReturnValue(mockStats);

      const result = getLastModifiedDate('/path/to/file.txt');

      expect(fs.statSync).toHaveBeenCalledWith('/path/to/file.txt');
      expect(result).toBe('2024-01-15');
    });

    test('should throw error if file does not exist', () => {
      fs.statSync.mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });

      expect(() => getLastModifiedDate('/path/to/nonexistent.txt')).toThrow(
        'ENOENT',
      );
    });

    test('should handle different timezones correctly', () => {
      const mockDate = new Date('2024-12-31T23:59:59.999Z');
      const mockStats = {
        mtime: mockDate,
      };
      fs.statSync.mockReturnValue(mockStats);

      const result = getLastModifiedDate('/path/to/file.txt');

      expect(result).toBe('2024-12-31');
    });
  });
});
