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
The ring rotates continuously, supports mouse/touch rotation and returns
smoothly to its original camera trajectory after release. No play/pause UI.
The completed setting screen opens the same ring in Final. PNG export of the
current pose works in the browser at 1500 pixels wide. The email form is a
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
