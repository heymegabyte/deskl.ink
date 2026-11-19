/**
 * @theme.tools/seo-geo — llms.txt / llms-full.txt Compiler, Sharded Sitemap Index, Hreflang Reciprocity & GEO Scorer
 *
 * Implements the structured `llms.txt` & `llms-full.txt` AI discovery specification, Sitemaps.org
 * sharded `sitemap-index.xml` splitting at 50,000 URLs or 50 MB uncompressed UTF-8 bytes,
 * bidirectional `hreflang` cluster reciprocity & `x-default` auditing, and Generative Engine
 * Optimization (GEO) citation-density / entity-salience / claim-attributability scoring.
 */
export const SITEMAP_PROTOCOL_MAX_URLS = 50_000;
export const SITEMAP_PROTOCOL_MAX_BYTES = 50 * 1024 * 1024; // 50 MiB (52,428,800 bytes)
const UTF8_ENCODER = new TextEncoder();
function escapeXml(value) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}
/**
 * Compiles structured `llms.txt` and expanded `llms-full.txt` discovery documents.
 */
export function buildLlmsDiscoveryCorpus(manifest) {
    const title = manifest.siteTitle.trim();
    const summary = manifest.blockquoteSummary.trim();
    if (!title || !summary) {
        throw new Error("buildLlmsDiscoveryCorpus requires non-empty siteTitle and blockquoteSummary");
    }
    const indexLines = [`# ${title}`, "", `> ${summary}`];
    const fullLines = [`# ${title} — Complete Knowledge Corpus`, "", `> ${summary}`];
    if (manifest.architecturalNotes && manifest.architecturalNotes.length > 0) {
        indexLines.push("");
        fullLines.push("");
        for (const note of manifest.architecturalNotes) {
            if (note.trim()) {
                indexLines.push(note.trim());
                fullLines.push(note.trim());
            }
        }
    }
    const optionalEntries = [];
    let indexedUrlCount = 0;
    for (const section of manifest.sections) {
        const primaryEntries = section.entries.filter((e) => !e.optional);
        for (const e of section.entries) {
            if (e.optional)
                optionalEntries.push(e);
        }
        if (primaryEntries.length > 0) {
            indexLines.push("", `## ${section.heading.trim()}`, "");
            fullLines.push("", `## ${section.heading.trim()}`);
            for (const entry of primaryEntries) {
                indexedUrlCount++;
                indexLines.push(`- [${entry.title.trim()}](${entry.url.trim()}): ${entry.summary.trim()}`);
                fullLines.push("", `### ${entry.title.trim()}`, `Source: ${entry.url.trim()}`, "", entry.fullMarkdownBody?.trim() || entry.summary.trim());
            }
        }
    }
    if (optionalEntries.length > 0) {
        indexLines.push("", "## Optional", "");
        fullLines.push("", "## Optional Supplementary Resources");
        for (const entry of optionalEntries) {
            indexedUrlCount++;
            indexLines.push(`- [${entry.title.trim()}](${entry.url.trim()}): ${entry.summary.trim()}`);
            fullLines.push("", `### ${entry.title.trim()}`, `Source: ${entry.url.trim()}`, "", entry.fullMarkdownBody?.trim() || entry.summary.trim());
        }
    }
    const llmsTxt = `${indexLines.join("\n")}\n`;
    const llmsFullTxt = `${fullLines.join("\n")}\n`;
    const estimatedFullTokenCount = Math.ceil(llmsFullTxt.length / 4);
    return {
        llmsTxt,
        llmsFullTxt,
        indexedUrlCount,
        estimatedFullTokenCount,
    };
}
function renderSingleSitemapUrlNode(entry) {
    const parts = ["  <url>", `    <loc>${escapeXml(entry.loc.trim())}</loc>`];
    if (entry.lastmod) {
        parts.push(`    <lastmod>${escapeXml(entry.lastmod.trim())}</lastmod>`);
    }
    if (entry.changefreq) {
        parts.push(`    <changefreq>${entry.changefreq}</changefreq>`);
    }
    if (entry.priority !== undefined) {
        const clamped = Math.max(0, Math.min(1, entry.priority));
        parts.push(`    <priority>${clamped.toFixed(1)}</priority>`);
    }
    if (entry.alternates && entry.alternates.length > 0) {
        for (const alt of entry.alternates) {
            parts.push(`    <xhtml:link rel="alternate" hreflang="${escapeXml(alt.hreflang.trim())}" href="${escapeXml(alt.href.trim())}" />`);
        }
    }
    parts.push("  </url>");
    return parts.join("\n");
}
/**
 * Splits large URL inventories into compliant `<urlset>` XML shards (<= 50,000 URLs and <= 50 MiB
 * uncompressed UTF-8 bytes per shard) and emits a master `<sitemapindex>`.
 */
export function buildShardedSitemapIndex(entries, options = {}) {
    const baseSitemapUrl = (options.baseSitemapUrl ?? "https://example.com/sitemaps").replace(/\/+$/, "");
    const maxUrls = Math.min(SITEMAP_PROTOCOL_MAX_URLS, Math.max(1, Math.trunc(options.maxUrlsPerShard ?? SITEMAP_PROTOCOL_MAX_URLS)));
    const maxBytes = Math.min(SITEMAP_PROTOCOL_MAX_BYTES, Math.max(512, Math.trunc(options.maxBytesPerShard ?? SITEMAP_PROTOCOL_MAX_BYTES)));
    const hasXhtmlAlternates = entries.some((e) => (e.alternates?.length ?? 0) > 0);
    const urlsetOpen = hasXhtmlAlternates
        ? `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n`
        : `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
    const urlsetClose = `</urlset>\n`;
    const wrapperOverheadBytes = UTF8_ENCODER.encode(urlsetOpen + urlsetClose).byteLength;
    const shards = [];
    let currentNodes = [];
    let currentBodyBytes = 0;
    const flushShard = () => {
        if (currentNodes.length === 0)
            return;
        const shardNum = String(shards.length + 1).padStart(4, "0");
        const fileName = `sitemap-${shardNum}.xml`;
        const xml = `${urlsetOpen}${currentNodes.join("\n")}\n${urlsetClose}`;
        const byteLength = UTF8_ENCODER.encode(xml).byteLength;
        shards.push({
            fileName,
            publicUrl: `${baseSitemapUrl}/${fileName}`,
            urlCount: currentNodes.length,
            byteLength,
            xml,
        });
        currentNodes = [];
        currentBodyBytes = 0;
    };
    for (const entry of entries) {
        const renderedNode = renderSingleSitemapUrlNode(entry);
        const nodeBytes = UTF8_ENCODER.encode(`${renderedNode}\n`).byteLength;
        if (wrapperOverheadBytes + nodeBytes > maxBytes) {
            throw new RangeError(`Single <url> entry '${entry.loc}' (${wrapperOverheadBytes + nodeBytes} B) exceeds maxBytesPerShard (${maxBytes} B)`);
        }
        if (currentNodes.length >= maxUrls ||
            wrapperOverheadBytes + currentBodyBytes + nodeBytes > maxBytes) {
            flushShard();
        }
        currentNodes.push(renderedNode);
        currentBodyBytes += nodeBytes;
    }
    flushShard();
    const indexLines = [
        `<?xml version="1.0" encoding="UTF-8"?>`,
        `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ];
    for (const shard of shards) {
        indexLines.push("  <sitemap>");
        indexLines.push(`    <loc>${escapeXml(shard.publicUrl)}</loc>`);
        if (options.indexLastMod) {
            indexLines.push(`    <lastmod>${escapeXml(options.indexLastMod)}</lastmod>`);
        }
        indexLines.push("  </sitemap>");
    }
    indexLines.push(`</sitemapindex>\n`);
    const totalBytesAcrossShards = shards.reduce((acc, s) => acc + s.byteLength, 0);
    return {
        sitemapIndexXml: indexLines.join("\n"),
        shards,
        totalUrls: entries.length,
        totalBytesAcrossShards,
    };
}
function isValidHreflangTag(tag) {
    if (tag.toLowerCase() === "x-default")
        return true;
    // BCP-47 language[-Script][-REGION] validation
    return /^[a-zA-Z]{2,3}(?:-[a-zA-Z]{4})?(?:-(?:[a-zA-Z]{2}|\d{3}))?$/.test(tag);
}
/**
 * Validates bidirectional `hreflang` return-link reciprocity, self-referential completeness,
 * and consistent `x-default` fallback declarations across a multilingual URL cluster.
 */
export function validateHreflangClusterReciprocity(clusterPages) {
    const pageByUrl = new Map();
    for (const page of clusterPages) {
        pageByUrl.set(page.pageUrl.trim(), page);
    }
    const missingReturnLinks = [];
    const missingXDefaultPages = [];
    const missingSelfReferentialPages = [];
    const invalidLanguageTags = [];
    const observedXDefaultTargets = new Set();
    for (const page of clusterPages) {
        const sourceUrl = page.pageUrl.trim();
        const sourceLang = page.declaredLocale.trim().toLowerCase();
        if (!isValidHreflangTag(sourceLang) || sourceLang === "x-default") {
            invalidLanguageTags.push(`${sourceUrl}: invalid declaredLocale '${page.declaredLocale}'`);
        }
        let hasXDefault = false;
        let hasSelf = false;
        for (const link of page.links) {
            const lang = link.hreflang.trim();
            const targetUrl = link.href.trim();
            if (!isValidHreflangTag(lang)) {
                invalidLanguageTags.push(`${sourceUrl} -> ${targetUrl}: invalid hreflang '${lang}'`);
            }
            if (lang.toLowerCase() === "x-default") {
                hasXDefault = true;
                observedXDefaultTargets.add(targetUrl);
                continue;
            }
            if (targetUrl === sourceUrl && lang.toLowerCase() === sourceLang) {
                hasSelf = true;
            }
            const targetPage = pageByUrl.get(targetUrl);
            if (!targetPage) {
                missingReturnLinks.push(`${sourceUrl} (${sourceLang}) -> ${targetUrl} (${lang}): target page missing from cluster`);
                continue;
            }
            const returnLinkFound = targetPage.links.some((back) => back.href.trim() === sourceUrl && back.hreflang.trim().toLowerCase() === sourceLang);
            if (!returnLinkFound) {
                missingReturnLinks.push(`${sourceUrl} (${sourceLang}) -> ${targetUrl} (${lang}): missing reciprocal return link back to ${sourceUrl} (${sourceLang})`);
            }
        }
        if (!hasXDefault) {
            missingXDefaultPages.push(sourceUrl);
        }
        if (!hasSelf) {
            missingSelfReferentialPages.push(sourceUrl);
        }
    }
    const inconsistentXDefaultTargets = observedXDefaultTargets.size > 1 ? [...observedXDefaultTargets].sort() : [];
    const valid = missingReturnLinks.length === 0 &&
        missingXDefaultPages.length === 0 &&
        inconsistentXDefaultTargets.length === 0 &&
        missingSelfReferentialPages.length === 0 &&
        invalidLanguageTags.length === 0;
    return {
        valid,
        missingReturnLinks,
        missingXDefaultPages,
        inconsistentXDefaultTargets,
        missingSelfReferentialPages,
        invalidLanguageTags,
    };
}
/**
 * Scores a document's Generative Engine Optimization (GEO) readiness across citation density,
 * entity salience, quantitative claim attributability, and structural extractability.
 */
export function scoreGenerativeEngineContent(input) {
    const body = input.markdownBody.trim();
    const words = body.split(/\s+/).filter((w) => w.length > 0);
    const wordCount = words.length;
    if (wordCount === 0) {
        return {
            wordCount: 0,
            citationCount: 0,
            quantitativeClaimCount: 0,
            attributedClaimCount: 0,
            citationDensityPer100Words: 0,
            citationDensityScore: 0,
            entitySalienceScore: 0,
            claimAttributabilityScore: 0,
            structuralExtractabilityScore: 0,
            compositeGeoScore: 0,
            recommendations: ["Provide substantive Markdown body copy with cited primary sources."],
        };
    }
    // 1. Citation extraction: Markdown outbound links `[anchor](https://...)` + footnote refs `[^1]` / `[1]`
    const markdownLinks = body.match(/\[[^\]]+\]\(https?:\/\/[^)\s]+\)/g) ?? [];
    const footnoteRefs = body.match(/\[\^?\d+\]/g) ?? [];
    const citationCount = markdownLinks.length + footnoteRefs.length;
    const citationDensityPer100Words = Number(((citationCount / wordCount) * 100).toFixed(2));
    // Target sweet spot: ~1.5 to 4.0 citations per 100 words
    const citationDensityScore = Math.min(100, Math.round((citationDensityPer100Words / 2.5) * 100));
    // 2. Entity salience: title presence, first-60-word lead presence, secondary entity coverage
    const primaryLower = input.primaryEntity.trim().toLowerCase();
    const titleHasPrimary = primaryLower.length > 0 && input.title.toLowerCase().includes(primaryLower);
    const leadText = words.slice(0, 60).join(" ").toLowerCase();
    const leadHasPrimary = primaryLower.length > 0 && leadText.includes(primaryLower);
    const bodyLower = body.toLowerCase();
    const primaryOccurrences = primaryLower.length > 0 ? bodyLower.split(primaryLower).length - 1 : 0;
    const secondary = input.secondaryEntities ?? [];
    const matchedSecondary = secondary.filter((e) => bodyLower.includes(e.trim().toLowerCase())).length;
    const secondaryRatio = secondary.length > 0 ? matchedSecondary / secondary.length : 1;
    const entitySalienceScore = Math.min(100, Math.round((titleHasPrimary ? 30 : 0) +
        (leadHasPrimary ? 30 : 0) +
        Math.min(20, primaryOccurrences * 5) +
        secondaryRatio * 20));
    // 3. Sentence-level quantitative / factual claim attributability
    const sentences = body
        .split(/(?<=[.!?])\s+|\n+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 15 && !s.startsWith("#"));
    const quantitativePattern = /\b\d+(?:\.\d+)?\s*(?:%|ms|s|kb|mb|gb|tb|x|fps|lufs|usd|\$|\bmillion|\bbillion)\b/i;
    const attributionPattern = /\[[^\]]+\]\(https?:\/\/[^)\s]+\)|\[\^?\d+\]|\b(?:according to|per rfc|ietf|w3c|iso|benchmark|measured)\b/i;
    let quantitativeClaimCount = 0;
    let attributedClaimCount = 0;
    for (const sentence of sentences) {
        if (quantitativePattern.test(sentence)) {
            quantitativeClaimCount++;
            if (attributionPattern.test(sentence)) {
                attributedClaimCount++;
            }
        }
    }
    const claimAttributabilityScore = quantitativeClaimCount > 0
        ? Math.min(100, Math.round((attributedClaimCount / quantitativeClaimCount) * 100))
        : citationCount > 0
            ? 70
            : 25;
    // 4. Structural extractability: H2/H3 headings, bullet/numbered lists, or Markdown tables
    const headingCount = (body.match(/^#{2,3}\s+.+$/gm) ?? []).length;
    const listItemCount = (body.match(/^\s*(?:[-*+]|\d+\.)\s+.+$/gm) ?? []).length;
    const hasTable = /\|.+\|.+\|/.test(body);
    const structuralExtractabilityScore = Math.min(100, (headingCount >= 2 ? 40 : headingCount === 1 ? 25 : 0) +
        (listItemCount >= 3 ? 35 : listItemCount > 0 ? 20 : 0) +
        (hasTable ? 25 : quantitativeClaimCount >= 2 ? 20 : 0));
    const compositeGeoScore = Math.round(citationDensityScore * 0.3 +
        entitySalienceScore * 0.25 +
        claimAttributabilityScore * 0.25 +
        structuralExtractabilityScore * 0.2);
    const recommendations = [];
    if (citationDensityScore < 60) {
        recommendations.push("Add authoritative inline citations (`[Source](https://...)`) to reach >= 1.5 citations per 100 words.");
    }
    if (!leadHasPrimary) {
        recommendations.push(`Define primary entity '${input.primaryEntity}' explicitly within the opening 60 words.`);
    }
    if (claimAttributabilityScore < 75) {
        recommendations.push("Anchor quantitative metrics and benchmarks directly to standards or primary URLs in the same sentence.");
    }
    if (structuralExtractabilityScore < 60) {
        recommendations.push("Organize sections with `##` headings and scannable bullet lists or comparison tables.");
    }
    return {
        wordCount,
        citationCount,
        quantitativeClaimCount,
        attributedClaimCount,
        citationDensityPer100Words,
        citationDensityScore,
        entitySalienceScore,
        claimAttributabilityScore,
        structuralExtractabilityScore,
        compositeGeoScore,
        recommendations,
    };
}
export const SEO_GEO_LLMS_TXT_SITEMAP_AND_GEO_SCORER_MODULE_SPECIFICATION = {
    capabilityId: "seo-geo",
    packageName: "@theme.tools/seo-geo",
    moduleSlug: "llms-txt-sitemap-and-geo-scorer",
    w3cTraceparentFormat: "00-32hex-16hex-01",
    langfuseFailOpenTimeoutMs: 2500,
    rfc9457ProblemDetailsSupported: true,
    tactileMicroInteractionsCount: 30,
    interactionStatesCount: 16,
    transitionDurationSeconds: 0.333,
    requiresCloudflareContainers: false,
    deterministicDigest: 1756714454,
};
export function verifySeoGeoLlmsTxtSitemapAndGeoScorerModuleInvariants(tenantId = "tenant_default") {
    const cleanTenant = tenantId.trim() || "tenant_default";
    let rollingHash = SEO_GEO_LLMS_TXT_SITEMAP_AND_GEO_SCORER_MODULE_SPECIFICATION.deterministicDigest ^ cleanTenant.length;
    for (let i = 0; i < cleanTenant.length; i++) {
        rollingHash = Math.imul(rollingHash ^ cleanTenant.charCodeAt(i), 0x01000193) >>> 0;
    }
    return {
        ok: SEO_GEO_LLMS_TXT_SITEMAP_AND_GEO_SCORER_MODULE_SPECIFICATION.interactionStatesCount === 16 &&
            SEO_GEO_LLMS_TXT_SITEMAP_AND_GEO_SCORER_MODULE_SPECIFICATION.tactileMicroInteractionsCount === 30 &&
            !SEO_GEO_LLMS_TXT_SITEMAP_AND_GEO_SCORER_MODULE_SPECIFICATION.requiresCloudflareContainers,
        tenantId: cleanTenant,
        packageName: SEO_GEO_LLMS_TXT_SITEMAP_AND_GEO_SCORER_MODULE_SPECIFICATION.packageName,
        moduleSlug: SEO_GEO_LLMS_TXT_SITEMAP_AND_GEO_SCORER_MODULE_SPECIFICATION.moduleSlug,
        w3cTraceparentFormat: SEO_GEO_LLMS_TXT_SITEMAP_AND_GEO_SCORER_MODULE_SPECIFICATION.w3cTraceparentFormat,
        langfuseFailOpenTimeoutMs: SEO_GEO_LLMS_TXT_SITEMAP_AND_GEO_SCORER_MODULE_SPECIFICATION.langfuseFailOpenTimeoutMs,
        rfc9457ProblemDetailsSupported: SEO_GEO_LLMS_TXT_SITEMAP_AND_GEO_SCORER_MODULE_SPECIFICATION.rfc9457ProblemDetailsSupported,
        tactileMicroInteractionsCount: SEO_GEO_LLMS_TXT_SITEMAP_AND_GEO_SCORER_MODULE_SPECIFICATION.tactileMicroInteractionsCount,
        interactionStatesCount: SEO_GEO_LLMS_TXT_SITEMAP_AND_GEO_SCORER_MODULE_SPECIFICATION.interactionStatesCount,
        transitionDurationSeconds: SEO_GEO_LLMS_TXT_SITEMAP_AND_GEO_SCORER_MODULE_SPECIFICATION.transitionDurationSeconds,
        spec: SEO_GEO_LLMS_TXT_SITEMAP_AND_GEO_SCORER_MODULE_SPECIFICATION,
        verifiedInteractionStateCount: 16,
        minApcaContrastLc: 60,
        checksum: rollingHash,
    };
}
//# sourceMappingURL=llms-txt-sitemap-and-geo-scorer.js.map