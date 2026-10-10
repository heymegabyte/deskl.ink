/**
 * Codename generator — gives every new computer a short, memorable, workspace-unique DISPLAY NAME
 * (e.g. "Atlas", "Ember", "Nova") instead of a generic type label like "Everyday Desktop". The
 * computer TYPE (distro · size · form) lives separately on the resource and is surfaced as metadata,
 * so the name is pure identity the user can relate to + rename.
 *
 * Design:
 *   - CURATED vocabulary (single memorable words — celestial, nature, gems, warm given names). No
 *     offensive / confusing / reserved terms BY CONSTRUCTION, so there's no runtime blocklist to
 *     maintain and no chance of an ugly random string.
 *   - CASE-INSENSITIVE uniqueness within the caller-supplied `taken` set (the owner's existing
 *     names), so a workspace never shows two "Atlas" from auto-generation.
 *   - Deterministic numeric-suffix fallback ("Atlas 2", "Atlas 3", …) once the vocabulary is
 *     exhausted — generation always terminates with a unique name, never throws.
 *   - PURE + injectable `rand` so unit tests are deterministic (the Worker default uses
 *     `crypto.getRandomValues`, available in workerd).
 */

/** Curated single-word codenames. Memorable, friendly, non-offensive by construction. */
export const CODENAMES = [
  // celestial / sky
  'Nova', 'Orbit', 'Comet', 'Lyra', 'Vega', 'Rigel', 'Nimbus', 'Zephyr', 'Cirrus', 'Aurora',
  'Polaris', 'Halley', 'Meteor', 'Solstice', 'Equinox', 'Twilight', 'Horizon', 'Zenith', 'Cosmo', 'Astra',
  // nature / botanical
  'Willow', 'Cedar', 'Juniper', 'Rowan', 'Birch', 'Clover', 'Dahlia', 'Fennel', 'Hazel', 'Laurel',
  'Maple', 'Sage', 'Tansy', 'Zinnia', 'Fern', 'Ivy', 'Poppy', 'Reed', 'Aspen', 'Briar',
  'Clementine', 'Marigold', 'Linden', 'Sorrel', 'Thistle', 'Wisteria', 'Yarrow', 'Basil', 'Olive', 'Pepper',
  // gems / minerals / metals
  'Jasper', 'Onyx', 'Opal', 'Pearl', 'Cobalt', 'Flint', 'Mica', 'Amber', 'Garnet', 'Topaz',
  'Quartz', 'Slate', 'Sable', 'Indigo', 'Cinnabar', 'Pewter', 'Verdigris', 'Lapis', 'Beryl', 'Jade',
  // warm given names
  'Francis', 'Atlas', 'Piper', 'Quill', 'Wren', 'Marlow', 'Hollis', 'Ember', 'Juno', 'Milo',
  'Nico', 'Remy', 'Sloane', 'Theo', 'Wren', 'August', 'Dashiell', 'Felix', 'Hugo', 'Ira',
  'Lennox', 'Otis', 'Rufus', 'Silas', 'Tobias', 'Vesper', 'Wilder', 'Cassius', 'Dorian', 'Emrys',
  // colors / warm abstracts
  'Purple', 'Scarlet', 'Crimson', 'Teal', 'Marine', 'Saffron', 'Russet', 'Umber', 'Sienna', 'Cerulean',
  // places / evocative
  'Harbor', 'Mesa', 'Delta', 'Fjord', 'Cove', 'Dune', 'Grove', 'Meadow', 'Summit', 'Vale',
  'Echo', 'Fable', 'Gale', 'Lumen', 'Mirage', 'Oasis', 'Quest', 'Relic', 'Saga', 'Tempo',
] as const;

export type Codename = (typeof CODENAMES)[number];

/** Uniform [0,1) from the Workers crypto RNG (workerd exposes `crypto.getRandomValues`). */
function cryptoRandom(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0]! / 2 ** 32;
}

/**
 * Pick a workspace-unique codename not already in `taken` (case-insensitive). Prefers a fresh word
 * from {@link CODENAMES}; once every word is taken, appends the smallest free numeric suffix. Always
 * returns a unique, non-empty name — never throws, never collides with an existing name.
 *
 * @param taken  the owner's existing computer names (any case/whitespace — normalized here).
 * @param rand   injectable [0,1) RNG for deterministic tests (defaults to the crypto RNG).
 */
export function generateCodename(
  taken: Iterable<string>,
  rand: () => number = cryptoRandom
): string {
  const used = new Set<string>();
  for (const n of taken) used.add(n.trim().toLowerCase());

  const free = CODENAMES.filter((w) => !used.has(w.toLowerCase()));
  if (free.length > 0) {
    const idx = Math.min(free.length - 1, Math.max(0, Math.floor(rand() * free.length)));
    return free[idx]!;
  }

  // Vocabulary exhausted → smallest "<Word> N" (N ≥ 2) that's free. Terminates: the (word, N) grid
  // is unbounded while `used` is finite.
  for (let n = 2; ; n++) {
    for (const w of CODENAMES) {
      const candidate = `${w} ${n}`;
      if (!used.has(candidate.toLowerCase())) return candidate;
    }
  }
}

/**
 * Does `name` look like a LEGACY auto-generated generic name (e.g. "Everyday Desktop", "Developer
 * Server")? Used by a safe backfill to migrate only machine-assigned generics to codenames while
 * NEVER touching a user's custom name. Matches "<FriendlySize> <Desktop|Server>" case-insensitively.
 */
export function isLegacyGenericName(name: string, friendlySizes: readonly string[]): boolean {
  const n = name.trim().toLowerCase();
  for (const size of friendlySizes) {
    if (n === `${size.toLowerCase()} desktop` || n === `${size.toLowerCase()} server`) return true;
  }
  return false;
}
