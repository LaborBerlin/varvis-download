const {
  promptYesNo,
  promptSelect,
  createReadlineInterface,
} = require('../../js/promptUtils.cjs');

// Mock readline module
jest.mock('node:readline', () => ({
  createInterface: jest.fn(() => ({
    question: jest.fn(),
    close: jest.fn(),
  })),
}));

describe('promptUtils', () => {
  describe('promptYesNo', () => {
    test('should return true for "y" answer', async () => {
      const mockRl = {
        question: jest.fn((_, callback) => callback('y')),
      };

      const result = await promptYesNo('Continue?', mockRl);
      expect(result).toBe(true);
    });

    test('should return true for "yes" answer', async () => {
      const mockRl = {
        question: jest.fn((_, callback) => callback('yes')),
      };

      const result = await promptYesNo('Continue?', mockRl);
      expect(result).toBe(true);
    });

    test('should return true for "Y" answer (case insensitive)', async () => {
      const mockRl = {
        question: jest.fn((_, callback) => callback('Y')),
      };

      const result = await promptYesNo('Continue?', mockRl);
      expect(result).toBe(true);
    });

    test('should return true for "YES" answer (case insensitive)', async () => {
      const mockRl = {
        question: jest.fn((_, callback) => callback('YES')),
      };

      const result = await promptYesNo('Continue?', mockRl);
      expect(result).toBe(true);
    });

    test('should return false for "n" answer', async () => {
      const mockRl = {
        question: jest.fn((_, callback) => callback('n')),
      };

      const result = await promptYesNo('Continue?', mockRl);
      expect(result).toBe(false);
    });

    test('should return false for "no" answer', async () => {
      const mockRl = {
        question: jest.fn((_, callback) => callback('no')),
      };

      const result = await promptYesNo('Continue?', mockRl);
      expect(result).toBe(false);
    });

    test('should return false for empty answer', async () => {
      const mockRl = {
        question: jest.fn((_, callback) => callback('')),
      };

      const result = await promptYesNo('Continue?', mockRl);
      expect(result).toBe(false);
    });

    test('should return false for invalid answer', async () => {
      const mockRl = {
        question: jest.fn((_, callback) => callback('maybe')),
      };

      const result = await promptYesNo('Continue?', mockRl);
      expect(result).toBe(false);
    });

    test('should trim whitespace from answer', async () => {
      const mockRl = {
        question: jest.fn((_, callback) => callback('  y  ')),
      };

      const result = await promptYesNo('Continue?', mockRl);
      expect(result).toBe(true);
    });

    test('should format question with (y/n) suffix', async () => {
      const mockRl = {
        question: jest.fn((prompt, callback) => {
          expect(prompt).toBe('Continue? (y/n): ');
          callback('y');
        }),
      };

      await promptYesNo('Continue?', mockRl);
    });
  });

  describe('promptSelect', () => {
    test('should return correct index for valid selection', async () => {
      const mockRl = {
        question: jest.fn((_, callback) => callback('2')),
      };

      const result = await promptSelect(
        'Choose an option:',
        ['Option A', 'Option B', 'Option C'],
        mockRl,
      );
      expect(result).toBe(1); // 0-indexed
    });

    test('should return 0 for first option', async () => {
      const mockRl = {
        question: jest.fn((_, callback) => callback('1')),
      };

      const result = await promptSelect('Choose:', ['First', 'Second'], mockRl);
      expect(result).toBe(0);
    });

    test('should return last index for last option', async () => {
      const mockRl = {
        question: jest.fn((_, callback) => callback('3')),
      };

      const result = await promptSelect('Choose:', ['A', 'B', 'C'], mockRl);
      expect(result).toBe(2);
    });

    test('should return -1 for selection below range', async () => {
      const mockRl = {
        question: jest.fn((_, callback) => callback('0')),
      };

      const result = await promptSelect('Choose:', ['A', 'B'], mockRl);
      expect(result).toBe(-1);
    });

    test('should return -1 for selection above range', async () => {
      const mockRl = {
        question: jest.fn((_, callback) => callback('5')),
      };

      const result = await promptSelect('Choose:', ['A', 'B'], mockRl);
      expect(result).toBe(-1);
    });

    test('should return -1 for non-numeric input', async () => {
      const mockRl = {
        question: jest.fn((_, callback) => callback('abc')),
      };

      const result = await promptSelect('Choose:', ['A', 'B'], mockRl);
      expect(result).toBe(-1);
    });

    test('should return -1 for empty input', async () => {
      const mockRl = {
        question: jest.fn((_, callback) => callback('')),
      };

      const result = await promptSelect('Choose:', ['A', 'B'], mockRl);
      expect(result).toBe(-1);
    });

    test('should trim whitespace from input', async () => {
      const mockRl = {
        question: jest.fn((_, callback) => callback('  2  ')),
      };

      const result = await promptSelect('Choose:', ['A', 'B'], mockRl);
      expect(result).toBe(1);
    });

    test('should format prompt with numbered options', async () => {
      const mockRl = {
        question: jest.fn((prompt, callback) => {
          expect(prompt).toContain('Choose an option:');
          expect(prompt).toContain('1. First');
          expect(prompt).toContain('2. Second');
          expect(prompt).toContain('Enter selection (1-2):');
          callback('1');
        }),
      };

      await promptSelect('Choose an option:', ['First', 'Second'], mockRl);
    });
  });

  describe('createReadlineInterface', () => {
    test('should create a readline interface', () => {
      const readline = require('node:readline');
      const rl = createReadlineInterface();

      expect(readline.createInterface).toHaveBeenCalledWith({
        input: process.stdin,
        output: process.stdout,
      });
    });
  });
});
