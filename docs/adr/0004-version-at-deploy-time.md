# Versions are released by the deploy, not by hand

We want a version number and Release notes in the admin without writing either by hand. The admin deploy runs on every push to `main` except the checker's and the admin CMS's data commits (`state.json`, `shows.json`). It bumps the last `v*` tag as the push's conventional commits ask (`admin/scripts/next-version.ts`): `feat` is a minor bump, `fix`/`perf`/`refactor`/`build` a patch, and other types release nothing. It builds with that version in `admin/package.json`. Once `vinext-cloudflare deploy` succeeds, it creates the GitHub Release on the deployed commit, with the PR title as its notes, and pushes a `chore: release x.y.z` commit to `main` bumping `admin/package.json`. Tags are the counter and `package.json` mirrors them, so a failed deploy or a lost bump push never leaves a version that wasn't live. The build reads the GitHub Releases and bakes them into the Releases page. This is the same approach as nhf-worship's ADR-0008, and history starts at v0.1.0.

## Considered options

- **A hand-edited release notes file bumped in each PR**: PRs open at the same time would claim the same version, and the notes would be written twice (the PR title, then the file).
- **release-please**: every change needs a second release PR to merge (which doesn't run CI, since the built-in token opened it) and a second deploy.
- **Release only on admin changes**: checker-only changes (a better announcement check) would never show up in the notes you read in the admin.

## Consequences

PRs are squash-merged only, so a PR's title becomes the commit the deploy reads; titles must be conventional commits. Deploys queue rather than cancel, so a released version is always the one live. The deploy job has `contents: write`. Pushes and releases made with the built-in token don't start workflows, which stops the bump commit deploying again. The bump can race the checker's `state.json` push, so both retry on a rejected push.
