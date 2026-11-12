# Risky Area: PTY And Sessions

## Main Files

- `src/main/core/pty/` — `local-pty.ts`, `ssh2-pty.ts`, `pty.ts`, `pty-env.ts`, `pty-session-registry.ts`, `spawn-utils.ts`, `exit-signals.ts`, `controller.ts`
- `src/main/core/terminals/` — terminal lifecycle, local and SSH terminal providers
- `src/main/core/agent-hooks/classifiers/` — per-provider terminal output parsers; `classifier-wiring.ts` in the parent directory connects them to PTY events
- `src/main/core/agent-hooks/` — hook server, event enrichment, OS notifications, hook config writer

## Core Risks

- PTY cleanup and exit handling
- resize behavior
- shell quoting and Windows command wrapping
- tmux lifecycle
- provider-specific resume/session behavior
- env passthrough safety

## Rules

- preserve the environment distinction in `src/main/core/pty/pty-env.ts`: `buildAgentEnv` builds a minimal agent environment with optional `AGENT_ENV_VARS` passthrough; `buildTerminalEnv` inherits the process environment for user-facing interactive terminals
- do not weaken quoting or spawn behavior casually
- validate both direct spawn and shell-wrapped spawn cases when changing PTY startup logic
- confirm renderer event flow if hook payload or notification behavior changes
