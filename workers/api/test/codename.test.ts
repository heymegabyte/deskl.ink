/**
 * Unit tests for the computer codename generator (P0: replace generic "Everyday Desktop" names with
 * memorable, workspace-unique codenames). Pure core, deterministic via an injected RNG.
 */
import { describe, it, expect } from 'vitest';
import { CODENAMES, generateCodename, isLegacyGenericName } from '../src/compute/codename.js';

describe('generateCodename', () => {
  it('returns a curated single-word codename, never a generic type label', () => {
    const name = generateCodename([], () => 0);
    expect(CODENAMES).toContain(name as (typeof CODENAMES)[number]);
    expect(name).not.toMatch(/desktop|server/i);
  });

  it('is deterministic under an injected RNG (first free word at rand=0)', () => {
    expect(generateCodename([], () => 0)).toBe(CODENAMES[0]);
  });

  it('never collides with a taken name — CASE-INSENSITIVE', () => {
    // Take the first word (lowercased + padded) → must not be chosen even though rand points at it.
    const taken = [`  ${CODENAMES[0]!.toUpperCase()}  `];
    const name = generateCodename(taken, () => 0);
    expect(name.toLowerCase()).not.toBe(CODENAMES[0]!.toLowerCase());
    expect(CODENAMES).toContain(name as (typeof CODENAMES)[number]);
  });

  it('appends the smallest free numeric suffix once the vocabulary is exhausted', () => {
    const name = generateCodename(CODENAMES, () => 0); // every single word taken
    expect(name).toBe(`${CODENAMES[0]} 2`);
  });

  it('skips an already-used suffix when extending past exhaustion', () => {
    const taken = [...CODENAMES, `${CODENAMES[0]} 2`];
    // First word's "2" is taken → the scan finds the SECOND word's "2" before the first word's "3".
    const name = generateCodename(taken, () => 0);
    expect(name).toBe(`${CODENAMES[1]} 2`);
  });

  it('produces no duplicates across many sequential generations', () => {
    const taken: string[] = [];
    for (let i = 0; i < 50; i++) taken.push(generateCodename(taken, () => 0.37));
    const lowered = taken.map((n) => n.toLowerCase());
    expect(new Set(lowered).size).toBe(taken.length);
  });
});

describe('isLegacyGenericName', () => {
  const sizes = ['Everyday', 'Developer', 'Power', 'Heavy'];
  it('matches machine-assigned generics (case-insensitive)', () => {
    expect(isLegacyGenericName('Everyday Desktop', sizes)).toBe(true);
    expect(isLegacyGenericName('developer server', sizes)).toBe(true);
    expect(isLegacyGenericName('  Power Desktop ', sizes)).toBe(true);
  });
  it('NEVER matches a custom or codename (so a backfill never clobbers user names)', () => {
    expect(isLegacyGenericName('Atlas', sizes)).toBe(false);
    expect(isLegacyGenericName("Marty's build box", sizes)).toBe(false);
    expect(isLegacyGenericName('Everyday', sizes)).toBe(false);
  });
});
