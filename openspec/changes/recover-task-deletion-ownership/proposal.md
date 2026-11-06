# Recover task deletion project ownership checks

**Architect Role:** assigned

## Why

Current deletion and preflight operations look up tasks by ID but accept a separate project ID without checking ownership. A stale or malformed request can delete another project's task or use the wrong project's repository during preflight. Retained commits `6652ce01` and `df69e896` contain bounded fixes that are absent from this worktree's starting HEAD.

## Scope

Recover the retained single-task ownership checks and batch validation, including their regression tests. Preserve missing-task behavior and valid owner deletion. No schema, UI, IPC signature, provider, or deployment changes.

## Impact

Cross-project requests reject before destructive side effects. Mixed-project batch deletion rejects before deleting any selected task. Existing owner requests keep their current behavior.
