# Proxy Configuration

The Varvis Download CLI supports HTTP and HTTPS proxies for environments that require network traffic to go through proxy servers, common in corporate and institutional settings.

## Overview

Proxy support includes:

- HTTP and HTTPS proxy protocols
- Proxy authentication (username/password)
- Environment variable configuration
- Command-line proxy settings
- Proxy bypass for specific hosts
- Corporate firewall compatibility

## Basic Proxy Configuration

### Command Line Options

```bash
# Basic proxy
./varvis-download.js -t laborberlin -a 12345 --proxy "http://proxy.company.com:8080"

# Proxy with authentication
./varvis-download.js -t laborberlin -a 12345 \
  --proxy "http://proxy.company.com:8080" \
  --proxyUsername "user" \
  --proxyPassword "pass"
```

### Environment Variables

```bash
# Set proxy environment variables
export HTTP_PROXY="http://proxy.company.com:8080"
export HTTPS_PROXY="http://proxy.company.com:8080"
export VARVIS_PROXY="http://proxy.company.com:8080"

# With authentication
export HTTP_PROXY="http://user:pass@proxy.company.com:8080"
export HTTPS_PROXY="http://user:pass@proxy.company.com:8080"

# Run without proxy arguments
./varvis-download.js -t laborberlin -a 12345
```

### Configuration File

```json
{
  "target": "laborberlin",
  "proxy": "http://proxy.company.com:8080",
  "proxyUsername": "proxy_user",
  "proxyPassword": "proxy_pass",
  "destination": "./downloads",
  "loglevel": "info"
}
```

## Proxy Authentication

### Basic Authentication

```bash
# Method 1: URL-encoded credentials
./varvis-download.js -t laborberlin -a 12345 \
  --proxy "http://username:password@proxy.company.com:8080"

# Method 2: Separate username/password
./varvis-download.js -t laborberlin -a 12345 \
  --proxy "http://proxy.company.com:8080" \
  --proxyUsername "username" \
  --proxyPassword "password"
```

### Environment Variables for Authentication

```bash
# Set proxy credentials
export VARVIS_PROXY_USER="proxy_username"
export VARVIS_PROXY_PASS="proxy_password"
export VARVIS_PROXY="http://proxy.company.com:8080"

# Credentials will be automatically used
./varvis-download.js -t laborberlin -a 12345
```

### Interactive Proxy Authentication

```bash
#!/bin/bash
# proxy-auth.sh - Prompt for proxy credentials

read -p "Proxy username: " PROXY_USER
read -s -p "Proxy password: " PROXY_PASS
echo

export VARVIS_PROXY_USER="$PROXY_USER"
export VARVIS_PROXY_PASS="$PROXY_PASS"

./varvis-download.js -t laborberlin -a 12345 --proxy "http://proxy.company.com:8080"
```

## Corporate Network Setup

### Windows Corporate Environment

```powershell
# PowerShell script for Windows corporate setup
# corporate-setup.ps1

# Set proxy from Internet Explorer settings
$proxySettings = Get-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings"
$proxyServer = $proxySettings.ProxyServer

if ($proxyServer) {
    $env:HTTP_PROXY = "http://$proxyServer"
    $env:HTTPS_PROXY = "http://$proxyServer"
    $env:VARVIS_PROXY = "http://$proxyServer"

    Write-Host "Proxy configured: $proxyServer"
} else {
    Write-Host "No proxy detected in IE settings"
}

# Run Varvis Download
& node varvis-download.js -t laborberlin -a $args[0]
```

### Linux Corporate Environment

```bash
#!/bin/bash
# corporate-setup.sh - Linux corporate environment setup

# Check for common proxy environment variables
if [[ -n "$HTTP_PROXY" ]]; then
  echo "Using existing HTTP_PROXY: $HTTP_PROXY"
  export VARVIS_PROXY="$HTTP_PROXY"
elif [[ -n "$http_proxy" ]]; then
  echo "Using existing http_proxy: $http_proxy"
  export VARVIS_PROXY="$http_proxy"
else
  # Try to detect proxy from system settings
  if command -v gsettings >/dev/null 2>&1; then
    PROXY_HOST=$(gsettings get org.gnome.system.proxy.http host 2>/dev/null | tr -d "'")
    PROXY_PORT=$(gsettings get org.gnome.system.proxy.http port 2>/dev/null)

    if [[ -n "$PROXY_HOST" && "$PROXY_HOST" != "''" ]]; then
      export VARVIS_PROXY="http://$PROXY_HOST:$PROXY_PORT"
      echo "Detected proxy from GNOME settings: $VARVIS_PROXY"
    fi
  fi
fi

# Set up proxy authentication if needed
if [[ -f ~/.proxy_credentials ]]; then
  source ~/.proxy_credentials
  export VARVIS_PROXY_USER="$PROXY_USERNAME"
  export VARVIS_PROXY_PASS="$PROXY_PASSWORD"
  echo "Loaded proxy credentials from ~/.proxy_credentials"
fi

# Run with corporate-friendly settings
./varvis-download.js \
  -t laborberlin \
  -a "$1" \
  --loglevel info \
  --logfile "corporate_download.log"
```

## Advanced Proxy Configuration

### Proxy Auto-Configuration (PAC)

```bash
#!/bin/bash
# pac-setup.sh - Handle PAC (Proxy Auto-Configuration)

# Function to extract proxy from PAC file
get_proxy_from_pac() {
  local pac_url="$1"
  local target_url="$2"

  # Download PAC file
  curl -s "$pac_url" > /tmp/proxy.pac

  # Simple PAC parser (requires node.js)
  node << EOF
const fs = require('fs');
const pac = fs.readFileSync('/tmp/proxy.pac', 'utf8');

// Simple PAC evaluation
function FindProxyForURL(url, host) {
  ${pac}
}

const result = FindProxyForURL('$target_url', new URL('$target_url').hostname);
console.log(result);
EOF
}

# Usage
PAC_URL="http://proxy.company.com/proxy.pac"
TARGET_URL="https://api.varvis.com"

PROXY_RESULT=$(get_proxy_from_pac "$PAC_URL" "$TARGET_URL")
echo "PAC result: $PROXY_RESULT"

# Extract first proxy from result
PROXY=$(echo "$PROXY_RESULT" | grep -o 'PROXY [^;]*' | head -1 | cut -d' ' -f2)

if [[ -n "$PROXY" ]]; then
  echo "Using proxy: $PROXY"
  export VARVIS_PROXY="http://$PROXY"
fi
```

### NTLM Authentication

```bash
#!/bin/bash
# ntlm-proxy.sh - Handle NTLM proxy authentication

# NTLM proxies require special handling
# Use ntlmaps or similar tools for NTLM authentication

# Install ntlmaps (if not already installed)
if ! command -v ntlmaps >/dev/null 2>&1; then
  echo "NTLM proxy detected but ntlmaps not found"
  echo "Please install ntlmaps or configure NTLM authentication manually"
  exit 1
fi

# Configure ntlmaps
cat > /tmp/ntlmaps.conf << EOF
[Basic]
LISTEN_PORT:5865
PARENT_PROXY:proxy.company.com
PARENT_PROXY_PORT:8080
NT_DOMAIN:COMPANY
USER:$NTLM_USER
PASSWORD:$NTLM_PASS
EOF

# Start ntlmaps in background
ntlmaps -c /tmp/ntlmaps.conf &
NTLMAPS_PID=$!

# Wait for ntlmaps to start
sleep 2

# Use local ntlmaps proxy
export VARVIS_PROXY="http://localhost:5865"

# Run download
./varvis-download.js -t laborberlin -a "$1"

# Cleanup
kill $NTLMAPS_PID 2>/dev/null
rm -f /tmp/ntlmaps.conf
```

## SSL/TLS and Certificate Handling

### Corporate Certificate Authority

```bash
#!/bin/bash
# corporate-ca.sh - Handle corporate CA certificates

# Add corporate CA certificate
CORPORATE_CA="/etc/ssl/certs/corporate-ca.crt"

if [[ -f "$CORPORATE_CA" ]]; then
  export NODE_EXTRA_CA_CERTS="$CORPORATE_CA"
  echo "Using corporate CA certificate: $CORPORATE_CA"
fi

# Alternative: Disable SSL verification (NOT recommended for production)
# export NODE_TLS_REJECT_UNAUTHORIZED=0

./varvis-download.js -t laborberlin -a "$1"
```

### Custom Certificate Bundle

```bash
#!/bin/bash
# custom-certs.sh - Use custom certificate bundle

# Create custom certificate bundle
cat /etc/ssl/certs/ca-certificates.crt > /tmp/custom-ca-bundle.crt
cat /path/to/corporate-ca.crt >> /tmp/custom-ca-bundle.crt

# Use custom bundle
export NODE_EXTRA_CA_CERTS="/tmp/custom-ca-bundle.crt"

./varvis-download.js -t laborberlin -a "$1"

# Cleanup
rm -f /tmp/custom-ca-bundle.crt
```

## Proxy Testing and Debugging

### Test Proxy Connectivity

```bash
#!/bin/bash
# test-proxy.sh - Test proxy connectivity

test_proxy() {
  local proxy="$1"
  local test_url="https://api.varvis.com"

  echo "Testing proxy: $proxy"

  # Test basic connectivity
  if curl -x "$proxy" -s --max-time 10 "$test_url" >/dev/null; then
    echo "✓ Proxy connectivity successful"
  else
    echo "✗ Proxy connectivity failed"
    return 1
  fi

  # Test with authentication if provided
  if [[ -n "$VARVIS_PROXY_USER" ]]; then
    if curl -x "$proxy" -U "$VARVIS_PROXY_USER:$VARVIS_PROXY_PASS" \
       -s --max-time 10 "$test_url" >/dev/null; then
      echo "✓ Proxy authentication successful"
    else
      echo "✗ Proxy authentication failed"
      return 1
    fi
  fi

  return 0
}

# Test proxy configuration
if [[ -n "$VARVIS_PROXY" ]]; then
  test_proxy "$VARVIS_PROXY"
elif [[ -n "$HTTP_PROXY" ]]; then
  test_proxy "$HTTP_PROXY"
else
  echo "No proxy configured"
fi
```

### Proxy Debug Mode

```bash
#!/bin/bash
# proxy-debug.sh - Debug proxy issues

# Enable detailed logging
export NODE_DEBUG=http,https,tls

# Test Varvis download with maximum logging
./varvis-download.js \
  -t laborberlin \
  -a 12345 \
  --proxy "$VARVIS_PROXY" \
  --loglevel debug \
  --logfile proxy-debug.log \
  --list

echo "Debug information saved to proxy-debug.log"

# Analyze proxy-related issues
echo "Proxy-related errors:"
grep -i "proxy\|connect\|tunnel" proxy-debug.log || echo "No proxy errors found"
```

### Network Diagnostics

```bash
#!/bin/bash
# network-diagnostics.sh - Comprehensive network testing

echo "Network Diagnostics for Varvis Download"
echo "======================================="

# Test basic DNS resolution
echo "1. DNS Resolution:"
nslookup api.varvis.com || echo "DNS resolution failed"

# Test direct connectivity (without proxy)
echo "2. Direct Connectivity:"
curl -s --max-time 10 https://api.varvis.com >/dev/null && \
  echo "✓ Direct connection successful" || \
  echo "✗ Direct connection failed"

# Test proxy connectivity
if [[ -n "$VARVIS_PROXY" ]]; then
  echo "3. Proxy Connectivity:"
  curl -x "$VARVIS_PROXY" -s --max-time 10 https://api.varvis.com >/dev/null && \
    echo "✓ Proxy connection successful" || \
    echo "✗ Proxy connection failed"

  # Test proxy authentication
  if [[ -n "$VARVIS_PROXY_USER" ]]; then
    echo "4. Proxy Authentication:"
    curl -x "$VARVIS_PROXY" -U "$VARVIS_PROXY_USER:$VARVIS_PROXY_PASS" \
         -s --max-time 10 https://api.varvis.com >/dev/null && \
      echo "✓ Proxy authentication successful" || \
      echo "✗ Proxy authentication failed"
  fi
fi

# Test SSL/TLS
echo "5. SSL/TLS:"
openssl s_client -connect api.varvis.com:443 -servername api.varvis.com < /dev/null 2>&1 | \
  grep -q "Verify return code: 0" && \
  echo "✓ SSL/TLS verification successful" || \
  echo "✗ SSL/TLS verification failed"

echo "Diagnostics complete"
```

## Common Proxy Issues and Solutions

### Issue 1: Proxy Authentication Failures

**Problem:** `407 Proxy Authentication Required`

**Solutions:**

```bash
# Verify credentials
echo "Testing credentials..."
curl -x "$VARVIS_PROXY" -U "$VARVIS_PROXY_USER:$VARVIS_PROXY_PASS" \
  https://httpbin.org/ip

# Check for special characters in password
# URL-encode if necessary
ENCODED_PASS=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$VARVIS_PROXY_PASS'))")
export VARVIS_PROXY="http://$VARVIS_PROXY_USER:$ENCODED_PASS@proxy.company.com:8080"
```

### Issue 2: SSL Certificate Validation

**Problem:** `unable to verify the first certificate`

**Solutions:**

```bash
# Add corporate CA
export NODE_EXTRA_CA_CERTS="/path/to/corporate-ca.crt"

# Temporarily disable SSL verification (testing only)
export NODE_TLS_REJECT_UNAUTHORIZED=0
```

### Issue 3: Connection Timeouts

**Problem:** Downloads timeout through proxy

**Solutions:**

```bash
# Increase timeout settings
export NODE_OPTIONS="--max-http-header-size=32768"

# Use keep-alive connections
./varvis-download.js \
  --proxy "$VARVIS_PROXY" \
  --loglevel debug \
  -t laborberlin -a 12345
```

## Proxy Configuration Examples

### Enterprise Environment

```bash
#!/bin/bash
# enterprise-proxy.sh - Complete enterprise proxy setup

# Load enterprise configuration
ENTERPRISE_CONFIG="/etc/varvis/enterprise.conf"
if [[ -f "$ENTERPRISE_CONFIG" ]]; then
  source "$ENTERPRISE_CONFIG"
fi

# Set proxy defaults
PROXY_HOST="${PROXY_HOST:-proxy.enterprise.com}"
PROXY_PORT="${PROXY_PORT:-8080}"
PROXY_URL="http://$PROXY_HOST:$PROXY_PORT"

# Handle authentication
if [[ -n "$PROXY_USER" && -n "$PROXY_PASS" ]]; then
  PROXY_URL="http://$PROXY_USER:$PROXY_PASS@$PROXY_HOST:$PROXY_PORT"
fi

# Configure environment
export VARVIS_PROXY="$PROXY_URL"
export NODE_EXTRA_CA_CERTS="/etc/ssl/certs/enterprise-ca-bundle.crt"

# Enterprise-specific settings
export VARVIS_TARGET="enterprise-varvis"
export VARVIS_LOG_LEVEL="info"
export VARVIS_DESTINATION="/data/genomics"

# Run with enterprise settings
./varvis-download.js "$@"
```

### Development Environment

```bash
#!/bin/bash
# dev-proxy.sh - Development environment with proxy

# Check if in development environment
if [[ "$NODE_ENV" == "development" ]]; then
  # Use development proxy (may have relaxed security)
  export VARVIS_PROXY="http://dev-proxy.company.com:8080"
  export NODE_TLS_REJECT_UNAUTHORIZED=0  # Dev only!

  echo "Development mode: Using relaxed security settings"
else
  # Production proxy configuration
  export VARVIS_PROXY="http://prod-proxy.company.com:8080"
  export NODE_EXTRA_CA_CERTS="/etc/ssl/certs/prod-ca-bundle.crt"
fi

./varvis-download.js "$@"
```

### Multi-Proxy Failover

```bash
#!/bin/bash
# multi-proxy.sh - Proxy failover

PROXIES=(
  "http://proxy1.company.com:8080"
  "http://proxy2.company.com:8080"
  "http://proxy3.company.com:8080"
)

test_and_use_proxy() {
  for proxy in "${PROXIES[@]}"; do
    echo "Testing proxy: $proxy"

    if curl -x "$proxy" -s --max-time 5 https://api.varvis.com >/dev/null; then
      echo "Using proxy: $proxy"
      export VARVIS_PROXY="$proxy"
      return 0
    fi
  done

  echo "All proxies failed, trying direct connection"
  unset VARVIS_PROXY
  return 1
}

# Test proxies and select working one
test_and_use_proxy

# Run download
./varvis-download.js "$@"
```

## Best Practices

### Security

1. **Credential Protection**: Never hardcode proxy credentials in scripts
2. **Environment Variables**: Use environment variables for sensitive data
3. **Certificate Validation**: Always validate SSL certificates in production
4. **Audit Logging**: Log proxy usage for security auditing

### Performance

1. **Connection Reuse**: Enable HTTP keep-alive for better performance
2. **Timeout Configuration**: Set appropriate timeouts for proxy connections
3. **Bandwidth Management**: Monitor and limit bandwidth usage if required
4. **Proxy Selection**: Use the closest/fastest proxy server

### Troubleshooting

1. **Test Connectivity**: Always test proxy connectivity before batch operations
2. **Debug Logging**: Enable detailed logging for proxy issues
3. **Fallback Options**: Implement proxy failover mechanisms
4. **Documentation**: Document proxy configuration for team members

## Related Documentation

- **[Configuration Guide](/guide/configuration)** - Proxy configuration options
- **[Authentication](/guide/authentication)** - Related to proxy authentication
- **[Logging & Reports](/guide/logging)** - Monitoring proxy usage
- **[Batch Operations](/guide/batch-operations)** - Using proxies in batch processing
