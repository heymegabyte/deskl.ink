# Remote Development

## Main Files

- `src/main/core/ssh/` — `lifecycle/`, `connect/`, `credentials/`, `config/` and `transport/`
- `src/main/core/projects/create-project-provider.ts` — local/SSH provider composition
- `src/main/core/projects/settings/providers/ssh-project-settings-provider.ts`
- `src/main/core/pty/ssh2-pty.ts`
- `src/main/core/fs/impl/ssh-fs.ts`
- `src/main/core/terminals/impl/ssh-terminal-provider.ts`
- `src/main/utils/shellEscape.ts`

## Current Model

- remote projects are backed by SSH connections
- remote worktree pools use the project's DB-backed worktree directory setting;
  the default directory is `<project-path>/.emdash/worktrees`, defined in
  `src/main/core/settings/worktree-defaults.ts`
- for new worktrees, the SSH provider appends the project name to that directory, and
  `src/main/core/projects/worktrees/worktree-service.ts` appends the branch name
  (which may contain path separators). Existing worktrees may be reused elsewhere;
  use service lookups rather than deriving paths from a task slug. See
  `agents/workflows/worktrees.md` for shared settings and lifecycle rules.
- remote PTYs stream agent shells back to the renderer

## Authentication And Storage

- `credentials/ssh-credential-service.ts` stores passwords and passphrases through
  `src/main/core/secrets/encrypted-app-secrets-store.ts`: values are encrypted with
  Electron safeStorage and persisted in the database's `app_secrets` table
  (`appSecrets` in `src/main/db/schema.ts`). It rejects
  unavailable encryption and the Linux `basic_text` backend.
- `connect/resolve-ssh-connect-config.ts` builds the ssh2 connection config; it does
  not configure `hostVerifier` or `hostHash`. Config parsing is not evidence of
  known-host verification. Review proxy subprocess behavior separately; see
  `agents/risky-areas/ssh.md`.

## Rules

- treat all shell construction as security-sensitive
- use shared SSH and shell-escaping helpers instead of ad hoc quoting
- confirm whether a feature is local-only before assuming parity on remote projects
