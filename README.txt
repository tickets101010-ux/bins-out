Bins Out V6 — Glasgow connector attempt

WHY V5 FAILED
The screenshot's “Failed to fetch” confirms the browser could not complete its direct request. UKBinDay now documents API v2, and its address list may be withheld behind an address-verification challenge. GitHub Pages cannot run a server-side proxy. This ZIP includes a Worker connector and frontend wiring, but the Worker must be deployed before live lookup can run.

SETUP (one time)
1. Open Cloudflare Workers & Pages and create a Worker named bins-out-connector.
2. Replace its starter code with the entire contents of worker.js and deploy.
3. Copy the Worker URL, e.g. https://bins-out-connector.YOURSUBDOMAIN.workers.dev
4. Upload all app files in this ZIP to the ROOT of https://github.com/tickets101010-ux/bins-out, replacing matching files. Do NOT upload the ZIP itself.
5. Open Bins Out, go to “Live data connector”, paste the Worker URL, tap “Save connector URL”, then test postcode lookup.

IMPORTANT
This is not yet a verified live Glasgow integration. UKBinDay documents /api/v2/find and /api/v2/{lad}/view/{uprn}; its /find address list may be unavailable where address verification is required. The connector does not bypass that challenge. If the provider cannot identify the property, use the official council calendar; the app will not invent dates.

OFFICIAL GLASGOW LOOKUP
https://onlineservices.glasgow.gov.uk/forms/refuseandrecyclingcalendar/AddressSearch.aspx
API DOCS: https://ukbinday.co.uk/api-docs
