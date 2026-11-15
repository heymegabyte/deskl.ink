## ADDED Requirements

### Requirement: GNOME is the default new desktop environment

The system SHALL create new desktop-form computers from a released, immutable GNOME catalog entry
unless the user explicitly selects another released environment. Server-form computers SHALL remain
headless. Existing computers SHALL retain their pinned environment and image revision.

#### Scenario: Default desktop creation

- **WHEN** an authorized user creates a desktop-form computer without selecting an environment
- **THEN** the system pins the current released GNOME catalog entry and its compatible resource tier
- **AND** discloses the image profile and hourly price before compute commitment

#### Scenario: Existing machine is not silently migrated

- **WHEN** GNOME becomes the default and an existing machine is pinned to another environment
- **THEN** start and restore continue using that compatible pin
- **AND** no environment migration occurs without an explicit separately validated operation

### Requirement: GNOME availability is acceptance-gated

The system SHALL offer GNOME only on tiers whose pinned image has passed boot, readiness, browser
transport, input, accessibility, memory, shutdown, checkpoint, and independent-restore acceptance.

#### Scenario: Tier lacks GNOME acceptance

- **WHEN** a tier has missing or failed GNOME acceptance evidence
- **THEN** the system excludes that tier from GNOME creation
- **AND** does not silently substitute an unaccepted image or environment
