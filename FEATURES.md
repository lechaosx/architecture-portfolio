# Features

Why the site behaves the way it does — the _product_ decisions. For _technical_
decisions see [ARCHITECTURE.md](ARCHITECTURE.md).

- **[Explicit]** — the user asked for this by name, or chose it when offered.
- **[Implicit]** — Agent proposed it and the user did not push back.

---

## Purpose & feel

### An architect's portfolio — [Explicit]

Showcases the work of Ing. arch. Tereza Kalábková: large imagery, quiet
typography, minimal chrome.

### Fast and clean — [Explicit]

The headline requirement: static pages, near-zero JavaScript, lazy-loaded images.

### Minimal, image-forward design — [Implicit]

Generous whitespace and a simple grid. The nav wordmark is the credentialed name
("Ing. arch. TEREZA KALÁBKOVÁ", name uppercase, credential not) and leads to the
landing page; there is no Home menu item.

### Works on phones — [Implicit]

Responsive down to small phones: the wordmark stacks, grids and gaps step down,
touch targets grow. Every page shares one content width, so pages line up at
every breakpoint.

### Black and white — [Explicit]

White background, black text, greys for secondary text. Colour comes only from
the imagery, never the UI, following the design brief.

### Nav and controls: idle, outline on hover, inverted when current — [Explicit]

The menu is just **Práce** · **O mně** (Work · About), uppercase with wide
tracking. The outline-then-invert treatment is the site's interaction
vocabulary, reused by carousel and lightbox controls. Inline text links keep an
underline.

### Roboto throughout — [Explicit]

One typeface for the whole page, at the architect's request. DIN Pro, also on
her list, has no free web licence. The CV PDF sets its titles in Roboto
Condensed — [Explicit].

### Justified, hyphenated prose — [Explicit]

Running text — rich-text bodies, project briefs, About's Approach texts and row
descriptions, and image descriptions — is justified with automatic hyphenation
in the right language's rules; a brief's own line breaks still end their lines
short. Labels, metadata, credits and titles are not justified. On phones,
About descriptions span their row's full width, so justified
lines keep a comfortable measure — [Implicit]. The CV PDF justifies its
profile and descriptions too, like the developer's own CV — [Explicit].

### Czech one-letter words never end a line — [Explicit]

As Czech typography requires, a one-letter preposition or conjunction (v, s, k,
z, o, u, a, i) is kept on the line of the word after it, in all visible Czech
text: content and labels alike, with nothing for the architect to type.

---

## Content & maintenance

### The architect edits content in Pages CMS; the developer changes code — [Explicit]

She edits in the browser at app.pagescms.org with forms and image upload, no
code, Git or Markdown. Saving commits to `master` and the site redeploys.
Structural and design changes are made in code on the same repo.

### Most of the site is editable — [Explicit]

Editable: projects, the landing page's images and projects, the About page (bio, portrait,
work experience, services, education, awards, Approach), what only the CV shows,
the contact details in the footer, and the site settings (name, credential,
description). Baked into code: page structure, navigation and section labels.
CMS entries: **Projekty**, **Úvodní stránka**, **O mně**, **Životopis**,
**Kontakt (patička)**, **Nastavení webu**.

### The CMS speaks Czech — [Explicit]

Every entry, field, help text and option the repo configures in Pages CMS is in
Czech, the architect's language. A field kept in both languages groups a
"Česky" and an "Anglicky" field; a project's title and place, which the project
list shows as columns, name the field too: "Název (česky)" / "Název (anglicky)"
— [Implicit]. Pages CMS's own buttons and menus stay in English.

### Image fields point to reusing uploads — [Explicit]

Every image field's help text tells her to pick an image already on the site
with **Select**, since **Upload** or dropping a file stores a new copy even of
a file already uploaded.

### Required fields are what a page cannot do without — [Implicit]

The name, both site descriptions (the search description), the contact email,
both About texts, every field of an Approach item, both names of a service and
both places and titles of an experience, education or award row are
required; everything else may be empty, including a row's period — [Explicit] —
and the hours and location — [Implicit]. The CMS refuses to save an entry
without them.

### Projects: title and start; everything else optional — [Explicit]

The CMS refuses to save a project without both titles and the start of its
involvement period. The end, brief, personal role, credits, award, classification and
content blocks are optional; so is the location — [Implicit]. A text block
needs both languages, an image block at least one image, each image a title in
both languages — [Explicit] — and a collaborator a name.

### Project brief and personal role — [Explicit]

The brief introduces the project and her involvement in natural prose; an optional **Moje role / My role** fact lists her roles, free-text items worded like collaborators’ roles, one per line, with her name implicit. On a project page, the title and badges precede the brief, with full-width facts beneath it; an absent brief leaves the facts directly below the title — [Explicit]. The brief follows the general prose column rule, preserves its line breaks and appears without a preset heading — [Implicit]; its CMS hint guides the wording (the project first, then her part), a hint, not a length limit — [Explicit].

### Project context and progress badges — [Explicit]

Quiet, non-interactive badges near the title describe the whole project: academic, competition, commissioned or self-initiated context; current design activity; and planned construction, construction in progress or built realization. Contexts may overlap, design activity is independent of realization, and realization has at most one value. Unfilled information makes no claim about cancellation, completion, contractual relationships or authorship.

### Project classification and credits — [Explicit]

The fact sheet can show intervention (new build, renovation, extension, adaptive reuse), scope (architecture, interior, landscape, public space, urban design), studio, her role, collaborators and award. **Spolupráce / Collaborators** lists the other people involved, each name above an optional smaller, muted bilingual role, including design authorship where confirmed; Tereza’s involvement is implicit in her portfolio and described in the brief and optional personal role. Studio holds the practice name; an individual role requires explicit credit for that person rather than a collective team credit.

Only filled facts appear, with location and **Období zapojení / Involvement period** added on the project page; the index already shows those in its row. Names remain whole. An index entry with a brief, facts or badges expands in place; search and machine-readable output preserve the same distinctions.

### Optional project website — [Explicit]

An optional external project link appears in the fact sheet on the project page and in an expanded index entry, including entries with no other details. Its hostname identifies the destination; the same address serves both languages and is preserved in machine-readable output. The CMS refuses anything but a complete http or https address — [Explicit]. That address needs a plain hostname: no IP address, port or non-ASCII hostname — [Implicit].

### Project fact rows form two groups when they fit — [Explicit]

The fact sheet balances whole rows into two groups side by side when both
remain comfortably readable; narrower sheets use one group. The fact sheet fills the project page width below its introduction.

### A project without content blocks has no page — [Explicit]

It is a brief entry: it appears only in the work page's index. A project with text
blocks but no images has a page, with no lightbox — [Implicit].

### Optional project thumbnail — [Explicit]

The architect can choose **Náhled projektu** for the project's cards and link
previews; leaving it empty uses the first image in page order. The chosen image
may be outside the page's blocks and does not change their order or the lightbox.
The project page keeps the blocks in the architect's order and loads its first
page image eagerly — [Implicit].

### A missing image is left out — [Explicit] (details [Implicit])

An image whose file is gone from the media library while content still refers
to it is left out wherever it would appear, with a build warning naming the
file and the content referring to it — [Explicit]. A block it empties goes too,
and a missing thumbnail counts as unset — [Implicit].

### Project URL is the editable filename — [Explicit]

The filename before `.md` is the URL segment, so renaming a project breaks old
links. A filename with nothing the URL can use, such as `!!!.md`, gets a short
code instead — [Implicit].

### A new project's filename comes from its Czech title — [Implicit]

Pages CMS proposes the filename from the Czech title, without diacritics, in
lowercase and with hyphens, so URLs match the Czech-named existing ones.

### Editable site settings — [Explicit]

Name, credential and description in one CMS entry, feeding the wordmark,
footer, tab titles and the description of pages without their own. The
description is for search engines and link previews only; no page shows it.

### Draft flag — [Implicit]

`draft: true` hides a project from the site.

### Periods: from and to, one model everywhere — [Explicit]

A project's period is when she worked on it; an About row's is the period of
that job, study or award. Both have the same two fields, "Od" and "Do", each a
year or a month and year ("2023", "3/2023"), shared by both languages. A
one-year project has the same year in both. An empty "Do" means ongoing, shown
as "2023 – dosud" / "2023 – present"; an identical start and end shows once. The
CMS refuses a malformed date but cannot compare the two fields, so an end
before the start shows as typed and an end without a start shows no period;
the build logs a warning naming the entry and field instead of failing —
[Explicit].

A period joins its dates with a spaced en dash, on the site and the CV alike —
[Explicit]. The details — [Implicit]: a date shows as "3/2023" or "2023", the
dash never starts a line, and a month may be typed with a leading zero.

### Projects sort ongoing first, then by end, then by start — [Explicit]

Automatic, with no order field: ongoing projects first, then the latest end,
then the latest start, then the English title, so the order is the same in both
languages. A year without a month counts as the whole year: it starts in
January and ends in December — [Implicit].

### Three pages: landing, Work and About — [Explicit]

The landing page at `/` gives a visitor her context before the work: chosen
images, what she is and where, and her chosen projects, even where that repeats Work
and About. The work page lists every project; the About page holds her bio,
the facts of her career and her approach. The contacts are in the footer of
every page, so there is no separate Contact page — [Explicit]. The legal
information page stands outside the menu, linked from the footer — [Explicit].

### Pages open with their content; section headings mark sections — [Explicit]

The small-caps heading over a black rule marks a section inside a page and
never titles one. The landing page opens with her images, Work with its covers
and About with her bio and portrait; the menu, which shows the current page
inverted, says where the visitor is. Work and About titles are there only for
screen readers and search. A page opening with imagery sits closer under the
header than a text page such as a project page or the 404, and without its
imagery opens like a text page.

### Landing page — [Explicit]

Top to bottom: her chosen images, large, filling the content width just under
the header; one quiet line saying what she is and where ("Architektka · Brno",
the place from the contacts), ending in **O mně →**, with her services under
it when there are any; then **Vybrané práce** with **Všechny práce →** over her
chosen projects as the work page's cards, which end the page.
No headline or introductory paragraph. For machines the line starts with her
credentialed name, hidden from view, so the page's main heading names her —
[Explicit].

The layout — [Implicit]: the line sits under the images like a caption, in the
section headings' small caps; the place appears when filled. **O mně →** ends
the line on the right, like **Všechny práce →** ends its heading row, both
underlined on hover and focus. The services follow on a line of their own.
The cards open their projects with the same cover transition as on Work.

### Services as one quiet line — [Explicit]

Her services are a line, not a section: under the landing page's identity line,
and closing the About bio column, level with the portrait's foot beside a
shorter bio and right after the bio otherwise. The line is small grey text, as
typed, with middle dots between services; a service moves to the next line
whole unless it alone is wider than the line, and no dot starts or ends a line.
On About a **Služby** heading names it for screen readers only.

### The architect chooses the landing projects — [Explicit]

She picks and orders any number of projects on **Úvodní stránka**; with none
chosen, **Vybrané práce** and **Všechny práce →** are left out. A draft or
deleted project in the list is skipped with a build warning, so the deploy never
fails on it, and so is a project without a card (no image or no page content):
the CMS picker lists every project. A repeated one is skipped too — [Implicit].

### Landing images or carousel — [Explicit]

The architect picks and orders the landing images; project images are never
added automatically. One image shows at its natural aspect ratio; two or more
form a carousel with arrows and dots that auto-advances, pausing on hover or
focus, and not at all with reduced motion; a change by hand restarts the
interval, so the next automatic change comes a full interval later. With none,
the page starts with the line saying what she is. The carousel is the project
image sets' one with auto-advance added, its images cropped to fill the frame.
The first landing image, alone or in the carousel, is fetched with high
priority — [Implicit].

### About page — [Explicit]

The intro opens the page, with an accessible About heading; the name already
appears in the header. The portrait sits in an equal-width column on the
right when both columns keep a comfortable text measure; otherwise the bio
and portrait each fill the page width, portrait first. A link to her CV as a
PDF, **Životopis (PDF)**, follows the bio, and her services close the bio
column — [Explicit]. The facts follow right after the intro, so studios hiring
meet her experience and education before Approach, which ends the page —
[Explicit].
All of it is edited in the one **O mně** entry. The portrait is described by
her credentialed name and loads first, since it opens the page.

The bio follows the general prose rule: longer text can form balanced columns
where each keeps a comfortable width — [Explicit]. Beside the portrait it is
one column; without one it spans the page — [Implicit].

### Experience, education and awards as facts — [Explicit]

Work experience, education and awards are each a quiet plain-text list under
its own section heading. A row reads period, then title and place, with the
department or category under it in grey and its description, if filled, below.
An education row can name its degree, shown in grey under the period, so the
title stays the programme's name alone — [Explicit]. An experience row can list
its skills, such as Archicad, BIM or visualisation, as badges under the period
in the project badge style, so studios hiring see what she worked with and
where — [Explicit].
An empty group shows no heading, so with nothing filled About is the bio. Rows
keep the order they are entered in.

Experience and education sit side by side on wide screens, top-aligned with
matching period columns — [Explicit]. Awards follow below, on the same columns
as the bio and portrait; the period has a column of its own, on phones too —
[Implicit].

### CV as a one-page PDF — [Explicit]

Every deploy prints her CV as one A4 page in each language; About stays the web
version. The file names her, such as
`Tereza-Kalabkova-cv-cs.pdf`, so it reads well in a downloads folder or
attached to an email.

It has a dark sidebar beside a white main column in the site's greys, light
Roboto text with bold Roboto Condensed titles, and experience and education on
a timeline whose line runs from the first dot to the last — [Explicit]. Its
type and spacing are as small and dense as the developer's own CV — [Explicit].
It shows her name, profession and contacts, portrait, links, profile,
experience with skills, education with degrees and awards, but not Approach or
services, and its links lead to the public site — [Implicit].
Content that does not fit the page prints smaller; body text starts just above
the 9 pt minimum, so the build warns almost as soon as it has to shrink —
[Implicit].

### CV-only content in the Životopis entry — [Explicit]

What belongs on the CV but not on the site is edited in **Životopis**: a short
profile for studios, shown as **O mně** instead of About's longer bio; an
optional headline under her name; interests as badges; links such as LinkedIn
after the site's address; and exhibitions and publications, each with an
optional note and link. The CV also lists the projects chosen for the landing
page, in that order, each with its place, period, her roles, its studio when it
has one and its brief, linking its page. It has no languages section: the
profile says she works in Czech and English.

Every optional section is left out when empty, and a profile a hand edit drops
leaves its section out with a build warning; the headline is set in italic
Roboto Condensed — [Explicit]. The profile sits under the portrait, and the
chosen projects open the main column, before her experience — [Explicit]. The
projects are on a timeline like her experience, the sidebar goes on with
exhibitions, interests and links, and a LinkedIn link gets LinkedIn's icon, any
other a generic link icon — [Implicit].

### Work page: a grid of square covers — [Explicit]

Three columns of project covers as square crops, with title, period and location;
hover enlarges the whole tile. Two and then one column on narrower screens —
[Implicit]. The grid holds projects with content blocks and a cover, including
text-only pages with a chosen thumbnail; the cards do not show the brief — [Implicit].

### Work page: an index of projects without cards, expanding in place — [Explicit]

Projects without a cover or without content blocks follow the grid, in the same
order, as a compact index, so the images lead and the rest stays easy to scan; a row with a brief,
facts or badges opens in place to show them. The index has no heading of its own:
its projects weigh the same as the grid's —
[Explicit]. The layout — [Implicit]: the index follows the grid at the grid's
own row gap, with thin rules above, between and below its rows; one aligned row
of period, title and location per project, and a project with a page linking
to it instead of opening. On phones the period sits above the title and location so names and briefs keep a readable width. Expanded brief and facts share the title column at every width; the brief follows the general prose column rule within that width. Without cards the index opens the page.

### Approach section — [Explicit]

How the architect works, after About's facts, as a two-by-two grid: each item
a small icon beside its small-caps label, with the text under it. The items
(label, text and which icon) are added, removed and reordered in the CMS.

The details — [Implicit]: the heading is a section heading like the facts';
one column on phones; the four icons are fixed in code. Hover effects mark only
links and buttons, so Approach items stay still — [Explicit]. In Approach texts
and fact descriptions, every line break the architect types starts a
paragraph, whether she typed one or two — [Implicit].

### Contacts in the footer — [Explicit]

Email, phone and when she receives calls (one short line per language, e.g.
"Po–Pá 10–15") are in every page's footer; email and phone are links, and
phone and hours show only when filled.
Under the © is a link to the legal information page, which holds the business
details a Czech sole trader's site must show; the footer stays uncrowded —
[Explicit].
No contact form: there is no backend to receive one. The footer is the one
place for contacts: no card or call to action above it repeats them —
[Explicit].

The contacts have no label; the icons and links say what they are — [Explicit].
Call hours use a clock icon and a call-hours label for screen readers —
[Implicit].

The layout — [Implicit]: on wide screens one row, the © on the left with the
legal link on a line under it, the contacts in the middle and the theme and
language switches on the right; each contact has its icon, which also separates
it from the next.
All of it is in the footer's small grey type — [Explicit]. When the complete
row no longer fits, the contacts spread across the full first line, with the
© block and the switches below. Only when that contact line does not fit do the
contacts stack on the page's left edge, icons and text each in a column,
followed by © and the switches in one row — [Explicit]. In every layout the ©
and the legal link under it center, as a pair, on the switches and, on wide
screens, the contacts, so their line has as much space below as above —
[Explicit].

### Custom 404 page — [Explicit]

An unknown address gets a page in the site's frame, menu and footer included: a
heading ("Na této parcele nic nestojí." / "Nothing stands on this plot."), a line
asking whether the address is right and a link back to the studio, the landing
page — copy [Explicit]. It is kept out of search engines and the sitemap, and nothing
redirects.

### Legal information page — [Explicit]

**Právní informace** / **Legal information**, linked from the footer, opens
with her business details: her name, registered seat and IČO when filled, and,
with the IČO, that she is registered in the trade register. Then come the
notices her site must carry: how she handles the personal data of people who
contact her (GDPR), and, with the IČO, that Česká obchodní inspekce resolves
consumer disputes out of court, with its web address; the page description
names consumer disputes only then too. So if she stops freelancing, emptying
the IČO takes these off. The texts are fixed in code, short and plain, and fill
in her details from the content, so they follow her edits. They read in one
column at every width, whatever their length — [Explicit].

The details — [Implicit]: each part has a section heading and the page title is
only for screen readers; her business details stand one per line. Like the
other pages it switches language in place and is in the sitemap. `llms-full.txt`
carries her business details — [Explicit] — but not the notices, which say
nothing about her work.

---

## Language

### Dual language (Czech + English) — [Explicit]

Every visible string exists in both languages, CMS content and baked-in labels
alike, including screen-reader labels. Project covers are decorative to
assistive technology because the adjacent title already names them.

### Filled content needs both translations — [Explicit]

An optional text can be omitted in both languages; filling either language
requires the other, including nested image captions, credits and About facts.
The CMS refuses to save a translation filled in one language or with whitespace
alone, so no edit stops the deploy — [Explicit].

### Auto-detected, with a manual switch in the footer — [Explicit]

The original unprefixed URLs select a saved choice, then the first supported browser language, then English, and go directly to content without a selection screen. The footer link shows the language it switches _to_ and saves an explicit choice; language selection stays in the footer rather than the navigation.

### A stable URL for each language — [Explicit]

Czech pages use `/cs/…` and English pages `/en/…`; an explicit language URL always wins over browser or saved preferences. The footer opens the same page in the other language, navigation stays in the selected language, and the viewer's language link retains the selected image.

### Language changes without a page jump — [Explicit]

With JavaScript, the language link updates the current page without reloading, keeping footer position and keyboard focus. In the viewer it retains the same drawing, zoom, pan and description side; Back closes the viewer in the selected language, and Forward reopens its selected image. The links also support ordinary navigation and opening the translation in another tab.

### Language-specific HTML and previews — [Explicit]

Content, page titles, descriptions, alt text and sharing metadata are served in the language named by the URL, including without JavaScript. Unprefixed pages show English content without JavaScript, with the footer language link still available.

---

## Interactivity & motion

### Alive and smooth, but no scroll hijacking — [Explicit]

Motion rides the native scrollbar and stays subtle.

### Page transitions — [Implicit]

Where the browser supports cross-document View Transitions, pages crossfade and
a project's cover moves between its card, on the work or landing page, and its
project page, changing crop on the way; elsewhere, ordinary navigation. The moving
image starts from the card's hover zoom — [Explicit]. It moves only when the cover
matches the first image in an image block at the top of the page; other thumbnail
choices and pages starting with text crossfade — [Implicit].

### Fade-in on scroll, as decoration only — [Implicit] / [Explicit]

Content eases in as it scrolls into view [Implicit]. The page looks and works
the same without it [Explicit]: nothing hides without JavaScript, and nothing
already on screen fades in late.

### Dark mode — [Explicit]

Charcoal background and off-white text; photos and drawings are never inverted.
Follows the system preference until the visitor uses the footer toggle (moon or
sun, showing the mode it switches to), which is remembered.

The dark palette has softer structural rules and separate greys for body text
and secondary information, with stronger contrast for current controls —
[Implicit].

### Reduced motion — [Implicit]

With `prefers-reduced-motion` there are no fades, hover zooms, slides, blends
or turns; changes happen at once or crossfade. The same input reaches the same
states at the same moments.

### Nothing waits for an animation — [Explicit]

Every input changes state at once, and animations chase it: pressing Next five
times quickly lands five images on, in carousels and the lightbox alike, and the
controls describe the new image straight away. A change mid-animation carries on
from where things are on screen, and a drag grabs whatever is moving where it
is; when a visitor swipes a carousel, its dots follow. Where the rule leaves
room — [Implicit]:

- A blend waits for its drawing to load rather than blending to black.
- Opening and closing take input too: closing hands the page back at once, and
  opening again turns the close around.
- The address follows every change, rate-limited only during a held key.

### Rapid image navigation skips unseen images — [Explicit]

Rapid arrows or dots go to the final image without showing or loading the
images skipped, in the carousel and the lightbox alike. Images already partly
visible keep moving continuously towards the new destination.

### Carousels load the images either side — [Explicit]

Once a carousel's current image has loaded, the previous and next ones load
too, so a change shows an image that is already there; the others load only
when needed.

### Carousels wrap through adjacent images — [Explicit]

Moving forward from the last image continues into the first; moving backward
from the first continues into the last. Arrows, automatic advance and native
horizontal scrolling share this circular order.

### Mouse dragging in carousels — [Explicit]

The landing carousel and project image sets follow mouse drags as well as touch
swipes. Short drags snap back; a sideways drag advances through the images, and
releasing it does not open the lightbox. Clicking a project image still opens it.

---

## Project pages and the lightbox

### Ordered blocks — [Explicit]

A project page is an ordered list of text, thumbnail-gallery and full-width
image-set blocks, in any order and repeated freely. A one-image set is a plain
image; more form a manual carousel, whose controls keep a high-contrast palette
in both themes.

### Single full-width images are discoverable in the CMS — [Explicit]

The full-width block's CMS label names both a single image and a slideshow, and
its help explains how the number of images determines the presentation.

### Project pages end with their content — [Explicit]

The footer follows the blocks, as on every page, and a project page carries no
links to the previous or next project.

### Prose columns depend on text length and available width — [Explicit]

Every prose block uses one full-width column until it contains enough text to
benefit from two; longer blocks split only when both columns retain a comfortable
minimum width. Each translation decides independently, and project briefs appear
above the full-width facts. The length threshold and font-relative minimum follow
the same rule across rich text, briefs, About descriptions and image descriptions
— [Implicit]. The legal information page is the exception — [Explicit].

### One lightbox per page, full-screen, controls in the corners — [Explicit]

Every image occurrence is one sequence in page order, each with
its own title and description even when an upload repeats. The drawing fills the
screen over a dark backdrop, with separate controls in the corners and arrows on
the sides; the arrow keys change image too. At 100% nothing covers the image;
zoomed, any part can be panned clear of the controls.

### Opening morphs from the thumbnail — [Explicit]

The clicked image grows from its visible thumbnail into the lightbox, including
when it is partly outside the screen or behind the header, and returns on close.
A crop at the header’s edge opens with the image and closes again on return.
Closing fades when the destination has no visible area or the image is
zoomed or turned; reduced-motion preferences suppress the movement.

### Thumbnail handoff stays continuous — [Explicit] (fade [Implicit])

The thumbnail fades back into the background as the image opens, and fades
under the returning image on close. After navigating, the full image moves
directly to its own thumbnail. Closing captures the hover zoom from the pointer’s
position and holds it for both images until landing; pointer changes during the
return ease into their latest hover state afterward, including when the thumbnail
is partly off screen or behind the header — [Explicit].

### Addressable images — [Explicit]

Each open image has a shareable `#image-N` address, by position, so reordering a
project's images changes it. Moving between images adds no history steps: Back
closes the lightbox, Forward reopens it, and a directly loaded `#image-N` link
closes to the project page before Back leaves it.

### Accessible modal — [Explicit]

Focus moves in on open, cycles inside, and returns to the thumbnail on close
without moving the page. Clicking the backdrop does not close it; ×, Escape and
Back do. Labels follow the page language and a live status announces the
position.

### Inspection: zoom, pan, swipe — [Explicit]

Wheel and pinch zoom toward the pointer, up to native pixel detail; drag pans
when zoomed and double-click or double-tap toggles zoom. At 100% a horizontal
drag slides to the neighbouring image, snapping back if short. `+`/`-`/`0` zoom
too, and a second finger turns a swipe into a pinch — [Implicit].

### High-detail drawings — [Explicit]

Previews use prefiltered responsive images so fine linework does not alias. The
lightbox loads more detail as the visitor zooms, and large drawings use
deep-zoom tiles so only visible regions load. Uploads are never enlarged or
altered; the original is one click away.

### Comparison sets: variants of one card — [Explicit]

Images sharing a comparison set stay ordinary images on the page; in the
lightbox they are variants of one card, switched by a set strip of named
buttons. Moving to a variant blends in place and keeps zoom and pan, so aligned
plans can be compared, and a sideways drag towards it scrubs the blend. The
strip stays one row and scrolls sideways — [Implicit]. In `llms-full.txt` each
image of a set, untitled ones too, names the others in it — [Explicit].

### Titles and descriptions; the card's back — [Explicit]

A bilingual title per image, which the CMS requires and asks to keep short, and
an optional description, shown only in the lightbox — [Explicit]. Wherever an
image is described to machines (alt text on the page and in the lightbox, the
structured data's image name), a titled image is named by its title followed by
its project's title and location in the current language, so the title can stay
short — [Explicit]; a name the text already contains is left out — [Implicit].
An untitled image has none — [Explicit]. Screen readers hear an image's button
on the page by its own short name, its position and title ("Otevřít obrázek 2:
Řezy", only the position when untitled), instead of the alt text — [Explicit].
Descriptions are machine-readable in the structured data — [Implicit] — and
titles and descriptions are in `llms-full.txt` with links to the images and to
where the project page opens them in the lightbox — [Explicit]. There the titles
stay plain, since each image is already under its project's heading —
[Implicit]. The title shows in the top-left set strip: a titled image outside a
set gets a strip of one, an image with neither title nor set gets none. A
description lives on the card's back, reached with the bottom-left toggle, which
turns the card over in 3D:

- The back is paper in the page's theme, the drawing's shape and size, growing
  only as far as its text needs — [Explicit]; a card taller than the screen
  scrolls as a page — [Explicit], its scrollbar shown only on the back —
  [Implicit].
- The turn zooms out to the whole card and back to the exact view left —
  [Explicit].
- On the back, a sideways swipe only turns the card back, rotating the way the
  finger moves — [Explicit]; a mouse selects text, so the mouse uses the toggle
  — [Explicit]. Other turns go the way the change travels — [Implicit].
- On phones the edge arrows slide aside while the text shows — [Explicit], and
  return as the next card slides in — [Implicit].
- Any change of image shows the new image drawing side up.

---

## Reach

### Custom domain at the root — [Explicit]

Served at the architect's own domain; the `*.github.io` URL redirects to it.

### SEO and sharing — [Implicit]

Per-page title, description and canonical address, Open Graph and Twitter tags,
a sitemap, and a `robots.txt` that admits every crawler and names the sitemap.
Tab titles pair page and credentialed name with `|`, e.g. "About | Ing. arch.
Tereza Kalábková" — [Explicit]. A project's adds the place its title doesn't
already name, e.g. "Hasičská zbrojnice, Doubravník | …" — [Explicit].

### Project descriptions from the brief — [Implicit]

A project page's description in search results and link previews is its brief,
else the start of its first text block; the landing page uses the site's SEO
description.

### About, Work and legal descriptions — [Explicit]

About is described by the start of its bio, Work by its project titles in page
order, as many whole titles as fit, and the legal page by a fixed line naming
its sections, so these pages don't repeat the site description.

### Share image: the project cover — [Implicit]

A project's link preview shows its cover, the work page's the first cover in its
grid, the landing page's its first landing image that is not an SVG, else its
first project's cover, and the About page's the portrait, as a JPEG about 1200px wide, the
format every social site shows. Social sites do not show SVGs, so an SVG gives
no preview image.

### Facts for search engines and AI assistants — [Implicit]

So that an assistant asked which architect to hire can quote her, every page
carries structured data (schema.org) about the architect: name, credential,
contact, services and awards; a project page adds its project location, credits,
award and status, its cover and its titled or described images, each linked at
the size the lightbox opens it at.
The architect's data includes her IČO when filled — [Explicit].
It also says where she works, the schools she studied at and the site
description; the Work page lists every published project, including those
without a page, and a project links an outside page about the project —
[Explicit]. It states the degree a study's row names — [Explicit] — for
finished studies only — [Implicit]. The skills from all experience rows are
what she knows about — [Explicit]. Her CV links, such as LinkedIn, name her
profiles elsewhere — [Implicit].

### Bilingual index and full export for AI assistants — [Explicit]

`/llms.txt`, linked from each page's head, is her contact line and a compact
index of About, Work and every published project, each linked in both canonical
languages with the language named (a project without its own page links to
Work) and noted with its place, period and build status — [Explicit] — and its
other title badges — [Implicit]. `/llms-full.txt` gathers her profession, bio,
approach, experience with its skills, services, education, awards, contact
details with call hours, IČO and seat, and every published project in the Work
page's order with its facts, texts and image captions, including projects
without a separate page. Long passages identify Czech (`cs`) and English
(`en`) explicitly.

### The landing page's tab title says what she is — [Explicit]

"Ing. arch. Tereza Kalábková | Architektka" in Czech, "… | Architect" in
English: the credentialed name and her profession. Other pages lead with their
own name, e.g. "Práce | Ing. arch. Tereza Kalábková".
