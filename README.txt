BINS OUT V8 — API V2 CONNECTOR TEST

Goal: get one verified live schedule for the test property 58 Crosslees Drive, G46 7DS (East Renfrewshire). V8 corrects the API route and council-code flow.

IMPORTANT STATUS
The app and connector code are prepared and syntax-checked, but live collection dates are NOT yet verified. This needs one Cloudflare Worker deployment and an exact property UPRN. Do not treat a date as verified until the app displays dates returned by the service for the selected UPRN.

CONNECTOR SETUP (one-time)
1. Open https://dash.cloudflare.com/ and sign in.
2. Go to Workers & Pages and create a Worker named bins-out-v8-connector.
3. Open worker.js from this ZIP, copy all of its contents into the Worker editor, and deploy.
4. Copy the HTTPS workers.dev URL.
5. Open Bins Out > My address. Paste the Worker URL into Live data connector URL and tap Save connector URL.
6. Open that URL with /health appended. It should return JSON containing "ok": true.

TEST PROPERTY
58 Crosslees Drive, G46 7DS, Thornliebank, East Renfrewshire.
Official council bin-day lookup: https://www.eastrenfrewshire.gov.uk/bin-days

TEST FLOW
1. In Bins Out, enter postcode G46 7DS and tap Find address by postcode. V8 asks UKBinDay API v2 which council covers the postcode and stores the returned LAD code.
2. The API may return no address list because it protects postcode-to-UPRN lookup with a browser challenge. If so, use the official council lookup to identify the exact house and its UPRN. Do not use a neighbour's UPRN.
3. Enter the exact UPRN in the UPRN field, then tap Check collection dates.
4. The app requests /{LAD}/view/{UPRN}?postcode=...&address=... and displays dates only if dated records are returned. If the API returns a deeplink instead of dates, dates remain unverified.

API ROUTES
Worker /find?postcode=G467DS -> UKBinDay API v2 /find
Worker /view?lad=...&uprn=...&postcode=...&address=... -> UKBinDay API v2 /{lad}/view/{uprn}
Worker /health -> connector health check

DEPLOY APP FILES
Extract this ZIP and upload the individual files to the root of the GitHub Pages repository, replacing matching files. Do NOT upload the ZIP itself. Files include index.html, worker.js, sw.js, manifest.webmanifest, icons, and this README.

After deploying, refresh the GitHub Pages app in Chrome. If an old screen remains, clear Chrome history/cache and reopen the installed app. This ZIP cannot deploy the Worker to your account or verify upstream live data by itself.
