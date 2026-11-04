# Metro Exit Finder (Dhaka MRT Line-6)

Made by **Atiqur Rahaman**, CEO & Founder @ Design Monks & Dev Monks · [LinkedIn](https://www.linkedin.com/in/atiq31416/) · [Facebook](https://www.facebook.com/atiq31416)

An installable web app (PWA) for Dhaka Metro Rail. It has no build step: every file is plain HTML, CSS and JS.

- **Navigation** tab (home screen) has two modes, **Find Metro Rail** and **Find Exit** (the default). The app remembers the last one you used.
- **Find Metro Rail**: pick your station and the station you're going to. The app says which train to board (named by its last station, as the platform signs are), which side of the tracks its platform is on, the number of stops, travel time, fare and the next train. A top-view drawing of the station highlights your platform, and with the compass on it turns so it matches where you're facing ("Your platform is on your right"). The side assumes trains keep left, which is not yet verified at every station.
- **Find Exit** (Navigation tab): detects your nearest station with GPS (or you pick one). You choose a destination from nearby places, search for one (OpenStreetMap search, needs internet), or tap the map. The app tells you which exit to take and which way to walk after you come out. It also has a compass arrow and a Google Maps walking link.
- **Stations** tab: all 16 stations from Uttara North to Motijheel. Each one lists its exits, nearby places and the best exit for each place.
- **Fares** tab: fare between any two stations, plus the MRT/Rapid Pass price (10% off).
- **Info** tab: timings, whether trains are running now (Dhaka time), ticket and on-board rules, and notes on how reliable the data is.
- **Trains now** (Stations tab) and **Next train** (each station page): where trains are on the line and how many minutes until the next one in each direction. Positions come from two places:
  - **Estimated** (dashed markers): worked out from the timetable, headways and the 38 min end-to-end run in `data.js`. Works offline, but can be a few minutes off.
  - **Live** (solid markers): riders on a train tap *Share my train*. The app snaps their GPS to the line and sends only their position along it (km from Uttara North), direction and speed, never their coordinates. A live train replaces any estimate near it. Sharing needs the train to move 300 m at train speed before it counts, stops when the rider leaves the line, and stops after 90 minutes.
- **Bangla / English**: the button at the top right switches the whole app, including station names, exit directions, times and digits. It starts in Bangla when the phone's language is Bangla and remembers your choice. All text is in `i18n.js`; data text in Bangla (notes, tips, exit areas) sits next to the English in `data.js` (`noteBn`, `towardBn`, `itemsBn` and so on). Nearby place names stay in English so search still matches them.
- **Station facilities** (each station page, and on the Find Exit answer): lifts, escalators, stairs, ticket machines, ticket counter, card top-up and toilets, with where they are. Each exit shows whether it has a lift and escalator. The data comes from 2022 press reports and is not checked station by station, so items show **Likely** or **Unverified**. *Fix this exit* now also saves "lift here / escalator here" for that exit on your phone.
- **Rush-hour guide** (Info tab, and a "Crowd on this train now" line in Find Metro Rail): an hour-by-hour crowd chart for each direction, Saturday to Thursday and Friday, plus tips (where to board, the women-only coach). It is an **unverified estimate** from commute patterns, not measured. Edit `crowd` in `data.js` to tune it.
- **Service alerts**: a banner at the top of every tab for delays, closures or changed timings, in English and Bangla. Riders can hide an alert. The app checks for alerts every 3 minutes while it is open (one small request, no open connection) and keeps the last list for offline use. You post and delete alerts at `#admin` (link at the bottom of the Info tab). See the setup below.
- **Works offline** after the first visit. Map tiles you have already viewed are cached too.
- **Fix this exit**: when you're at a station, you can save the real sign name ("Exit A", "Gate 2") and stand at the exit to record its exact GPS position. Fixes stay on your phone. Info → *Copy my fixes* exports them so they can be merged into `data.js`.

## Analytics (Firebase)

Analytics stays off until you fill in `firebase-config.js` with your Firebase web app config (Firebase console → Project settings → Your apps → Web app). Google Analytics must be enabled for the project so that `measurementId` exists.

Events sent: `screen_view` (exit / stations / fares / info), `select_station`, `exit_recommended` (station, destination name, chosen exit), `fare_check`, `location_permission`, `compass_on`, `walking_route`, `exit_fixed`, `live_share` (on / off), `home_mode`, `platform_finder`, `language`, `rush_guide`, `alert_hide` and `alert_post`. GPS coordinates and personal data are never sent. If Firebase is blocked or the phone is offline, the app works as normal.

## Live trains setup (Firebase Realtime Database)

Estimated trains work with no setup. Rider sharing stays off until `databaseURL` in `firebase-config.js` is filled in:

1. Firebase console → **Build → Realtime Database → Create database** (pick Singapore, `asia-southeast1`, as it is closest to Dhaka; start in locked mode).
2. **Rules** tab: paste the contents of `database.rules.json` and publish. Anyone can read; each rider can only write their own entry, with checked values and at most one write every 4 seconds.
3. **Build → Authentication → Sign-in method**: enable **Anonymous**. Riders get an anonymous id, with no account or login.
4. Copy the database URL from the top of the **Data** tab into `databaseURL` in `firebase-config.js` and redeploy.

The free Spark plan allows 100 simultaneous connections. The app connects only while the Stations tab or a station page is open (or while sharing) and disconnects 30 seconds after you leave.

## Service alerts setup (Firebase)

Alerts use the same Realtime Database as live trains. Until steps 1 and 2 are done the banner stays empty and the app works as before.

1. Firebase console → **Realtime Database → Rules**: paste the new `database.rules.json` and publish. It adds `alerts` (anyone can read, only admins can write) and `admins`.
2. **Authentication → Sign-in method**: enable **Email/Password**. Then **Authentication → Users → Add user** with your email and a strong password, and copy the **User UID** shown in the list.
3. **Realtime Database → Data**: add a child `admins`, and under it a child named with your UID and the value `true` (so `admins/<your uid> = true`).
4. Open the app at `#admin` (or Info → *Post a service alert*), sign in, and post. Riders see it within about 3 minutes. Use **Hide after** so old alerts disappear on their own, or delete them on the same page.

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
| Facilities (lifts, escalators, ticket machines, counters, top-up) | Medium ("Likely") | Dhaka Tribune (Mar 2022), The Business Standard and The Financial Express (Dec 2022). Reported for every station, not checked one by one. Real lift and escalator positions per exit are not known. |
| Toilets | **Low** | Press reports say each station has washrooms (including a women's washroom and baby changing room). Where they are is not known. |
| Rush-hour crowding | **Low** | Estimate from commute patterns, not measured |
| Women-only coach | Low | One of the six coaches is reserved for women (press reports, Dec 2022). Which one is not known, so the app says to follow the platform signs. |

Fonts (in `fonts/`): Funnel Display for English titles and DM Sans for English body text (both SIL OFL, self-hosted so they work offline). Li Ador Noirrit (supplied by you) is used for all Bangla text and loads only when Bangla characters appear.

Third-party code: Leaflet 1.9.4 (BSD-2, `vendor/leaflet`). Map tiles and search come from OpenStreetMap.
