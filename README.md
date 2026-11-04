# Metro Exit Finder (Dhaka MRT Line-6)

Made by **Atiqur Rahaman**, CEO & Founder @ Design Monks & Dev Monks · [LinkedIn](https://www.linkedin.com/in/atiq31416/) · [Facebook](https://www.facebook.com/atiq31416)

An installable web app (PWA) for Dhaka Metro Rail. It has no build step: every file is plain HTML, CSS and JS.

- **Exit** tab: detects your nearest station with GPS (or you pick one). You choose a destination from nearby places, search for one (OpenStreetMap search, needs internet), or tap the map. The app tells you which exit to take and which way to walk after you come out. It also has a compass arrow and a Google Maps walking link.
- **Stations** tab: all 16 stations from Uttara North to Motijheel. Each one lists its exits, nearby places and the best exit for each place.
- **Fares** tab: fare between any two stations, plus the MRT/Rapid Pass price (10% off).
- **Info** tab: timings, whether trains are running now (Dhaka time), ticket and on-board rules, and notes on how reliable the data is.
- **Works offline** after the first visit. Map tiles you have already viewed are cached too.
- **Fix this exit**: when you're at a station, you can save the real sign name ("Exit A", "Gate 2") and stand at the exit to record its exact GPS position. Fixes stay on your phone. Info → *Copy my fixes* exports them so they can be merged into `data.js`.

## Hosting (pick one; all free, all HTTPS, which location and install need)

1. **Netlify Drop (easiest):** open https://app.netlify.com/drop and drag the `dhaka-metro` folder onto the page. You get a link right away.
2. **GitHub Pages:** in this repo go to Settings → Pages → Deploy from a branch → `main` / `(root)`. The app will be at `https://atiq31416.github.io/dhaka-metro-exit-finder/`.
3. **Cloudflare Pages** or **Vercel:** create a new project from the folder or repo. Leave the build command empty and set the output directory to `/`.

Open the link on your phone, then choose **Add to Home Screen** (Safari) or **Install app** (Chrome).

To test locally, run `python3 -m http.server` in this folder and open http://localhost:8000. Location works on localhost.

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
