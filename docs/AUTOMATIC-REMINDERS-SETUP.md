# Bins Out automatic push reminders — Cloudflare setup

The app and Worker contain the Web Push flow, but delivery stays disabled until the Worker has its KV binding and VAPID keys. The app must be served over HTTPS and the user must grant notification permission.

## Cloudflare Worker settings

Worker name: `bins-out-connector`

1. Create a KV namespace in Cloudflare named `PUSH_STORE` (the name is the Worker binding name; use the namespace ID from Cloudflare).
2. Open the `bins-out-connector` Worker → Settings → Bindings → Add → KV namespace. Set variable name to `PUSH_STORE` and select the namespace.
3. Add the cron trigger `*/15 * * * *` under Triggers. The repository's `wrangler.toml` also declares this trigger for Wrangler deployments.
4. Add Worker secrets:
   - `VAPID_PUBLIC_KEY`: base64url-encoded uncompressed P-256 public point (65 bytes, starting with 0x04).
   - `VAPID_PRIVATE_JWK`: JSON for the matching P-256 private JWK, including `crv`, `kty`, `x`, `y`, and `d`.
5. Save and deploy the Worker. Do not put the private JWK in the public GitHub repository.

## App-side test

1. Open the deployed Bins Out PWA on the phone and refresh it so the new service worker is installed.
2. Save a household and confirm real future collection dates.
3. Open Reminders → Enable automatic phone reminders and allow notifications.
4. Confirm the status says reminders are enabled. Set a test collection date for tomorrow only in a development/test environment before testing scheduled delivery.

## Important behaviour

- The scheduled Worker checks every 15 minutes and sends one reminder at the selected UK local time when confirmed collections are due the next day.
- Expired push subscriptions are removed when the push service reports HTTP 404/410.
- If `PUSH_STORE` or either VAPID secret is missing, the Worker intentionally returns a configuration error rather than pretending notifications are enabled.
- The address and collection schedule are stored in the browser until the user enables push; when enabled, the confirmed bin names/dates and subscription endpoint are stored in the Worker KV namespace.
