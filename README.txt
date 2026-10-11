Bins Out V#5 — corrected UK Bin Day API integration

UPLOAD
Upload every file in this ZIP to the ROOT of the existing GitHub Pages repository and replace files with the same names. Do not upload the ZIP itself.

WHAT CHANGED
- Uses the documented UKBinDay API v1 routes: /addresses/{postcode} and /lookup/{uprn}, instead of the previous v2-style /find and council/view paths.
- Normalises common address and collection response shapes and requires a property UPRN before saving dates as verified.
- Keeps the existing household save/delete/switch functionality and refuses to invent collection dates.
- Bumps the service-worker cache so the updated app can be fetched.
- Glasgow official fallback opens the council's address search.

IMPORTANT HONEST LIMITATION
I could not make live network requests from the build environment, so I could not verify the provider's live response shape or whether its API allows browser CORS requests. The API docs list these v1 routes, but this ZIP is not a claim that the live integration has passed a real-address test. After uploading, test with a postcode and exact house number. If Chrome reports a network/CORS error, the next required step is deploying a server-side proxy/connector; GitHub Pages alone cannot run that backend.

GLASGOW OFFICIAL SOURCE
https://onlineservices.glasgow.gov.uk/forms/refuseandrecyclingcalendar/AddressSearch.aspx

API reference
https://ukbinday.co.uk/api/v1/councils
API project documentation: https://github.com/cmbsteinberg/ukbinday

After upload: open the site in Chrome, clear browser history/site data as you did for the previous install fix, then reopen/reinstall the app if it keeps showing the old version.
