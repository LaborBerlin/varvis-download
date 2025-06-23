# Installation

This guide covers all installation methods and system requirements for the Varvis Download CLI.

## System Requirements

### Required

- **Node.js**: v20.16.0 or higher
- **NPM**: v10.0.0 or higher (included with Node.js)
- **Operating System**: Linux, macOS, or Windows (WSL recommended)
- **Memory**: 512MB RAM minimum
- **Storage**: 100MB for tool + space for downloaded files

### Optional (for Range Downloads)

These bioinformatics tools are required only for genomic range functionality:

| Tool         | Version | Purpose                          |
| ------------ | ------- | -------------------------------- |
| **samtools** | v1.17+  | BAM file processing and indexing |
| **tabix**    | v1.20+  | VCF file indexing and querying   |
| **bgzip**    | v1.20+  | VCF file compression             |

## Installation Methods

### Method 1: Git Clone (Recommended)

```bash
# Clone the repository
git clone https://github.com/LaborBerlin/varvis-download.git
cd varvis-download

# Install dependencies
npm install

# Make executable
chmod +x varvis-download.js

# Test installation
./varvis-download.js --version
```

### Method 2: Download Release

```bash
# Download latest release
curl -L https://github.com/LaborBerlin/varvis-download/archive/refs/heads/main.zip -o varvis-download.zip

# Extract and setup
unzip varvis-download.zip
cd varvis-download-main
npm install
chmod +x varvis-download.js
```

### Method 3: Global Installation

For system-wide access:

```bash
# After cloning and installing
npm link

# Now you can use from anywhere
varvis-download --version
```

To uninstall:

```bash
npm unlink
```

## Bioinformatics Tools Setup

### Ubuntu/Debian

```bash
# Update package list
sudo apt update

# Install bioinformatics tools
sudo apt install samtools tabix

# bgzip is included with tabix package
```

### CentOS/RHEL/Fedora

```bash
# Enable EPEL repository (if needed)
sudo yum install epel-release

# Install tools
sudo yum install samtools tabix
```

### macOS

Using Homebrew:

```bash
# Install Homebrew if needed
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install bioinformatics tools
brew install samtools htslib
```

### Windows (WSL)

```bash
# Enable WSL and install Ubuntu
wsl --install

# Follow Ubuntu instructions above
```

### Conda/Mamba (Cross-platform)

```bash
# Create new environment
conda create -n varvis-tools samtools tabix -c bioconda

# Activate environment
conda activate varvis-tools
```

## Verification

### Verify Node.js Installation

```bash
node --version    # Should show v20.16.0+
npm --version     # Should show v10.0.0+
```

### Verify Varvis Download CLI

```bash
./varvis-download.js --version
```

Expected output:

```
    ╭─────────────────────────────────────────────────╮
    │                                                 │
    │   ██╗   ██╗ █████╗ ██████╗ ██╗   ██╗██╗███████╗ │
    │   ██║   ██║██╔══██╗██╔══██╗██║   ██║██║██╔════╝ │
    │   ██║   ██║███████║██████╔╝██║   ██║██║███████╗ │
    │   ╚██╗ ██╔╝██╔══██║██╔══██╗╚██╗ ██╔╝██║╚════██║ │
    │    ╚████╔╝ ██║  ██║██║  ██║ ╚████╔╝ ██║███████║ │
    │     ╚═══╝  ╚═╝  ╚═╝╚═╝  ╚═╝  ╚═══╝  ╚═╝╚══════╝ │
    │                                                 │
    ╰─────────────────────────────────────────────────╯

varvis-download - Version 0.17.1
Date Last Modified: [timestamp]
Author: Bernt Popp
Repository: https://github.com/LaborBerlin/varvis-download.git
License: GPL-3.0
```

### Verify Bioinformatics Tools

```bash
# Check tool versions
samtools --version
tabix --version
bgzip --version

# Quick functionality test
samtools view --help | head -1
tabix --help 2>&1 | head -1
```

## Troubleshooting

### Node.js Issues

**Version too old:**

```bash
# Check current version
node --version

# Update Node.js using NodeSource repository (Ubuntu/Debian)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Or use nvm (cross-platform)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 20
nvm use 20
```

**Permission errors:**

```bash
# Fix npm permissions
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

### Tool Installation Issues

**samtools not found:**

```bash
# Check if installed
which samtools

# Add to PATH if needed
echo 'export PATH=/usr/local/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

**Version too old:**

```bash
# Remove old version
sudo apt remove samtools

# Install from source or use conda
conda install -c bioconda samtools=1.17
```

### Package Installation Issues

**NPM installation fails:**

```bash
# Clear npm cache
npm cache clean --force

# Remove node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

**Network/proxy issues:**

```bash
# Configure npm proxy (if needed)
npm config set proxy http://proxy.company.com:8080
npm config set https-proxy http://proxy.company.com:8080
```

## Platform-Specific Notes

### Windows

- **WSL Recommended**: Use Windows Subsystem for Linux for best compatibility
- **Native Windows**: PowerShell or Command Prompt work, but some features may be limited
- **Path Separators**: Use forward slashes `/` in file paths even on Windows

### macOS

- **Xcode Tools**: May need `xcode-select --install` for some dependencies
- **M1/M2 Macs**: All tools are compatible with Apple Silicon
- **Homebrew**: Recommended package manager for bioinformatics tools

### Linux

- **Distribution**: Tested on Ubuntu 20.04+, CentOS 7+, and Debian 10+
- **Permissions**: Some distributions require `sudo` for global installations
- **SELinux**: May need to configure SELinux policies in enterprise environments

## Next Steps

After successful installation:

1. **[Configuration](/guide/configuration)** - Set up your environment
2. **[Getting Started](/guide/getting-started)** - Run your first download
3. **[Authentication](/guide/authentication)** - Configure secure access

## Updates

To update to the latest version:

```bash
cd varvis-download
git pull origin main
npm install
```

Check for new releases at: https://github.com/LaborBerlin/varvis-download/releases
