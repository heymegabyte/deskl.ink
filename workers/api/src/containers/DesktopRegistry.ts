/**
 * DesktopRegistry — the authoritative desktop list.
 *
 * A plain SQLite Durable Object (no container) that persists one row per
 * desktop: id, name, os, size, status, createdAt, persistent, lastActiveAt.
 * The control-plane (`routes/desktops.ts`) calls these methods over the DO stub
 * to create / list / get / update-status / remove desktops; the DesktopContainer
 * DO owns the live compute, this DO owns the metadata + lifecycle state.
 *
 * @remarks
 * - Single GLOBAL registry for now (`getRegistry(env)` resolves the singleton
 *   id). Per-user scoping is M2 — see the TODO on {@link getRegistry}.
 * - Methods are directly RPC-callable on the stub (`DurableObject` base). Every
 *   row crossing the boundary is validated against `DesktopResourceSchema` by
 *   the caller; this DO stores/returns the already-typed shape.
 * - Container DOs require SQLite, and so does this one — declared via
 *   `new_sqlite_classes` in `wrangler.jsonc`.
 */

import { DurableObject } from 'cloudflare:workers';
import {
  DEFAULT_DESKTOP_OS,
  type DesktopResource,
  type DesktopSizeId,
  type DesktopStatus,
} from '@deskl/shared';
import type { Env } from '../env.js';

/**
 * Row shape as stored in SQLite (booleans are 0/1 integers in SQLite).
 * Extends `Record<string, SqlStorageValue>` so it satisfies the generic on
 * `this.ctx.storage.sql.exec<DesktopRow>(...)`; every field is a SqlStorageValue
 * (string | number | ArrayBuffer | null).
 */
interface DesktopRow extends Record<string, SqlStorageValue> {
  id: string;
  name: string;
  os: string;
  size: string;
  status: string;
  created_at: string;
  last_active_at: string | null;
  persistent: number;
}

/** Fields the control-plane supplies on create; the rest are derived here. */
export interface CreateDesktopRow {
  id: string;
  name: string;
  os?: string;
  size: DesktopSizeId;
  status: DesktopStatus;
  persistent: boolean;
}

export class DesktopRegistry extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Idempotent schema init — safe to run on every cold start.
    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS desktops (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        os TEXT NOT NULL,
        size TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_active_at TEXT,
        persistent INTEGER NOT NULL DEFAULT 0
      );`
    );
  }

  /** Insert a new desktop row. Idempotent: re-creating the same id is a no-op upsert. */
  create(input: CreateDesktopRow): DesktopResource {
    const now = new Date().toISOString();
    this.ctx.storage.sql.exec(
      `INSERT INTO desktops (id, name, os, size, status, created_at, last_active_at, persistent)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         os = excluded.os,
         size = excluded.size,
         status = excluded.status;`,
      input.id,
      input.name,
      input.os ?? DEFAULT_DESKTOP_OS,
      input.size,
      input.status,
      now,
      input.persistent ? 1 : 0
    );
    const row = this.getRow(input.id);
    if (!row) throw new Error(`failed to persist desktop ${input.id}`);
    return rowToResource(row);
  }

  /** Every desktop, newest first. */
  list(): DesktopResource[] {
    const rows = this.ctx.storage.sql
      .exec<DesktopRow>(`SELECT * FROM desktops ORDER BY created_at DESC;`)
      .toArray();
    return rows.map(rowToResource);
  }

  /** One desktop by id, or `undefined` if unknown. */
  get(id: string): DesktopResource | undefined {
    const row = this.getRow(id);
    return row ? rowToResource(row) : undefined;
  }

  /**
   * Update a desktop's lifecycle status; bumps `lastActiveAt`. Idempotent —
   * setting the same status twice is harmless. Returns the updated resource,
   * or `undefined` if the id is unknown (so callers can 404).
   */
  updateStatus(id: string, status: DesktopStatus): DesktopResource | undefined {
    const now = new Date().toISOString();
    this.ctx.storage.sql.exec(
      `UPDATE desktops SET status = ?, last_active_at = ? WHERE id = ?;`,
      status,
      now,
      id
    );
    return this.get(id);
  }

  /** Delete a desktop row. Idempotent — removing an unknown id is a no-op. */
  remove(id: string): void {
    this.ctx.storage.sql.exec(`DELETE FROM desktops WHERE id = ?;`, id);
  }

  /** Internal: fetch a single raw row. */
  private getRow(id: string): DesktopRow | undefined {
    return this.ctx.storage.sql
      .exec<DesktopRow>(`SELECT * FROM desktops WHERE id = ? LIMIT 1;`, id)
      .toArray()[0];
  }
}

/** Map a SQLite row to the API's `DesktopResource` (exactOptionalPropertyTypes-safe). */
function rowToResource(row: DesktopRow): DesktopResource {
  const base: DesktopResource = {
    id: row.id,
    name: row.name,
    os: row.os,
    size: row.size as DesktopSizeId,
    status: row.status as DesktopStatus,
    createdAt: row.created_at,
    persistent: row.persistent === 1,
  };
  // Only attach the optional field when present — never set it to `undefined`.
  return row.last_active_at ? { ...base, lastActiveAt: row.last_active_at } : base;
}
