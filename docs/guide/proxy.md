# Proxy Configuration

The Varvis Download CLI can route its HTTP/HTTPS traffic through a forward proxy — common in corporate and institutional networks.

## How the tool finds a proxy

There are exactly two ways to configure a proxy, in precedence order:

1. **CLI flags** — `--proxy`, `--proxyUsername`, `--proxyPassword`
2. **Configuration file** — the `proxy`, `proxyUsername`, `proxyPassword` keys

::: warning No proxy environment variables
The tool does **not** read `HTTP_PROXY`, `HTTPS_PROXY`, `VARVIS_PROXY`, or any other proxy environment variable. If you rely on those elsewhere, pass the value explicitly with `--proxy "$HTTP_PROXY"`.
:::

## Command-line options

```bash
# Basic proxy
./varvis-download.cjs -t mytarget -a 12345 --proxy "http://proxy.company.com:8080"

# Proxy with authentication
./varvis-download.cjs -t mytarget -a 12345 \
  --proxy "http://proxy.company.com:8080" \
  --proxyUsername "proxy_user" \
  --proxyPassword "proxy_pass"
```

You can also embed credentials directly in the URL:

```bash
./varvis-download.cjs -t mytarget -a 12345 \
  --proxy "http://proxy_user:proxy_pass@proxy.company.com:8080"
```

## Configuration file

Store proxy settings in `.config.json` so you don't repeat them:

```json
{
  "target": "mytarget",
  "proxy": "http://proxy.company.com:8080",
  "proxyUsername": "proxy_user",
  "proxyPassword": "proxy_pass",
  "destination": "./downloads"
}
```

## Authenticated proxies

When `--proxyUsername` and `--proxyPassword` (or the config keys) are set, the
tool sends a correctly base64-encoded `Proxy-Authorization: Basic …` header.

::: tip Requires v0.33.0+
Authenticated-proxy support was fixed in **v0.33.0**. Earlier versions sent a
malformed header that authenticating proxies rejected — upgrade if you see
`407 Proxy Authentication Required` on a supported proxy.
:::

If your password contains characters that are awkward in a URL, prefer the
separate `--proxyUsername` / `--proxyPassword` flags over embedding credentials
in the `--proxy` URL.

## Corporate TLS interception (CA certificates)

Many corporate proxies terminate TLS with a private certificate authority. Node
reads the standard `NODE_EXTRA_CA_CERTS` variable, so point it at your corporate
CA bundle before running the tool:

```bash
export NODE_EXTRA_CA_CERTS="/etc/ssl/certs/corporate-ca.crt"
./varvis-download.cjs -t mytarget -a 12345 --proxy "http://proxy.company.com:8080"
```

::: warning Do not disable verification in production
`NODE_TLS_REJECT_UNAUTHORIZED=0` turns off certificate validation entirely and
exposes you to interception. Use it only for a one-off local test, never in a
scripted or production run.
:::

## NTLM / PAC environments

The tool speaks plain HTTP proxying; it does not implement NTLM negotiation or
evaluate PAC files. In those environments, run a local proxy that handles the
corporate authentication (for example [`px`](https://github.com/genotrance/px)
or `cntlm`) and point the tool at it:

```bash
# Local NTLM-bridging proxy listens on 127.0.0.1:3128
./varvis-download.cjs -t mytarget -a 12345 --proxy "http://127.0.0.1:3128"
```

## Troubleshooting

Enable debug logging to see how requests are dispatched:

```bash
./varvis-download.cjs -t mytarget -a 12345 \
  --proxy "http://proxy.company.com:8080" \
  --loglevel debug --logfile proxy-debug.log --list
```

| Symptom                                  | Likely cause / fix                                                                |
| ---------------------------------------- | --------------------------------------------------------------------------------- |
| `407 Proxy Authentication Required`      | Wrong/missing `--proxyUsername`/`--proxyPassword`, or a pre-0.33.0 version.       |
| `unable to verify the first certificate` | Set `NODE_EXTRA_CA_CERTS` to your corporate CA bundle.                            |
| Proxy ignored entirely                   | You set `HTTP_PROXY`/`VARVIS_PROXY` — pass `--proxy` (or the config key) instead. |
| Connection timeouts                      | Verify the proxy host/port with `curl -x "$PROXY" https://…` first.               |

## Related documentation

- **[Configuration](/guide/configuration)** — configuration-file reference
- **[Authentication](/guide/authentication)** — credentials and non-interactive use
- **[Logging & Reports](/guide/logging)** — debug logging for network issues
