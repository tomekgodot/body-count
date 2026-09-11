# Body Count PWA v1.3

A local-first prototype focused on people first, encounters second.

## v1.3
- Home "Latest additions" now means people, not encounters.
- Collection has search by name / Mental Note.
- Person profile is now a real hub: identity, Mental Note, average rating, repeat count, optional detail modules, and encounter history.
- Encounters open into their own compact detail view.
- Optional details can be edited later from the person profile, not only immediately after adding someone.
- Existing local IndexedDB data is preserved.
- No backend, no account, no analytics.


## v1.4
- Shazam-style home: one central BC action only
- New bottom nav: Count / People / Insights / You
- Brand palette and BC artwork integrated as the visual anchor
- No latest additions or stats on the first screen


## v1.5
- Count home now uses a circular brand button.
- Added a pulsing + action badge and a subtle breathing animation.
- Added a single CTA label: ADD SOMEONE.
- Tap feedback contracts the button and fades the + before Quick Add.


## v1.6
- Home now uses only peach + eggplant, no BC letters.
- The main circle breathes slowly; the + pulses faster.
- Clear “Tap to add someone” hint points to the action.
- Softer blur/scale transition into Quick Add.


## v1.7
- Home title BODY COUNT
- Removed tap hint
- Softer, larger fruit artwork inside the breathing action
- Faster service-worker takeover during development


## v1.8
- Removed the circular container from the Home action
- Peach + eggplant form one large tappable composition
- Independent breathing motion and faster pulsing + badge
- BODY COUNT remains at the top


## v1.9
- COUNT home is now full black, edge to edge
- No circle/container behind the fruit composition
- Light BODY COUNT wordmark at top
- Dark translucent four-item bottom navigation
- Peach, eggplant and pulsing plus float directly on the black canvas


## v2.0
- Removed the legacy circular action background completely
- Switched the entire app to a consistent dark theme
- Fruits and plus float directly on the black canvas
- Dark cards, inputs, navigation and detail screens


## v2.1
- Symmetrical peach/eggplant home composition
- Plus moved to the visual center
- Fixed bottom navigation alignment and spacing
- Simplified Quick Add to name, memory, rating and one ADD action
- Repeat encounter moved behind a subtle 'Already in your count?' link


## v2.2
- Mirrored eggplant so the fruit composition closes around the center
- Added explicit MENTAL NOTE label
- Replaced star rating with a clear 1–5 numeric rating control


## v2.3
- Removed the MENTAL NOTE label
- Memory cue is now the in-field placeholder: “What you’ll remember him by…”


## v2.4
- Eggplant mirrored/rotated inward to hug the peach
- Fruit artwork softened and made more translucent
- Exact placeholder: “What you’ll remember him by…”
- Replaced numeric rating with five satisfaction faces


## v2.5
- Removed the HOW WAS IT? heading above the mood rating for a cleaner Quick Add screen


## v2.6
- Restored star rating
- Stars use the same full-width five-column layout as the previous mood faces


## v2.7
- Reoriented the eggplant on the home screen so its curve opens to the right and visually hugs the peach


## v2.8
- Post-add reduced to ABOUT HIM and ENCOUNTER
- New ABOUT HIM progressive screen: age, height, build/weight, type
- Optional anatomy details hidden behind 🍆 🍑 💦
- ENCOUNTER continues into the existing encounter-detail flow for now


## v2.9
- Rebuilt ABOUT HIM as AGE / BODY / TYPE visual carousel
- AGE supports broad shortcuts and exact slider
- BODY combines height and build, including two-dimensional touch gesture
- TYPE is a selectable visual carousel with multi-select
- 🍆 🍑 💦 stay persistently available below the visual editor


## v3.0
- Cumulative star rating fill
- Age exact/category modes with contextual category highlight
- Vertical height control and horizontal exact weight
- Build as categorical alternative to exact weight
- Circular continuous TYPE wheel with blended archetypes


## v3.0.1
- Fixed cumulative star highlighting
- Removed SAVE from About Him
- About Him now autosaves selections/changes immediately
- Bumped service worker cache


## v3.1
- Height labels moved off the slider rail
- Height and build are shown together above the figure
- Build simplified to Slim / Average / Athletic / Big
- Weight range changed to 50–110 kg, with 80 kg at midpoint


## v3.2
- TYPE now uses a single stylized central portrait only
- Removed any thumbnail-like visual treatment around category anchors
- Stronger archetype differentiation: blond/younger Twink, darker Otter, grey Daddy, broader fuller-bearded Bear
- Dot remains the only moving control around the wheel
