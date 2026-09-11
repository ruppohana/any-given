# Hero crops - "cutout-narrow" (kept on Jason's word, 2026-09-11)

"yes, do the wider crop, but keep this as well in case i want to come back to it."

These three are the hero images as shipped in commit `aeffe37` ("Home hero: stadiums cut out onto
the page, taller, text below it"): each source render in `art/hero/` keyed out of its white
background (flood fill from the edges, threshold 244, softened edge), then cropped
`left 180, top 0, 1200 x 720` with 80px of transparent air added on top -> 1200 x 800 WebP with alpha.

To go back: copy these three files over `public/hero/hero-1..3.webp`, ship, commit. The CSS that
went with them (300px hero, `object-position: 50% 0%`, fade on the bottom 28%) is unchanged by the
wider crop, so nothing else moves.
