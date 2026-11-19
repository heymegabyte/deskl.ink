/**
 * @module @theme.tools/seo-geo/builders
 * @description
 * STANDALONE-SAFE barrel for the general SEO/GEO builders — importable by a plain
 * npm / Vite / Hono site WITHOUT any workspace (`@theme-tools/shared-utils`) resolution.
 *
 * The package root (`.`) barrel transitively re-exports from
 * `@theme-tools/shared-utils/tier1-3-upstream-repo-compat` (a `workspace:*` dependency),
 * so a standalone consumer that imports from the root fails to resolve. This subpath
 * re-exports ONLY from `business-seo-and-placeholders.ts` and
 * `llms-txt-sitemap-and-geo-scorer.ts`, both of which are fully self-contained
 * (zero imports) — so the emitted `dist/builders.js` references no workspace package.
 *
 * Use this for the three canonical builders a site actually wants:
 * - `fitMetaTitle` — SEO-sweet-spot meta `<title>` fitting.
 * - `buildBusinessJsonLd` — Schema.org `LocalBusiness`/`Organization` JSON-LD from a profile.
 * - `buildLlmsDiscoveryCorpus` — `llms.txt` / `llms-full.txt` AI-discovery corpus.
 *
 * ...plus their self-contained siblings (placeholder firewall, meta-description fitting,
 * address/hours parsing, alt-text dedupe, sitemap sharding, hreflang reciprocity, GEO scoring).
 *
 * Importing from the root barrel stays supported and unchanged — this is purely additive.
 */
export * from "./business-seo-and-placeholders.js";
export * from "./llms-txt-sitemap-and-geo-scorer.js";
//# sourceMappingURL=builders.js.map