# Violation System v3

This folder is the rollback-safe v3 prompt pack for the worker.

Current status:
- `docs/prompts/` remains the v2 baseline and rollback path.
- `VIOLATION_SYSTEM_VERSION=v3` enables the v3 overlay in the worker.
- `VIOLATION_SYSTEM_VERSION=v2` restores the current live behavior immediately.

Design notes:
- v3 keeps the same worker topology and internal IDs.
- v3 changes the human-facing title style to title-only violation names.
- v3 keeps article/atom codes for backend routing only.
- v3 follows the newer violations handbook, but does not replace v2 until we finish validation.

Rollback plan:
1. Set `VIOLATION_SYSTEM_VERSION=v2`.
2. Redeploy worker.
3. v2 prompt behavior returns without touching the stored findings.

