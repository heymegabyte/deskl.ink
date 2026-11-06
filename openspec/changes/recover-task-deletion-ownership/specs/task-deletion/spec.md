## ADDED Requirements

### Requirement: Task deletion enforces project ownership

The system SHALL reject deletion of an existing task when its stored project ID differs from the requested project ID, before invoking cleanup providers or mutating persisted task, workspace, or view state.

#### Scenario: Foreign task deletion

- **WHEN** project B requests deletion of a task owned by project A
- **THEN** deletion rejects and preserves the task and workspace without cleanup or deletion telemetry

#### Scenario: Owned and missing task deletion

- **WHEN** the requested project owns the task
- **THEN** existing deletion options and cleanup behavior are preserved
- **WHEN** the task does not exist
- **THEN** deletion remains a no-op

### Requirement: Deletion preflight enforces project ownership

The system SHALL reject preflight for an existing foreign task before resolving its worktree, including tasks with no branch.

#### Scenario: Foreign branchless task preflight

- **WHEN** project B requests preflight for project A's branchless task
- **THEN** preflight rejects rather than returning an empty result

### Requirement: Batch deletion validates ownership before deletion

The system SHALL validate every existing selected task's ownership before dispatching any deletion in the batch.

#### Scenario: Mixed-project batch

- **WHEN** a batch contains an owned task and a foreign task in either order
- **THEN** the batch rejects before deleting either task or invoking deletion cleanup

#### Scenario: Empty batch or missing IDs

- **WHEN** an empty batch is submitted
- **THEN** no deletion is dispatched
- **WHEN** an otherwise owned batch contains missing task IDs
- **THEN** existing tasks are deleted normally and missing IDs remain no-ops
