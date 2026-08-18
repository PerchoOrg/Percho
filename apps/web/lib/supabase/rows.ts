/**
 * Canonical row types, derived from the generated schema.
 *
 * Per CLAUDE.md §5, row shapes are never redefined by hand — a hand-written
 * `interface CommunityRow { ... }` silently drifts the moment a migration
 * adds or renames a column, and the compiler cannot tell you. Everything
 * here is projected from `database.types.ts`, so a migration + `pnpm db:types`
 * propagates to every call site automatically.
 *
 * Usage:
 *
 *   import type { Row } from '@/lib/supabase/rows';
 *
 *   // whole row
 *   type Community = Row<'communities'>;
 *
 *   // just the columns a query actually selects — still schema-checked,
 *   // so a renamed column breaks the build instead of returning undefined
 *   type CommunityCard = Pick<Row<'communities'>, 'id' | 'name' | 'slug'>;
 *
 * Prefer `Pick<Row<'x'>, ...>` over the full row when the query selects a
 * subset: it documents the projection and keeps the type honest.
 */
import type { Database } from './database.types';

type PublicSchema = Database['public'];

/** A table's `Row` type, by table name. */
export type Row<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Row'];

/** A table's `Insert` type, by table name. */
export type Insert<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Insert'];

/** A table's `Update` type, by table name. */
export type Update<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Update'];

/** A view's `Row` type, by view name. */
export type ViewRow<T extends keyof PublicSchema['Views']> = PublicSchema['Views'][T]['Row'];
