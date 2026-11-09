# MCP

## Main Files

- `src/main/core/mcp/services/McpService.ts`
- `src/main/core/mcp/utils/` — adapters, catalog, config IO, config paths, conversion
- `src/main/core/mcp/controller.ts`
- `src/shared/mcp/`
- `src/renderer/features/mcp/components/` — server cards, editor, provider selection, and queries
- `src/renderer/features/mcp/mcp-view.tsx` — registered view slots
- `src/renderer/app/view-registry.ts` — MCP view registration

## Current Behavior

- MCP server configs are read, adapted, merged, and written across supported agent ecosystems
- provider-specific config formats are handled through adapters in `src/main/core/mcp/utils/`
- the renderer MCP UI manages installed servers and catalog entries

## Important Constraint

- This repository exports only stdio MCP servers through its Codex adapter.
  `src/main/core/mcp/utils/config-paths.ts` marks Codex HTTP support as false;
  `src/main/core/mcp/utils/adapters.ts` filters non-stdio entries on export.
  This describes the application integration, not the capabilities of every Codex version.

## Rules

- do not assume all providers support the same MCP transport types
- keep canonical MCP data in shared types and adapt at the edges
- if you add provider-specific MCP behavior, update both service and UI compatibility handling
- trace compatibility from `config-paths.ts` through `src/main/core/mcp/controller.ts`
  (`supportsHttp`) to `src/renderer/features/mcp/components/ProviderSelect.tsx`;
  `src/renderer/features/mcp/components/McpModal.tsx` also filters providers on transport changes
- `src/renderer/features/mcp/components/useMcps.ts` owns React Query loading and mutations
  through `rpc.mcp`; keep transport conversion in the main-process adapters
