# Virtual receptionist

The website chat uses `os-event` and its existing secure cookie/reply polling. Owner-only settings arrive through the Ed25519-signed `/os-bridge/receptionist/*` routes from Tuff Bros OS. Credentials are encrypted using the website’s existing `BOOKING_SESSION_SECRET`; no key is placed in frontend code, Git, URLs or a browser storage object.

Configure and test through **Tuff Bros OS → Virtual receptionist**. Website and phone channels default off. The private test form creates no customer records. Services are refreshed from the OS catalog. Custom quotes, numeric prices, availability and bookings remain team-reviewed; the receptionist cannot access other customer records, invoices or payment actions. Human takeover pauses automatic replies.

`receptionist-phone` is the POST incoming voice webhook for a verified Twilio number. It validates the request signature, AccountSid and To number; no unauthenticated test mode exists. Keep Google Voice by forwarding calls to that verified number. This does not forward Google Voice texts or change the current phone configuration. Provider charges and a destination number require separate setup; no number is purchased by deployment.

No audio recording is requested. Speech uses Twilio Gather/Say. Incoming messages are queued before AI generation. Replies and bounded transcripts have deterministic receipts and conditional-write locks. AI failures go to human review; no booking, quote acceptance or SMS consent is inferred. The default daily limit is 100 AI attempts in America/Chicago, and each conversation is limited to 20 AI turns.

Keep `netlify/functions/lib/receptionist-core.mjs` identical to the OS copy. Run `npm test`, `npm run check`, and `node --check os-client.js` before publishing. The new tests use in-memory stores, mocked model responses and disposable signatures. No real customer messages are sent.
