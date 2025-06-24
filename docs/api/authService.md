# API Reference


  ##
  getCsrfToken

    Fetches the CSRF token required for login.

    ### Parameters | Name | Type | Description | |------|------|-------------|
      | `target` | `string` |
      The target for the Varvis API.
      |

    ### Returns **Type:** `Promise.&lt;string&gt;`

      - The CSRF token.


  ---

  ##
  login

    Logs in to the Varvis API and retrieves the CSRF token.

    ### Parameters | Name | Type | Description | |------|------|-------------|
      | `user` | `Object` |
      The user credentials.
      |
      | `user.username` | `string` |
      The username.
      |
      | `user.password` | `string` |
      The password.
      |
      | `target` | `string` |
      The target for the Varvis API.
      |

    ### Returns **Type:** `Promise.&lt;Object&gt;`

      - The login response containing the CSRF token.


  ---


  ## Class:
  AuthService

    AuthService class handles authentication with the Varvis API.


