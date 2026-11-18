# Providers

## Source Of Truth

- `src/shared/agent-provider-registry.ts`
- `src/main/core/dependencies/dependency-manager.ts`
- `src/main/core/pty/`

## Provider IDs

Read `AGENT_PROVIDER_IDS` and `AGENT_PROVIDERS` in the registry for the current IDs
and metadata. Keep runtime decisions tied to the registry rather than a copied list.

## Provider Metadata Includes

- CLI and detection commands
- version args
- install command and docs URL
- auto-approve flags
- initial prompt handling
- keystroke injection behavior
- resume and session flags
- optional plan activation and auto-start commands

## Agent Event Classifiers

Terminal-output classifiers live in `src/main/core/agent-hooks/classifiers/`.
`index.ts` selects a provider-specific factory when present and otherwise uses the
generic fallback; not every provider has a dedicated classifier.
`src/main/core/agent-hooks/classifier-wiring.ts` connects PTY output to classification,
notification handling and renderer events. Local conversation setup selects native
hooks and classifier fallback in
`src/main/core/conversations/impl/local-conversation.ts`; Codex and Amp keep
classifiers active even when native hooks are available.

## Provider Runtime Notes

- New Claude sessions pass the conversation ID as `--session-id`; resume uses
  the stored provider session ID when available, otherwise the conversation ID.
- Initial prompt delivery follows registry metadata, not just the presence of a CLI
  prompt flag. `src/main/core/conversations/impl/agent-command.ts` builds CLI arguments
  and stdin pipelines (Amp uses `initialPromptViaStdinPipe`).
  `src/main/core/conversations/impl/keystroke-injection.ts` handles providers with
  `useKeystrokeInjection`, such as Hermes, using output-idle detection with a
  bounded startup timeout.
- `src/main/core/agent-hooks/agent-hook-service.ts` receives native hook events,
  enriches them, forwards renderer events and can show OS notifications.
- `src/main/core/agent-hooks/hook-config.ts` owns configuration writing. Local
  conversation setup supplies the task filesystem: Claude hooks go into
  `.claude/settings.local.json` there. Codex hooks go into `.codex/hooks.json`
  under the user-home filesystem; the task filesystem's `.codex/config.toml` is
  inspected to remove legacy notify entries. Do not describe all hook configuration as worktree-local.

## Adding Or Changing A Provider

1. update `src/shared/agent-provider-registry.ts`
2. update allowlisted agent env vars in `src/main/core/pty/pty-env.ts` if needed
3. add or update a classifier in `src/main/core/agent-hooks/classifiers/` when
   provider-specific detection is needed; otherwise verify the generic fallback
4. validate detection behavior in `src/main/core/dependencies/`
5. add or update tests for any non-standard behavior
