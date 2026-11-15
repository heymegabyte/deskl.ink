## ADDED Requirements

### Requirement: Inactivity saves durable state before stopping compute

The system SHALL use authoritative meaningful activity and a versioned inactivity policy to fence
access, create and verify a durable checkpoint, advance the last-known-good pointer, and only then
stop billable compute. The initial policy SHALL use a ten-minute inactivity interval.

#### Scenario: Machine becomes inactive

- **WHEN** no accepted meaningful activity occurs for the configured interval
- **THEN** the machine coordinator fences new interaction and creates an R2 checkpoint
- **AND** stops compute only after the checkpoint and last-known-good pointer are verified

#### Scenario: Checkpoint fails

- **WHEN** upload, manifest validation, or pointer advancement fails
- **THEN** the prior last-known-good checkpoint remains authoritative
- **AND** the machine remains fenced and visibly degraded while bounded retry or recovery runs
- **AND** the system does not report that the machine was saved successfully

### Requirement: R2 is durable recovery truth

The system SHALL store tenant-isolated immutable checkpoint chunks and manifests in R2 using
operation-scoped S3-compatible capabilities. Provider snapshots and container filesystems SHALL NOT
be the sole durable copy.

#### Scenario: Source container is replaced

- **WHEN** the source container has been deleted and the owner requests the stopped machine
- **THEN** the system can restore supported filesystem state from the verified R2 generation into a
  fresh compatible pinned image
- **AND** validates hashes, tombstones, modes, ownership, scope, schema, and base compatibility

### Requirement: Signed-in return restores before access

The system SHALL require an authenticated owner, funded unlocked account, compatible image, and
verified checkpoint before restoring. It SHALL issue viewer or agent access only after restore,
readiness, metering initialization, and credential rotation succeed.

#### Scenario: Owner returns to a stopped machine

- **WHEN** the signed-in owner opens a stopped machine with sufficient funds and a verified checkpoint
- **THEN** the system reserves funds, restores a fresh pinned container, verifies readiness, and
  issues a new short-lived access capability

#### Scenario: Durable recovery is unavailable

- **WHEN** no compatible verified checkpoint exists
- **THEN** the system discloses that durable recovery is unavailable
- **AND** requires an explicit clean-start or recovery decision rather than presenting empty state as
  a successful restore

### Requirement: Recovery guarantees are explicit

The system SHALL describe cold recovery as filesystem-only and expose the last verified generation,
verification time, retention deadline, degradation reason, and possible loss of newer changes.

#### Scenario: User reviews recovery status

- **WHEN** an owner views a running, saving, stopped, restoring, locked, degraded, or failed machine
- **THEN** the system returns owner-scoped recovery status and the exact last verified checkpoint
- **AND** does not claim RAM, live-process, or arbitrary system-package continuity
