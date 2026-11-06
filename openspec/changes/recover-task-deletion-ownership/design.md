# Task deletion ownership recovery

**Architect Role:** assigned

## Decision

After task lookup, reject an existing task whose stored `projectId` differs from the requested project, before project lookup, teardown, workspace/task deletion, view-state cleanup, telemetry, worktree removal, or branch deletion. Apply the same guard in preflight before its branchless early return.

Validate all existing batch task rows before dispatching concurrent single-task deletions. Keep the single-task guard as defense in depth. Wire the service batch method through that operation so deletion hooks run only after successful validation and deletion.

## Compatibility and limits

Missing task IDs remain no-ops for deletion and retain the existing empty preflight item. Empty batches remain no-ops. Matching owner requests preserve cleanup and option behavior. No transaction is added around asynchronous provider cleanup; this change guarantees rejection of an initially mixed-project batch before deletion, not general atomic rollback for provider failures. Current creation assigns ownership and the inspected task operations do not expose task project reassignment.

Preflight remains read-only and concurrent; rejection of a mixed selection may occur while an owned task's read-only preflight runs. This recovery does not claim batch preflight has zero provider reads.

## Validation

Use real isolated SQLite fixtures to prove cross-project deletion preserves tasks/workspaces and calls no cleanup providers. Cover branchless foreign preflight, both mixed-batch orders, owner cleanup, missing IDs, and empty batches. Keep existing preflight unit coverage. Run repository formatting, lint, typecheck, and tests, reporting native toolchain blockers separately from assertion failures.
