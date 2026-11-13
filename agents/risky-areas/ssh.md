# Risky Area: SSH And Shell Escaping

## Main Files

- `src/main/core/ssh/lifecycle/` — connection manager, production wiring and client proxy
- `src/main/core/ssh/connect/` — shared connection-config resolver, authentication,
  agent forwarding and connection testing; production wiring injects credential lookup
- `src/main/core/ssh/config/` — SSH config parsing, effective config resolution and connection metadata
- `src/main/core/ssh/transport/transports.ts` — ProxyCommand/ProxyJump child processes and cleanup
- `src/main/core/ssh/credentials/ssh-credential-service.ts` — password/passphrase access
- `src/main/core/secrets/encrypted-app-secrets-store.ts` — encrypted database storage via Electron safeStorage
- `src/main/core/ssh/controller.ts` — RPC entry points
- `src/main/core/fs/impl/ssh-fs.ts`
- `src/main/core/pty/ssh2-pty.ts`
- `src/main/core/terminals/impl/ssh-terminal-provider.ts`
- `src/main/utils/shellEscape.ts`

## Rules

- treat remote shell construction as security-sensitive
- use shared escaping and validation helpers
- do not bypass path-safety or shell validation helpers
- verify how a change affects both connection setup and command execution
- inspect `connect/resolve-ssh-connect-config.ts` and `transport/transports.ts`
  separately when evaluating host verification: the ssh2 config builder does not set
  `hostVerifier` or `hostHash`. Do not infer known-host enforcement from config parsing
  or from an OpenSSH proxy subprocess.

## Focused Validation

Run the SSH node tests with `pnpm exec vitest run --project node src/main/core/ssh/`.
These exercise config resolution, connection lifecycle and proxy behavior, including
a disposable ssh2 server/client handshake and proxy child processes alongside test
doubles. They do not establish destination trust after a changed host key, compatibility
with a deployed remote host, or an Electron remote-project journey. See
`agents/workflows/testing.md` for native isolation requirements.
