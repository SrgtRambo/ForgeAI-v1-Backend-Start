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
  published_url text,
  published_at timestamptz,
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
  if not exists (select 1 from information_schema.columns where table_name='purchases' and column_name='published_url') then
    alter table purchases add column published_url text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name='purchases' and column_name='published_at') then
    alter table purchases add column published_at timestamptz;
  end if;
end $$;

create index if not exists purchases_user_id_idx on purchases(user_id);
alter table purchases add column if not exists organization_id text;
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
alter table projects add column if not exists is_favorite boolean not null default false;
alter table projects add column if not exists is_archived boolean not null default false;
-- Organization support for multi-tenant isolation (future)
alter table projects add column if not exists organization_id text;
create index if not exists projects_updated_at_idx on projects(updated_at desc);

-- Analysis usage tracking: one row per user per day.
create table if not exists analysis_usage (
  user_id text not null references users(id),
  day date not null,
  count int not null default 0,
  primary key (user_id, day)
);

create index if not exists analysis_usage_user_id_idx on analysis_usage(user_id, day);

-- Project versions: stores snapshots for revision history.
create table if not exists project_versions (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references projects(id) on delete cascade,
  version_number int not null,
  name text,
  stage text,
  data jsonb not null default '{}',
  created_at timestamptz default now(),
  unique (project_id, version_number)
);

create index if not exists project_versions_project_id_idx on project_versions(project_id);
create index if not exists project_versions_created_at_idx on project_versions(created_at desc);

-- Add sharing columns to projects if they don't exist.
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name='projects' and column_name='share_token') then
    alter table projects add column share_token text unique;
  end if;
  if not exists (select 1 from information_schema.columns where table_name='projects' and column_name='visibility') then
    alter table projects add column visibility text not null default 'private' check (visibility in ('private','public','unlisted'));
  end if;
  if not exists (select 1 from information_schema.columns where table_name='projects' and column_name='type') then
    alter table projects add column type text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name='projects' and column_name='version') then
    alter table projects add column version int not null default 1;
  end if;
  if not exists (select 1 from information_schema.columns where table_name='projects' and column_name='created_at') then
    alter table projects add column created_at timestamptz default now();
  end if;
end $$;

-- Audit log: tracks important user actions.
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id text references users(id),
  action text not null,
  resource_type text,
  resource_id text,
  details jsonb,
  ip_address text,
  created_at timestamptz default now()
);

create index if not exists audit_log_user_id_idx on audit_log(user_id);
create index if not exists audit_log_created_at_idx on audit_log(created_at desc);

-- Project comments for collaboration.
create table if not exists project_comments (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references projects(id) on delete cascade,
  user_id text not null references users(id),
  content text not null,
  created_at timestamptz default now()
);

create index if not exists project_comments_project_id_idx on project_comments(project_id);

-- Notifications for user activity.
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(id),
  title text not null,
  message text,
  type text not null default 'info' check (type in ('info','success','warning','error')),
  read boolean not null default false,
  resource_type text,
  resource_id text,
  created_at timestamptz default now()
);

create index if not exists notifications_user_id_idx on notifications(user_id);
create index if not exists notifications_read_idx on notifications(read);

-- User feedback.
create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  user_id text references users(id),
  type text not null default 'general' check (type in ('general','bug','feature','praise')),
  content text not null,
  page text,
  created_at timestamptz default now()
);

create index if not exists feedback_user_id_idx on feedback(user_id);
create index if not exists feedback_created_at_idx on feedback(created_at desc);
