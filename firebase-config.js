// Firebase config (Analytics + live trains). Paste the web app config from
// Firebase console → Project settings → General → Your apps → SDK setup and configuration.
// These values are public by design (they identify the project, they are not secrets).
// While apiKey or measurementId is empty, analytics stays off and nothing is sent.
// While databaseURL is empty, rider live sharing stays off (timetable estimates still show).
// databaseURL is shown in Firebase console → Realtime Database, at the top of the Data tab.
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyCq5Jd6hlWFYJdVgwaF-ysUmplLj2tV8Cg",
  authDomain: "dhaka-metro-exit-finder.firebaseapp.com",
  projectId: "dhaka-metro-exit-finder",
  storageBucket: "dhaka-metro-exit-finder.firebasestorage.app",
  messagingSenderId: "772109446121",
  appId: "1:772109446121:web:e31ec7cc2725860f5df978",
  measurementId: "G-20B6HJ0PYF",
  databaseURL: "https://dhaka-metro-exit-finder-default-rtdb.asia-southeast1.firebasedatabase.app"
};
