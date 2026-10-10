BINS OUT — USER TEST PROTOTYPE 0.1

WHAT WORKS
- Mobile-first app-like interface
- PWA manifest with Android-sized PNG icons and service worker for offline app shell
- Address form (house/name, postcode/ZIP, country, area)
- Stores address and reminder preferences in this browser on this device
- Demo schedule and reminder preview
- Optional link to an official local collection lookup page

IMPORTANT LIMITATIONS
- This is a prototype, not a production service.
- It does NOT yet fetch verified address-specific collection schedules.
- It does NOT send scheduled background push notifications.
- The demo schedule is illustrative and must not be treated as the user's real collection.
- International collection data is fragmented across local authorities and providers; integrations need to be researched and built country/region by country/region.
- Do not collect payments or charge users until schedule accuracy, notification delivery, privacy, support, and applicable legal requirements are ready.

HOW TO TEST ON AN ANDROID PHONE
1. Upload/extract the ZIP to a static HTTPS host such as GitHub Pages, Netlify, or Cloudflare Pages. A secure HTTPS origin is needed for service-worker installation.
2. Open the published site in Chrome on Android.
3. Use the browser menu (three dots) and choose "Install app" or "Add to Home screen".
4. Open Bins Out from the new home-screen icon.
5. Tap My address and enter test data. For privacy, use a test address rather than another person's address.
6. Tap My bins and choose "Load sample schedule" to see the sample bins.
7. Tap Reminders, change the reminder time, and use Preview reminder.
8. Refresh/reopen the app to confirm preferences persist on that browser/device.

LOCAL TEST
For a quick desktop preview, serve this folder from a local web server rather than opening index.html directly, for example:
  python -m http.server 8000
Then open http://localhost:8000. PWA installation generally requires HTTPS or localhost.

NEXT BUILD MILESTONES
1. Choose initial data partners and create verified address-to-schedule integrations for launch regions.
2. Implement server-side schedule storage, source timestamps, and fallback/confirmation paths.
3. Add real push notification scheduling and delivery, with permission onboarding.
4. Add consent, privacy policy, data deletion, security review, analytics, and support.
5. Add one-off checkout and receipt flow only after core reliability testing.
