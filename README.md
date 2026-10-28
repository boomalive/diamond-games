# Diamond Games

[Open the prototype](https://boomalive.github.io/diamond-games/)

Four tabs: mining, polishing, setting a diamond, and a finished 3D ring.
Public preview, no account required. Working branch: `diamond-games`.

## Loading

Each screen loads on first entry. Polishing requests four lossless WebP images
for the selected shape. Setting loads only one chosen ring frame sequence.
Final loads only the selected viewer and its original GLB. Changing the model
destroys the previous viewer iframe. Hidden 3D screens stop rendering.
No collection is prefetched and no archives are downloaded by the client.

## Final screen

The final screen follows design frame 366:3415. The supplied 16-ring v12-v3
collection keeps its GLBs, materials, lighting and refraction shaders.
The tilted ring turns about its own local Y axis, matching the original
collection catalogue. Each model fits its full turn inside the preview. Mouse/touch
rotation waits two seconds after release, then returns smoothly to its original
camera trajectory. A new grab cancels the pending return; the next release
starts a fresh two-second wait. Switching tabs pauses the countdown.
Scrolling shrinks the same live model beneath the fixed logo; scrolling back
restores its full size. Its GLB, WebGL context and rotation phase stay intact.
No play/pause UI. The setting and final admin ring pickers are temporarily hidden
pending approval. Their code is preserved; setting reset remains available.
The current main edition stays v13.
The completed setting screen opens the same ring in Final. PNG export of the
fixed three-quarter pose works in the browser at 1500 pixels wide. The email form is a
visual prototype and does not transmit personal data or send emails.

## Local preview and publication

Readable templates and scripts are in `source/`. The root HTML files are prebuilt.
The verified package manifest describes static archives and their byte parts.
These files are unpacked only when preparing the site, never in its frontend.

    python3 scripts/prepare-site.py
    python3 -m http.server 8000 --directory _site

Open http://localhost:8000. GitHub Pages uses the same preparation step.
Publication has read-only repository access and never commits changes.

All HTML pages request noindex, nofollow, noarchive and nosnippet.
Repository and website remain public; these directives are not access control.
Manrope, Lottie and the 3D viewer library license files are included.

## Client adjustments · 2026-10-28

Edition stays v13; document revision 13-20261028-3. The initial final camera
uses the agreed catalogue pose. PNG export always uses that fixed pose and
restores the live camera afterward. Only LR2882BR01 uses the frontal setting
trial, centred while inserting, then returning to the original final angle.
The last 31 frames are reused byte for byte. Its admin angle selector compares
Previous and New; ring selection stays hidden. Other ring modules and all
GLBs are unchanged. Explanatory copy is corrected.

## Current polishing images · 2026-10-28

The second image (30% state) for each shape now uses the user's attached
круг 2.png, овал 2.png, квадрат 2.png and прямоугольник 2.png from the folder
доработка этапа огранки. These supersede the previously generated sets.
Supplied 2000×2000 RGBA pixels are retained exactly in verified lossless
WebP, 40.1% smaller than the PNG originals. All other image states, layout
and mechanics remain unchanged; only the selected shape loads.
Polishing document revision: 13-20261028-7. Main edition stays v13.

## Final turntable adjustment · 2026-10-28

Final document and viewer revision: 13-20261028-5; edition stays v13. The
reference is the original ring-collection-v12-v1 catalogue, LR5600BR01.
Camera and tilt are retained; autoplay follows each ring's own local Y axis.
A constant per-ring scale is calculated from all vertices over the full turn,
keeping the model inside the preview and above the specifications. This
viewer fit preserves the existing fixed 1500-pixel PNG export. The two-second
inspection pause, smooth return and compact scrolling are unchanged.

## Parallel curved tweezers · 2026-10-28

The New setting variant for LR2882BR01 uses frontal v5: constant-width parallel
steel jaws, short curved noses projecting past the stone contact points, and
bright silver reflections. Ring and diamond studio, metadata, interaction
runtime and gesture are preserved; frames 78–126 are reused byte for byte
from v2. The Previous option remains the original setting module. Other 15
rings, polishing and final 3D stay unchanged. Setting revision: 13-20261028-9;
the main edition stays v13. Intermediate v3/v4 candidates were not published.

## Mobile gestures · 2026-10-28

Polishing and setting document revision: 13-20261028-10; main edition stays v13.
The shared host and both embedded game screens suppress native page panning.
A scoped non-passive touch guard on each actual game surface supports nested
frames in mobile Safari. The selected setting module is versioned with its
host so cached HTML receives the fix. Canonical frames, sequence metadata,
polishing mechanics and 3D assets are unchanged. Final retains its scrollable
form and shrinking live viewer.

Verified using native mobile Chromium touch input at 375×667 and 320×568,
and WebKit pointer interaction plus touch-default prevention at 390×664.
