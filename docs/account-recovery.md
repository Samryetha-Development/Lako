# Open registration and account recovery

Registration accepts a username and password (12–256 characters). Email and
display name remain optional API fields for existing provisioning clients.
Public registration creates an ACTIVE account with the normal member role;
neither Lako nor the OIDC forum flow requires administrator approval.

Every public registration returns exactly eight account recovery codes, once.
The web flow asks the user to save or download them before continuing to login.
The database stores only SHA-256 hashes of random 64-bit codes. These codes
are independent of existing authenticator/passkey second-factor backup codes.

`POST /api/auth/password/reset/recovery-code` accepts `username`, `code`, and
`new_password`. A successful transaction atomically consumes one code, updates
the password, revokes all cookie sessions and OAuth access tokens, and records
an audit event. It does not disable existing MFA. Invalid or disabled accounts
and invalid codes return the same error; attempts are limited per IP.

Existing users can open Security → Account recovery to generate eight codes.
`GET /api/account/recovery-codes` returns only the unused count.
`POST /api/account/recovery-codes` requires authentication, CSRF validation and
the current password (plus recent AAL2 when TOTP is enabled). It invalidates all
previous account recovery codes. No phone number or SMS integration is used.

Apply Alembic revision `0008_account_recovery` before starting the new API.
The migration adds a separate table; it does not modify existing credentials,
users or MFA recovery codes. Rollback the application images if necessary;
the additive table can remain during rollback without affecting older code.
