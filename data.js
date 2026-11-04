// Dhaka Metro Rail data. Edit this file to correct anything.
// conf: "high" = well established, "med" = likely right, "low" = best guess, please verify on site.
// Station coordinates are approximate (within ~100 m). Exit positions are generated from the
// station point and the direction the viaduct runs (axis, degrees from north), then labelled by side.

window.METRO = {
  updated: "2026-11-04",
  line: {
    name: "MRT Line-6",
    nameBn: "এমআরটি লাইন-৬",
    color: "#0b7a4b",
    operator: "Dhaka Mass Transit Company Limited (DMTCL)",
    lengthKm: 20.1,
    note: "Line-6 is the only line in service. The Motijheel to Kamalapur extension (1 more station) is under construction. MRT Line-1 (Airport / Purbachal) and Line-5 are under construction or planned."
  },

  // Timetable (source: trainjatri.com metro schedule page, last updated 24 Aug 2026).
  // DMTCL has changed hours several times; a Financial Express report (Oct 2025) gave Fri start 2:30 PM, last trip 10:10 PM.
  schedule: {
    source: "trainjatri.com, updated 24 Aug 2026 (verify with DMTCL)",
    days: {
      regular: { label: "Saturday to Thursday", fromNorth: ["06:30", "21:50"], fromMotijheel: ["07:15", "22:30"] },
      friday:  { label: "Friday", fromNorth: ["15:00", "21:50"], fromMotijheel: ["15:20", "22:30"] }
    },
    headway: "About every 6 to 8 min at peak hours, 10 to 12 min off-peak (approximate)",
    // Used to estimate where trains are when no rider is sharing live. Approximate, tune when DMTCL publishes exact headways.
    headwayMin: { peak: 8, offPeak: 10, peakHours: [["07:30", "11:00"], ["16:30", "20:30"]], fridayAllOffPeak: true },
    endToEndMin: 38
  },

  // fare = Tk 5 per km, rounded up to the next Tk 10, min Tk 20, max Tk 100 (official policy, 2022).
  // km = approximate chainage tuned to match the published Uttara North fare row.
  fare: {
    min: 20, max: 100, perKm: 5, passDiscount: 0.10,
    note: "Fares are calculated from the official fare policy and match the published Uttara North row. Other pairs can be off by Tk 10, so check the ticket machine."
  },

  stations: [
    { id: "uttara-north", code: "G1", name: "Uttara North", bn: "উত্তরা উত্তর", km: 0, lat: 23.8693, lng: 90.3672, axis: 175, opened: "2022-12-29",
      exits: [
        { side: "W", name: "West exit", toward: "Diabari, Uttara Depot side", conf: "low" },
        { side: "E", name: "East exit", toward: "Uttara Sector 15 / 16 side, Diabari Bottola", conf: "low" }
      ],
      landmarks: [
        { n: "Diabari Bottola", lat: 23.8700, lng: 90.3640 },
        { n: "Uttara Sector 15", lat: 23.8660, lng: 90.3725 },
        { n: "Uttara Sector 16", lat: 23.8640, lng: 90.3640 },
        { n: "Uttara Sector 18", lat: 23.8760, lng: 90.3660 }
      ]
    },
    { id: "uttara-center", code: "G2", name: "Uttara Center", bn: "উত্তরা সেন্টার", km: 1.6, lat: 23.8597, lng: 90.3654, axis: 178, opened: "2023-02-18",
      exits: [
        { side: "W", name: "West exit", toward: "Sector 16 / 17 side", conf: "low" },
        { side: "E", name: "East exit", toward: "Sector 13 / 14, toward main Uttara", conf: "low" }
      ],
      landmarks: [
        { n: "Uttara Sector 13", lat: 23.8640, lng: 90.3760 },
        { n: "Uttara Sector 14", lat: 23.8560, lng: 90.3720 },
        { n: "Uttara Sector 17", lat: 23.8560, lng: 90.3580 }
      ]
    },
    { id: "uttara-south", code: "G3", name: "Uttara South", bn: "উত্তরা দক্ষিণ", km: 3.2, lat: 23.8458, lng: 90.3634, axis: 180, opened: "2023-03-31",
      exits: [
        { side: "W", name: "West exit", toward: "Turag / Birulia road side", conf: "low" },
        { side: "E", name: "East exit", toward: "Uttara Sector 10 / 12, Rajlakshmi direction", conf: "low" }
      ],
      landmarks: [
        { n: "Uttara Sector 10", lat: 23.8500, lng: 90.3700 },
        { n: "Uttara Sector 12", lat: 23.8430, lng: 90.3690 },
        { n: "Mirpur–Uttara (Birulia) road", lat: 23.8430, lng: 90.3580 }
      ]
    },
    { id: "pallabi", code: "G4", name: "Pallabi", bn: "পল্লবী", km: 4.9, lat: 23.8265, lng: 90.3645, axis: 180, opened: "2023-01-25",
      exits: [
        { side: "W", name: "West exit", toward: "Pallabi, Mirpur Section 12 residential area", conf: "med" },
        { side: "E", name: "East exit", toward: "Mirpur DOHS, Mirpur Cantonment direction", conf: "med" }
      ],
      landmarks: [
        { n: "Mirpur 12 bus stand", lat: 23.8285, lng: 90.3650 },
        { n: "Pallabi Thana", lat: 23.8260, lng: 90.3610 },
        { n: "Mirpur DOHS", lat: 23.8345, lng: 90.3715 },
        { n: "Mirpur Cantonment", lat: 23.8370, lng: 90.3610 }
      ]
    },
    { id: "mirpur-11", code: "G5", name: "Mirpur 11", bn: "মিরপুর ১১", km: 5.8, lat: 23.8190, lng: 90.3655, axis: 175, opened: "2023-03-15",
      exits: [
        { side: "W", name: "West exit", toward: "Mirpur 11 bazar, Section 11 blocks", conf: "med" },
        { side: "E", name: "East exit", toward: "Section 11 Avenue side, Purobi direction", conf: "low" }
      ],
      landmarks: [
        { n: "Mirpur 11 bus stand", lat: 23.8190, lng: 90.3660 },
        { n: "Purobi Cinema", lat: 23.8220, lng: 90.3650 },
        { n: "Mirpur 11 Kacha Bazar", lat: 23.8180, lng: 90.3620 }
      ]
    },
    { id: "mirpur-10", code: "G6", name: "Mirpur 10", bn: "মিরপুর ১০", km: 6.9, lat: 23.8075, lng: 90.3685, axis: 170, opened: "2023-03-01", transfer: "Future interchange with MRT Line-5 (North)",
      exits: [
        { side: "W", name: "West exit", toward: "Shah Ali Plaza, Mirpur 2 / Stadium road, Mirpur 1", conf: "med" },
        { side: "E", name: "East exit", toward: "Mirpur 10 roundabout east side, Mirpur 14 / Kachukhet road", conf: "med" }
      ],
      landmarks: [
        { n: "Mirpur 10 Golchattar (roundabout)", lat: 23.8069, lng: 90.3687 },
        { n: "Shah Ali Plaza", lat: 23.8080, lng: 90.3660 },
        { n: "Sher-e-Bangla Cricket Stadium", lat: 23.8069, lng: 90.3633 },
        { n: "Mirpur 2", lat: 23.8045, lng: 90.3610 },
        { n: "Mirpur 14", lat: 23.7985, lng: 90.3830 },
        { n: "Mirpur 1", lat: 23.7955, lng: 90.3535 }
      ]
    },
    { id: "kazipara", code: "G7", name: "Kazipara", bn: "কাজীপাড়া", km: 7.9, lat: 23.7975, lng: 90.3722, axis: 160, opened: "2023-03-15",
      exits: [
        { side: "W", name: "West exit", toward: "Kazipara, Senpara Parbata side", conf: "med" },
        { side: "E", name: "East exit", toward: "Ibrahimpur, Kafrul side", conf: "med" }
      ],
      landmarks: [
        { n: "Kazipara bus stop", lat: 23.7975, lng: 90.3720 },
        { n: "Senpara Parbata", lat: 23.7995, lng: 90.3690 },
        { n: "Ibrahimpur", lat: 23.7960, lng: 90.3830 },
        { n: "Kafrul", lat: 23.7905, lng: 90.3835 }
      ]
    },
    { id: "shewrapara", code: "G8", name: "Shewrapara", bn: "শেওড়াপাড়া", km: 9.0, lat: 23.7902, lng: 90.3755, axis: 160, opened: "2023-03-31",
      exits: [
        { side: "W", name: "West exit", toward: "West Shewrapara, Pirerbag", conf: "med" },
        { side: "E", name: "East exit", toward: "East Shewrapara, Kafrul / Taltola side", conf: "med" }
      ],
      landmarks: [
        { n: "Shewrapara bus stop", lat: 23.7902, lng: 90.3757 },
        { n: "Pirerbag", lat: 23.7925, lng: 90.3680 },
        { n: "East Shewrapara", lat: 23.7880, lng: 90.3810 }
      ]
    },
    { id: "agargaon", code: "G9", name: "Agargaon", bn: "আগারগাঁও", km: 10.6, lat: 23.7780, lng: 90.3805, axis: 165, opened: "2022-12-29",
      exits: [
        { side: "W", name: "West exit", toward: "IDB Bhaban, Bangladesh Betar, Passport Office, Election Commission, ICT Tower", conf: "med" },
        { side: "E", name: "East exit", toward: "Taltola, West Kafrul", conf: "med" }
      ],
      landmarks: [
        { n: "IDB Bhaban", lat: 23.7778, lng: 90.3775 },
        { n: "Bangladesh Betar", lat: 23.7795, lng: 90.3770 },
        { n: "Passport Office (Agargaon)", lat: 23.7748, lng: 90.3765 },
        { n: "Election Commission (Nirbachon Bhaban)", lat: 23.7765, lng: 90.3730 },
        { n: "Bangladesh Bureau of Statistics", lat: 23.7762, lng: 90.3755 },
        { n: "Dhaka Shishu Hospital", lat: 23.7738, lng: 90.3700 },
        { n: "Taltola", lat: 23.7800, lng: 90.3860 }
      ]
    },
    { id: "bijoy-sarani", code: "G10", name: "Bijoy Sarani", bn: "বিজয় সরণি", km: 11.8, lat: 23.7660, lng: 90.3835, axis: 165, opened: "2023-12-13",
      exits: [
        { side: "W", name: "West exit", toward: "Chandrima Udyan, National Parliament (Sangsad Bhaban)", conf: "med" },
        { side: "E", name: "East exit", toward: "Novo Theatre / Planetarium, Military Museum, Tejgaon / PM's Office", conf: "med" }
      ],
      landmarks: [
        { n: "National Parliament (Sangsad Bhaban)", lat: 23.7625, lng: 90.3780 },
        { n: "Chandrima Udyan", lat: 23.7665, lng: 90.3800 },
        { n: "Bangabandhu Novo Theatre", lat: 23.7690, lng: 90.3865 },
        { n: "Bangladesh Military Museum", lat: 23.7680, lng: 90.3880 },
        { n: "Prime Minister's Office (Tejgaon)", lat: 23.7690, lng: 90.3910 }
      ]
    },
    { id: "farmgate", code: "G11", name: "Farmgate", bn: "ফার্মগেট", km: 12.6, lat: 23.7575, lng: 90.3892, axis: 160, opened: "2023-12-05",
      exits: [
        { side: "W", name: "West exit", toward: "Khamarbari, Indira Road, Ananda Cinema, Green Road", conf: "med" },
        { side: "E", name: "East exit", toward: "Tejgaon College, Holy Cross College, Tejturi Bazar", conf: "med" }
      ],
      landmarks: [
        { n: "Khamarbari", lat: 23.7590, lng: 90.3865 },
        { n: "Ananda Cinema Hall", lat: 23.7578, lng: 90.3880 },
        { n: "Indira Road", lat: 23.7590, lng: 90.3840 },
        { n: "Green Road", lat: 23.7530, lng: 90.3860 },
        { n: "Tejgaon College", lat: 23.7565, lng: 90.3910 },
        { n: "Holy Cross College", lat: 23.7550, lng: 90.3920 }
      ]
    },
    { id: "karwan-bazar", code: "G12", name: "Karwan Bazar", bn: "কারওয়ান বাজার", km: 14.2, lat: 23.7505, lng: 90.3928, axis: 165, opened: "2023-12-31", transfer: "Future interchange with MRT Line-5 (South)",
      exits: [
        { side: "W", name: "West exit", toward: "Panthapath, Bashundhara City, Square Hospital", conf: "med" },
        { side: "E", name: "East exit", toward: "Karwan Bazar market, TCB Bhaban, media houses", conf: "med" }
      ],
      landmarks: [
        { n: "Bashundhara City", lat: 23.7510, lng: 90.3905 },
        { n: "Square Hospital", lat: 23.7528, lng: 90.3818 },
        { n: "Karwan Bazar kitchen market", lat: 23.7520, lng: 90.3955 },
        { n: "TCB Bhaban", lat: 23.7522, lng: 90.3950 },
        { n: "Pan Pacific Sonargaon", lat: 23.7478, lng: 90.3925 }
      ]
    },
    { id: "shahbagh", code: "G13", name: "Shahbagh", bn: "শাহবাগ", km: 15.6, lat: 23.7385, lng: 90.3958, axis: 175, opened: "2023-12-31",
      exits: [
        { side: "W", name: "West exit", toward: "BSMMU (PG Hospital), Katabon, National Museum", conf: "med" },
        { side: "E", name: "East exit", toward: "Ramna Park, Dhaka Club, Shishu Park, InterContinental", conf: "med" }
      ],
      landmarks: [
        { n: "BSMMU (PG Hospital)", lat: 23.7390, lng: 90.3945 },
        { n: "National Museum", lat: 23.7375, lng: 90.3945 },
        { n: "Katabon", lat: 23.7395, lng: 90.3900 },
        { n: "Ramna Park", lat: 23.7385, lng: 90.4005 },
        { n: "Charukala (Fine Arts)", lat: 23.7362, lng: 90.3958 },
        { n: "InterContinental Dhaka", lat: 23.7420, lng: 90.3985 }
      ]
    },
    { id: "dhaka-university", code: "G14", name: "Dhaka University", bn: "ঢাকা বিশ্ববিদ্যালয়", km: 16.6, lat: 23.7330, lng: 90.3962, axis: 150, opened: "2023-12-13",
      exits: [
        { side: "W", name: "West exit", toward: "TSC, Raju Sculpture, Nilkhet, Arts Faculty", conf: "low" },
        { side: "E", name: "East exit", toward: "Suhrawardy Udyan, Bangla Academy", conf: "low" }
      ],
      landmarks: [
        { n: "TSC", lat: 23.7330, lng: 90.3955 },
        { n: "Suhrawardy Udyan", lat: 23.7335, lng: 90.3995 },
        { n: "Bangla Academy", lat: 23.7318, lng: 90.3982 },
        { n: "Nilkhet", lat: 23.7330, lng: 90.3870 },
        { n: "Shaheed Minar / Dhaka Medical", lat: 23.7262, lng: 90.3975 },
        { n: "Curzon Hall", lat: 23.7268, lng: 90.4022 }
      ]
    },
    { id: "secretariat", code: "G15", name: "Bangladesh Secretariat", bn: "বাংলাদেশ সচিবালয়", km: 17.6, lat: 23.7298, lng: 90.4068, axis: 95, opened: "2023-12-05",
      exits: [
        { side: "N", name: "North exit", toward: "Bangladesh Secretariat, Topkhana Road, Press Club", conf: "low" },
        { side: "S", name: "South exit", toward: "High Court, Doel Chattar, Shishu Academy", conf: "low" }
      ],
      landmarks: [
        { n: "Bangladesh Secretariat", lat: 23.7310, lng: 90.4080 },
        { n: "National Press Club", lat: 23.7300, lng: 90.4100 },
        { n: "High Court", lat: 23.7285, lng: 90.4030 },
        { n: "Baitul Mukarram Mosque", lat: 23.7290, lng: 90.4130 },
        { n: "Gulistan / Zero Point", lat: 23.7255, lng: 90.4110 }
      ]
    },
    { id: "motijheel", code: "G16", name: "Motijheel", bn: "মতিঝিল", km: 19.0, lat: 23.7280, lng: 90.4185, axis: 90, opened: "2023-12-05",
      exits: [
        { side: "N", name: "North exit", toward: "Bangladesh Bank, Arambagh, Notre Dame College", conf: "low" },
        { side: "S", name: "South exit", toward: "Dilkusha, Shapla Chattar, Biman Bhaban", conf: "low" }
      ],
      landmarks: [
        { n: "Shapla Chattar", lat: 23.7272, lng: 90.4210 },
        { n: "Bangladesh Bank", lat: 23.7290, lng: 90.4195 },
        { n: "Dilkusha", lat: 23.7268, lng: 90.4165 },
        { n: "Arambagh", lat: 23.7312, lng: 90.4180 },
        { n: "Notre Dame College", lat: 23.7305, lng: 90.4215 },
        { n: "Kamalapur Railway Station", lat: 23.7320, lng: 90.4262 },
        { n: "Bangabandhu National Stadium", lat: 23.7270, lng: 90.4135 }
      ]
    }
  ],

  info: [
    { h: "Tickets", items: [
      "Single Journey Ticket (token) from ticket machines or counters. Valid for the trip you bought it for on the same day.",
      "MRT Pass or Rapid Pass (stored value card): 10% discount on every fare. Tap in and tap out.",
      "MRT Pass is about Tk 500 including a Tk 200 refundable deposit (verify at the counter).",
      "Keep your ticket until you exit. You need it to open the exit gate."
    ]},
    { h: "On board", items: [
      "One coach on every train is reserved for women.",
      "Priority seats for older people, people with disabilities, pregnant women and children.",
      "No eating, smoking or littering inside stations or trains.",
      "Large luggage and hazardous items are not allowed."
    ]},
    { h: "Getting out of the right exit", items: [
      "Check this app before your train reaches the station, then walk to the end of the platform nearest your exit staircase.",
      "Most Line-6 stations sit over the middle of the road. The concourse has exits down to both sides, so choosing the right side saves you crossing a busy road.",
      "Exit signs inside the station show the exit letter or number and the area. If they differ from this app, tap Fix this exit to save the real name on your phone."
    ]}
  ]
};
