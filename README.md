# Credit Tracker (iOS web app)

A small offline-first web app for tracking past-due accounts, built to be added to an iPhone home screen.

- Runs entirely in the browser; data is stored on the device (IndexedDB). Nothing is sent to a server.
- Install: open the site in Safari → Share → Add to Home Screen.
- Backup: Settings → Export / Import backup (JSON).
- Static files only (HTML/CSS/JS), hosted with GitHub Pages. Map uses Leaflet with OpenStreetMap/CARTO tiles.

To publish an update, change `CACHE` in `sw.js`; installed copies will show "Update available, tap to refresh".
