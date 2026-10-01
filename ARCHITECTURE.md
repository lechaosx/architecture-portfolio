# Architecture

Why the code is shaped the way it is. Each decision is tagged:

- **[Explicit]** — the user asked for this by name, or chose it when offered.
- **[Implicit]** — Agent proposed it and the user did not push back.

See [FEATURES.md](FEATURES.md) for _product_ decisions (why it behaves this
way). See [AGENTS.md](AGENTS.md) for how these docs are kept honest.

---

## Hosting & delivery

### Static site, no server — [Implicit]

Everything renders to static HTML/CSS at build time; there is no runtime backend.
This follows directly from the explicit choice to host on GitHub Pages, which
serves files only. It is also what makes the site fast and cheap.

### Host: GitHub Pages — [Explicit]

The user asked to host on GitHub Pages "ideally". This constrains several other
decisions (static output, the CMS auth story, the deploy workflow).

### Hosting: custom domain at the root — [Explicit]

The site is served from a single custom domain at the root (`/`). The user first
asked that the GitHub Pages project URL (`https://<owner>.github.io/<repo>/`)
work too, but later gave up dual-URL support to keep the setup simple. Choosing
the root as the only mount point is what makes the code simple:

- There is **no `base`** to configure — at the root, plain root-absolute paths
  (`/about`, `/uploads/…`, `/favicon.svg`) just work, both in `astro dev` and in
  the build. No `withBase()` helper, no per-target config, no dev override.
- **The custom domain is committed as `public/CNAME`** (a static file Astro
  copies to `dist/`). No build hook generates it.
- `astro.config.mjs` sets a single hardcoded `site` (the canonical origin),
  registers the Svelte, sitemap, and Tailwind integrations, and keeps `.direnv`
  out of the dev file watcher (see "Dev environment") — nothing else.
- `site` feeds only the sitemap's absolute URLs (SEO — see below).

Trade-off given up: the bare `*.github.io/<repo>/` URL doesn't serve correctly on
its own (its assets would need a `/<repo>/` prefix). This is fine because once the
custom domain is configured, GitHub Pages 301-redirects that URL to the domain, so
visitors still land in the right place.

### CI/CD: GitHub Actions → Pages — [Explicit]

`.github/workflows/deploy.yml` runs static analysis, unit tests, and Chromium and
Firefox interaction tests, builds with `withastro/action` (with npm),
and deploys via `actions/deploy-pages`; a push to `master` is the trigger. Pushes
whose complete diff is confined to `src/content/**` and `public/uploads/**` skip
the test steps but still build and deploy, keeping CMS edit cycles short while
retaining Astro content validation and responsive-image generation. Mixed
changes and manual workflow runs execute the full suite. The test job and Astro
build action share the same `node_modules/.astro` cache key, so the browser-test
prebuild populates the cache consumed by the deployment build.

### Browser tests bring their own carousel pages — [Implicit]

The shipped content need not contain a carousel, so the carousel tests run
against test-only pages (`src/pages/[fixture].astro`) that render the carousel
components with placeholder uploads. They are built only when `E2E_FIXTURES`
is set; the deployment build never sets it, so they never reach the site.

---

## Framework & language

### Static site generator: Astro — [Implicit]

Proposed as the best fit for an image-heavy, mostly-static portfolio: ships zero
JS by default, supports partial hydration ("islands"), first-class Markdown
content. The user accepted the recommended stack without pushback.

### Language: TypeScript — [Explicit]

Chosen from the offered options (over plain JavaScript). Uses Astro's `strict`
tsconfig. `npm run check` runs Astro's project checker across Astro, Svelte,
TypeScript, and JavaScript sources and fails on errors, warnings, or hints. The
tsconfig also checks JavaScript and reports unused or unreachable code so config
files and scripts are held to the same zero-diagnostic rule. The content schema
in `src/content.config.ts` is the main place types earn their keep — [Explicit].

### Runtime / package manager: Node and npm — [Explicit]

The user chose Node and npm. Node 24, an LTS line, runs the TypeScript
scripts directly by stripping their types; the image script
therefore imports local modules with their `.ts` extensions. Unit tests run
under Vitest. Used only at build/dev time — nothing runtime-specific ships to
production.

### Dev environment: minimal Nix flake — [Explicit]

`flake.nix` provides Node 24 (with npm), the pinned Playwright browser package,
and util-linux (for `flock`) for `x86_64-linux`. It sets only the browser path
needed by the test runner and has no description. `.gitignore` was likewise
trimmed on request.

The dev server's file watcher ignores `.direnv` — [Explicit]. direnv links the
flake's inputs, including the whole nixpkgs source tree, into
`.direnv/flake-inputs`; watching through those links would hold about 127,000
files open and add several seconds to dev-server startup.

---

## Interactivity

### Islands architecture (mostly static, hydrate the exceptions) — [Implicit]

Pages are static HTML; only components that need to run in the browser are
hydrated. This keeps the JS payload tiny.

### Interactive components in Svelte — [Explicit]

The user chose Svelte for the interactive parts. In practice that is a single
island today (`src/components/Gallery.svelte`, the lightbox), composed of child
components and plain TypeScript modules (see "Lightbox structure").

### The lightbox is the only browser-side JS — [Implicit]

`Gallery.svelte` (the project image lightbox) is the sole hydrated island
(`client:load`). Loading it with the project page lets a pasted image hash open
without waiting for an image trigger to enter the viewport; OpenSeadragon still
loads only when a tiled image is opened. `ProjectBlocks.astro` renders those
triggers on the server; the island attaches their lightbox behavior at load so
multiple blocks still share one dialog and navigation state. The only other
browser JS is a few tiny first-party vanilla scripts (reveal-on-scroll, the home
and project image-set carousels, the language switch, and the project-cover
transition direction). Native
cross-document View Transitions add no client router or framework runtime.
Images up to 4096 px use local transforms constrained to the image stage;
larger images lazy-load OpenSeadragon as a separate chunk and use its tiled
canvas. The stage fills the viewport and holds no text, so image selection and
apparent size depend only on the viewport and the image's aspect ratio. Both
rendering paths support pointer-centred wheel zoom, double-click and double-tap
zoom, key zoom, touch pinch and pan, and constrain maximum zoom to native image
detail. At and below the base scale, horizontal mouse and one-finger gestures
drive the same animated navigation. Svelte's window primitives update image
selection when viewport size or display density changes; a live media query
applies reduced-motion changes immediately. Gesture distance remains separate
from its rendered
offset so reduced-motion swipes can retain their navigation threshold without
moving the slide. Previous, current, and next processed previews are
neighboring DOM slides rather than an explicit JavaScript cache;
one translation moves them as a continuous strip, each slide sized to its own
rest view. Image gesture listeners remain confined to the stage; elements marked
`data-lightbox-scroll` (the set strip and the description) keep native
scrolling while the surrounding dialog contains page-scroll gestures. A visually
hidden live status element reports the current gallery position.

Images with the same non-empty `comparison_set` fill the set strip; otherwise a
titled image fills it alone. The single-row strip occupies the space left of the
close button and scrolls horizontally when its intrinsic width exceeds that
area. Its wheel handler maps the dominant wheel delta to `scrollLeft` and
consumes the event, while native horizontal touch panning remains enabled. A
reactive effect in `LightboxControls` centres the active button after opening,
switching images, or switching language, since the labels change width with
it. While a set member is active, the zoom ceiling is the minimum
`nativeZoomScale` across the set's responsive sources.

### Lightbox structure — [Explicit] (seams [Implicit])

The lightbox is split along the concepts the product has, each unit with one
purpose and a small interface, so each can be read without the others:

| Unit | Owns |
|------|------|
| `Gallery.svelte` | The lightbox as a whole and its state: open, the current image, its view (scale and pan), its side, the address; the strip of slides and where it rests; how far open it shows and the thumbnail it opens from; a live drag and what it grabbed; the stage size, language and motion preference; the derived sources, sizes and zoom range; keys and the focus trap; composing the parts below. |
| `lightbox-gestures.ts` | The gesture interpreter: a DOM-free state machine that turns mouse, touch, wheel, double-click and zoom-key input into intents (claim the event, a mouse gesture starting or ending, set the view, zoom about a point, a live drag at rest, commit or settle a drag, and a live drag on the text that turns the card, completing or keeping that turn). It holds the one live gesture and the tap record, every threshold, and the one rule for when zoom input is ignored. |
| `LightboxCard.svelte` | One card and how it looks while it changes: its images stacked as layers, the blend and the turn it chases from where they are on screen, waiting for a layer's drawing, what a drag grabbed of it, its front (the drawing, or the tiled canvas over its preview), its back (`LightboxVerso`), and all the CSS that turns, blends and zooms them. |
| `LightboxVerso.svelte` | The back's scrolling viewport and the card's fit to its text. |
| `LightboxTiles.svelte` | The OpenSeadragon viewer's lifecycle and syncing its viewport to a card's view. |
| `LightboxControls.svelte` | The corner controls and set strip, as markup with props and callbacks, their shared control styles, and the edge arrows stepping aside as far as they are told. |
| `lightbox-history.ts` | The `#image-N` history entry: push, replace (a run of changes at a rate browsers accept), Back/Forward, closing, a linked hash on load, and scroll-restoration suspension. |
| `gallery.ts` | The pure lightbox geometry, image-selection and motion maths shared by the units: where a slide or layer goes when a change arrives mid-move, how long a move takes from where it is, the easings, and where the opening puts the card between its thumbnail and rest. |

The seams sit where state and responsibility actually divide. Input
interpretation needs only the view, the zoom range and the side shown, so it is
a plain class with unit tests (`lightbox-gestures.test.ts`) and no knowledge of
the DOM; the component feeds it stage-centred points and applies the intents,
since applying them (clamping the pan, grabbing the strip or the card from
where they are on screen) depends on lightbox state and the page. The cursor's
grabbing state is set only by the interpreter's `grab` intents, so it cannot
drift from the live gesture. A change of image stays in `Gallery.svelte`
because it moves the index, view, side, strip and address together; how a card
shows the change stays in the card, which sees only the image it is on, its
side, its view and a live drag, so the same card works as the current one, as
one sliding away, and as one the lightbox comes back to. The tiled viewer and
the controls receive data and report back through props, bindings and
callbacks, so none of them reads another's state. What an image shows on its
card (its size, title, description and pyramid) does not depend on the view and
is derived apart from its source URL, which does; so panning and zooming update
only the image sources and the view, never the backs, the set strip or its
scroll position. History is browser-API glue with its own invariants, called
from a few points in the component and unit-tested against a fake session
history (`lightbox-history.test.ts`); the travel, timing, easing and opening
geometry in `gallery.ts` are tested against their own cases
(`gallery.test.ts`).

### State changes instantly; the visuals chase it — [Explicit] (model [Implicit])

The owner's rule (AGENTS.md → "Known invariants to protect"): input is never
ignored, queued or delayed because something is animating, and a move sent
somewhere new carries on from where it is on screen. The carousels hold it with
a kept slide index (see "Home-page carousel"); cross-document page transitions
are the one accepted exception (see "Page transitions"). The lightbox holds this
by construction: its **state** — open, the current image, its side, its view and
the address — changes the moment input arrives, and nothing waits for an
animation to end before state settles. Its **visuals** are derived from state
and each is one number that a Svelte `Tween` (`svelte/motion`) chases from its
value on screen towards the target:

| Visual | Number | Where |
|--------|--------|-------|
| The strip | its position, in slides | `Gallery.svelte`, drawn as the strip's translation |
| The lightbox opening | how far open it shows, 1 at rest | `Gallery.svelte`, drawn as the backdrop and the controls' opacity |
| The card opening | where it is between its thumbnail (0) and rest (1), and how far it has faded in | `Gallery.svelte`, drawn as a transform, a clip and an opacity of the stage's contents |
| A card's blend | the layer it rests on | `LightboxCard.svelte`, drawn as each layer's opacity |
| A card's turn | 1 text side up | `LightboxCard.svelte`, as `--lightbox-turn` |
| A card's shown view | the drawing's view as shown | `LightboxCard.svelte`, as `--lightbox-view-*` |

The phone's edge arrows are not chased on their own: they step aside by the
turn of each card on screen, weighted by how much of it the strip shows, so
they are in step with what shows by construction, a turn and a slide alike.

A tween's `current` is the value on screen, so a change reads where things are
exactly, with no style reads, and `set(target, { duration })` moves on from
there; a duration given as a function of where the move starts and ends gives
it the share of a whole move it has to go (`settleDuration` in `gallery.ts`,
never more than a whole one). Numbers set in the same update with the same
duration and easing move in step by construction: a card's blend and turn take
one duration, so a blend from the text is edge-on halfway through both. A
tween times a move from when it is set but starts it from its value at its
next frame, which a move under way would first carry on, so a move is stopped
where it is before it is sent on (`moveOn`); and a card's move sent on while
under way eases out, so it moves on at once rather than stalling, as the card's
own ease-in-out would by starting again from standing. A drag, and reduced motion, set a number with no
duration, so it follows the
finger or changes at once; with reduced motion the same state changes happen at
the same moments, and a turn is a short crossfade of the faces derived from the
turn itself. The easings are CSS's cubic béziers (`cubicBezier` in
`gallery.ts`), and the numbers reach the DOM as styles and custom properties,
from which CSS computes the rest: each face's angle and the view it is drawn
at. Tweens run in JavaScript each frame rather than as CSS transitions because
a CSS transition's start cannot be read or timed exactly: browsers start a
retargeted one from the value on screen at moments a frame apart, and each
shortens one sent back its own way, where a tween starts from exactly the value
it holds, the same in both browsers. A move counts from the input that starts
it and shows first a frame after.

**The strip.** Slides sit at integer positions along one strip, which rests
with the current image's slide on screen (`at`). A change to another card puts
the target's slide one position on in the way the change travels, but never
more than one past what is on screen (`slidePosition`): a card changed away
from before it came into view is never shown, and a fast run of changes
travels to the last one without racing through the rest or loading them. A
slide on screen keeps its image, so one holding another is passed over. Slides
are rendered in the order they were made and never moved in the page, because
moving an element in the page loses its scroll position, a card's reading
position among it. The slide the
lightbox leaves keeps its card with what it last showed (its image, side and
view: a card left text side up slides away showing its text, a zoomed one
stays zoomed and clipped to its slide), and its running blend or turn goes on;
the arriving card is the current one from the start, so the controls, the
toggle and zooming act on it while it slides in. A card the strip comes back to
while it is still on screen becomes current again and eases from how it was
left to how the current image is shown (drawing side up, at rest), which is
why the view has a tween of its own. Neighbours are plain previews; once the
strip rests on screen, it keeps only the current card and its two neighbours.

**The card.** Every image a card shows is a layer at an integer blend
position, stacked upwards, and each layer is fully shown once the blend
reaches its position (its opacity `clamp(0, mix − position + 1, 1)`), so
the layers below stay opaque and a blend never shows the backdrop. A change to
a variant reuses a layer on screen that already shows it, or layers the image
just above what is on screen (`layerPosition`), so a blend under way is never
cut: the new image fades in over whatever is showing, and an image changed away
from before it showed is never blended through. The back's card view that the
turn moves the drawing to is each layer's own, weighted by how much of the
drawing side each layer shows, so it moves with the blend too; a layer whose
image has no back fades the backs below it. Once the blend rests on a layer,
the layers it covers go. A layer's drawing must have loaded before the blend
moves to it (a drawing already loaded is `complete` as it enters the page, in
both browsers, so a cached one starts at once): until
then the card holds what it shows, its turn included, and so do the phone's
edge arrows, which follow the turn on screen; state and further input do not
wait. A tiled drawing draws its tiles once the card has come to rest on it,
since creating the tiled canvas mid-move stalls the main thread; until then it
shows its preview, which is what bounds the number of tiled viewers under
rapid changes. "At rest" is on screen: the strip and the opening have stopped
and the blend on screen has reached the layer, not merely been sent there.

**The turn's direction** changes only while the card rests on a side, where
both directions draw the same card, which the card reads from its turn on
screen; a turn sent elsewhere mid-way keeps the way it was
turning, so the card never jumps to its mirror image.

**Drags grab what is on screen.** A drag reads, when it begins, where the
strip, the blend and the turn are on screen, and moves them from there: a drag
that begins while the strip moves carries the strip either way; one at rest
towards a variant moves the blend on from where it is (towards a layer that
already shows that variant, or one layered above), and holds it where it is
towards a different card, whose side moves the strip; one on the text turns
the card from where it is, as a signed share of the way back to the drawing
whose sign is the way it rotates, so the way changes only as the finger passes
the text-up point. Released, each moves on to its target from where the drag
left it. The interpreter's offsets stay relative to where the finger went down; the
component and the card add what they grabbed.

### Lightbox soft inset and corner controls — [Explicit]

`lightboxAreas(viewport)` in `gallery.ts` is the single source of the lightbox
geometry. The corner gap is `clamp(8px, 1.2vmin, 16px)` and a control band is
gap + 40 px control + gap. The **rest area** (viewport minus the top and bottom
bands) is where an image fits at 100%; the **safe area** (also minus the side
bands) is what pan limits and the zoom floor respect. `clampPan` keeps an axis
that fits the rest area centred and lets a larger one slide until its edge
reaches the safe edge, so every part of a zoomed image can be pulled out from
under a control while a full-width rest view stays centred. `zoomFloor` lets the
scale drop below 1 until the rest image fits the safe area. The component hands
the gap, band, and control size to CSS as `--lightbox-gap`, `--lightbox-band`,
and `--lightbox-control` on the dialog, so the stylesheet never restates them.
A single `$effect` re-clamps scale and pan whenever the areas or the current
image change, covering resizes and phone rotation.

The controls (`LightboxControls.svelte`) are children of the dialog, outside the
stage and its card, so pan, zoom, swipe offset, the card's flip, and its `inert`
face never move or disable them, and the stage's pointer and touch handlers
never see their events. The stage isolates its image and card layers in their
own stacking context beneath the controls, so no z-index or blend inside it can
paint over them. The controls share the `.lightbox-control` box scoped to
`LightboxControls`: solid black, 40%-white border, white border on hover, and
inverted (white fill, black text, a 2 px black ring so it stays distinct over a
light card or drawing) when pressed, `aria-pressed`, or `aria-current`. The set
strip joins its buttons by overlapping their borders. The language switch reuses
the footer's `data-lang-toggle` markup, so Base.astro's delegated handler does
the switching and the island follows `data-lang`. Arrow icons are centred SVG
chevrons rather than text glyphs, whose font metrics sit them off-centre in the
box.

### Each lightbox image is a card; a comparison set is one card's variants — [Explicit]

The current slide is a card, `LightboxCard.svelte`: `[data-lightbox-sheet]`
inside `.lightbox-slide-current`, whose front face holds the drawing (responsive
or tiled: for an image with a pyramid the card renders the tiled canvas snippet
it is given with that pyramid's URL, so the card does not depend on
OpenSeadragon) and whose back face, present only when an image on it has a
description in the current language, is `LightboxVerso.svelte`. A card the
lightbox has changed away from stays a card while its slide is on screen; the
neighbouring slides are plain previews. The card takes the image it is on, the
way the latest change went, its side, the drawing's view, a live drag and the
variants a drag may blend to as props; it keeps its layers and hands CSS the
numbers on the sheet: `--lightbox-turn`, the turn on screen (1 text side up, 0
drawing up); `--lightbox-turn-direction` (1: turning back to the drawing
rotates the card leftwards, and turning over rotates it rightwards; −1 the
other way round); the drawing's view (`--drawing-*`, which the shown view
`--lightbox-view-*` follows); each layer's opacity from the blend (see "State
changes instantly; the visuals chase it"); and the back's card view (`--back-*`, each
layer's `cardView` of its card's scale and scroll, weighted by the blend; each
layer's back also has its own `--card-*`). From these the sheet derives the
shown view, the drawing view blended into the card view by the turn, and every
face is drawn at it: the images with `.lightbox-at-view`, the tiled canvas
(laid out by OpenSeadragon at the drawing view, not the shown one) with
`.lightbox-from-drawing`, and each back's card (laid out at its own card view)
with `.lightbox-card` in `LightboxVerso`, whose x terms are mirrored because the
card is seen from behind the front. The sheet itself does not turn: it sets one
perspective (`--lightbox-perspective`) and derives the front's and the back's
angles from the turn and its direction; the front face turns by its angle about the stage's
vertical centre line, and each back's card turns by the back's angle inside its
scroll container, whose content applies the same perspective seen from the
middle of the screen (`perspective-origin` follows the scroll). The scroll
container therefore stays in screen space and clips the card only to the screen
(less any scrollbar gutters); a scroller inside a turning face would clip in the
turned plane, to a shrunken copy of the screen. So both faces keep one outline
at every instant of the turn, a card larger than the screen included. The
scroller is transparent until the turn passes edge-on (`--lightbox-back-facing`,
the turn rounded), so neither its card nor its scrollbar ever shows over the
drawing. The front hides its turned-away side by backface culling, which Firefox
applies only to a transformed element and Chromium only within the sheet's
`transform-style: preserve-3d`. The turn and the blend therefore turn and blend
the card and zoom every face together. The flip
never changes the drawing view: it is the saved view, restored by turning back
and re-clamped on resize by the same effect as any other view. Scrolling the
back changes only the card view, so the hidden tiled canvas is not re-synced
while reading. A layer over another shows the image blending in on both faces:
its drawing on the front, and its card on the back (a layer whose image has no
description fades the backs beneath it instead; one with no responsive entry
has no rest size until its drawing has loaded, so it has no back to blend in
until then). Turn and blend take one duration and easing, so
a turn that blends keeps the angle, the zoom and the blend in step: edge-on is
halfway on both faces. A live drag sets them with no duration, so a scrub
follows the finger directly. The flip button turns in direction 1; which way a
change or a drag turns is described below and under "State changes instantly".
With reduced motion nothing turns and the blend is instant: the faces
crossfade by the turn (the front's opacity 1 − turn, the back's the turn) and
the view goes at once to the side the card turns to. The face turned away is
`inert` immediately and `visibility: hidden` once the turn on screen reaches
its side, so it is neither focusable, hit-tested, nor drawn.

Every route to another image (Previous/Next, the arrow keys, a released swipe, a
set button) goes through `changeTo(target, direction)`, which blends when the
target is a variant of the current card (`isVariant`: another member of the same
comparison set) and slides otherwise. It ends the gesture interpreter's live
gesture first (`endDrag`), so a gesture held through a change cannot act again,
and makes the target the current image at once: `index` is the image the
lightbox is on, so the controls, the status, whether there is a description
toggle and the address describe the target from the moment the change is made.
`slideTo` moves the strip on from where it is to the target's slide and resets
the view; the card left behind keeps its view, limits and side while it slides
away. A blend keeps scale and pan: the current card's image changes, and the
card layers it in. From the text side the target is drawing side up, so the
same move turns the card back as it blends, in the direction the change
travels: Next as a leftward swipe would, Previous as a rightward one —
[Implicit]. The back being left keeps its scroll position, and the variant's
text starts at the top.

The interpreter reports a drag at rest as a live offset from where it went
down, which the lightbox applies with `dragAtRest`: towards a variant the card
moves its blend on from where it is by `scrubProgress` (the drag as a share of
the stage width, as far as a slide would have moved the strip) with no
transition and the strip stays in place; towards another card the strip moves
by the drag; a drag that began while the strip was moving carries the strip
either way. Until it is released past the threshold a drag changes nothing but
the card and the strip, so the controls stay on the current image. On release
the interpreter commits a drag of at least its 50 px swipe threshold (and more
horizontal than vertical) and settles a shorter one: a commit changes image,
and the blend or the strip carries on from where the drag left it; a settle
lets the strip and the card chase their rest. A second finger turns a drag into
a pinch: the interpreter settles the drag as the pinch begins, so the strip and
any scrub ease back to rest — [Implicit]. With reduced motion there is no scrub
and the change is instant.

Because the text is inside the stage, the stage's gestures see drags on it, and
there a sideways drag turns the card instead of changing image — [Explicit],
whatever the drawing's zoom and whatever lies beside the card. The interpreter
marks a drag that starts on the text side as one that turns: it reports it as
live `turn` offsets, which the card applies as the same share of the stage
width as a blend scrub (half the width is edge-on), turning the card back by it
from where the turn was with no duration and the way the finger moves (a
leftward drag turns it leftwards) — [Explicit]; the strip and the blend are left
alone. On release, with the same threshold, it gives `turnBack`, which makes
the drawing side current, so the turn finishes from where it is onto the saved
view, the way it was turning, or `keepText`, which returns it to the text.
With reduced motion there is no scrub, and `turnBack` is the flip's crossfade.
`LightboxVerso` keeps `touch-action: pan-y`, so vertical scrolling and
long-press selection stay native. On the text side the drag follows only while
it is more horizontal than vertical, since a mostly vertical drag may still
become a native scroll; a native scroll of the text then cancels the drag, and
no drag starts or continues while text in the stage is selected. While the text
shows, the stage ignores the wheel, double-click, pinch and double-tap, so the
text scrolls natively, and every mouse press, since the text spans the stage:
a mouse drag on the text side selects text, and a mouse turns the card with
the toggle — [Explicit].

The interpreter claims every touch move it follows (a pan, a pinch, a drag at
rest, and a drag on the text once it is more horizontal than vertical), and the
stage and the dialog attach their `touchmove` listeners without the `passive`
Svelte gives touch handlers, so a claim, or the dialog keeping the page behind
from scrolling, cancels the move — [Implicit]. Left to the browser, a quick
swipe also starts a fling, which the stage's `touch-action: none` (or the
text's `pan-y`) then forbids, and Chromium swallows the next tap, for as long as
that fling would have run, as the tap that stops it.

On phones (at `PHONE_WIDTH` and below) the edge arrows make way for the text
and move with the card's turn — [Explicit]: the lightbox hands
`LightboxControls` how far the arrows step aside: the turn of each card on
screen (1 text up, a drag's live turn included), weighted by how much of it the
strip shows, so they move with the card's turn, follow a drag on the text
directly, and wait with the card for a variant that is still loading. A change
of image from the text to another card brings them back as the next drawing
slides in, in the slide's time, since the arriving card is drawing side up
while the one it leaves keeps its text — [Implicit]. They are
`inert` as soon as they start aside and `visibility: hidden` once they are
fully aside, as a turned-away face is. With reduced motion they fade over the
flip's crossfade instead — [Implicit].

`LightboxVerso` is the back's viewport: a native scroll container (the browser's
own scrollbar and scrolling) spanning the stage, with the control bands as its
padding, whose content is the card. The card is the page's surface and text
(`--page-surface`/`--page-text`, which `global.css` resolves on `<html>` from
the theme's `--color-white`/`--color-black`, so they follow a live theme switch
inside the pinned lightbox), `cardScale` × the front's rest size
(`restImageSize`, the one rule for every front: the image contained in the rest
area, its size read from the responsive manifest or, for a drawing without
responsive variants, from the image once loaded, so every description has a
back; only such a drawing records its loaded size, so loading an image with
responsive variants never replaces it — [Implicit]), centred, and may overflow
the screen sideways (clipped; both scrollbar gutters keep it centred).
`cardScale` in `gallery.ts` finds the smallest scale, at least 1, at which the
text's height at `cardColumn` plus the card's padding (`cardPadding`: 6% of its
width within 24–64 px) fits the card's height; the column is the page measure
within the card's padding and `textColumnLimit` (the stage minus the side bands,
or the page margins at `PHONE_WIDTH` and below, where the arrows step aside).
The text is measured in a hidden copy outside the scroll, once per text,
language, image and viewport and again whenever web fonts finish loading
(`document.fonts` `loadingdone`, as a face first needed later can change the
text's size); a re-measure keeps the scroll position in proportion. It renders
the title and description in the current language with a `lang` attribute (so
hyphenation picks the right dictionary), as a focusable, labelled region.

### Shared lightbox input and tiled rendering — [Explicit]

The lightbox owns one view (scale and pan) for both paths. Wheel, keys, and
double-click/double-tap all go through `zoomTo`, which keeps the point under the
pointer (or the centre) in place and clamps pan to the safe area; pinch uses the
same clamp with its own two-finger pan. The gesture interpreter detects the
double tap (two short taps within 300 ms and 30 px) and claims the second tap's
`touchend`, which is cancelled so the browser does not also synthesize a
`dblclick`. The zoom keys go through the interpreter too (the component only
leaves modified keys to the browser's own zoom), so one rule decides for every
zoom input: it waits during a drag at rest and does nothing on the text side,
and otherwise zooms whatever is moving, the image being changed to included —
[Implicit]. Only the mouse drives pointer gestures; touch input arrives through
touch events.

`LightboxTiles.svelte` wraps OpenSeadragon. Its mouse, touch, and keyboard
navigation is disabled; its viewport receives the lightbox's view reactively,
with immediate updates, and remains responsible for tile selection, loading,
caching, and drawing. Its home view fits the whole stage, so `deepZoomViewport`
maps the rest-fitted width times the scale to a zoom directly. OpenSeadragon's
own pan and zoom constraints and its auto-resize are off, because either would
move the view away from the lightbox's clamp; the adapter passes the stage size
to the viewport before each update. A pyramid `minPixelRatio` of `0.5` selects
the closest DZI level at or above the required physical-pixel density instead of
upscaling the level below it. OpenSeadragon caches display density at module
scope, so each new viewer refreshes that value before sizing its canvas; this
covers browser-zoom changes made while no viewer exists. Tiled images retain
that density-matched processed preview beneath the canvas, preventing unloaded
tile regions from exposing the dark stage.

### Lightbox modal state — [Explicit]

The lightbox is a native modal `<dialog>`, so the browser owns the top layer,
inertness of the page behind it, and Escape handling. A modal dialog still lets
Tab and Shift+Tab leave for the browser chrome at either end, so the keydown
handler wraps focus between the first and last enabled control, including the
focusable description and skipping `inert` faces. Focus enters the close control
and returns to the opening thumbnail without scrolling the page on close. The
viewport-filling dialog suppresses wheel, touch, and keyboard scrolling without
changing document overflow or positioning, except for native scrolling inside
the set strip and the description. The page and sticky header therefore retain
their normal layout and position beneath it. The lightbox locally pins black and
white colour tokens so the global dark-mode swap cannot invert its overlay and
controls; only the card back takes the page's own surface and text. A
`data-lang` observer keeps the dialog's accessible names aligned with the global
language switch.

Opening and closing are the live dialog itself, not a View Transition — the
design: a View Transition animates snapshots taken when it starts, so it can
neither be sent somewhere new mid-way nor take input while it runs (Chromium
delivers pointer input to the document element meanwhile). Opening is three
more chased numbers (see "State changes instantly"): how far open the lightbox
shows, from which the backdrop's alpha and the controls' opacity are derived;
where the card is, 0 at its thumbnail and 1 at rest, from which its move is
derived; and how far the card has faded in. The dialog is always in the page, so
it becomes modal in the click itself and every input reaches the real
lightbox from then on, in both browsers. The backdrop and controls come in at
once. The card moves from the thumbnail's frame (`morphFrame` in `gallery.ts`):
a box between the frame and the rest area, the drawing covering it as the
thumbnail crops it, at the thumbnail's hover scale as measured at the click,
all as a transform and a clip of the stage's contents, so the crop opens up to
the whole drawing. That move waits for the drawing to load, so it never moves
an empty box: meanwhile the card, still at the thumbnail, draws nothing, and the
thumbnail itself shows beneath the darkening backdrop; the thumbnail is
transparent only while the card travels from or to it, and stays focusable.
The card moves only when the thumbnail is fully in view and clear of the sticky
header; otherwise it fades in at rest, as it does opened from history or with
reduced motion, where nothing waits. The dialog's own backdrop is transparent:
its background carries the 90 % black plus the 10 % a modal backdrop adds, so
both fade together. The tiled canvas waits for the card to come to rest (the
`rested` latch), so it never starts under a moving card. The page-to-page View
Transitions are separate and unaffected.

Closing takes effect at once: the dialog stops being modal, the page behind
takes input and the thumbnail takes focus, while the dialog, `inert` and
`aria-hidden`, stays drawn over the page until it has faded out and its card
has landed or faded — [Implicit]. So a click or the wheel on the page acts
during the close as it would with no animation, and Enter on the focused
thumbnail opens it again. Staying modal until the end would instead keep the
page inert for the length of the fade and let the fading lightbox take clicks
meant for the page. The card goes into the current image's own thumbnail when
it can (in view and clear of the header, drawing side up, not zoomed), decided
when the close starts; otherwise it fades where it is — [Implicit]. The frame
it goes into is the thumbnail as it is on screen, followed as the page scrolls
or resizes, and the frame the card is in goes on from the one it was in towards it in step
with the move, so neither a change of image during the opening nor scrolling
makes it jump; a thumbnail scrolled out of view fades the card where it is.
Opening again while the lightbox closes goes on from where it is: on the same
image the card goes back to rest; on another image the lightbox changes to it
as it comes back in; either way the card moves once its drawing has loaded,
still leaving the thumbnail it was going into — [Implicit]. A close while opening turns the opening back
from where it is. With reduced motion the lightbox opens and closes at once.
Each translated slide clips its own contents, so a transformed image cannot
paint over the adjacent slide.

Each image maps to a one-based `#image-N` hash (`lightbox-history.ts`). Opening
pushes one marked history entry; navigation replaces that entry at once. A
burst of 50 writes goes at once, then one every 100 ms at most, since browsers
ignore (Chromium) or refuse (Firefox) more than about 200 address changes in
10 s, which only holding an arrow key reaches; closing writes a change still to
come first, so Forward reopens the last image — [Implicit]. (Browser Back
during such a held-key run can leave the entry up to 100 ms behind: a page
cannot rewrite an entry it has left.) Closing calls the lightbox's close at
once and then goes back over the entry, whose popstate the lightbox, already
closed, then ignores. Opening again before that traversal has arrived waits
for it and pushes the new entry after it, since browsers disagree on a push
made while a traversal is pending (Chromium goes back after the push, Firefox
drops the traversal). The popstate handler closes or restores the lightbox for
Back and Forward. The
history module selects manual browser scroll restoration while its history entry
is active, preventing hash traversal from moving the page behind the overlay,
and restores the previous setting when the lightbox closes. On initial
hydration, a valid image hash is placed after a base-page entry so Back first
closes a directly linked lightbox. Image numbers intentionally follow page
order, starting with the cover, and therefore change if the content owner
reorders blocks or their images.

### Home-page carousel: scroll-snap + a small vanilla script — [Implicit]

The carousel (`Carousel.astro`) is a native horizontal scroll-snap strip; a small
vanilla script enhances it with arrows, dot indicators and a 5s auto-advance,
pausing on hover/focus and skipping auto-advance under `prefers-reduced-motion`.
The live media query updates both scrolling and auto-advance when the preference
changes. Normal document navigation gives each page one script lifetime, so no
client-router cleanup lifecycle is needed. No hydrated island — the same lightweight approach as the reveal
script, so the "islands stay minimal" invariant holds. Because it scrolls its
own container (not the page), it stays clear of the "don't reimplement scrolling"
boundary. Images come only from the Home singleton's required `gallery` list. A
single entry renders as a normal responsive image at its natural aspect ratio;
two or more entries render through the carousel. The carousel and lightbox share
only their control interaction language (40 px boxes, outline on hover, invert
on press); the carousel's translucent `.media-navigation-button` suits controls
over a page image, the lightbox's solid `.lightbox-control` a full-screen
drawing. Their native scroll-snap and Svelte gesture/navigation implementations
remain independent.
Dots retain the same interaction language but use literal media-surface colours,
including a dark edge for contrast over pale images, rather than inheriting
page-theme tokens.

The current slide is a kept index, not read back from the scroll position — the
"State changes instantly" rule. Arrows, dots and auto-advance step the index
from itself, mark the dots at once and send the track to it with
`scrollTo({ behavior: 'smooth' })`, which the browser retargets from wherever
the scroll is. The index is re-read from `scrollLeft` only while the visitor
scrolls the track themselves: any pointer, key, focus or sideways-wheel input
on the track marks the scroll as theirs until the next arrow, dot or
auto-advance step. A vertical wheel over the track scrolls the page and leaves
the index alone. During a smooth scroll the position is mid-way, so an index
read from it would drop a quick second press and send Next-then-Previous from
the first slide to the last. The home and project carousels each keep this in
their own script — [Implicit]; only the home one auto-advances.

### Project media blocks render in Astro — [Explicit]

`ProjectBlocks.astro` renders the ordered text, gallery, and image-set sequence
without hydrating the full project body. The project page uses the shared
`max-w-6xl` frame; text blocks are constrained to `max-w-2xl` below the `lg`
breakpoint and use two columns across the full frame from `lg` onward. Cover and
media blocks use the full frame at every width. Gallery items use the existing
square thumbnail treatment. A one-item image set keeps the source aspect ratio
at the project content width; a multi-item set uses a fixed 16:9 scroll-snap
viewport with `object-contain`, arrows, and dots so drawings are not cropped.
Its small vanilla script supports every carousel block on the page, keeps the
slide index as the home carousel does, and does not autoplay.
Every rendered image button exposes its flattened page index to the single
`Gallery.svelte` island, so each occurrence of an image is its own lightbox
slide and close-transition target.

### Page transitions: native View Transitions API — [Implicit]

`@view-transition { navigation: auto; }` opts ordinary same-origin document
navigations into the browser's cross-document View Transitions. Pages remain a
normal multi-page site: there is no client router, swapped DOM, persistence API,
or script reinitialization lifecycle. Browsers without support perform ordinary
navigation. Project covers use matching transition names between the work grid
and project pages. A stable wrapper owns that name while the nested image owns
hover scaling, so hover and shared-element geometry do not compete: the square
frame on a work card and the cover's button on a project page. The
project image carries its native dimensions so an uncached destination has
stable geometry. One shared transition class keeps the image snapshots covering
the changing box, progressively cropping or revealing them between the square
card and the project image. Only the project page's full-image snapshot is
drawn, clipped by the image pair, because blending it with the card's crop
doubles the image's edges. An inline `<head>` script tags
each navigation's transition `project-open` (arriving on a project page) or
`project-close` from `pagereveal`, which must run before the first frame, and
CSS picks the snapshot by type. On `pageswap` it finds the opened card by the
navigation's destination (`activation.entry.url`), so a card opened from the
keyboard gets its own scale even with the pointer over another, and stores
that card image's scale in `sessionStorage`; the opening snapshot animates
from that scale so the hover zoom does not jump. Without `activation`, the
snapshot starts unscaled. Work cards skip the independent reveal effect
because starting a second entrance animation during the page transition
produces competing motion.

These transitions are the one accepted exception to "State changes instantly"
— [Explicit]: the owner keeps them. During a cross-document View Transition
(every same-origin navigation, about 0.4 s) the browser itself holds input,
and a second navigation skips the running transition rather than retargeting
it.

### Reveal-on-scroll: IntersectionObserver on the native scrollbar — [Implicit]

Elements with `.reveal` fade in as they enter the viewport (script in
`Base.astro`, styles in `global.css`). This explicitly avoids scroll-hijacking
libraries — the user asked not to reimplement scrolling. It initializes once
for each normally loaded document and respects `prefers-reduced-motion`.
The reveal is decoration only — [Explicit]: `.reveal` alone is plain visible
content, and the script adds `.is-hidden` only to elements the observer's first
report finds off screen, removing it as they enter the viewport (no root
margin). So without the script nothing is hidden, and what is on screen at
load never fades in late.

---

## Styling

### Tailwind CSS v4 via the Vite plugin — [Implicit]

`@tailwindcss/vite` plus `@import "tailwindcss"` in `global.css`. No
`tailwind.config` file — v4 is configured in CSS.

### CSS unit & token conventions — [Explicit]

Pick units by what the value should scale with, not by habit. Tailwind's default
scales already follow most of this (its `text-*`/`p-*`/`gap-*` utilities are
`rem`-based), so staying on the utility scale is the path of least resistance;
these rules govern the arbitrary values and the custom CSS in `global.css`.

- **`rem`** — typography and spacing. Scales with the user's root font size.
- **`em`** — sizing that should scale with the component's own font size (e.g.
  padding on a button). Avoid setting `font-size` in `em` on nested elements —
  that compounds through the cascade. Non-font-size `em` does not.
- **`px`** — borders, shadows, and pixel-precise details only.
- **`%` / `fr` / `vw` / `vh`** — responsive layout (grid tracks, viewport-sized
  regions).
- **`clamp()`** — fluid text/sizing, with `rem` bounds and a `rem`+`vw` middle
  term (`clamp(1rem, 0.5rem + 1.5vw, 1.5rem)`) so it still responds to zoom.
- **unitless** — `line-height` (a ratio, not a length). Tailwind's
  `leading-none`/`leading-normal` already are.
- Prefer **tokens/variables** (Tailwind's scale, or `@theme` custom props such as
  `--font-sans` and `--duration-*`) over hardcoded values — but don't invent a
  token for a genuine one-off; a single literal is clearer inline.
- Don't use the 62.5% root font-size hack.

Note: page-title headings deliberately step at the `sm` breakpoint
(`text-3xl sm:text-4xl`) rather than using `clamp()` — the fluid range is narrow
and the semantic utility is more readable. `clamp()` is the tool if a genuinely
large display type is introduced later.

### Typography plugin for Markdown bodies — [Implicit]

`@tailwindcss/typography` (`prose` classes) styles rendered Markdown bodies —
project text blocks and the home page's About text. Because those bodies are
bilingual they live in frontmatter fields (`body_cs`/`body_en`), not the file's
Markdown body, so they're rendered from their Markdown strings with `marked` (a
tiny build-time dependency) inside `Prose.astro` rather than via Astro's
`render()`. See "Internationalization" below.

### Prose uses language-aware automatic hyphenation — [Explicit]

The shared `.prose` rule applies `text-align: justify` and `hyphens: auto` to
every Markdown body. `Prose.astro` emits separate `lang="cs"` and `lang="en"`
wrappers, so the browser selects its Czech or English hyphenation dictionary
rather than breaking both language variants by one generic rule.

### Self-hosted webfonts via @fontsource — [Implicit]

Roboto ships as a variable webfont from `@fontsource-variable/roboto`, imported in
`Base.astro` and bundled to `dist/_astro/*.woff2` — no third-party (Google Fonts)
request, which keeps with "fast and clean". It is the single page typeface:
`global.css`'s `@theme` sets one token, `--font-sans`, to Roboto, so body,
headings and nav all share it. There is deliberately **no** separate
display/heading token — Open Sans (body) and a `--font-display` seam were both
tried and removed in favour of one typeface everywhere (the owner's call: "if I
want separation later, I'll do it from scratch"). DIN Pro — also on the owner's
wishlist — is commercial with no free web licence and is omitted; to add it (or
any distinct heading face) later, self-host the licensed `woff2`, reintroduce a
`--font-display` token in `@theme`, and apply it to the headings/nav.

### Motion durations as `@theme` tokens — [Implicit]

The three transition speeds used by the CSS animations (reveal-on-scroll and the
theme-icon cross-fade) live as `--duration-fast/base/slow` tokens in `@theme`
rather than as inline seconds, so the values stay consistent and adjustable in
one place. The reveal offset is authored in `rem` (`translateY(0.875rem)`), not
`px`, so it scales with the root font size like the rest of the spacing.

### Dark mode: palette remap via CSS variables — [Implicit]

Dark mode is not a second set of utility classes; it's a remap of the palette
**tokens**. Tailwind v4 compiles colour utilities to `var(--color-*)` (e.g.
`bg-white` → `background-color: var(--color-white)`), so overriding those tokens
under `html[data-theme="dark"]` in `global.css` flips every existing
`bg-white`/`text-black`/`text-neutral-*` at once — no `dark:` class on any
component. `--color-white`/`--color-black` become charcoal/off-white and the
used neutral shades provide the intermediate contrast. The lightbox establishes
local literal black/white tokens because its dark inspection surface is the same
in both themes. This is why the old
`filter: invert` approach was rejected: a filter
also inverts `<img>` content, whereas a token remap leaves imagery alone. The one
exception that needs a `dark:` variant is the typography plugin, whose prose
colours are literal, not token-based — a registered `@custom-variant dark` plus
`dark:prose-invert` on the two `.prose` blocks handles the Markdown bodies.

The theme is selected before first paint by a tiny inline script in `Base.astro`.
An explicit `localStorage.theme` wins; otherwise `prefers-color-scheme` supplies
the initial theme and a media-query listener tracks live browser or system
changes. The footer button toggles `html[data-theme]` and persists that choice,
which stops the listener from overriding it. `<html>` ships `data-theme="light"`
so no-JS still falls back to light. The toggle shows the mode it switches _to_
(moon in light, sun in dark); the two icons are cross-faded purely in CSS off
`html[data-theme]`.

---

## Content

### Astro Content Collections + glob loader — [Implicit]

`src/content.config.ts` defines a `projects` collection loaded from
`src/content/projects/*.md`, with a Zod schema validating frontmatter. The
singletons — Site settings, Home, and Contact — are single Markdown files under
`src/content/singletons/`, imported directly where they're needed (`home.md`
supplies the home page's bio + portrait + gallery + approaches in
`index.astro`/`Carousel`/`Approaches`; `contact.md` in `contact.astro` and the
footer; `site.md` in the layout/nav). They are not collections (each is a one-off)
and are validated only through `.pages.yml` + their consuming code, not Zod.
Components guard optional fields where their content model permits them (e.g. an
empty approach list hides the section). Project frontmatter
stores an ordered discriminated block list: bilingual text, thumbnail gallery,
or full-width image set. All human-readable text is bilingual (paired
`_cs`/`_en` fields); the Markdown file *bodies* are unused — even the bio and
project text blocks live in `body_cs`/`body_en` frontmatter.

### Images: original uploads plus responsive display derivatives — [Explicit]

Images live in `public/uploads` and are referenced by root-absolute string paths
(e.g. `/uploads/cover.jpg`). This keeps the CMS flow direct: the CMS commits a
file and writes a path, with no import resolution involved.

Before development or production builds, `scripts/generate-responsive-images.ts`
finds raster uploads referenced by content and creates gamma-aware Lanczos
resizes as WebP files in the ignored `public/_responsive` directory. Derivatives
are auto-oriented, converted to the web sRGB colour space, and stripped of
metadata. PNG and alpha-bearing sources remain lossless; already-lossy sources
use high-quality lossy WebP. The original upload is never modified. The pipeline
probes each source first, generates widths up to and including its
orientation-aware native width, and publishes a full-image derivative only when
its file is smaller than the original. A generated manifest records the
dimensions, byte size, format, and content-addressed URL of every available
representation.

Reduced display surfaces build `srcset` from that manifest and provide accurate
`sizes` hints, avoiding severe browser downsampling of detailed architectural
linework without assuming every configured size exists. Every `object-cover`
surface uses `coverSizes` to multiply its slot-width hint when the source is
wider than the frame, because those images scale by height before their sides
are cropped. The hint also includes any hover enlargement. Width-constrained
sources keep the normal slot-size hint. The untouched original is replaced as
the terminal browser candidate by a smaller processed native-resolution
derivative whenever one is available. It remains the terminal candidate only
when processing cannot reduce its byte size. SVGs bypass the
derivative pipeline. A direct original-image link remains available independently
of browser display selection.

### Large gallery images use cached Deep Zoom pyramids — [Explicit]

Referenced rasters whose longest oriented side exceeds 4096 px receive a DZI
pyramid of 512 px WebP tiles. Each level is resized directly from the original
with the same gamma-aware Lanczos3 filter as a full-image derivative; levels are
not recursively block-shrunk. Lossless tiles have one pixel of overlap. Lossy
tiles have 16 px—one WebP macroblock—so codec-edge filtering remains outside
the visible tile core. This boundary avoids decoding full bitmaps above roughly
64 MiB of RGBA memory while leaving smaller images on the lower-overhead
full-image path. OpenSeadragon is dynamically imported only when such an image
opens. It requests the resolution levels and visible regions needed for the
current viewport and stops at a 1:1 ratio with the finest source level. Smaller
images select the least full-image derivative that covers their rendered pixels
and use the same native-detail zoom limit. Both calculations consume Svelte's
reactive device-pixel ratio, keeping them synchronized with browser-reported
density changes.

Pyramids use the same lossless-versus-photographic WebP policy as full-image
derivatives and have their own content-addressed cache keys. Their combined
files can exceed the original because they contain multiple resolution levels;
the benefit is bounded browser memory and network transfer for the region being
viewed, not a smaller aggregate deployment.

### Image derivatives use a content-addressed build cache — [Explicit]

Encoding results are cached under `node_modules/.astro/images` by SHA-256 keys
derived from the original bytes and the complete transformation recipe,
including the Sharp and libvips versions. A changed upload or recipe gets a new
cache entry; unrelated site changes reuse existing entries. A derivative is
encoded to a temporary file and a pyramid built in a temporary directory, each
renamed into place once complete: an existing entry is reused after reading
only its header or the presence of its `image.dzi`, so an interrupted run must
not leave a partial one — [Implicit].

Each run syncs `public/_responsive` with the cache in place — [Explicit]. It
writes only files that are missing or differ, replacing each through a
temporary file and a rename, then writes the manifest the same way, and only
afterwards removes entries the new manifest no longer references, so removed
content is not deployed. `src/server-images.ts` re-reads the manifest whenever
its modification time changes, so a dev server running while builds and tests
regenerate images renders only URLs of files that exist and never serves one
half-written — [Implicit]. A page already open in the browser can still point
at a removed derivative until it is reloaded.

Runs are serialized — [Implicit]. `npm run dev`, builds and browser tests all
start the script, and overlapping runs would remove each other's new output and
cache entries. The `images` package script runs it under `flock` on
`node_modules/.images.lock`, a kernel advisory lock: a later run blocks silently
until the earlier one exits, and the kernel releases the lock when its holder
dies, so a killed run never leaves the next one waiting. `flock` comes from
util-linux, which the flake provides and GitHub's Ubuntu runners include; Linux
is the only development and build platform.

Public derivative URLs contain the cache key, so a changed source or recipe
cannot reuse a stale browser response. The test job and official Astro
GitHub Action persist `node_modules/.astro` under matching keys, sharing the
browser-test prebuild's results with the deployment build and later runs. A
missing or evicted cache remains safe because the same build recreates it from
the originals.

The manifest separates each upload's `originalUrl` from the `source.url` used as
the responsive ladder's lossless fallback. They normally match. When an encoded
path contains `%2B`, the generator copies the untouched bytes to a hash-only
`source.<ext>` URL and uses that for display because Astro's static preview
misresolves plus signs during file lookup. The lightbox's **Open original** link
continues to use `originalUrl`, so filename safety does not replace or re-encode
the architect's file.

### Project image-block items are caption records — [Explicit]

Each gallery or image-set item groups its root-absolute `image` path with optional
paired `title_cs`/`title_en` and `description_cs`/`description_en` fields, plus an
optional language-neutral `comparison_set` identifier. Keeping that metadata
beside its image preserves the associations when items are reordered in Pages
CMS. Both block types use the same record shape so the page-level lightbox can
flatten them into one sequence.

### Sitemap — [Implicit]

`@astrojs/sitemap` generates `sitemap-index.xml` at build. Needs `site` (in
`astro.config.mjs`) set to the canonical origin to produce absolute URLs.

---

## Internationalization

### Both languages ship in one page, CSS picks which shows — [Explicit] (shape [Implicit])

The site is bilingual (Czech + English) but stays a **single set of URLs** — no
`/cs` or `/en` route prefixes. This was a deliberate choice to preserve the
root-only hosting model (see "Hosting") and to make "default to the visitor's
browser language" work on a static host with **no server** to negotiate
`Accept-Language`. Both language variants are rendered into every page; a CSS rule
keyed off `html[data-lang]` hides the inactive one:

```css
html[data-lang="cs"] [lang="en"] { display: none !important; }
html[data-lang="en"] [lang="cs"] { display: none !important; }
```

Consequences of this shape:

- **Language switching is instant** (no navigation) — the toggle just flips
  `html[data-lang]`; the other language is already in the DOM.
- **Both languages are in the HTML**, so search engines see both. There are no
  per-language URLs to share except the `?lang=` query (which the picker script
  honours), and no `hreflang` (there are no alternate URLs to point at).
- `<html>` is served with `data-lang="en"`, so if JS never runs the page falls
  back to **English** (a clean single language) rather than a blank page. The
  inline picker script overrides this before first paint when JS is on.

### Picking the language — a tiny inline script — [Implicit]

An `is:inline` script in `<head>` (so it runs before first paint, no flash) sets
`html[data-lang]` from, in order: `?lang=`, `localStorage`, `navigator.language`,
else English. A second module script in `Base.astro` wires the footer language
toggle (shows the other language, persists to `localStorage`, flips `data-lang`),
and syncs `<title>`/meta description to the active language. Each normally
loaded document reads the persisted language before first paint. No island —
same "tiny vanilla script" approach as reveal/carousel.

### Where the strings come from — `i18n.ts`, `T.astro`, `Prose.astro` — [Implicit]

- **Baked-in UI labels** (nav, section headings) live in `src/i18n.ts` as a
  `{ cs, en }` dictionary.
- **`T.astro`** renders a bilingual inline/block element — either a dictionary key
  (`<T k="about" />`) or explicit `cs`/`en` strings for CMS content — emitting one
  element per language with a `lang` attribute for the CSS rule to target.
- **`Prose.astro`** does the same for rich-text bodies, rendering each language's
  Markdown string with `marked`.

### Content shape: paired `_cs`/`_en` fields — [Implicit]

Translatable fields are declared as pairs (`title_cs`/`title_en`,
`body_cs`/`body_en`, `label_cs`/`label_en`, `day_cs`/`day_en`, …); genuinely
language-neutral fields (images, `year`, `email`, `phone`) stay single. This keeps
one file per project/singleton (rather than a file per language) and keeps the CMS
a single form. The `projects` Zod schema and `.pages.yml` both encode the pairs and
must stay in sync (see below). Sorting uses the English title for stability. The
project route uses Astro's filename-derived content ID. Pages CMS initially
generates the filename from the English title and exposes the complete filename
for later edits; renaming it therefore changes the route without another source
of truth for the slug.

---

## Content management

### CMS: Pages CMS (hosted) — [Explicit]

The user chose Pages CMS. Schema lives in `.pages.yml` at the repo root; the
editor is hosted at app.pagescms.org, so there is **no** OAuth proxy or server to
operate.

> History: Agent first proposed Sveltia CMS (which would have required a self-
> hosted OAuth proxy). After the user asked why the proxy was necessary and
> whether it could be avoided, the project switched to Pages CMS. The proxy
> requirement is a property of doing GitHub OAuth from a static host, not of any
> one CMS.

### Two sources of truth for content shape — [Implicit] (constraint to respect)

The frontmatter schema is declared **twice**: in `src/content.config.ts` (build-
time validation) and in `.pages.yml` (the editing UI). They must be kept in sync
by hand — see MAINTAINERS.md and AGENTS.md. This applies to the `projects`
collection. The singletons (Site, Home, Contact) have no Zod mirror — they are
declared only in `.pages.yml` and read straight from their Markdown — so for those
the pair to keep in sync is `.pages.yml` and the consuming component. Pages CMS
treats fields as optional unless `required: true` is explicit, so
`src/content.config.test.ts` checks that every field required by the Astro project
schema is also required in the editor.

### Empty project block lists — [Explicit]

Projects may have no content blocks. Pages CMS can serialize a blank row in an
optional block or nested image list as `{}`, so the Astro schema removes
completely empty rows before validating the remaining items. Text blocks require
both languages, and gallery/image-set blocks require at least one valid image.
