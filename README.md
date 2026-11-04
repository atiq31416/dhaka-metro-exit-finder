# Metro Exit Finder (Dhaka MRT Line-6)

Made by **Atiqur Rahaman**, CEO & Founder @ Design Monks & Dev Monks · [LinkedIn](https://www.linkedin.com/in/atiq31416/) · [Facebook](https://www.facebook.com/atiq31416)

An installable web app (PWA) for Dhaka Metro Rail. It has no build step: every file is plain HTML, CSS and JS.

- **Exit** tab: detects your nearest station with GPS (or you pick one). You choose a destination from nearby places, search for one (OpenStreetMap search, needs internet), or tap the map. The app tells you which exit to take and which way to walk after you come out. It also has a compass arrow and a Google Maps walking link.
- **Stations** tab: all 16 stations from Uttara North to Motijheel. Each one lists its exits, nearby places and the best exit for each place.
- **Fares** tab: fare between any two stations, plus the MRT/Rapid Pass price (10% off).
- **Info** tab: timings, whether trains are running now (Dhaka time), ticket and on-board rules, and notes on how reliable the data is.
- **Trains** tab and **Next train** (each station page): where trains are on the line and how many minutes until the next one in each direction. Positions come from two places:
  - **Estimated** (dashed markers): worked out from the timetable, headways and the 38 min end-to-end run in `data.js`. Works offline, but can be a few minutes off.
  - **Live** (solid markers): riders on a train tap *Share my train*. The app snaps their GPS to the line and sends only their position along it (km from Uttara North), direction and speed, never their coordinates. A live train replaces any estimate near it. Sharing needs the train to move 300 m at train speed before it counts, stops when the rider leaves the line, and stops after 90 minutes.
- **Works offline** after the first visit. Map tiles you have already viewed are cached too.
- **Fix this exit**: when you're at a station, you can save the real sign name ("Exit A", "Gate 2") and stand at the exit to record its exact GPS position. Fixes stay on your phone. Info → *Copy my fixes* exports them so they can be merged into `data.js`.

## Analytics (Firebase)

Analytics stays off until you fill in `firebase-config.js` with your Firebase web app config (Firebase console → Project settings → Your apps → Web app). Google Analytics must be enabled for the project so that `measurementId` exists.

Events sent: `screen_view` (exit / stations / fares / info), `select_station`, `exit_recommended` (station, destination name, chosen exit), `fare_check`, `location_permission`, `compass_on`, `walking_route`, `exit_fixed` and `live_share` (on / off). GPS coordinates and personal data are never sent. If Firebase is blocked or the phone is offline, the app works as normal.

## Live trains setup (Firebase Realtime Database)

Estimated trains work with no setup. Rider sharing stays off until `databaseURL` in `firebase-config.js` is filled in:

1. Firebase console → **Build → Realtime Database → Create database** (pick Singapore, `asia-southeast1`, as it is closest to Dhaka; start in locked mode).
2. **Rules** tab: paste the contents of `database.rules.json` and publish. Anyone can read; each rider can only write their own entry, with checked values and at most one write every 4 seconds.
3. **Build → Authentication → Sign-in method**: enable **Anonymous**. Riders get an anonymous id, with no account or login.
4. Copy the database URL from the top of the **Data** tab into `databaseURL` in `firebase-config.js` and redeploy.

The free Spark plan allows 100 simultaneous connections. The app connects only while the Stations tab or a station page is open (or while sharing) and disconnects 30 seconds after you leave.

## Data and what to verify

Everything is in `data.js`. Edit it and redeploy to correct something.

| Data | Confidence | Source / note |
|---|---|---|
| Station list, order, codes, opening dates | High | Wikipedia list of Dhaka Metro Rail stations |
| Timings | Medium | trainjatri.com (updated 24 Aug 2026). Sat to Thu 6:30 AM to 9:50 PM from Uttara North, 7:15 AM to 10:30 PM from Motijheel. Fri from 3:00 PM / 3:20 PM. A Financial Express report from Oct 2025 gave different Friday hours, so check the DMTCL notices. |
| Fares | Medium | Calculated from the official policy (Tk 5/km, rounded up to Tk 10, min 20, max 100). The Uttara North row matches the published chart, but other pairs can be off by Tk 10. |
| Station coordinates | Medium | Approximate, within about 100 m |
| Exit side and "toward" areas | Medium ("Likely") for Pallabi to Shahbagh; **Low ("Unverified")** for Uttara North/Center/South, Dhaka University, Secretariat and Motijheel | Based on road layout. Real exit letters or numbers are not in the data. |
| Exit count | **Low** | Each station is modelled as two exits, one on each side of the road. Some stations have more staircases or lifts. |
| MRT Pass price (Tk 500 incl. Tk 200 deposit) | Low | Confirm at the counter |

Fonts (in `fonts/`): Funnel Display for English titles and DM Sans for English body text (both SIL OFL, self-hosted so they work offline). Li Ador Noirrit (supplied by you) is used for all Bangla text and loads only when Bangla characters appear.

Third-party code: Leaflet 1.9.4 (BSD-2, `vendor/leaflet`). Map tiles and search come from OpenStreetMap.
