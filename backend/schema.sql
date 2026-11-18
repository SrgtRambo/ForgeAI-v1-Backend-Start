-- Forge AI database schema (plain Postgres, idempotent).
-- Run this in your Postgres database (Replit provides DATABASE_URL automatically).

-- Users table (Replit-native, no external auth dependency).
create table if not exists users (
  id text primary key,
  name text,
  email text,
  created_at timestamptz default now()
);

-- Purchases table (user_id is plain text, no auth.users foreign key).
create table if not exists purchases (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  email text not null,
  type text not null check (type in ('website','restaurant','services','saas','social','spreadsheet','software')),
  tier text not null check (tier in ('standard','pro')),
  prompt text not null,
  amount_cents integer not null default 0,
  status text not null default 'pending' check (status in ('pending','queued','processing','ready','failed','cancelled')),
  progress integer not null default 0,
  progress_message text,
  project_name text,
  file_count integer,
  error text,
  license_key text,
  stripe_session_id text,
  storage_path text,
  brief_id uuid references site_briefs(id),
  qa_status text,
  qa_report_key text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Add columns to purchases if they don't already exist (idempotent).
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name='purchases' and column_name='brief_id') then
    alter table purchases add column brief_id uuid references site_briefs(id);
  end if;
  if not exists (select 1 from information_schema.columns where table_name='purchases' and column_name='qa_status') then
    alter table purchases add column qa_status text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name='purchases' and column_name='qa_report_key') then
    alter table purchases add column qa_report_key text;
  end if;
end $$;

create index if not exists purchases_user_id_idx on purchases(user_id);
create index if not exists purchases_status_idx on purchases(status);
create index if not exists purchases_created_at_idx on purchases(created_at desc);

-- Site briefs: stores the analysis, spec, and input for each generated site.
create table if not exists site_briefs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(id),
  input jsonb,
  analysis jsonb,
  spec jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists site_briefs_user_id_idx on site_briefs(user_id);
create index if not exists site_briefs_created_at_idx on site_briefs(created_at desc);

-- Site image assets: tracks uploaded/stock/url images per brief and slot.
create table if not exists site_image_assets (
  id uuid primary key default gen_random_uuid(),
  brief_id uuid references site_briefs(id) on delete cascade,
  slot_id text not null,
  source text not null check (source in ('stock','upload','url','none')),
  storage_key text,
  credit jsonb,
  created_at timestamptz default now()
);

create index if not exists site_image_assets_brief_id_idx on site_image_assets(brief_id);

-- Projects: stores user project state.
create table if not exists projects (
  id text primary key,
  user_id text not null references users(id),
  name text not null default 'Untitled project',
  stage text not null default '',
  data jsonb not null default '{}',
  updated_at timestamptz default now()
);

create index if not exists projects_user_id_idx on projects(user_id);
create index if not exists projects_updated_at_idx on projects(updated_at desc);

-- Analysis usage tracking: one row per user per day.
create table if not exists analysis_usage (
  user_id text not null references users(id),
  day date not null,
  count int not null default 0,
  primary key (user_id, day)
);

create index if not exists analysis_usage_user_id_idx on analysis_usage(user_id, day);
