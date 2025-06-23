# Getting Started

This guide will help you get up and running with the Varvis Download CLI tool quickly.

## Prerequisites

Before installing Varvis Download CLI, ensure you have:

- [Node.js](https://nodejs.org/) v20.16.0 or higher
- NPM or Yarn for package management
- Access to a Varvis API instance
- Valid Varvis credentials

### External Tools (Optional)

For genomic range downloads, you'll need these bioinformatics tools:

- **samtools** v1.17+ - For BAM file manipulation
- **tabix** v1.20+ - For VCF file indexing and querying
- **bgzip** v1.20+ - For VCF file compression

::: tip
The tool will automatically check for these dependencies when using range download features and provide helpful error messages if they're missing.
:::

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/LaborBerlin/varvis-download.git
cd varvis-download
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Make Executable

```bash
chmod +x varvis-download.js
```

### 4. Optional: Global Installation

```bash
npm link
```

After linking, you can use `varvis-download` from anywhere on your system.

## Basic Usage

### Set Up Authentication

The most secure way to provide credentials is through environment variables:

```bash
export VARVIS_USER="your_username"
export VARVIS_PASSWORD="your_password"
```

### Your First Download

Download BAM files for a specific analysis:

```bash
./varvis-download.js -t laborberlin -a 12345
```

This command will:

- Connect to the `laborberlin` Varvis instance
- Download BAM and BAI files for analysis ID `12345`
- Save files to the current directory

### List Available Files

Before downloading, you can preview what files are available:

```bash
./varvis-download.js -t laborberlin -a 12345 --list
```

## Common Use Cases

### Download Multiple Analyses

```bash
./varvis-download.js -t laborberlin -a "12345,67890,11111"
```

### Download Specific File Types

```bash
./varvis-download.js -t laborberlin -a 12345 -f "vcf.gz,vcf.gz.tbi"
```

### Download to Custom Directory

```bash
./varvis-download.js -t laborberlin -a 12345 -d "./downloads"
```

### Download with Filters

```bash
./varvis-download.js -t laborberlin -s "LB24-001,LB24-002" -F "analysisType=SNV"
```

## Configuration File

Create a `.config.json` file for persistent settings:

```json
{
  "username": "your_username",
  "target": "laborberlin",
  "destination": "./downloads",
  "loglevel": "info",
  "filetypes": ["bam", "bam.bai"]
}
```

Then run with minimal arguments:

```bash
./varvis-download.js -a 12345
```

## Next Steps

Now that you have the basics working, explore these advanced features:

- **[Authentication Methods](/guide/authentication)** - Learn about different ways to provide credentials
- **[File Downloads](/guide/downloads)** - Understand file type selection and output options
- **[Filtering & Search](/guide/filtering)** - Master the filtering system for precise file selection
- **[Range Downloads](/guide/range-downloads)** - Extract specific genomic regions

## Getting Help

- Use `./varvis-download.js --help` for command-line help
- Check the [API Reference](/api/) for detailed parameter documentation
- Browse [Examples](/examples/) for real-world usage patterns

## Troubleshooting

### Common Issues

**Permission denied error:**

```bash
chmod +x varvis-download.js
```

**Node.js version too old:**

```bash
node --version  # Check your version
# Update Node.js if needed
```

**Authentication failures:**

- Verify your credentials are correct
- Check network connectivity to the Varvis API
- Ensure your account has appropriate permissions

**External tool errors (for range downloads):**

- Install samtools, tabix, and bgzip
- Verify they're in your PATH: `which samtools tabix bgzip`
