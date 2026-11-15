---
name: production-release
description: Safely finish production-bound deskl.ink implementation work by validating the exact tree, committing it to main, deploying through the repository's Cloudflare release path, and verifying the live result. Use when a prompt requests deployment, publication, release, shipping, a production fix, or completion of an authorized production-bound code change.
---

# Production Release

Finish authorized implementation work with traceable source, deployment, and live evidence. Never turn a read-only request or an unsafe tree into an implicit production mutation.

## Release workflow

1. Read the closest repository instructions and deployment configuration. Inspect `git status`, the active branch, remotes, and push-triggered workflows.
2. Resolve the exact release scope. Preserve unrelated work and exclude credentials, workstation metadata, generated output, and unverified changes. Stop if safe separation is impossible.
3. Run the repository's required formatting, lint, type, test, and build checks. Treat skipped, blocked, and failed checks distinctly.
4. Confirm the current branch is `main` and synchronized enough to publish without rewriting history. Never force-push or blanket-stage.
5. Stage only the verified release files, review the staged diff, and create a descriptive commit.
6. Push the tested commit to `origin/main` after checking push-triggered workflows.
7. Deploy using the repository-owned production command and existing authenticated provider route. Never expose or rewrite secrets.
8. Capture the deployment identifier and URL. Validate production with health checks plus the user-visible journey relevant to the change. Confirm the live artifact corresponds to the released commit when the platform exposes that evidence.
9. Report the commit SHA, deployment URL or identifier, checks, and production validation. Report a blocker instead of claiming completion when any required step cannot be proven.

## Authorization and safety boundary

- Apply automatically only to completed production-bound implementation work when repository policy or the user authorizes release.
- Do not deploy for explanations, reviews, planning, diagnostics without a requested fix, local-only work, or documentation-only discussion.
- Do not deploy a failing build, ambiguous release scope, credentials, unrelated dirty work, destructive migration without approval, or changes requiring an unavailable external dependency.
- A terminal request such as “finish” means persist toward a safe release; it does not broaden authorization or waive checks.
- If production cannot be safely reached, leave the work validated locally and state the exact blocker and next command or external action.
