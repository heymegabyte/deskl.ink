# Design: Premium GNOME desktops, durable inactivity recovery, and funded access

**Architect Role:** assigned

## Context

The authoritative path remains Browser → Worker → per-desktop Durable Object → Cloudflare Container.
D1 owns relational account, machine, price, and ledger records. Durable Object storage owns small
per-machine lifecycle coordination. R2 owns durable checkpoint objects and manifests. Containers are
replaceable compute and must never be the only copy of user work.

The design must coordinate three boundaries that cannot be implemented independently:

1. inactivity may stop compute only after a verified durable save;
2. restore may open interactive access only after funded authority and checkpoint validation; and
3. account credit depletion must fence every machine, not merely the tab that notices it first.

## Goals

- A premium GNOME default with explicit resource acceptance.
- Durable, replacement-tested filesystem recovery after inactivity.
- A replay-safe $25 starting credit and versioned premium prices.
- No unfunded interactive or background compute after the account-wide lock commits.
- No implicit card charge and no destruction of the last verified user state.

## Architecture

### GNOME image and catalog

New desktop catalog entries pin distribution, architecture, GNOME image revision, minimum resource
tier, and checkpoint schema compatibility. `desktop` creation defaults to the released GNOME entry;
`server` creation remains headless. Existing machine rows retain their image revision and desktop
environment. Migration is a separate operation that first creates a checkpoint and proves restore
against the target image; it is not part of this change's initial activation.

GNOME acceptance measures boot-to-usable latency, idle and active memory, browser transport,
accessibility, shutdown behavior, and checkpoint/restore on every offered tier. A tier that cannot
run the accepted GNOME baseline is not offered rather than silently degrading to another desktop.

### Versioned premium price book

Price revisions are immutable D1 records with effective time, currency, per-tier hourly rate,
source snapshot, infrastructure cost evidence, storage policy, and approval identity. A machine run
pins one revision before compute starts; later price changes affect only a new run after disclosure.
Metering uses fixed-point USD nanos and server-observed running intervals.

The initial proposed retail schedule is:

| Tier      | Proposed hourly price |
| --------- | --------------------: |
| Everyday  |                 $0.29 |
| Developer |                 $0.49 |
| Power     |                 $0.79 |
| Heavy     |                 $1.19 |

These are product prices, not claims of hardware equivalence. Before approval, PricingService must
record current Cloudflare cost and a dated competitor review. Reference anchors include AWS
WorkSpaces' hourly-plus-base-fee model, AWS WorkSpaces Applications' published streaming examples,
E2B's runtime estimator, Daytona's per-second sandbox model, and Shadow's bundled persistent-PC
subscriptions. Primary references:

- https://aws.amazon.com/workspaces/pricing/
- https://aws.amazon.com/workspaces-family/workspaces/faqs/
- https://aws.amazon.com/workspaces/applications/getting-started/
- https://pricing.e2b.dev/
- https://www.daytona.io/docs/billing
- https://shadow.tech/us/shadowpc/

Activation rejects a revision that lacks evidence, falls below the approved cost/margin floor, uses
non-USD or floating-point values, or is not disclosed before commitment.

### Starting credit and ledger authority

The wallet is an append-only fixed-point ledger. On first verified-account eligibility, a
deterministic promotion key posts exactly $25 to a non-withdrawable promotional bucket. Retries,
OAuth linking, email changes, and concurrent sign-ins resolve to the same account grant. Anonymous
sessions do not receive independent grants that can later stack; any prior guest promotion must be
deducted or merged under an explicit promotion policy before the verified balance reaches $25.

Available balance excludes active reservations. Every start or restore reserves a bounded running
interval plus a checkpoint-and-stop reserve. Settlement consumes promotional funds before paid funds
unless the published promotion terms specify otherwise. No operation may create a negative balance.

### Inactivity checkpoint state machine

The per-machine Durable Object is the single lifecycle writer. Authenticated keyboard, pointer,
touch, terminal, file, or explicit keep-working actions update meaningful activity; polling,
stream keepalive, and background processes do not.

The initial inactivity interval is ten minutes and is versioned policy, not a browser timer. On its
alarm the coordinator fences new input and transitions:

`running → checkpointing → checkpoint-verified → stopped`

The checkpoint agent quiesces supported paths, computes an incremental manifest relative to the
pinned image baseline, uploads content-addressed encrypted chunks through operation-scoped
credentials, writes an immutable manifest, verifies object availability and hashes, and atomically
advances a two-phase last-known-good pointer. Only then may the container stop and metering close.
Failure leaves the prior last-known-good generation intact, keeps the machine visibly degraded, and
retries within a bounded cost reserve; it never reports “saved” prematurely.

R2 is the Cloudflare-native deployment target. Its S3-compatible interface is the transfer protocol,
not an abstraction promising arbitrary storage portability. Checkpoint metadata records image/base
revision, schema, owner, machine, generation, timestamps, supported paths, tombstones, modes,
ownership, logical/stored hashes, and retention deadline. RAM, running processes, and unapproved
system paths are explicitly outside the cold-restore guarantee.

### Signed-in return and restore

Returning to a machine requires an active signed-in owner, an unlocked funded account, a compatible
released image, and a verified checkpoint. The coordinator reserves funds before allocating compute,
creates a fresh pinned container, restores and validates the checkpoint, runs readiness, rotates
connection credentials, and only then issues a short-lived viewer capability. Restore is idempotent
by operation key and single-flight per machine.

If no verified checkpoint exists, the UI discloses that durable recovery is unavailable and requires
an explicit clean-start choice; it must not silently open an empty home directory as a successful
restore. Corrupt or incompatible state preserves the last-known-good record and blocks access pending
retry, migration, or support recovery.

### Account-wide depletion lock

The account wallet coordinator serializes reservations and is authoritative for funded access. When
available balance cannot cover the next interval plus shutdown reserve, it commits an account lock
generation and emits a durable outbox command for every nonterminal machine. Each machine coordinator
rejects new start, restore, input, and agent-execution authority at or behind that generation, revokes
viewer/control capabilities, performs the same verified checkpoint flow, and stops compute.

The account is not considered fully cost-contained until reconciliation confirms every machine is
stopped or records an actionable cleanup incident. Provider TTL is a backstop, never the primary
stop mechanism. A failed checkpoint remains fenced and uses only the pre-reserved shutdown budget;
it cannot reopen interactive access.

The browser shows a billing-required state with balance, stopped/checkpoint status, disclosed price,
and an explicit Add balance action. “Force billing” means force this funded-access gate. Stripe
Checkout remains a user-authorized test-mode flow; the system does not automatically debit a card.
After a verified webhook posts paid funds, unlocking is explicit and replay-safe. Machines remain
stopped until the owner chooses one to restore, avoiding an account-wide cost spike.

## Concurrency and failure handling

- Every lifecycle, promotion, top-up, lock, checkpoint, and restore command has a deterministic
  idempotency key; conflicting replay fails closed.
- The wallet lock generation and each machine fence prevent stale tabs or callbacks from reopening
  access after depletion.
- D1 records intent before external compute/storage effects. Ambiguous effects reconcile by labels,
  operation IDs, manifests, and object receipts rather than blind retry.
- A top-up racing with depletion may fund the account, but cannot cancel an already fenced save.
  Unlock becomes available only after lock reconciliation; stopped machines do not auto-resume.
- Last-known-good checkpoint pointers advance only after verification and never point to partial data.

## Security and privacy

- Tenant desktops receive only operation-scoped, short-lived R2 capabilities, never account-level R2
  or Stripe credentials.
- Checkpoint object keys are tenant/machine scoped; authorization is checked independently of key
  secrecy. Encryption, retention, deletion, and audit events are mandatory.
- Viewer and agent capabilities bind owner, machine, resource, permissions, fence, issue time, and
  expiry. Account lock invalidates them through the authoritative fence.
- Billing UI and APIs derive ownership and prices server-side. Browser-reported balance, activity,
  elapsed time, checkpoint identity, or price is never authoritative.

## Rollout

1. Ship schemas, disabled flags, immutable price revisions, promotion ledger, and lifecycle states.
2. Build and acceptance-test GNOME images without changing the default.
3. Prove checkpoint/restore after deleting a disposable source container.
4. Prove account-wide depletion across multiple machines, including failure and reconciliation.
5. Run Stripe test-mode top-up and billing reconciliation.
6. Enable GNOME and the premium price book for an internal cohort, then staged accounts.
7. Keep existing machines pinned; offer migration only after independent acceptance.

## Open questions and research gates

- Verify current Cloudflare Container runtime and GNOME resource limits on every tier.
- Select and validate the checkpoint engine against current R2 S3 semantics; restic is a candidate,
  not an assumed final implementation.
- Approve inactivity duration, checkpoint retention, storage charging, and premium price margins from
  measured evidence.
- Confirm promotion eligibility, tax, refund, dispute, and regional consumer-law treatment before
  live billing.
