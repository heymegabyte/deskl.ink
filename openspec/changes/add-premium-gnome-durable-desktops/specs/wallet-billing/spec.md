## ADDED Requirements

### Requirement: Retail prices are immutable, premium, and disclosed

The system SHALL use approved immutable fixed-point USD price revisions informed by current
infrastructure cost and dated competitor evidence. Every run SHALL pin and disclose its tier price
before commitment, and active-run prices SHALL NOT change retroactively.

#### Scenario: Start uses an approved price revision

- **WHEN** a funded user starts or restores a machine
- **THEN** the system discloses the tier, hourly price, estimated funded duration, and revision
- **AND** persists that revision before allocating compute

#### Scenario: Price evidence is incomplete

- **WHEN** a price revision lacks cost evidence, market source snapshot, effective time, or approval
- **THEN** the system rejects it for customer settlement

### Requirement: Eligible accounts receive exactly $25 starting credit

The system SHALL grant an eligible verified account exactly one non-withdrawable $25 promotional
starting balance through an append-only idempotent ledger entry. Identity linking, retries, and guest
upgrade SHALL NOT stack multiple grants.

#### Scenario: First verified-account eligibility

- **WHEN** an account becomes eligible for the starting promotion
- **THEN** the system posts one $25 promotional credit under a deterministic external key
- **AND** retry returns the same ledger result without adding balance

#### Scenario: Guest identity is upgraded or accounts are linked

- **WHEN** identities with prior promotional value merge into one verified account
- **THEN** the promotion policy produces no more than $25 total starting promotional value
- **AND** preserves an auditable transfer and consumption history

### Requirement: Compute requires funded authority

The system SHALL reserve sufficient available balance for a bounded running interval plus verified
checkpoint and stop before starting or restoring compute. Available balance SHALL never become
negative and browser-reported balance SHALL never authorize compute.

#### Scenario: Funds cannot cover safe execution

- **WHEN** available balance cannot cover the next interval and shutdown reserve
- **THEN** the system refuses new compute authority and initiates the account billing lock

### Requirement: Depletion locks every machine

The system SHALL commit a monotonic account-wide billing-lock generation when funded authority is
depleted. Every billable machine SHALL reject interaction and background execution, revoke access,
checkpoint, and stop under that fence.

#### Scenario: Account balance is depleted with multiple running machines

- **WHEN** the wallet coordinator cannot renew funded authority
- **THEN** it durably locks the account and dispatches one idempotent fenced stop command per machine
- **AND** each machine revokes viewer and agent capabilities, saves durable state, and stops compute
- **AND** reconciliation reports any machine not confirmed stopped

#### Scenario: Stale tab acts after lock

- **WHEN** a stale viewer, callback, or agent command carries an older lock or machine generation
- **THEN** the system rejects it without reopening access or extending billable runtime

### Requirement: Billing re-entry requires explicit payment and unlock

The system SHALL route locked accounts to a billing-required state with an explicit Add balance
action. It SHALL NOT charge a stored payment method without separate user authorization. Unlock SHALL
occur only after verified idempotent payment fulfillment and SHALL NOT automatically resume all
machines.

#### Scenario: Locked user adds balance

- **WHEN** a user explicitly completes Checkout and a verified webhook posts paid funds
- **THEN** the system makes the account eligible for an explicit unlock
- **AND** leaves machines stopped until the owner selects one to restore

#### Scenario: Payment is absent, delayed, or duplicated

- **WHEN** Checkout is abandoned, fulfillment is delayed, or a webhook is replayed
- **THEN** no unfunded machine resumes
- **AND** duplicate fulfillment does not add balance twice
