# Change: Premium GNOME desktops with durable inactivity recovery and funded access

**Architect Role:** assigned

## Why

deskl.ink currently proves that a browser desktop can be created and controlled, but its default
desktop, persistence, and commercial lifecycle do not yet express the premium product. Users need a
polished GNOME workstation that survives compute replacement, a clear one-time starting credit, and
a fail-closed boundary that prevents unfunded machines from continuing to accrue cost.

The change also needs an honest price book. Current low infrastructure estimates are not a retail
price: the product includes a managed desktop, browser transport, durable recovery, control-plane
coordination, storage, and support. Pricing must therefore be versioned, disclosed before launch,
and reviewed against current competitor and infrastructure evidence rather than scattered constants.

## What Changes

- Make GNOME the default environment for newly created `desktop`-form computers. Server-form
  computers remain headless, and existing computers retain their pinned image until an explicit,
  reversible migration is offered.
- Introduce a versioned premium hourly price book. The first proposed schedule is $0.29/hr Everyday,
  $0.49/hr Developer, $0.79/hr Power, and $1.19/hr Heavy, subject to a current infrastructure-cost
  and competitor review before activation.
- Grant each eligible verified account one non-withdrawable $25 promotional starting balance,
  idempotently and exactly once across identity linking and retry.
- Treat R2, through its S3-compatible API, as durable machine-state truth. After a configurable
  inactivity interval (initial default: ten minutes), checkpoint supported persistent state,
  verify it, atomically advance the last-known-good pointer, and only then stop compute.
- Restore a signed-in user's stopped machine into its pinned compatible image from the last verified
  checkpoint before granting desktop access. A missing or corrupt checkpoint never produces a false
  successful restore or overwrites the last-known-good generation.
- When available funded balance is exhausted or cannot reserve the next billing interval, apply an
  account-wide billing lock: revoke interactive access, checkpoint and stop every billable machine,
  and route the user to explicit top-up. The system never charges a payment method without a separate
  user-authorized purchase.

## Impact

- Affected capabilities: desktop experience, durable lifecycle, wallet and billing.
- Expected implementation areas: desktop images/catalog, Durable Object lifecycle coordination,
  R2 checkpoint manifests and transfer, D1 wallet/ledger and account lock state, pricing service,
  authenticated API contracts, browser restore/locked states, and Stripe test-mode top-up.
- Operational impact: new image and restore acceptance gates, storage retention policy, account-wide
  funded-access reconciliation, price-book publication, and migration guidance for existing images.
- Rollout remains deny-by-default until GNOME resource measurements, independent replacement restore,
  billing reconciliation, and exhaustion/lock acceptance tests pass in staging.

## Non-Goals

- Automatically migrating or deleting existing XFCE/KDE machines.
- Preserving RAM, live processes, or arbitrary system-package changes across a cold restore.
- Treating provider/container snapshots as the sole durable backup.
- Charging a saved payment method automatically, creating debt, or allowing a negative wallet.
- Publishing competitor comparisons as equivalent hardware claims.
