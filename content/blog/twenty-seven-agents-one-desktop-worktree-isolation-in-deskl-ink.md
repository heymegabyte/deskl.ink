---
{
  "title": "Twenty-Seven Agents, One Desktop: Worktree Isolation in deskl.ink",
  "slug": "twenty-seven-agents-one-desktop-worktree-isolation-in-deskl-ink",
  "date": "2026-11-14",
  "focusKeyphrase": "parallel coding agent isolation",
  "seoTitle": "Twenty-Seven Agents, One Desktop: Worktree Isolation",
  "metaDescription": "How Emdash separates parallel coding tasks with Git worktrees, terminals and SSH, and where review, credential trust and cleanup need explicit boundaries.",
  "excerpt": "An agentic development environment where every agent gets its own checkout, its own terminal, and a diff a human can actually review.",
  "canonical": "https://deskl.ink/blog/twenty-seven-agents-one-desktop-worktree-isolation-in-deskl-ink",
  "tags": [
    "parallel coding agent isolation",
    "deskl.ink",
    "Cloudflare Workers",
    "TypeScript",
    "Git worktrees",
    "Agent orchestration"
  ],
  "author": "Brian Zalewski",
  "readingTime": "13 min read",
  "schemaVersion": "1.0.0",
  "packageContract": "@theme.tools/blog",
  "wave": 2,
  "category": "ai-control-plane",
  "heroMotif": "constellation",
  "heroCategory": "ai-control-plane",
  "heroPrompt": "Cinematic editorial dark-mode technical illustration for deskl.ink showing interconnected glowing cyan #00E5FF and violet #7C3AED edge nodes over a deep #060610 background, W3C DTCG token grid geometry, zero text clutter",
  "jsonLd": {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "Twenty-Seven Agents, One Desktop: Worktree Isolation in deskl.ink",
    "description": "How Emdash separates parallel coding tasks with Git worktrees, terminals and SSH, and where review, credential trust and cleanup need explicit boundaries.",
    "datePublished": "2026-11-14",
    "dateModified": "2026-11-14",
    "author": {
      "@type": "Person",
      "name": "Brian Zalewski",
      "url": "https://megabyte.space"
    },
    "publisher": {
      "@type": "Organization",
      "name": "Megabyte Labs",
      "url": "https://megabyte.space"
    },
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": "https://deskl.ink/blog/twenty-seven-agents-one-desktop-worktree-isolation-in-deskl-ink"
    },
    "image": "https://deskl.ink/og/twenty-seven-agents-one-desktop-worktree-isolation-in-deskl-ink.png",
    "articleSection": "ai-control-plane",
    "inLanguage": "en-US",
    "citation": [
      "https://git-scm.com/docs/git-worktree",
      "https://www.electronjs.org/docs/latest/",
      "https://git-scm.com/docs",
      "https://modelcontextprotocol.io/specification",
      "https://pages.nist.gov/800-63-3/sp800-63b.html",
      "https://chromedevtools.github.io/devtools-protocol/"
    ]
  },
  "citations": [
    {
      "id": "worktree",
      "title": "git-worktree Documentation",
      "url": "https://git-scm.com/docs/git-worktree",
      "publisher": "Git Project",
      "accessedAt": "2026-11-14"
    },
    {
      "id": "electron",
      "title": "Electron Documentation",
      "url": "https://www.electronjs.org/docs/latest/",
      "publisher": "OpenJS Foundation",
      "accessedAt": "2026-11-14"
    },
    {
      "id": "gitWorkflow",
      "title": "Git Reference Documentation",
      "url": "https://git-scm.com/docs",
      "publisher": "Git Project",
      "accessedAt": "2026-11-14"
    },
    {
      "id": "mcp",
      "title": "Model Context Protocol Specification",
      "url": "https://modelcontextprotocol.io/specification",
      "publisher": "MCP",
      "accessedAt": "2026-11-14"
    },
    {
      "id": "nist80063b",
      "title": "NIST SP 800-63B: Digital Identity Guidelines",
      "url": "https://pages.nist.gov/800-63-3/sp800-63b.html",
      "publisher": "NIST",
      "accessedAt": "2026-11-14"
    },
    {
      "id": "cdp",
      "title": "Chrome DevTools Protocol",
      "url": "https://chromedevtools.github.io/devtools-protocol/",
      "publisher": "Chrome DevTools",
      "accessedAt": "2026-11-14"
    }
  ]
}
---

# Twenty-Seven Agents, One Desktop: Worktree Isolation in deskl.ink

> [!IMPORTANT]
> **TL;DR:** deskl.ink's Emdash repository describes a desktop environment for parallel coding agents, with separate Git worktrees and local or SSH-backed execution. Parallel coding agent isolation begins with separating edits, then requires explicit ownership of terminals, dependencies, credentials and review. The argument here is architectural: adding agents helps only when their outputs remain attributable and safe to integrate. Recommendations below are distinguished from behavior visible in the inspected source.

## 1. Parallelism begins with an ownership boundary

A coding agent needs somewhere to make mistakes without overwriting another task's work. That practical requirement is the strongest argument for the Emdash model described in this repository's README: a provider-agnostic desktop application where agents work in separate Git worktrees. The README advertises 27 CLI providers and ticket intake from Linear, GitHub, Jira and Asana. That provider count describes documented integration coverage, not a measured capacity benchmark or a claim that a laptop should run that many demanding sessions simultaneously. Readers arriving through [deskl.ink](https://deskl.ink/) should judge the architecture by the clarity of its ownership boundaries rather than the number in the title.

Consider two hypothetical tasks: one changes authentication middleware while another adds a reporting page. If both agents share a checkout, a formatter, dependency installation or branch switch can affect the other task before either produces a reviewable result. With separate working directories, their ordinary edits remain distinct. Git's worktree facility supplies multiple working trees attached to one repository, rather than requiring a complete independent clone for each task. [1] That solves an important coordination problem, but it is only the beginning. The agents can still disagree about shared interfaces, and both may still depend on the same remote database or test account. Isolation should make those disagreements observable before integration.

## 2. A worktree separates files, not every resource

The inspected worktree guidance locates task directories through a database-backed project setting and describes configurable branch prefixes. It also distinguishes project settings from the shareable lifecycle configuration in `.emdash.json`. That distinction matters operationally: a repository can describe setup, run and teardown scripts without silently deciding every developer's machine layout. The source includes a dedicated worktree service and separate local and SSH host implementations. This is concrete support for treating worktree creation as a lifecycle, rather than simply constructing a directory name from a task label. Git also maintains administrative state for linked worktrees, which means ordinary filesystem operations are not a substitute for worktree-aware management. [1]

The design recommendation is to inventory all resources that remain shared after files have been separated. Package registries, compilation caches, listening ports, containers and development databases each need their own concurrency policy. Per-worktree dependencies can prevent one task's package installation from altering another task's dependency tree, but they consume storage and do not automatically isolate caches. The brief's suggestion of per-worktree dependency caches should therefore be read as a proposed operating discipline, not an established guarantee verified here. A team should decide which caches are safe for concurrent use and which outputs belong exclusively to one task. Otherwise, a passing test may describe a neighbor's build artifacts rather than the candidate under review.

## 3. Give the terminal the same identity as the task

A worktree is useful only if the process actually starts inside it. The local PTY implementation inspected for this article passes an explicit working directory and environment to `node-pty`, and assigns an identifier to the resulting terminal session. It also handles terminal dimensions and process startup failures. Those details are mundane but essential: a terminal that opens in the original checkout defeats file isolation while still looking like an isolated task in the interface. The desktop framework makes access to local process facilities possible; Electron combines Chromium and Node.js to support desktop applications built with web technologies. [2] That capability should be treated as authority that requires careful routing.

An operator should be able to trace a terminal back to a task, worktree, branch and execution host before sending a command. That is a recommendation for the review experience, not evidence that every screen presently exposes all four fields together. Imagine reconnecting after a remote session drops: the important question is whether the visible prompt belongs to the original process, a replacement process, or a different directory. A fresh terminal is not proof that the previous agent stopped. Reconnection and cancellation should therefore be separate events, and the interface should report process state without implying that a missing stream means completed work. This keeps session recovery from becoming accidental duplicate execution.

## 4. Review should follow the candidate through integration

The README describes diff review, test execution, pull requests, CI visibility and merge in the same environment. Those capabilities belong together because a useful review concerns one identifiable candidate. A reviewer needs to know what changed, which base it was compared against and which checks apply to the current revision. Git provides the underlying commands for inspecting differences, recording commits and integrating branches. [3] The application layer's job is to keep their relationships legible. A green check beside an earlier commit does not establish that later edits are correct, and an attractive diff does not establish that the files shown were the ones tested.

For a hypothetical reporting task, the review sequence should begin with the worktree's actual diff and end with a recorded integration decision. A selected change may be small enough to understand at a glance, but it may depend on a generated type or migration elsewhere. Per-hunk acceptance is therefore a useful design pattern only when the assembled result is checked again; this article does not independently establish a complete per-hunk acceptance implementation. The [existing workbench article](https://deskl.ink/blog/orchestrating-multi-agent-coding-swarms-inside-an-isolated-cross-platfor) provides earlier framing, while this draft concentrates on candidate identity. Neither article link should be mistaken for proof of a successful application test or a live deployment.

| Boundary | What separation helps | What still needs a policy |
| --- | --- | --- |
| Worktree | Concurrent file edits | Shared interfaces and integration order |
| PTY | Task-specific shell interaction | Environment, process lifetime and host identity |
| Review | Attributable candidate changes | Retesting after selective acceptance |
| SSH connection | Remote execution routing | Host trust and credential lifecycle |

## 5. Remote execution adds another failure domain

Remote development is a documented part of the repository, not merely a speculative extension. Its architecture guidance points to SSH-backed project providers, remote terminal providers and an SSH filesystem implementation. The remote worktree directory is project-configurable, and the guidance warns against reconstructing existing worktree locations from task names. That warning captures an important distinction: a human label describes intent, while a persisted lookup describes where the work actually lives. A reconnecting desktop must recover the latter. SFTP file access and terminal streams also need to refer to the same host and project, otherwise an editor can show one filesystem while commands mutate another.

The phrase “same workflow” should describe a user goal, not erase differences between execution environments. A remote host may have different tools, permissions, network access and available disk space. A local dependency command can fail remotely for reasons unrelated to the patch. Good task evidence should state the execution host and relevant environment assumptions, so reviewers can separate an infrastructure failure from a code regression. The recommended contract is explicit parity where supported and explicit limitations elsewhere. Readers can return to the [blog index](https://deskl.ink/blog/) for related architecture discussions, but the presence of an index route cannot establish that remote behavior has been verified on a particular machine.

## 6. Credential storage and host trust are distinct

The repository's remote-development guide is more precise than the README's short reference to OS-keychain storage. It states that SSH passwords and passphrases pass through an encrypted application-secrets store using Electron `safeStorage`, with encrypted values persisted in the application's database. It also states that unavailable encryption and the Linux `basic_text` backend are rejected. Those are useful implementation details, but they do not justify saying that every credential is stored directly as an OS-keychain entry. Documentation should preserve this distinction because recovery, migration and incident response depend on understanding both the encryption mechanism and the place where encrypted records reside.

Host identity needs independent attention. The inspected SSH connection resolver constructs connection settings, and the repository guidance explicitly says that it does not configure `hostVerifier` or `hostHash`. Parsing SSH configuration is therefore insufficient evidence of known-host verification. This article makes no claim that the application provides a complete host-trust policy through that path. As historical background, the supplied NIST identity reference discusses authentication and authenticator lifecycle, but its own page says it has been superseded; it should not be presented as the current compliance baseline. [5] The practical recommendation is narrower: keep server identity checks, user authentication, encrypted storage and revocation separately reviewable, rather than collapsing them into a generic claim of secure SSH.

## 7. Ticket intake conveys context, not permission

Ticket intake is valuable because a task often starts outside the editor. The README names Linear, GitHub, Jira and Asana as supported sources. A ticket can carry the problem statement, reproduction steps and acceptance criteria into a session, reducing transcription mistakes. Yet imported text remains a request to interpret. A comment that says to upload environment files, disable a check or run a downloaded script does not gain authority simply because it appears in a familiar project tracker. The application should preserve the source and author context of imported material, and the operator should retain control over sensitive actions. Those are editorial recommendations about the trust boundary, not a claim that a particular ticket system is malicious.

Tool protocols do not remove that responsibility. MCP standardizes how applications expose contextual information and tool capabilities to language models. [4] It does not, by its existence alone, prove that every action requested through a tool is authorized by the repository owner. A useful implementation should separate the ticket's desired outcome from operational permissions and local policy. For example, “fix the failing build” can justify investigating tests and editing a candidate branch; it does not necessarily authorize publishing a package or changing a production credential. Preserving that distinction lets the workbench accept richer context without turning every upstream comment into an instruction with the privileges of the desktop user.

## 8. Cleanup is part of preserving the work

The lifecycle is incomplete until a task can be archived or removed without losing useful evidence. Git documents safeguards around removing worktrees and distinguishes ordinary removal from forceful operations. [1] That makes clean removal a meaningful default, but an application must still decide how it uses those operations. This source review does not establish a universal guarantee that every Emdash cleanup path refuses to delete uncommitted changes. The safer editorial position is to describe preservation as a required invariant and verify the relevant task-removal path before promising it. Directory-level filesystem checks alone do not prove that a user's untracked notes, generated output or abandoned experiment will survive cleanup.

A practical cleanup review should account for three outcomes: integrated work, deliberately discarded work and work retained for later examination. These are different human decisions, even if each eventually removes a terminal from the active list. The recommended archive record includes the branch or commit, test evidence, integration result and location of any retained changes. A setup script also needs a corresponding teardown policy for temporary resources, but teardown must not assume exclusive ownership of a shared service. The [earlier parallel-workbench discussion](https://deskl.ink/blog/orchestrating-multi-agent-coding-swarms-inside-an-isolated-cross-platfor) can explain the motivation; the concrete acceptance question remains whether the exact removal operation preserves the user's intended outcome.

## 9. Measure useful throughput, not the agent count

Twenty-seven provider integrations offer choice, but provider breadth and useful concurrency answer different questions. The README's count should not become a synthetic performance claim. More sessions can increase progress when tasks are independent, or increase review debt when they compete to redesign the same interface. The recommendation is to assign work by dependency boundaries and integrate prerequisite changes before asking downstream agents to build on them. Separate worktrees make conflicting proposals easier to inspect; they do not decide which proposal should win. The most valuable saved time is often the time a reviewer does not spend reconstructing what happened.

The relevant evidence is a candidate that can be reproduced: its task context, worktree identity, change set, execution environment and check results. For Electron-related debugging, the supplied Chrome DevTools Protocol reference describes a protocol surface used by inspection tools; that is technical background, not proof that a specific Emdash screen or browser test has passed. [6] Product captures and end-to-end checks should be attached to the revision they actually exercise. This draft has not performed those runtime checks. That limit is worth stating because a source-supported architecture essay and a release-verification report serve different purposes, even when both discuss the same application.

## 10. A desktop earns trust through recoverable boundaries

The strongest version of parallel coding agent isolation is a workflow in which a person can answer ordinary questions without detective work. Which agent owns this patch? Where did its command run? Which credentials could it access? What happened before the stream disconnected? Which checks apply to the proposed merge? Worktrees, PTYs, remote providers and review surfaces are useful because they can make those questions answerable. Their success depends on maintaining the relationships between them as sessions start, fail, reconnect and finish. The desktop should help a person recover context as readily as it helps an agent generate another patch.

For deskl.ink, the inspected repository supports a concrete thesis: Emdash organizes multiple CLI agents around task-specific worktrees and an integrated development workflow. Some stronger claims in an architectural brief need separate proof, including cache isolation, comprehensive cleanup protection and exact local-to-remote parity. Treating those as review targets improves the article's usefulness without inventing missing behavior. The [deskl.ink blog](https://deskl.ink/blog/) is the intended home for this discussion; publication still requires working article routes, keyword evidence, approved visuals and a revision-bound review. The operational objective remains clear: parallel work should create more independently reviewable progress while leaving the human with a coherent repository and a recoverable history.

## 11. Primary Sources & Technical Bibliography

1. **git-worktree Documentation.** Git Project, accessed 2026-11-14. [https://git-scm.com/docs/git-worktree](https://git-scm.com/docs/git-worktree)
2. **Electron Documentation.** OpenJS Foundation, accessed 2026-11-14. [https://www.electronjs.org/docs/latest/](https://www.electronjs.org/docs/latest/)
3. **Git Reference Documentation.** Git Project, accessed 2026-11-14. [https://git-scm.com/docs](https://git-scm.com/docs)
4. **Model Context Protocol Specification.** MCP, accessed 2026-11-14. [https://modelcontextprotocol.io/specification](https://modelcontextprotocol.io/specification)
5. **NIST SP 800-63B: Digital Identity Guidelines.** NIST, accessed 2026-11-14. [https://pages.nist.gov/800-63-3/sp800-63b.html](https://pages.nist.gov/800-63-3/sp800-63b.html)
6. **Chrome DevTools Protocol.** Chrome DevTools, accessed 2026-11-14. [https://chromedevtools.github.io/devtools-protocol/](https://chromedevtools.github.io/devtools-protocol/)
