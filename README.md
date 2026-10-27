# Diamond Games

[Play the prototype](https://boomalive.github.io/diamond-games/)

Three browser mini games: mining, polishing and setting a diamond.
The published site is public and does not require a GitHub account.
The working branch is `diamond-games`.

## Loading

The navigation loads one game on first entry. Polishing requests only four
lossless WebP images for the selected shape. Setting loads only the selected
ring iframe and its progressive frame buffer; no other rings are prefetched.
There is no background collection download or service worker.
All accepted artwork and gameplay are preserved.

## Repository and local preview

Readable game templates and scripts are in `source/`. The four root HTML files
are the prebuilt web edition. The ZIP files in `packages/` contain the
static deployment, including its image folders, split below the web upload limit.
These archives are used during publication and are never requested by the game.

To prepare the full site and view it locally:

    python3 scripts/prepare-site.py
    python3 -m http.server 8000 --directory _site

Open http://localhost:8000. GitHub Pages runs the same preparation step and
publishes the resulting files. Publication has read-only repository access;
it never commits or pushes repository changes.

## Privacy and indexing

Repository, branch, description and page titles use neutral names.
All HTML pages include noindex, nofollow, noarchive and nosnippet directives.
The source and website remain public; these directives are not access control.

Manrope and Lottie licenses are included. Frame artwork is not recompressed.
