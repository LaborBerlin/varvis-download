const fs = require('node:fs');

// Mock fs module
jest.mock('node:fs');

const {
  readRestorationState,
  writeRestorationState,
  appendToAwaitingRestoration,
  removeRestorationEntry,
  getReadyEntries,
} = require('../../js/restorationState.cjs');

describe('restorationState', () => {
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    };
    jest.clearAllMocks();
  });

  describe('readRestorationState', () => {
    test('should return null if file does not exist', () => {
      fs.existsSync.mockReturnValue(false);

      const result = readRestorationState('test.json', mockLogger);

      expect(result).toBeNull();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Restoration file not found: test.json',
      );
    });

    test('should return null if file is empty array', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('[]');

      const result = readRestorationState('test.json', mockLogger);

      expect(result).toBeNull();
    });

    test('should return data array if file contains entries', () => {
      fs.existsSync.mockReturnValue(true);
      const mockData = [
        { analysisId: 'AN001', fileName: 'test.bam' },
        { analysisId: 'AN002', fileName: 'test2.bam' },
      ];
      fs.readFileSync.mockReturnValue(JSON.stringify(mockData));

      const result = readRestorationState('test.json', mockLogger);

      expect(result).toEqual(mockData);
    });

    test('should return null and log error on parse error', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('invalid json');

      const result = readRestorationState('test.json', mockLogger);

      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('writeRestorationState', () => {
    test('should write data to file as JSON', () => {
      const mockData = [{ analysisId: 'AN001', fileName: 'test.bam' }];

      writeRestorationState(mockData, 'test.json', mockLogger);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        'test.json',
        JSON.stringify(mockData, null, 2),
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Updated restoration file: test.json',
      );
    });

    test('should write empty array', () => {
      writeRestorationState([], 'test.json', mockLogger);

      expect(fs.writeFileSync).toHaveBeenCalledWith('test.json', '[]');
    });
  });

  describe('appendToAwaitingRestoration', () => {
    test('should create new file with entry if file does not exist', async () => {
      fs.existsSync.mockReturnValue(false);

      const info = {
        analysisId: 'AN001',
        fileName: 'test.bam',
        restoreEstimation: '2026-02-04T12:00:00Z',
        options: {},
      };

      await appendToAwaitingRestoration(info, mockLogger, 'test.json');

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        'test.json',
        JSON.stringify([info], null, 2),
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Appended new restoration entry for analysis AN001, file test.bam.',
      );
    });

    test('should append to existing entries', async () => {
      fs.existsSync.mockReturnValue(true);
      const existing = [{ analysisId: 'AN001', fileName: 'test1.bam' }];
      fs.readFileSync.mockReturnValue(JSON.stringify(existing));

      const newEntry = {
        analysisId: 'AN002',
        fileName: 'test2.bam',
        restoreEstimation: '2026-02-04T12:00:00Z',
        options: {},
      };

      await appendToAwaitingRestoration(newEntry, mockLogger, 'test.json');

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        'test.json',
        JSON.stringify([...existing, newEntry], null, 2),
      );
    });

    test('should update existing entry with same analysisId and fileName', async () => {
      fs.existsSync.mockReturnValue(true);
      const existing = [
        {
          analysisId: 'AN001',
          fileName: 'test.bam',
          restoreEstimation: '2026-02-03T12:00:00Z',
          options: {},
        },
      ];
      fs.readFileSync.mockReturnValue(JSON.stringify(existing));

      const updatedEntry = {
        analysisId: 'AN001',
        fileName: 'test.bam',
        restoreEstimation: '2026-02-04T12:00:00Z',
        options: {},
      };

      await appendToAwaitingRestoration(updatedEntry, mockLogger, 'test.json');

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        'test.json',
        JSON.stringify([updatedEntry], null, 2),
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Updated existing restoration entry for analysis AN001, file test.bam.',
      );
    });

    test('should start fresh if file is corrupted', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('invalid json');

      const info = {
        analysisId: 'AN001',
        fileName: 'test.bam',
        restoreEstimation: '2026-02-04T12:00:00Z',
        options: {},
      };

      await appendToAwaitingRestoration(info, mockLogger, 'test.json');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to parse awaiting-restoration file. Starting fresh.',
      );
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        'test.json',
        JSON.stringify([info], null, 2),
      );
    });
  });

  describe('removeRestorationEntry', () => {
    test('should return false if file does not exist', () => {
      fs.existsSync.mockReturnValue(false);

      const result = removeRestorationEntry(
        'AN001',
        'test.bam',
        'test.json',
        mockLogger,
      );

      expect(result).toBe(false);
    });

    test('should return false if entry not found', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(
        JSON.stringify([{ analysisId: 'AN002', fileName: 'other.bam' }]),
      );

      const result = removeRestorationEntry(
        'AN001',
        'test.bam',
        'test.json',
        mockLogger,
      );

      expect(result).toBe(false);
    });

    test('should remove entry and return true', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(
        JSON.stringify([
          { analysisId: 'AN001', fileName: 'test.bam' },
          { analysisId: 'AN002', fileName: 'other.bam' },
        ]),
      );

      const result = removeRestorationEntry(
        'AN001',
        'test.bam',
        'test.json',
        mockLogger,
      );

      expect(result).toBe(true);
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        'test.json',
        JSON.stringify(
          [{ analysisId: 'AN002', fileName: 'other.bam' }],
          null,
          2,
        ),
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Removed restoration entry for test.bam (analysis AN001)',
      );
    });
  });

  describe('getReadyEntries', () => {
    test('should return empty arrays if file does not exist', () => {
      fs.existsSync.mockReturnValue(false);

      const result = getReadyEntries('test.json', mockLogger);

      expect(result).toEqual({ ready: [], pending: [] });
    });

    test('should categorize entries based on restoreEstimation', () => {
      fs.existsSync.mockReturnValue(true);
      const pastDate = new Date(Date.now() - 1000 * 60 * 60).toISOString(); // 1 hour ago
      const futureDate = new Date(Date.now() + 1000 * 60 * 60).toISOString(); // 1 hour from now

      const entries = [
        {
          analysisId: 'AN001',
          fileName: 'ready.bam',
          restoreEstimation: pastDate,
        },
        {
          analysisId: 'AN002',
          fileName: 'pending.bam',
          restoreEstimation: futureDate,
        },
        { analysisId: 'AN003', fileName: 'no-estimation.bam' }, // No estimation = ready
      ];
      fs.readFileSync.mockReturnValue(JSON.stringify(entries));

      const result = getReadyEntries('test.json', mockLogger);

      expect(result.ready).toHaveLength(2);
      expect(result.pending).toHaveLength(1);
      expect(result.ready.map((e) => e.fileName)).toContain('ready.bam');
      expect(result.ready.map((e) => e.fileName)).toContain(
        'no-estimation.bam',
      );
      expect(result.pending.map((e) => e.fileName)).toContain('pending.bam');
    });

    test('should treat null restoreEstimation as ready', () => {
      fs.existsSync.mockReturnValue(true);
      const entries = [
        { analysisId: 'AN001', fileName: 'test.bam', restoreEstimation: null },
      ];
      fs.readFileSync.mockReturnValue(JSON.stringify(entries));

      const result = getReadyEntries('test.json', mockLogger);

      expect(result.ready).toHaveLength(1);
      expect(result.pending).toHaveLength(0);
    });
  });
});
