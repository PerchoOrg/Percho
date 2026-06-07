// Stub generated types. Run `pnpm db:types` after applying migrations
// to regenerate this file from the live schema.
//
// DO NOT edit by hand. This file is overwritten by Supabase CLI.

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type Database = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
