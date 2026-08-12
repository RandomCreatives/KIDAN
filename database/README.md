# Database

`migrations/` is append-only once a migration has been applied outside a disposable local database.

The initial schema demonstrates trust-boundary separation; it is not yet wired to the API. Before persistence work:

1. Select an Ethiopia-compatible hosting and backup location.
2. Select managed application-layer key storage for identity ciphertext.
3. Define roles that prevent discovery code from reading `identity_vault`.
4. Add transaction-level services and database integration tests for connection state transitions.
5. Finalize retention/deletion rules and audit-log minimization.

Never use `public_code` as a database primary key or credential.
