Bins Out V#3 — UK postcode and collection lookup

Upload these files to the root of the existing GitHub Pages repository, replacing the matching files.

What's new:
- Postcode-based address lookup using the UK Bin Day API v2.
- Collection-date lookup by matching the saved house/address and postcode to a UPRN, then requesting that property's dates.
- Real collection dates are shown only when the API returns dated records. The app does not manufacture dates.
- Glasgow City Council official address/calendar lookup is linked as the fallback when the external service is unavailable, blocked by browser CORS, or cannot provide dates.
- Scotland is the default region; postcode lookup can also identify Glasgow.
- Cache version bumped to bins-out-v10 to help the installed PWA pick up updates.

Important test note:
The external API could not be reached from the build environment, so live API responses and browser CORS behaviour have not been verified here. After uploading, test a Glasgow postcode in Chrome. If the browser blocks the API, the app gives the official Glasgow lookup fallback rather than pretending the dates are connected.

QR / tenant accounts:
A proper tenant QR invite should use an opaque property invite token backed by a secure account/database service. Do not put a tenant's full address or personal details directly into a QR URL. This static GitHub Pages build does not yet create secure cross-device tenant accounts, so it does not pretend that QR invitations are live.

Official Glasgow lookup:
https://onlineservices.glasgow.gov.uk/forms/refuseandrecyclingcalendar/AddressSearch.aspx
UK Bin Day API documentation:
https://ukbinday.co.uk/api/v2/redoc
