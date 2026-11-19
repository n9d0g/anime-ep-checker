## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues for n9d0g/anime-ep-checker, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the default label names: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Releases

- PR titles must be conventional commits (`feat: ✨ …`, `fix: 🐛 …`, `chore: …`). PRs are squash-merged, so the title becomes the commit the deploy reads to choose the next version and write the Release notes (ADR 0004).

## Admin UI

- Admin UI uses shadcn/ui on Tailwind v4 (preflight on): primitives in `admin/components/ui`, styled with Tailwind classes. `admin/app/styles.css` is the one stylesheet: the tokens (`--bg`, `--panel`, `--accent`, …), their shadcn mappings, the `page-column` utility and a few element rules. Style new UI with classes, not new CSS there.
- Check UI changes at phone (375px), tablet (820px) and desktop (1280px) widths. Below 900px is "phone or tablet" (the floating tab bar, drawers).
