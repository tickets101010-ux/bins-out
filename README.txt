BINS OUT V9 — VERIFIED CROSSLEES SCHEDULE TEST

WHAT THIS VERSION DOES
- Preserves the existing Bins Out interface.
- Includes the collection schedule transcribed from the user's East Renfrewshire Council checker screenshots for 58 Crosslees Drive, G46 7DS, through Wednesday 25 November 2026.
- Attaches that schedule when the saved address exactly matches 58 Crosslees Drive and postcode G46 7DS, unless a confirmed schedule is already saved.
- Keeps the Cloudflare Worker connector controls for testing the upstream API.

IMPORTANT LIMITATION
The Cloudflare connector is deployed and responds, but East Renfrewshire's upstream checker currently blocks automated lookups. This build does not claim that collection dates are being fetched live or automatically refreshed. Dates after 25 November 2026 are not included or verified in this version.

INSTALL TO GITHUB PAGES
1. Download and extract this ZIP.
2. Open the GitHub repository for Bins Out.
3. Upload the CONTENTS of the binsout_v9 folder to the repository root, replacing matching files. Do not upload the ZIP itself or create a nested binsout_v9 folder in the repository.
4. Commit the changes.
5. Open the live app and refresh. The service worker cache name is bumped so it should replace the older app shell.

FILES
index.html, worker.js, sw.js, manifest.webmanifest, icon.svg, icon-192.png, icon-512.png.

TEST ADDRESS
58 Crosslees Drive, G46 7DS (UPRN 131036325; East Renfrewshire Council).
Council lookup: https://www.eastrenfrewshire.gov.uk/bin-days
