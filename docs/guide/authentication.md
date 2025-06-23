# Authentication

Learn how to securely authenticate with Varvis API instances using various methods.

## Authentication Overview

Varvis Download CLI supports multiple authentication methods to suit different use cases:

1. **Environment Variables** (Recommended)
2. **Interactive Password Prompts**
3. **Configuration Files**
4. **Command Line Arguments** (Least secure)

## Environment Variables (Recommended)

### Primary Method

Set credentials as environment variables for maximum security:

```bash
export VARVIS_USER="your_username"
export VARVIS_PASSWORD="your_password"
```

Then run commands without credential arguments:

```bash
./varvis-download.js -t laborberlin -a 12345
```

### Alternative Variable Names

The tool also recognizes these alternative environment variable names:

```bash
# Alternative naming convention
export VARVIS_API_USER="your_username"
export VARVIS_API_PASSWORD="your_password"

# Legacy support
export VARVIS_USERNAME="your_username"
export VARVIS_API_KEY="your_password"
```

### Session Management

For long-running sessions, set credentials once:

```bash
#!/bin/bash
# setup_session.sh
export VARVIS_USER="your_username"
export VARVIS_PASSWORD="your_password"
export VARVIS_TARGET="laborberlin"

echo "Varvis session configured for user: $VARVIS_USER"
echo "Target: $VARVIS_TARGET"
```

Source the script:

```bash
source setup_session.sh
./varvis-download.js -a 12345,67890
```

## Interactive Password Prompts

### Secure Input

When no password is provided, the tool prompts securely with hidden input:

```bash
./varvis-download.js -t laborberlin -u your_username -a 12345
# Output: Please enter your Varvis password: [hidden input]
```

### Benefits

- **Security**: Password not visible in terminal history
- **Flexibility**: No need to store credentials
- **Audit**: Clear record of when authentication occurred

### Automation Considerations

Interactive prompts are not suitable for:

- CI/CD pipelines
- Automated scripts
- Background processes

Use environment variables or configuration files for automation.

## Configuration Files

### Basic Authentication

Create `.config.json` with credentials:

```json
{
  "username": "your_username",
  "password": "your_password",
  "target": "laborberlin"
}
```

### Secure Configuration

**Recommended approach**: Store only username in config, use environment for password:

```json
{
  "username": "your_username",
  "target": "laborberlin",
  "destination": "./downloads"
}
```

```bash
export VARVIS_PASSWORD="your_password"
./varvis-download.js --config .config.json -a 12345
```

### Multiple Environments

Create environment-specific configuration files:

**development.config.json:**

```json
{
  "username": "dev_user",
  "target": "laborberlin-dev",
  "destination": "./dev-downloads",
  "loglevel": "debug"
}
```

**production.config.json:**

```json
{
  "username": "prod_user",
  "target": "laborberlin",
  "destination": "/data/genomics",
  "loglevel": "warn"
}
```

Usage:

```bash
# Development
export VARVIS_PASSWORD="dev_password"
./varvis-download.js --config development.config.json -a 12345

# Production
export VARVIS_PASSWORD="prod_password"
./varvis-download.js --config production.config.json -a 12345
```

## Command Line Arguments

### Direct Credentials

Provide credentials directly via command line:

```bash
./varvis-download.js -t laborberlin -u "your_username" -p "your_password" -a 12345
```

::: warning Security Risk
Command line arguments are visible in process lists and shell history. Use only for testing or single-use scenarios.
:::

### Secure Command Line

Use environment variables even with CLI:

```bash
./varvis-download.js -t laborberlin -u "$VARVIS_USER" -p "$VARVIS_PASSWORD" -a 12345
```

## Authentication Flow

### Login Process

The tool follows this authentication sequence:

1. **Credential Collection**
   - Check command line arguments
   - Check environment variables
   - Read configuration file
   - Prompt interactively if needed

2. **CSRF Token Retrieval**
   - Fetch CSRF token from API
   - Handle token refresh if needed

3. **Authentication Request**
   - Submit credentials with CSRF token
   - Receive session token

4. **Session Management**
   - Store session token for requests
   - Handle token expiration
   - Automatic re-authentication if needed

### Token Management

Session tokens are:

- Stored in memory only
- Not persisted to disk
- Automatically refreshed
- Invalidated on exit

## Multi-Instance Authentication

### Different Targets

Authenticate with multiple Varvis instances:

```bash
# Labor Berlin
export VARVIS_LB_USER="lb_username"
export VARVIS_LB_PASSWORD="lb_password"

# University Leipzig
export VARVIS_UL_USER="ul_username"
export VARVIS_UL_PASSWORD="ul_password"

# Use with different targets
./varvis-download.js -t laborberlin -u "$VARVIS_LB_USER" -p "$VARVIS_LB_PASSWORD" -a 12345
./varvis-download.js -t uni-leipzig -u "$VARVIS_UL_USER" -p "$VARVIS_UL_PASSWORD" -a 67890
```

### Configuration per Target

Create target-specific configurations:

**laborberlin.config.json:**

```json
{
  "username": "lb_user",
  "target": "laborberlin",
  "destination": "./laborberlin-data"
}
```

**uni-leipzig.config.json:**

```json
{
  "username": "ul_user",
  "target": "uni-leipzig",
  "destination": "./uni-leipzig-data"
}
```

## Security Best Practices

### Credential Protection

1. **Use Environment Variables**

   ```bash
   # Secure
   export VARVIS_PASSWORD="secret"

   # Avoid
   ./varvis-download.js -p "secret"  # Visible in process list
   ```

2. **File Permissions**

   ```bash
   # Restrict config file access
   chmod 600 .config.json

   # Verify permissions
   ls -la .config.json
   # Expected: -rw------- (owner read/write only)
   ```

3. **Environment File Security**
   ```bash
   # Protect .env files
   chmod 600 .env
   echo ".env" >> .gitignore
   ```

### Credential Rotation

Regular credential updates:

```bash
#!/bin/bash
# rotate_credentials.sh

echo "Updating Varvis credentials..."
read -s -p "Enter new password: " NEW_PASSWORD
echo

# Update environment
export VARVIS_PASSWORD="$NEW_PASSWORD"

# Test authentication
./varvis-download.js -t laborberlin --list -a 12345

if [ $? -eq 0 ]; then
    echo "✓ Credential rotation successful"
    # Update stored configurations if needed
else
    echo "✗ Credential rotation failed"
    exit 1
fi
```

### Access Control

1. **Principle of Least Privilege**
   - Use accounts with minimal necessary permissions
   - Regular audit of account access
   - Separate accounts for different environments

2. **Session Management**
   - Sessions automatically expire
   - No persistent authentication storage
   - Clean session termination

3. **Audit Logging**

   ```bash
   # Enable authentication logging
   ./varvis-download.js -t laborberlin -a 12345 --loglevel info --logfile auth.log

   # Review authentication events
   grep "Login\|Auth" auth.log
   ```

## Troubleshooting Authentication

### Common Issues

**Invalid Credentials:**

```
Error: Authentication failed - invalid username or password
```

**Solutions:**

- Verify username spelling
- Check password accuracy
- Confirm account status
- Test with interactive prompt

**Network/Proxy Issues:**

```
Error: Connection timeout during authentication
```

**Solutions:**

- Check network connectivity
- Verify proxy configuration
- Test DNS resolution
- Check firewall settings

**Token Expiration:**

```
Error: Session token expired
```

**Solutions:**

- Tool automatically handles re-authentication
- Check system clock accuracy
- Verify account hasn't been disabled

### Debug Authentication

Enable detailed authentication logging:

```bash
./varvis-download.js -t laborberlin -a 12345 --loglevel debug 2>&1 | grep -i auth
```

Example debug output:

```
[DEBUG] AuthService: Fetching CSRF token from https://laborberlin.varvis.com
[DEBUG] AuthService: CSRF token received: csrf_abc123
[DEBUG] AuthService: Submitting login request for user: your_username
[DEBUG] AuthService: Login successful, session token received
[DEBUG] AuthService: Authentication complete
```

### Test Authentication

Verify credentials without downloading:

```bash
# Quick authentication test
./varvis-download.js -t laborberlin -a 12345 --list | head -5
```

Expected output:

```
Analysis ID: 12345
Available files:
  - sample_001.bam (1.2 GB)
  - sample_001.bam.bai (4.5 MB)
```

## Enterprise Integration

### LDAP/Active Directory

For enterprise authentication:

1. **Service Accounts**
   - Create dedicated service accounts
   - Use strong, rotated passwords
   - Document account purposes

2. **Integration Scripts**

   ```bash
   #!/bin/bash
   # enterprise_auth.sh

   # Retrieve credentials from enterprise vault
   VARVIS_USER=$(vault kv get -field=username secret/varvis)
   VARVIS_PASSWORD=$(vault kv get -field=password secret/varvis)

   export VARVIS_USER VARVIS_PASSWORD

   # Execute download
   ./varvis-download.js "$@"
   ```

### CI/CD Integration

**GitHub Actions:**

```yaml
- name: Download Genomic Data
  env:
    VARVIS_USER: ${{ secrets.VARVIS_USER }}
    VARVIS_PASSWORD: ${{ secrets.VARVIS_PASSWORD }}
  run: |
    ./varvis-download.js -t laborberlin -a ${{ matrix.analysis_id }}
```

**Jenkins:**

```groovy
withCredentials([usernamePassword(
    credentialsId: 'varvis-credentials',
    usernameVariable: 'VARVIS_USER',
    passwordVariable: 'VARVIS_PASSWORD')]) {

    sh './varvis-download.js -t laborberlin -a ${ANALYSIS_ID}'
}
```

## Next Steps

- **[File Downloads](/guide/downloads)** - Configure download behavior
- **[Configuration](/guide/configuration)** - Set up environment-specific configs
- **[Proxy Configuration](/guide/proxy)** - Enterprise network setup
