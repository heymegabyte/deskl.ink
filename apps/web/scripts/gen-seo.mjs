// Generate the AI-discovery corpus (llms-full.txt) for deskl.ink by CONSUMING the
// @theme.tools/seo-geo engine (vendored, zero workspace deps — see ../vendor/theme-tools-seo-geo).
//
// `buildLlmsDiscoveryCorpus` emits the structured llms.txt / llms-full.txt spec. The existing
// hand-written public/llms.txt is kept as the canonical short index; this adds the long-form
// public/llms-full.txt (full markdown bodies) it points at. Vite copies public/ into dist/ verbatim.
//
// Run: node scripts/gen-seo.mjs   (prebuild hook — deterministic, no network/AI/secrets)
import { buildLlmsDiscoveryCorpus } from '../vendor/theme-tools-seo-geo/builders.js';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, '..', 'public');

const { llmsFullTxt } = buildLlmsDiscoveryCorpus({
  siteTitle: 'deskl.ink',
  blockquoteSummary:
    'A desktop for you. A computer for your AI. Instantly available, browser-accessible Linux workstations operable by a human, an AI agent, many cooperating agents, or a human and AI together. Cloudflare-native — a workstation boots in seconds and scales to zero when idle.',
  architecturalNotes: [
    'Cloudflare-native: each live desktop is a container-enabled Durable Object; it boots in seconds and scales to zero when idle.',
    'A standalone product that owns its own workstation runtime, UI, and agent-control plane — not a plugin of another app.',
    'Built to be operated by AI as a first-class user, not only by humans, through the same control plane.',
  ],
  sections: [
    {
      heading: 'Product',
      entries: [
        {
          title: 'Cloud Linux workstations in your browser',
          url: 'https://deskl.ink/',
          summary:
            'Ubuntu, Fedora, or Debian workstations — no local install, no infrastructure to configure.',
          fullMarkdownBody:
            '## Cloud Linux workstations in your browser\n\n' +
            'deskl.ink gives you cloud Linux workstations (Ubuntu, Fedora, Debian) in your browser — no local install, no infrastructure to configure.\n\n' +
            '- **Sizes:** Everyday (4 GiB) · Developer (6) · Power (8) · Heavy (12).\n' +
            '- **Forms:** a **Desktop** (full graphical environment streamed over VNC) or a headless **Server** (terminal-native — git, Node, Python, ripgrep, tmux, and a browser terminal).\n' +
            '- Every open computer is a tab in one workspace; a ⌘K command palette, inline rename, live cost estimates, and a one-click “stop everything running” keep it fast.\n' +
            '- Installable as an app, and the shell works offline.\n' +
            '- Built to be operated by people and by AI agents through the same control plane.',
        },
      ],
    },
    {
      heading: 'For AI agents',
      entries: [
        {
          title: 'Agent-operable control plane',
          url: 'https://deskl.ink/',
          summary:
            'deskl.ink is built to be operated by AI as a first-class user, not only by humans.',
          fullMarkdownBody:
            '## Agent-operable control plane\n\n' +
            'deskl.ink is built to be operated by AI as a first-class user, not only by humans. A single desktop can be driven by a human, one AI agent, many cooperating agents, or a human and AI together.\n\n' +
            'It is a standalone product that owns its own workstation runtime, UI, and agent-control plane — not a plugin of another app.',
        },
        {
          title: 'Sitemap',
          url: 'https://deskl.ink/sitemap.xml',
          summary: 'The public pages, machine-readable.',
        },
      ],
    },
  ],
});

writeFileSync(join(publicDir, 'llms-full.txt'), llmsFullTxt, 'utf8');
process.stdout.write(`llms-full.txt written (${llmsFullTxt.length} bytes)\n`);
