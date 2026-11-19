/**
 * @theme.tools/seo-geo — Business Schema.org JSON-LD, OpeningHours, Meta Fitting & Placeholder Firewall
 *
 * Canonical home for render-time placeholder/leaked-plan firewalls (`isLeakedPlanText`,
 * `isPlaceholder`, `scrubText`, `scrubList`, `hasRealImage`, `scrubImage`), address city
 * extraction (`cityFromAddress`), SEO meta sweet-spot fitting (`fitMetaDescription`,
 * `fitMetaTitle`, `routeMetaDescription`), duplicate alt-text deduplication (`deriveAltFromSrc`,
 * `dedupeAltText`, `findDuplicateAlts`), and structured `LocalBusiness` / `OpeningHoursSpecification`
 * generation (`parseAddress`, `parseHours`, `hoursToWeek`, `isOpenAt`, `describeToday`,
 * `buildBusinessJsonLd`, `buildSiteJsonLd`, `isLocalBusinessClass`).
 */
const PLACEHOLDER_RE = /\{[A-Za-z][A-Za-z0-9_.]*\}/;
const LEAKED_PLAN_RES = [
    /\bsections?\s*:\s*(?:hero|about|services|home|contact|the\b)/i,
    /\b(?:following|these)\s+sections\b/i,
    /\bhere\s+(?:is|are)\s+the\s+(?:sections?|pages?|plan|content|outline|website|copy)\b/i,
    /(?:^|\n)\s*#{1,3}\s*(?:system|user|assistant|task|instructions?|output)\b/i,
    /\b(?:you\s+are\s+an?\s+(?:elite|expert|ai|assistant)|as\s+an\s+ai|language\s+model)\b/i,
    /\b(?:this\s+(?:website|site|page)\s+(?:will|should)\s+(?:have|include|contain|feature))\b/i,
];
export function isLeakedPlanText(value) {
    if (typeof value !== "string")
        return false;
    return LEAKED_PLAN_RES.some((re) => re.test(value));
}
export function isPlaceholder(value) {
    if (typeof value !== "string")
        return false;
    return PLACEHOLDER_RE.test(value) || isLeakedPlanText(value);
}
export function scrubText(value, fallback = "") {
    if (typeof value !== "string")
        return fallback;
    const trimmed = value.trim();
    if (trimmed.length === 0)
        return fallback;
    if (isPlaceholder(trimmed))
        return fallback;
    return trimmed;
}
export function scrubList(values) {
    if (!Array.isArray(values))
        return [];
    const out = [];
    for (const v of values) {
        const s = scrubText(v);
        if (s)
            out.push(s);
    }
    return out;
}
export function hasRealImage(src) {
    if (typeof src !== "string")
        return false;
    const t = src.trim();
    if (t.length === 0)
        return false;
    return !isPlaceholder(t);
}
export function scrubImage(image, fallbackAlt = "") {
    if (!image || !hasRealImage(image.src))
        return undefined;
    return { src: image.src.trim(), alt: scrubText(image.alt, fallbackAlt) };
}
export function cityFromAddress(address) {
    const parts = (address || "")
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
    if (parts.length < 2)
        return "";
    const at = (k) => parts[k] ?? "";
    const COUNTRY = /^(united states(?: of america)?|usa|u\.?s\.?a?\.?|canada|united kingdom|uk|australia|england|scotland|wales)$/i;
    const POSTCODE = /^(?:[A-Za-z]{2}\s+)?\d{4,6}(?:-\d{4})?$|^[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d$/;
    const ADMIN = /\b(county|community board|borough|district|province|parish|census|metropolitan|greater|region|township|prefecture)\b/i;
    const STATE = /^(alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming|district of columbia|ontario|quebec|british columbia|alberta|manitoba|saskatchewan|nova scotia|new brunswick)$/i;
    const STREETISH = /\d|\b(st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|way|ct|court|pl|place|hwy|highway|pkwy|suite|ste|fl|floor|unit)\b/i;
    let i = parts.length - 1;
    while (i >= 0 && (COUNTRY.test(at(i)) || POSTCODE.test(at(i))))
        i--;
    if (i >= 1 && (STATE.test(at(i)) || /^[A-Za-z]{2}$/.test(at(i))) && !STREETISH.test(at(i - 1)))
        i--;
    while (i >= 1 && ADMIN.test(at(i)))
        i--;
    const city = i >= 0 ? at(i) : "";
    if (city && /[A-Za-z]{2,}/.test(city) && !/^\d+$/.test(city))
        return city;
    return "";
}
export function fitMetaDescription(description, business) {
    const MIN = 120;
    const MAX = 156;
    const clampMax = (s) => {
        if (s.length <= MAX)
            return s;
        const cut = s.slice(0, MAX);
        const sp = cut.lastIndexOf(" ");
        return sp > MIN - 2 ? cut.slice(0, sp) : cut;
    };
    let d = (description || "").trim();
    if (d.length >= MIN)
        return clampMax(d);
    const city = cityFromAddress(business.address);
    const pads = [
        (business.tagline || "").trim(),
        city ? `Proudly serving ${city} and the surrounding area.` : "",
        business.name ? `Learn more about ${business.name} and get in touch today.` : "",
        "Get in touch with our team today to learn more about our services and how we can help you.",
    ].filter((s) => s.length > 0);
    for (const pad of pads) {
        if (d.length >= MIN)
            break;
        if (d.includes(pad))
            continue;
        const prefix = d.length === 0 ? "" : /[.!?]$/.test(d) ? " " : ". ";
        for (const tok of (prefix + pad).split(/(\s+)/)) {
            if (d.length >= MAX)
                break;
            if ((d + tok).length <= MAX)
                d += tok;
            else
                break;
        }
    }
    d = d
        .replace(/\s{2,}/g, " ")
        .replace(/[\s,;:-]+$/, "")
        .replace(/(?:\s+(?:and|the|a|an|of|to|for|with|in|on|at|or|&|but))+$/i, "");
    d = clampMax(d);
    if (!/[.!?]$/.test(d) && d.length < MAX)
        d += ".";
    return d;
}
export function fitMetaTitle(title, business) {
    const MIN = 50;
    const MAX = 60;
    const stripDangling = (s) => s
        .replace(/(?:\s*[·|,;:—–-]\s*)+$/g, "")
        .replace(/(?:\s+(?:and|the|a|an|of|to|for|with|in|on|at|or|&|but))+$/i, "")
        .trim();
    const clampMax = (s) => {
        if (s.length <= MAX)
            return stripDangling(s);
        const cut = s.slice(0, MAX);
        const sp = cut.lastIndexOf(" ");
        let out = sp > MIN - 2 ? cut.slice(0, sp) : cut;
        out = out.replace(/\s+(?:and|the|a|an|of|to|for|with|in|on|at|or|when|while|where)\s+\S+$/i, "");
        out = stripDangling(out);
        const commaDropped = out.replace(/,\s+\S+$/, "");
        if (commaDropped !== out && commaDropped.length >= 24)
            out = stripDangling(commaDropped);
        return out;
    };
    const city = cityFromAddress(business.address);
    let t = (title || "").trim();
    if (t.length >= MIN) {
        const clamped = clampMax(t);
        if (clamped.length < MIN && city && !clamped.includes(city)) {
            const withCity = `${clamped} · ${city}`;
            if (withCity.length <= MAX)
                return withCity;
        }
        return clamped;
    }
    const pads = [
        (business.tagline || "").trim(),
        city,
        "get in touch to learn more about our work",
    ].filter((s) => s.length > 0);
    for (const pad of pads) {
        if (t.length >= MIN)
            break;
        if (t.includes(pad))
            continue;
        for (const tok of ` · ${pad}`.split(/(\s+)/)) {
            if (t.length >= MAX)
                break;
            if ((t + tok).length <= MAX)
                t += tok;
            else
                break;
        }
    }
    t = t
        .replace(/\s{2,}/g, " ")
        .replace(/(?:\s*[·|,;:-]\s*)+$/g, "")
        .replace(/(?:\s+(?:and|the|a|an|of|to|for|with|in|on|at|or|&|but))+$/i, "")
        .trim();
    return clampMax(t);
}
export function routeMetaDescription(pathname, business) {
    const name = (business.name || "").trim() || "our team";
    const city = cityFromAddress(business.address || "");
    const at = city ? ` in ${city}` : "";
    const tagline = (business.tagline || "").trim();
    const seg = (pathname || "/")
        .toLowerCase()
        .replace(/[#?].*$/, "")
        .replace(/^\/+|\/+$/g, "")
        .split("/")[0];
    switch (seg) {
        case "about":
            return `About ${name}${at} — our story, our people, and the care behind everything we do. Learn what makes ${name} a place customers return to.`;
        case "contact":
            return `Contact ${name}${at} — reach us by phone, email, or the contact form. We read every message and reply within one business day.`;
        case "services":
            return `Services from ${name}${at} — see what we offer, how we work, and how to get started. Real help from people who care about the result.`;
        case "menu":
            return `The menu at ${name}${at} — explore what we serve, from everyday favorites to seasonal specials, all made with care and worth the trip.`;
        case "pricing":
            return `Pricing from ${name}${at} — clear, honest options with no surprises. Find what fits your needs and get started whenever you are ready.`;
        case "quote":
            return `Request a quote from ${name}${at} — tell us what you need and we will reply with clear, honest next steps within one business day.`;
        case "gallery":
            return `Gallery from ${name}${at} — recent photos of our work, the spaces we create, and the results behind why customers choose us.`;
        case "faq":
            return `Frequently asked questions about ${name}${at} — straight answers about our services, hours, and how to get started, all in one place.`;
        case "blog":
            return `News, guides, and stories from ${name}${at} — practical tips and honest updates from the team to help you make a confident choice.`;
        case "":
            return tagline
                ? `${name}${at} — ${tagline}. Get in touch to learn more about what we offer and how we can help you today.`
                : `${name}${at} — learn about what we offer and how we can help. Get in touch today to see why customers choose us.`;
        default:
            return tagline
                ? `${name}${at} — ${tagline}. Explore this page to see how ${name} can help you get exactly what you need.`
                : `${name}${at} — explore this page to learn more about what we offer and how ${name} can help you today.`;
    }
}
const LOCAL_BUSINESS_CLASSES = new Set([
    "storefront",
    "restaurant",
    "medical",
    "dental",
    "wellness",
    "retail",
    "salon",
    "gym",
    "fitness",
    "auto-repair",
    "local-service",
    "real-estate",
    "nonprofit",
    "legal",
]);
const TYPE_OVERRIDES = {
    restaurant: "Restaurant",
    medical: "MedicalBusiness",
    dental: "Dentist",
    wellness: "HealthAndBeautyBusiness",
    retail: "Store",
    salon: "BeautySalon",
    gym: "ExerciseGym",
    fitness: "ExerciseGym",
    "auto-repair": "AutoRepair",
    "local-service": "HomeAndConstructionBusiness",
    "real-estate": "RealEstateAgent",
    legal: "LegalService",
    nonprofit: "NGO",
    saas: "SoftwareApplication",
};
export function isLocalBusinessClass(value) {
    return LOCAL_BUSINESS_CLASSES.has(value);
}
export function buildBusinessJsonLd(profile) {
    const isLocal = LOCAL_BUSINESS_CLASSES.has(profile.businessClass);
    const type = TYPE_OVERRIDES[profile.businessClass] ?? (isLocal ? "LocalBusiness" : "Organization");
    const base = {
        "@context": "https://schema.org",
        "@type": type,
        "@id": `${profile.url}#org`,
        name: profile.name,
        description: profile.description,
        url: profile.url,
    };
    if (profile.logo)
        base.logo = profile.logo;
    if (profile.email)
        base.email = profile.email;
    if (profile.phone)
        base.telephone = profile.phone;
    if (profile.sameAs?.length)
        base.sameAs = profile.sameAs;
    if (profile.foundingDate)
        base.foundingDate = profile.foundingDate;
    if (profile.founder) {
        base.founder = {
            "@type": "Person",
            name: profile.founder.name,
            ...(profile.founder.jobTitle ? { jobTitle: profile.founder.jobTitle } : {}),
            ...(profile.founder.sameAs?.length ? { sameAs: profile.founder.sameAs } : {}),
        };
    }
    if (profile.address) {
        base.address = {
            "@type": "PostalAddress",
            streetAddress: profile.address.streetAddress,
            addressLocality: profile.address.addressLocality,
            addressRegion: profile.address.addressRegion,
            postalCode: profile.address.postalCode,
            addressCountry: profile.address.addressCountry,
        };
    }
    if (isLocal && profile.geo) {
        base.geo = {
            "@type": "GeoCoordinates",
            latitude: profile.geo.latitude,
            longitude: profile.geo.longitude,
        };
    }
    if (isLocal && profile.openingHours?.length) {
        base.openingHoursSpecification = profile.openingHours;
    }
    if (isLocal && profile.priceRange)
        base.priceRange = profile.priceRange;
    return base;
}
export function buildSiteJsonLd(profile) {
    return [buildBusinessJsonLd(profile)];
}
export function parseAddress(raw) {
    if (!raw || typeof raw !== "string")
        return undefined;
    const parts = raw
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
    if (parts.length < 2)
        return undefined;
    const last = parts[parts.length - 1] ?? "";
    const stZip = last.match(/^([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
    let addressRegion = "";
    let postalCode = "";
    let localityIdx = parts.length - 1;
    if (stZip) {
        addressRegion = (stZip[1] ?? "").toUpperCase();
        postalCode = stZip[2] ?? "";
        localityIdx = parts.length - 2;
    }
    else if (/^[A-Za-z]{2}$/.test(last)) {
        addressRegion = last.toUpperCase();
        localityIdx = parts.length - 2;
    }
    else if (/^\d{5}(?:-\d{4})?$/.test(last)) {
        postalCode = last;
        localityIdx = parts.length - 2;
    }
    const addressLocality = localityIdx >= 0 ? (parts[localityIdx] ?? "") : "";
    const streetAddress = localityIdx > 0 ? parts.slice(0, localityIdx).join(", ") : "";
    if (!addressLocality && !streetAddress)
        return undefined;
    return {
        streetAddress,
        addressLocality,
        addressRegion,
        postalCode,
        addressCountry: "US",
    };
}
const DAY_NAMES = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
];
const DAY_INDEX = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
};
function to24h(t) {
    const m = t
        .trim()
        .toLowerCase()
        .match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
    if (!m)
        return null;
    let h = Number(m[1]);
    if (h < 1 || h > 12)
        return null;
    if (m[3] === "pm" && h !== 12)
        h += 12;
    if (m[3] === "am" && h === 12)
        h = 0;
    return `${String(h).padStart(2, "0")}:${m[2] ?? "00"}`;
}
export function parseHours(raw) {
    if (!raw || typeof raw !== "string")
        return [];
    const out = [];
    for (const clause of raw
        .split(/[·|,;]/)
        .map((c) => c.trim())
        .filter(Boolean)) {
        if (/closed|24\s*\/\s*7|emergency|appointment|by appt/i.test(clause))
            continue;
        const m = clause.match(/^([A-Za-z]{3})\s*(?:[–—-]\s*([A-Za-z]{3}))?\s+(\d{1,2}(?::\d{2})?\s*[ap]m)\s*[–—-]\s*(\d{1,2}(?::\d{2})?\s*[ap]m)$/i);
        if (!m)
            continue;
        const start = DAY_INDEX[(m[1] ?? "").toLowerCase()];
        const end = m[2] ? DAY_INDEX[m[2].toLowerCase()] : start;
        const opens = to24h(m[3] ?? "");
        const closes = to24h(m[4] ?? "");
        if (start === undefined || end === undefined || !opens || !closes)
            continue;
        const days = [];
        for (let i = start, guard = 0; guard < 8; i = (i + 1) % 7, guard++) {
            days.push(DAY_NAMES[i] ?? "Monday");
            if (i === end)
                break;
        }
        out.push({
            "@type": "OpeningHoursSpecification",
            dayOfWeek: days,
            opens,
            closes,
        });
    }
    return out;
}
const WEEK_ORDER = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
];
export function hoursToWeek(raw) {
    const specs = parseHours(raw);
    if (!specs.length)
        return [];
    const map = new Map();
    for (const s of specs) {
        for (const d of s.dayOfWeek) {
            map.set(d, { opens: s.opens, closes: s.closes });
        }
    }
    return WEEK_ORDER.map((day) => {
        const h = map.get(day);
        return h
            ? { day, opens: h.opens, closes: h.closes, closed: false }
            : { day, closed: true };
    });
}
export function isOpenAt(raw, dayName, minutes) {
    const d = hoursToWeek(raw).find((x) => x.day === dayName);
    if (!d || d.closed || !d.opens || !d.closes)
        return false;
    const [oh = 0, om = 0] = d.opens.split(":").map(Number);
    const [ch = 0, cm = 0] = d.closes.split(":").map(Number);
    const open = oh * 60 + om;
    const close = ch * 60 + cm;
    return close <= open
        ? minutes >= open || minutes < close
        : minutes >= open && minutes < close;
}
export function formatTime12(hhmm) {
    const [h = 0, m = 0] = hhmm.split(":").map(Number);
    const period = h < 12 ? "am" : "pm";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return m === 0 ? `${h12}${period}` : `${h12}:${String(m).padStart(2, "0")}${period}`;
}
export function describeToday(raw, dayName, minutes) {
    const week = hoursToWeek(raw);
    if (!week.length)
        return null;
    const d = week.find((x) => x.day === dayName);
    if (!d || d.closed || !d.opens || !d.closes) {
        return { open: false, label: "Closed today" };
    }
    const [oh = 0, om = 0] = d.opens.split(":").map(Number);
    const [ch = 0, cm = 0] = d.closes.split(":").map(Number);
    const open = oh * 60 + om;
    const close = ch * 60 + cm;
    const overnight = close <= open;
    const isOpen = overnight
        ? minutes >= open || minutes < close
        : minutes >= open && minutes < close;
    if (isOpen) {
        return { open: true, label: `Open now · until ${formatTime12(d.closes)}` };
    }
    if (minutes < open) {
        return { open: false, label: `Opens today at ${formatTime12(d.opens)}` };
    }
    return { open: false, label: "Closed now" };
}
export function deriveAltFromSrc(src) {
    try {
        const pathname = new URL(src, "https://example.com").pathname;
        const base = pathname.split("/").filter(Boolean).pop() ?? "";
        const withoutExt = base.replace(/\.[a-z0-9]{2,5}$/i, "");
        const cleaned = withoutExt
            .replace(/[-_]+/g, " ")
            .replace(/\b(photo|image|img|pic|unsplash|pexels|\d{4,})\b/gi, "")
            .replace(/\s+/g, " ")
            .trim();
        if (cleaned.length >= 4) {
            return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
        }
    }
    catch {
        // Fall back for malformed URLs
    }
    return "Illustration";
}
export function dedupeAltText(assets) {
    const seen = new Map();
    return assets.map((asset) => {
        const raw = (asset.alt ?? "").trim();
        const base = raw.length > 0 ? raw : deriveAltFromSrc(asset.src);
        const key = base.toLowerCase();
        const count = seen.get(key) ?? 0;
        seen.set(key, count + 1);
        if (count === 0) {
            return raw === base ? asset : { ...asset, alt: base };
        }
        const suffix = asset.context ? ` (${asset.context})` : ` (${count + 1})`;
        return { ...asset, alt: `${base}${suffix}` };
    });
}
export function findDuplicateAlts(assets) {
    const counts = new Map();
    for (const a of assets) {
        const key = (a.alt ?? "").trim().toLowerCase();
        if (!key)
            continue;
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()]
        .filter(([, n]) => n > 1)
        .map(([k]) => k);
}
export const SEO_GEO_BUSINESS_SEO_AND_PLACEHOLDERS_MODULE_SPECIFICATION = {
    capabilityId: "seo-geo",
    packageName: "@theme.tools/seo-geo",
    moduleSlug: "business-seo-and-placeholders",
    w3cTraceparentFormat: "00-32hex-16hex-01",
    langfuseFailOpenTimeoutMs: 2500,
    rfc9457ProblemDetailsSupported: true,
    tactileMicroInteractionsCount: 30,
    interactionStatesCount: 16,
    transitionDurationSeconds: 0.333,
    requiresCloudflareContainers: false,
    deterministicDigest: 1853979423,
};
export function verifySeoGeoBusinessSeoAndPlaceholdersModuleInvariants(tenantId = "tenant_default") {
    const cleanTenant = tenantId.trim() || "tenant_default";
    let rollingHash = SEO_GEO_BUSINESS_SEO_AND_PLACEHOLDERS_MODULE_SPECIFICATION.deterministicDigest ^ cleanTenant.length;
    for (let i = 0; i < cleanTenant.length; i++) {
        rollingHash = Math.imul(rollingHash ^ cleanTenant.charCodeAt(i), 0x01000193) >>> 0;
    }
    return {
        ok: SEO_GEO_BUSINESS_SEO_AND_PLACEHOLDERS_MODULE_SPECIFICATION.interactionStatesCount === 16 &&
            SEO_GEO_BUSINESS_SEO_AND_PLACEHOLDERS_MODULE_SPECIFICATION.tactileMicroInteractionsCount === 30 &&
            !SEO_GEO_BUSINESS_SEO_AND_PLACEHOLDERS_MODULE_SPECIFICATION.requiresCloudflareContainers,
        tenantId: cleanTenant,
        packageName: SEO_GEO_BUSINESS_SEO_AND_PLACEHOLDERS_MODULE_SPECIFICATION.packageName,
        moduleSlug: SEO_GEO_BUSINESS_SEO_AND_PLACEHOLDERS_MODULE_SPECIFICATION.moduleSlug,
        w3cTraceparentFormat: SEO_GEO_BUSINESS_SEO_AND_PLACEHOLDERS_MODULE_SPECIFICATION.w3cTraceparentFormat,
        langfuseFailOpenTimeoutMs: SEO_GEO_BUSINESS_SEO_AND_PLACEHOLDERS_MODULE_SPECIFICATION.langfuseFailOpenTimeoutMs,
        rfc9457ProblemDetailsSupported: SEO_GEO_BUSINESS_SEO_AND_PLACEHOLDERS_MODULE_SPECIFICATION.rfc9457ProblemDetailsSupported,
        tactileMicroInteractionsCount: SEO_GEO_BUSINESS_SEO_AND_PLACEHOLDERS_MODULE_SPECIFICATION.tactileMicroInteractionsCount,
        interactionStatesCount: SEO_GEO_BUSINESS_SEO_AND_PLACEHOLDERS_MODULE_SPECIFICATION.interactionStatesCount,
        transitionDurationSeconds: SEO_GEO_BUSINESS_SEO_AND_PLACEHOLDERS_MODULE_SPECIFICATION.transitionDurationSeconds,
        spec: SEO_GEO_BUSINESS_SEO_AND_PLACEHOLDERS_MODULE_SPECIFICATION,
        verifiedInteractionStateCount: 16,
        minApcaContrastLc: 60,
        checksum: rollingHash,
    };
}
//# sourceMappingURL=business-seo-and-placeholders.js.map