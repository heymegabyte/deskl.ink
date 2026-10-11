# Compute & Persistence Architecture

> How a deskl.ink computer's `/home` survives an ephemeral container — what's **shipped + proven**
> today, and the **precise, de-risked design for the one open P0: restore-on-boot (PERSIST-1b)**.
> This doc is the authoritative handoff for implementing restore-on-boot in a focused session.
> SSOT for progress: `.claude/run-the-loop/CONVERGENCE.md`. Related: `docs/adr/0002-*`.

## 1. The durable-truth model (non-negotiable)

- A Cloudflare Container's filesystem is **ephemeral** — it is destroyed on stop/eviction/replacement.
- **R2 is the only durable truth.** CF container snapshots are time-limited acceleration, never the
  sole recovery.
- **The DO is the ONLY thing that touches R2.** No R2 credential ever enters the tenant container
  (assume the workstation can become hostile even with passwordless sudo inside it).
- The in-container **backup agent** (`container/ubuntu/backup-agent.py`, loopback `0.0.0.0:7070`,
  NOT in `EXPOSE`, reachable ONLY by the DO via the Container runtime's private port access) owns the
  tar: `GET /backup` streams `tar -czf -` of `/home`; `POST /restore` pipes a tar into `tar -xzf`
  (`--no-same-owner --no-same-permissions`, untrusted-archive hardening). Single-flight lock.

## 2. SNAPSHOT — shipped + PROVEN LIVE (PERSIST-1a)

- Pure core `workers/api/src/persistence/homeBackup.ts`, DO adapter in `DesktopContainer.ts`, routes
  in `routes/desktops.ts`. R2 bucket `deskl-ink-backups` bound as `BACKUPS`.
- **The DO streams the agent's tar into R2 via MULTIPART upload** — R2 `put()` rejects a length-unknown
  stream ("must have a known length"), and `tar -czf -` is exactly that. 8 MiB bounded parts,
  abort-on-failure, no full buffering. (Found live; the unit fakes accepted any stream.)
- **Integrity gate:** `latest.json` is advanced ONLY after `complete()` AND a gzip-magic check, so
  restore never points at a corrupt archive. Unique keys (`home/<id>/<ISO>-<rand>.tar.gz`) — no
  same-ms overwrite. Newest-N retention (best-effort).
- Triggers: on-demand `POST /:id/snapshot`, the `/:id/stop` + `/:id/restart` checkpoints
  (`stopWithCheckpoint` resolves the R2 put BEFORE `.stop()` — never "stopped" before durable), and a
  best-effort pre-`DELETE` snapshot. Every success records owner-scoped `lastBackupAt` (best-effort
  `recordBackupTime` — a DO-lag failure never breaks the core op) → the card shows "Backed up <time>".
- **Evidence:** `/:id/snapshot` → `ok:true` with a ~1 MB real `/home` tar in R2, verified live ×5+;
  `e2e/backup.spec.ts` asserts it incl. reload-persistence of the indicator.

## 3. RESTORE — the open P0 (PERSIST-1b), and WHY it needs restore-on-boot

**Empirically established (iteration 2, live, across 4 fix cycles):** you cannot restore into a `/home`
that a desktop session is using.

- Restore into a **stopped** container → the agent is down → `capability_gap` (no agent to untar).
- Restore into a **live** container → `POST /restore` reaches the agent, but `tar -x` over an in-use
  `/home` (running apps, runtime sockets, files changing under tar) exits **fatal rc ≥ 2** (502).
  Tolerating rc 1 + excluding volatile cruft was not enough.
- The streamed POST body (`duplex:'half'` + the R2 tar stream) is also not reliably carried by
  `containerFetch` → the DO **buffers** the tar and POSTs with a known length (bounded 100 MiB; larger
  needs streaming — see §5 risks).

⇒ The ONLY clean window to untar is **after the container boots but BEFORE the desktop session
(VNC/apps) starts writing `/home`.** That is restore-on-boot, and it necessarily touches the container
boot sequence — which is why it is deferred to a focused session (a bad boot change can wedge *all* new
container launches).

## 4. restore-on-boot — the DESIGN (fail-safe, de-risked)

### Coordination (DO holds R2; container holds no creds)
On a container START where a backup MAY exist, the DO delivers the tar to the agent during a narrow
pre-session window; `start.sh` gates the desktop session on that window with a **bounded timeout** and
**proceeds on failure** (fail-open → a broken restore degrades to a normal fresh boot, never a wedged
boot).

### `container/ubuntu/start.sh` (the ONLY boot-path change — keep it minimal + fail-safe)
1. Start the backup agent **FIRST** (before VNC/ttyd), so `/restore` + `/health` are reachable early.
2. Enter a **restore window**: poll a local sentinel (e.g. `/run/desklink/restore.done`) for up to
   `RESTORE_TIMEOUT` (e.g. 20 s). The DO, seeing the agent healthy, POSTs the tar to `/restore`; the
   agent writes the sentinel when extraction finishes (or the DO writes a "no-backup" sentinel).
3. On sentinel-seen OR timeout → **proceed to launch VNC/apps regardless.** Never block boot on restore.
   Log the outcome (restored / no-backup / timed-out).
   - Extract into a QUIESCENT `/home` here → none of the live-`/home` rc≥2 failures from §3.

### DO (`DesktopContainer`) start hook
- On start: if `BACKUPS` has a `latest.json` for this id, after the agent's `/health` is up (retry
  briefly), buffer the tar from R2 and `POST /restore`; then signal "done"/"no-backup". Idempotent;
  owner-scoped resolution unchanged. Guard with `persistenceAvailable(env)` (already shipped) so the
  `COMPUTER_DO` backend never hits a shadow `/home`.

### Auto-restore-on-replacement (the actual product promise)
Because the DO restores on EVERY cold start when a backup exists, a crash/eviction/replacement
auto-restores `/home` — no manual action. (Supersedes the earlier manual `/:id/restore` idea, which
can't win the live-`/home` race.)

## 5. Verification plan (the acceptance gate — do NOT claim done without it)
- **Sentinel round-trip E2E:** create → write a known file into `/home` (drive the ttyd terminal via
  Playwright — focus xterm, type `echo SENTINEL_<rnd> > ~/sentinel && echo WROTE`) → snapshot (or stop,
  which checkpoints) → force a **container replacement** (destroy the container instance; keep the
  desktop id) → let it boot (restore-on-boot fires) → reconnect ttyd → `cat ~/sentinel` → assert
  `SENTINEL_<rnd>` present. Real app + real backend; no mocks.
- Negative paths: no-backup boots clean; a corrupt/absent tar times out → fresh boot (never wedged);
  `RESTORE_TIMEOUT` respected; `COMPUTER_DO` guard holds.

## 6. Production-safety guards (why this is a fresh-session slice)
- The `start.sh` change is on the **critical boot path** — fail-open with a bounded timeout is
  mandatory; a half-baked version could wedge every new desktop. Rebuild + roll the image carefully;
  `wrangler rollback` is the escape hatch.
- Large `/home`: the buffered 100 MiB restore cap must become a streamed/multipart download on the DO
  side (or a staged extract in the agent) before GA.
- Keep snapshot (shipped, proven) untouched; restore-on-boot only ADDS the boot-time consume path.

## 7. Status
Snapshot = durable truth: **done + proven live.** Restore-on-boot: **designed here, implementation is
the next focused-session P0.** When it lands + the §5 E2E is green, Golden Path G (data recovery)
converges and the persistence promise — "never destroy user work, survives container replacement" — is
fully met.
