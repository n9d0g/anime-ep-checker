# Run TypeScript directly on Node, with `.ts` import extensions

The cron gate (`should-run`) and the checker run `.ts` files directly using Node's built-in type stripping, with no build step and no `tsx`. This lets the gate import the real `schedule` and `reddit-feeds` modules instead of keeping a hand-copied JavaScript version that drifted. Node's type stripping only resolves real file names, so relative imports in `src/` and `shared/` use `.ts` extensions, not `.js`. Don't "fix" them back to `.js`.

## Consequences

Code run by the gate or the checker must use only erasable TypeScript syntax (no `enum`, no `namespace`, no parameter properties). The admin's bundler accepts the same `.ts` imports, so `shared/` modules work in both.
