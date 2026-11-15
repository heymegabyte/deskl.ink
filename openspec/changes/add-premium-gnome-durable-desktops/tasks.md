# Implementation tasks

## 1. Gates and contracts

- [ ] Verify current Cloudflare Container, R2 S3, GNOME resource, Stripe, tax, and competitor-pricing evidence; record dated primary sources and approvals.
- [ ] Add shared Zod contracts for GNOME catalog pins, immutable price revisions, wallet balances/reservations, checkpoints, restore status, inactivity policy, and account lock generations.
- [ ] Add deny-by-default flags for GNOME defaulting, premium prices, promotional credit, inactivity checkpointing, restore, account-wide lock, and paid unlock.
- [ ] Add migration-safe D1 schema and generated migrations for price revisions, ledger entries, reservations, checkpoints, lock generations, outbox commands, and audit evidence.

## 2. GNOME default

- [ ] Build a pinned GNOME desktop image with browser transport, checkpoint agent, readiness probes, accessibility baseline, and no tenant or platform secrets.
- [ ] Measure and accept GNOME boot latency, idle/active memory, input, transport, shutdown, and checkpoint behavior per offered tier.
- [ ] Make the released GNOME catalog entry the default only for new desktop-form machines; preserve server behavior and existing image pins.
- [ ] Add explicit, reversible migration planning for existing desktops without silently changing their environment.

## 3. Pricing and starting credit

- [ ] Implement immutable fixed-point USD price revisions with infrastructure cost, competitor source snapshot, effective time, and operator approval.
- [ ] Approve or revise the proposed $0.29/$0.49/$0.79/$1.19 hourly schedule from measured cost and market evidence.
- [ ] Disclose the pinned tier price and funded duration before start/restore; keep later price changes from altering active runs.
- [ ] Implement the append-only wallet and exactly-once $25 verified-account promotion, preventing guest/account or linked-identity stacking.
- [ ] Implement bounded run plus checkpoint/stop reservations, observed settlement, release, reversal, refund, dispute, and reconciliation.

## 4. Durable inactivity save and restore

- [ ] Implement authoritative meaningful-activity recording and a versioned ten-minute inactivity alarm; exclude polling, keepalive, stream traffic, and background processes.
- [ ] Implement the versioned checkpoint agent and manifest for supported paths, baselines, tombstones, modes, ownership, exclusions, hashes, compression, quotas, and quiescing.
- [ ] Add tenant-isolated R2 storage with operation-scoped S3 credentials, immutable chunks/manifests, two-phase last-known-good advancement, retention, deletion, and audit.
- [ ] Make checkpoint-before-stop durable and idempotent; never report saved/stopped until verification and preserve the prior generation on failure.
- [ ] Restore into a fresh compatible pinned image before readiness or viewer access; rotate credentials and clean up failed replacement compute.
- [ ] Surface filesystem-only recovery scope, last verified checkpoint, retention deadline, degradation, progress, and clean-start fallback.

## 5. Depletion lock and billing re-entry

- [ ] Implement atomic account-level funding checks and monotonically increasing billing-lock generations.
- [ ] Fan out durable fenced lock commands to every billable machine; revoke viewer/agent access, checkpoint, stop, and reconcile leaks within the reserved shutdown budget.
- [ ] Reject start, restore, input, and background-agent execution while locked, including stale callbacks and tabs.
- [ ] Add the billing-required UI with balance, machine save/stop status, disclosed price, and explicit Add balance action; never auto-charge.
- [ ] Implement Stripe test-mode Checkout and verified idempotent webhook funding; unlock only after authoritative ledger credit and never auto-resume all machines.

## 6. Acceptance and rollout

- [ ] Test promotion replay/linking, concurrent reservations, price-revision pinning, depletion races, stale fences, and top-up during checkpoint.
- [ ] Test modified/deleted files, modes/ownership, corrupt/partial uploads, restore incompatibility, simultaneous restore, container replacement, and last-known-good preservation.
- [ ] Prove multi-machine depletion locks all access and stops all compute even with alarm, provider, storage, webhook, and reconciliation faults.
- [ ] Run an independent restore after deleting the source container and record raw R2, lifecycle, latency, and integrity evidence.
- [ ] Run GNOME browser input/accessibility tests and Stripe test-mode top-up; reconcile provider/storage cost with wallet settlement.
- [ ] Keep production flags disabled until security review, threat model, migrations, unit/integration/browser tests, staged acceptance, and operational runbooks pass distinctly.
