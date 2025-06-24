# API Reference


  ##
  createApiClient

    Creates and configures an API client instance.

    ### Parameters | Name | Type | Description | |------|------|-------------|
      | `agent` | `Object` |
      The HTTP agent instance.
      |
      | `logger` | `Object` |
      The logger instance.
      |

    ### Returns **Type:** `ApiClient`

      - The configured API client instance.


  ---

  ##
  fetchWithRetry

    Retries a fetch operation with a specified number of attempts.

    ### Parameters | Name | Type | Description | |------|------|-------------|
      | `url` | `string` |
      The URL to fetch.
      |
      | `options` | `Object` |
      The fetch options.
      |
      | `retries` | `number` |
      The number of retry attempts.
      |

    ### Returns **Type:** `Promise.&lt;Response&gt;`

      - The fetch response.


  ---


  ## Class:
  ApiClient

    API Client class for handling HTTP requests with retry logic and agent management.


