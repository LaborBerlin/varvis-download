import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'Varvis Download CLI',
  description:
    'A command-line interface tool for downloading BAM, BAI, and VCF files from the Varvis API',
  base: '/varvis-download/',
  ignoreDeadLinks: [
    // Temporarily ignore missing pages while documentation is being built
    '/api/functions',
    '/api/filters', 
    '/api/archive',
    '/examples/filtering',
    '/examples/ranges',
    '/examples/automation'
  ],

  themeConfig: {
    logo: '/logo.png',

    nav: [
      { text: 'Home', link: '/' },
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'API Reference', link: '/api/' },
      { text: 'Examples', link: '/examples/index' },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Installation', link: '/guide/installation' },
            { text: 'Quick Start', link: '/guide/getting-started' },
            { text: 'Configuration', link: '/guide/configuration' },
          ],
        },
        {
          text: 'Core Features',
          items: [
            { text: 'Authentication', link: '/guide/authentication' },
            { text: 'File Downloads', link: '/guide/downloads' },
            { text: 'Filtering & Search', link: '/guide/filtering' },
            { text: 'Range Downloads', link: '/guide/range-downloads' },
          ],
        },
        {
          text: 'Advanced Usage',
          items: [
            { text: 'Archive Management', link: '/guide/archive-management' },
            { text: 'Batch Operations', link: '/guide/batch-operations' },
            { text: 'Proxy Configuration', link: '/guide/proxy' },
            { text: 'Logging & Reports', link: '/guide/logging' },
          ],
        },
      ],
      '/api/': [
        {
          text: 'API Reference',
          items: [
            { text: 'Overview', link: '/api/' },
            { text: 'CLI Commands', link: '/api/cli' },
            { text: 'Configuration Schema', link: '/api/config' },
            { text: 'Core Functions', link: '/api/functions' },
          ],
        },
      ],
      '/examples/': [
        {
          text: 'Examples',
          items: [
            { text: 'Basic Usage', link: '/examples/basic' },
            { text: 'Advanced Filtering', link: '/examples/filtering' },
            { text: 'Genomic Ranges', link: '/examples/ranges' },
            { text: 'Automation Scripts', link: '/examples/automation' },
          ],
        },
      ],
    },

    socialLinks: [
      {
        icon: 'github',
        link: 'https://github.com/LaborBerlin/varvis-download',
      },
    ],

    footer: {
      message: 'Released under the GPL-3.0 License.',
      copyright: 'Copyright © 2024 LaborBerlin',
    },

    search: {
      provider: 'local',
    },

    editLink: {
      pattern:
        'https://github.com/LaborBerlin/varvis-download/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },
  },

  markdown: {
    theme: {
      light: 'github-light',
      dark: 'github-dark',
    },
    lineNumbers: true,
  },
});
