# ADR-0013: Documentation serves two audiences; the user guide lives only on the docs site

Date: 2026-07-10. Status: accepted.

## Context

Through ADR-0012 the documentation was written for one reader: an engineer or
data scientist evaluating the design. Every workflow was shown as schema, SQL,
or API code. But the product's daily users are clinical operations staff —
CRAs, coordinators, TMF specialists — and the docs gave them no task-based
entry point, no glossary, and no walkthroughs of the app.

The gap had already produced a defect of the kind this project treats as
serious: `operations.qmd` captioned a screenshot with "recording a new
deviation is a form on the same page" when no such form existed in the app.
Docs claims had run ahead of the code.

## Decision

1. **Two documented audiences.** The docs site carries a task-based user
   guide (`docs-site/user-guide/`, plus a top-level glossary) for clinical
   operations readers, alongside the existing technical guide, cookbook, and
   SQL material. `index.qmd` routes each audience at the top.
2. **The user guide has no `docs/` mirror.** The usual convention is that
   `docs/*.md` and `docs-site/*.qmd` overlap deliberately. The user guide is
   screenshot-driven and reads as a product manual, which plain-markdown
   design docs can't carry; the mirror rule is explicitly waived for it (and
   for the glossary). `docs/01-vision.md` records the two-audience split in
   one sentence.
3. **Guide content must never describe UI the app doesn't have.** The
   `issues.png` caption incident is the motivating example. Where a guide
   page needs UI that doesn't exist, the UI is built first (the issue form,
   milestone management, new-version upload, the signing confirmation, and
   the audit page shipped together with the guide for exactly this reason).
4. **Existing rules carry over unchanged:** screenshots regenerate only via
   `docs-site/screenshots.mjs` (ADR-0007); regulatory language in the guide
   and glossary stays deliberately general unless verified against source
   texts with a citation (ADR-0012); no TMF taxonomy content from model
   memory (ADR-0005).

## Consequences

- Clinical operations readers get a code-free path through every workflow the
  app supports, and the app now supports every workflow the operations docs
  describe.
- Guide statuses and walkthroughs can drift from the UI only if someone
  changes the app without re-running the screenshot script and re-reading the
  guide — the screenshot regeneration step is the tripwire, since stale shots
  are visually obvious.
- The waived mirror means a `docs/`-only reader sees no user-guide content;
  that is accepted, since that reader is by definition the technical
  audience.
