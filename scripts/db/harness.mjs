// Minimal Supabase stand-in on PGlite (embedded Postgres): roles, auth.uid()/auth.jwt()
// and storage stubs, so migrations, RLS and RPCs can be exercised without Docker.
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATIONS_DIR = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));

const PRELUDE = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
grant execute on function auth.uid(), auth.jwt() to anon, authenticated, service_role;

create schema storage;
grant usage on schema storage to anon, authenticated, service_role;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
create publication supabase_realtime;
`;

export async function createDb({ migrationsDir = MIGRATIONS_DIR, upTo = Infinity } = {}) {
  const db = await PGlite.create({ extensions: { pgcrypto } });
  await db.exec(PRELUDE);
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const number = Number(file.slice(0, 4));
    if (number > upTo) break;
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    try {
      await db.exec(sql);
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${error.message}`);
    }
  }
  return db;
}

/**
 * Run fn in its own transaction as a Supabase API role (anon/authenticated),
 * with the JWT claims PostgREST would set, so RLS and grants apply for real.
 */
export async function as(db, { role = "anon", userId = null, anonymous = false } = {}, fn) {
  return db.transaction(async (tx) => {
    const claims = JSON.stringify(userId ? { sub: userId, role, is_anonymous: anonymous } : { role });
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true)`, [userId ?? "", claims]);
    await tx.exec(`set local role ${role}`);
    return fn(tx);
  });
}

export async function createUser(db, id, email) {
  await db.query(`insert into auth.users(id, email) values ($1, $2)`, [id, email]);
}
