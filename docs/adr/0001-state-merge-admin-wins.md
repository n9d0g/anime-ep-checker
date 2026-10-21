# Cron state commits merge field by field, and the admin wins conflicts

Both the checker cron and the admin app write `state.json`. A check run can take minutes, so the cron commit does a field-level 3-way merge (the run's starting version, the run's result, and the current remote) instead of overwriting the file. When both sides changed the same field, the admin's value wins and the merge logs the conflict: admin edits are deliberate human actions, and anything the checker loses is recomputed on its next run.

## Consequences

If the checker alerts on an episode while the admin manually sets that show's last episode lower, the admin value wins and the episode is alerted again on the next run. We accept this rare duplicate rather than special-casing individual fields.
