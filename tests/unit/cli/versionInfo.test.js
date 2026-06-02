const { formatVersionInfo } = require('../../../js/cli/versionInfo.cjs');

describe('cli/versionInfo.formatVersionInfo', () => {
  test('returns multi-line string with required fields', () => {
    const output = formatVersionInfo({
      name: 'varvis-download',
      version: '0.31.1',
      author: 'Bernt Popp',
      license: 'GPL-3.0',
      repository: { url: 'git+https://github.com/LaborBerlin/varvis-download' },
      lastModified: '2026-05-26',
      logo: 'LOGO',
    });

    expect(output).toContain('LOGO');
    expect(output).toContain('varvis-download');
    expect(output).toContain('Version 0.31.1');
    expect(output).toContain('Date Last Modified: 2026-05-26');
    expect(output).toContain('Author: Bernt Popp');
    expect(output).toContain(
      'Repository: git+https://github.com/LaborBerlin/varvis-download',
    );
    expect(output).toContain('License: GPL-3.0');
  });
});
