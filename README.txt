BINS OUT — V#1 INSTALL REPAIR PACKAGE

This package keeps the V4 UK-first layout and app features, and updates the PWA installation setup:
- Explicit, stable manifest ID and start URL/scope
- Android-friendly 192px and 512px PNG app icons
- New service-worker cache version
- Network-first page navigation to avoid stale cached HTML
- Cleanup of older bins-out-* caches on service-worker activation

UPLOAD INSTRUCTIONS
1. Open the GitHub repository: https://github.com/tickets101010-ux/bins-out
2. Open the repository's main file list.
3. Upload/replace the files from this ZIP at the repository ROOT (not inside a new folder).
4. Replace files with the same names when GitHub asks.
5. Wait for GitHub Pages to publish, then open https://tickets101010-ux.github.io/bins-out/ in Chrome.

IMPORTANT
This package does not itself edit GitHub or install the app on the phone. After upload, Chrome may still need the old stale installation entry cleared if the previous app registration remains broken. Do not clear all Chrome data; that can remove unrelated browsing data.
The app's collection dates are not verified automatically unless a connected local-authority/provider source supplies them. Do not treat sample schedules as real collections.
