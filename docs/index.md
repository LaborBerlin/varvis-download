---
layout: home

hero:
  name: 'Varvis Download CLI'
  text: 'Bioinformatics File Download Tool'
  tagline: 'A powerful command-line interface for downloading BAM, BAI, and VCF files from the Varvis API with advanced filtering and genomic range support.'
  image:
    src: /hero-image.svg
    alt: Varvis Download CLI
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/LaborBerlin/varvis-download

features:
  - icon: 🚀
    title: Fast & Reliable
    details: High-performance downloads with retry logic, resume capability, and comprehensive error handling for production workflows.

  - icon: 🔒
    title: Secure Authentication
    details: Multiple authentication methods including environment variables, interactive prompts, and configuration files with credential protection.

  - icon: 🎯
    title: Advanced Filtering
    details: Powerful filtering system to select specific files by analysis type, sample ID, LIMS ID, and custom expressions.

  - icon: 🧬
    title: Genomic Range Support
    details: Download specific genomic regions using coordinates or BED files with automatic tool integration (samtools, tabix, bgzip).

  - icon: 📦
    title: Archive Management
    details: Intelligent handling of archived files with restoration workflows and automated retry mechanisms.

  - icon: ⚙️
    title: Enterprise Ready
    details: Proxy support, comprehensive logging, batch operations, and detailed reporting for enterprise environments.
---

## Quick Example

```bash
# Set credentials (recommended)
export VARVIS_USER="your_username"
export VARVIS_PASSWORD="your_password"

# Download BAM files for specific analyses
./varvis-download.js -t laborberlin -a "12345,67890" -f "bam,bam.bai"

# Download with genomic range filtering
./varvis-download.js -t laborberlin -a 12345 -g "chr1:1000000-2000000"

# List available files without downloading
./varvis-download.js -t laborberlin -a 12345 --list
```

## Installation

```bash
git clone https://github.com/LaborBerlin/varvis-download.git
cd varvis-download
npm install
chmod +x varvis-download.js
npm link  # Optional: global installation
```

## Key Features

### 🔍 **Flexible File Discovery**

Find files by analysis IDs, sample IDs, or LIMS IDs with powerful filtering expressions.

### 📁 **Multiple File Types**

Support for BAM, BAI, VCF, and VCF.GZ files with automatic index handling.

### 🎯 **Genomic Range Downloads**

Extract specific genomic regions using coordinates or BED files for targeted analysis.

### 🔄 **Archive Integration**

Seamless handling of archived files with restoration requests and automated workflows.

### 📊 **Comprehensive Reporting**

Detailed download reports, metrics tracking, and configurable logging levels.

### 🌐 **Enterprise Support**

Proxy configuration, batch processing, and CI/CD integration capabilities.

---

<div style="text-align: center; margin-top: 2rem;">
  <a href="/guide/getting-started" style="background: #3eaf7c; color: white; padding: 0.75rem 1.5rem; border-radius: 4px; text-decoration: none; font-weight: 500;">
    Get Started →
  </a>
</div>
