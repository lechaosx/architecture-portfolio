# AGENTS.md

Guidance for Agent (and any contributor) working in this repo. Its first job is
to keep the documentation trustworthy.

## The docs, and what each answers

| File | Audience | Answers |
|------|----------|---------|
| [README.md](README.md) | Visitors + site owner | "How do I …?" (use the site, edit content, go live) |
| [MAINTAINERS.md](MAINTAINERS.md) | Developer | "How do I …?" — same as README but for building/changing the code |
| [FEATURES.md](FEATURES.md) | Anyone | "Why does it behave this way?" — product decisions |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Developer | "Why is the code shaped this way?" — technical decisions |

FEATURES and ARCHITECTURE tag every decision **[Explicit]** (the user asked for
it by name or chose it when offered) or **[Implicit]** (Agent proposed it and
the user didn't push back). When Agent proposes something and the user neither
pushes back nor explicitly asks for it, it is **[Implicit]**.

## Documentation is part of the change — not a follow-up

**Keeping the docs accurate takes priority over keeping responses short. Update
the relevant docs in the SAME response that changes the code — never defer
documentation to a later turn.**

Before finishing any change, check whether it affects:

- **Behavior a user would notice** → update FEATURES.md (and README.md if it
  changes how the owner does something).
- **Code structure, tech, or a technical trade-off** → update ARCHITECTURE.md
  (and MAINTAINERS.md if it changes a dev workflow).
- **A new decision** → add it to FEATURES/ARCHITECTURE with an
  [Explicit]/[Implicit] tag.

## Flag code↔docs skew — let the developer decide

If you notice the code and the docs disagree (a doc describes something the code
no longer does, or vice-versa), **do not silently "fix" either side**. Surface
the discrepancy explicitly to the developer and ask which is the source of
truth — the intended behavior may have changed, or the code may have drifted.
Only then reconcile them.

## Known invariants to protect

- **Two schemas must stay in sync:** `src/content.config.ts` (Zod, build-time)
  and `.pages.yml` (Pages CMS editing UI). Change both together. See
  ARCHITECTURE.md → "Two sources of truth for content shape".
- **Deployment is declared in `deploy.config.json`** (targets + `active`
  selector); `astro.config.mjs` just applies it and emits `CNAME`. Don't hardcode
  URLs/paths or add CI logic. Every internal link/asset MUST go through
  `withBase()` (`src/lib/url.ts`) — a hardcoded `/…` path breaks the project-URL
  deployment. See ARCHITECTURE.md → "Dual deployment".
- **Islands stay minimal:** hydrated Svelte components should be the exception.
  Adding broad client-side JS contradicts the explicit "fast and clean" goal —
  if it's needed, record it as a decision in ARCHITECTURE.md.

## Verifying a change

Run `bun run build` (via `nix develop`) before declaring a change done; the build
validates content against the schema. See MAINTAINERS.md for commands.
