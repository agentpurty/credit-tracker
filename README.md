# Credit Tracker (iOS web app) 2.1

A small offline-first web app for an iPhone home screen with two screens: **Scanner** and **Map**.

- **Scanner:** photograph fanned run sheets (or pick photos). Text is read on the phone with a self-hosted copy of
  [tesseract.js](https://github.com/naptha/tesseract.js) (`vendor/tesseract`, Apache-2.0). Photos never leave the
  phone and are not saved. Phone numbers are never read or stored. Names and addresses are added in scan order, and
  duplicates are skipped.
- **Map:** Leaflet with OpenStreetMap tiles (Esri street map as a fallback). Addresses are looked up with OpenStreetMap
  Nominatim using the street address only (units removed, about one request a second) and cached on the phone.
  Pins are numbered in scan order and have Go (Apple Maps or Google Maps) and Mark done. **Add marker** creates your
  own stops (name, address, phone) with a Notes page.
- **ZIP code areas (2.1):** Legend → ZIP code areas switch. Outlines and ZIP labels from the U.S. Census Bureau 2020
  ZCTAs for mid-Michigan (`data/zcta_mid_michigan.json`, self-hosted, loaded only when the switch is first turned on).
- Data lives only in this browser's storage (`localStorage` keys `ct2-*`). Data from 1.x (IndexedDB `credit-tracker`,
  `ct-settings`, `ct-tiles`) is left alone.
- Install: open the site in Safari, then Share → Add to Home Screen.

Development: `node tests/parser.test.js` runs the sheet-reader fixtures (made-up names only).
To publish an update, change `CACHE` in `sw.js` and add a `changelog.json` entry.
