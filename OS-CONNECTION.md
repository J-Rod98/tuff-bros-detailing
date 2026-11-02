# Tuff Bros website → Tuff Bros OS

The public site saves quote requests, copies successfully completed appointment requests, and supports customer website chat through Netlify Functions and Blobs. Tuff Bros OS imports pending events automatically on opening and checks while active, with a manual Sync button in Settings, Reports and Communications. Requests stay queued safely on the website while the app is closed. The app remains private.

The private app holds `WEBSITE_SIGNING_KEY` in Sites runtime secret storage. The matching **public** verification key is committed in `netlify/functions/lib/os-public-key.mjs`. Netlify validates Ed25519 signatures over method, exact request path, timestamp and body digest, rejects expired requests, and permits queue reads, acknowledgements and owner replies only with a valid signature. No website-side password or private Site-access token is needed. The public key is safe to publish.

Customer chat uses an HttpOnly, Secure, SameSite cookie and an unguessable conversation identifier. Replies are visible only in that customer's browser, for up to 30 days. The app's Send reply action requires review. No external SMS or email is sent by website chat. Customers must keep/return to the same browser to receive replies.

Quote forms use the new durable queue once its configuration endpoint responds successfully; otherwise the existing Formspree route remains in place. Accepted OS requests still emit the existing Google/Meta quote-success events. Standard appointment requests continue their existing Jobber workflow and add an independent OS event after successful processing. Pending requests never become confirmed jobs automatically. A failed OS copy can be retried with the existing booking submission. New customers do not receive SMS consent automatically.

Reports count new first-party page views, call/text clicks, quote requests, appointment requests, chat messages and lead sources. They do not import historical GA4 data or count unique visitors. Never include submitted names, phone numbers, email addresses, messages or URL query strings in traffic measurement. The private app retains 90 days of analytics events; its imported customer/request records persist.

Recovery: Sync requests now safely repeats imports and acknowledgement. Stable event IDs prevent duplicates after retries. If a website import fails, the event stays in the queue. Check app Settings for the last event/connection error and Netlify function logs. Do not delete queue entries manually before importing. Key rotation requires a matching Sites secret and public verification key deployment.

Validation: `npm ci`, `npm test`, `npm run check`, and `node --check os-client.js`. Tests cover the established quote tracking, durable intake, duplicate retry, signed requests/body tampering, cross-origin writes, isolated conversations, and owner reply delivery. The integration changes do not ingest incoming SMS/email replies; those channels require a separate provider webhook integration.

## Customer quote links

The OS signs publication of a limited quote snapshot to the existing Netlify bridge. Customer links use a 256-bit capability in the URL fragment; the page sends it to a same-origin API, which checks its SHA-256 hash, expiry and revocation. Only the selected lead/estimate's public options are included; internal notes, other customers and OS access are excluded. Each link accepts one confirmed response with conditional writes, and at most five verified image uploads. Responses and photos remain durable until the authenticated OS sync acknowledges them. The OS checks the current quote snapshot again before applying acceptance; stale, closed, already accepted or revoked quotes are flagged for owner review. Accepting never creates a job or sends a message. Revoke from the quote's Customer quote links dialog. A changed price/scope requires a fresh link.

Tests: customer-quotes.test.mjs covers scoped lookup, cross-origin rejection, response retry / competing response protection, acknowledgment, revocation, and verified image transfer. No API model calls or payments are used.
