-- PostgreSQL 15+ reference schema.
-- The Gateway is the authorization boundary. The app schema is deliberately
-- not exposed to Supabase's browser Data API; clients use the Gateway only.

create extension if not exists pgcrypto;
create extension if not exists citext;
create schema if not exists app;

create type app.channel_kind as enum ('category', 'text', 'voice');
create type app.message_status as enum ('active', 'deleted');

create table app.users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  username citext not null unique,
  display_name varchar(64) not null,
  avatar_url text,
  created_at timestamptz(3) not null default now(),
  updated_at timestamptz(3) not null default now(),
  deleted_at timestamptz(3),
  constraint users_username_length check (char_length(username::text) between 2 and 32),
  constraint users_display_name_length check (char_length(display_name) between 1 and 64)
);

create table app.guilds (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references app.users(id) on delete restrict,
  name varchar(100) not null,
  icon_url text,
  created_at timestamptz(3) not null default now(),
  updated_at timestamptz(3) not null default now(),
  deleted_at timestamptz(3),
  constraint guilds_name_length check (char_length(name) between 1 and 100)
);

create table app.roles (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references app.guilds(id) on delete cascade,
  name varchar(100) not null,
  position integer not null default 0,
  permissions bigint not null default 0,
  is_default boolean not null default false,
  managed boolean not null default false,
  created_at timestamptz(3) not null default now(),
  constraint roles_position_nonnegative check (position >= 0),
  constraint roles_permissions_nonnegative check (permissions >= 0),
  constraint roles_name_length check (char_length(name) between 1 and 100),
  unique (guild_id, name),
  unique (guild_id, id)
);

create unique index roles_one_default_per_guild
  on app.roles(guild_id) where is_default;
create index roles_guild_position_idx on app.roles(guild_id, position desc);

create table app.guild_members (
  guild_id uuid not null references app.guilds(id) on delete cascade,
  user_id uuid not null references app.users(id) on delete cascade,
  nickname varchar(32),
  joined_at timestamptz(3) not null default now(),
  timeout_until timestamptz(3),
  primary key (guild_id, user_id),
  constraint member_nickname_length check (nickname is null or char_length(nickname) between 1 and 32)
);
create index guild_members_user_idx on app.guild_members(user_id, guild_id);

create table app.member_roles (
  guild_id uuid not null,
  user_id uuid not null,
  role_id uuid not null references app.roles(id) on delete cascade,
  primary key (guild_id, user_id, role_id),
  foreign key (guild_id, user_id) references app.guild_members(guild_id, user_id) on delete cascade,
  foreign key (guild_id, role_id) references app.roles(guild_id, id) on delete cascade
);
create index member_roles_lookup_idx on app.member_roles(guild_id, user_id);

create table app.channels (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references app.guilds(id) on delete cascade,
  parent_id uuid references app.channels(id) on delete set null,
  kind app.channel_kind not null,
  name varchar(100) not null,
  topic varchar(1024),
  position integer not null default 0,
  bitrate integer,
  user_limit integer,
  created_at timestamptz(3) not null default now(),
  updated_at timestamptz(3) not null default now(),
  deleted_at timestamptz(3),
  constraint channels_name_length check (char_length(name) between 1 and 100),
  constraint voice_bitrate_valid check (bitrate is null or bitrate between 8000 and 384000),
  constraint voice_limit_valid check (user_limit is null or user_limit between 0 and 99),
  unique (guild_id, id)
);
create index channels_guild_position_idx on app.channels(guild_id, position, id);
create index channels_parent_idx on app.channels(parent_id, position);

create table app.channel_permission_overwrites (
  id bigint generated always as identity primary key,
  guild_id uuid not null references app.guilds(id) on delete cascade,
  channel_id uuid not null references app.channels(id) on delete cascade,
  role_id uuid references app.roles(id) on delete cascade,
  user_id uuid references app.users(id) on delete cascade,
  allow_bits bigint not null default 0,
  deny_bits bigint not null default 0,
  constraint overwrite_one_target check ((role_id is null) <> (user_id is null)),
  constraint overwrite_allow_nonnegative check (allow_bits >= 0),
  constraint overwrite_deny_nonnegative check (deny_bits >= 0),
  unique nulls not distinct (channel_id, role_id, user_id),
  foreign key (guild_id, channel_id) references app.channels(guild_id, id) on delete cascade,
  foreign key (guild_id, role_id) references app.roles(guild_id, id) on delete cascade,
  foreign key (guild_id, user_id) references app.guild_members(guild_id, user_id) on delete cascade
);
create index channel_overwrites_channel_idx on app.channel_permission_overwrites(channel_id);

create table app.messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references app.channels(id) on delete cascade,
  author_id uuid not null references app.users(id) on delete restrict,
  reply_to_id uuid references app.messages(id) on delete set null,
  client_nonce uuid not null,
  content varchar(4000) not null,
  status app.message_status not null default 'active',
  version bigint not null default 1,
  created_at timestamptz(3) not null default now(),
  edited_at timestamptz(3),
  deleted_at timestamptz(3),
  constraint messages_content_length check (char_length(content) between 1 and 4000),
  constraint messages_version_positive check (version > 0)
);
create unique index messages_idempotency_idx
  on app.messages(channel_id, author_id, client_nonce);
create index messages_channel_cursor_idx
  on app.messages(channel_id, created_at desc, id desc)
  where status = 'active';
create index messages_author_idx on app.messages(author_id, created_at desc);

create table app.message_reactions (
  message_id uuid not null references app.messages(id) on delete cascade,
  user_id uuid not null references app.users(id) on delete cascade,
  emoji varchar(64) not null,
  created_at timestamptz(3) not null default now(),
  primary key (message_id, user_id, emoji),
  constraint reaction_emoji_length check (char_length(emoji) between 1 and 64)
);
create index message_reactions_message_idx on app.message_reactions(message_id, emoji);

create table app.audit_log (
  id bigint generated always as identity primary key,
  guild_id uuid references app.guilds(id) on delete set null,
  actor_id uuid references app.users(id) on delete set null,
  action varchar(64) not null,
  target_type varchar(32) not null,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz(3) not null default now()
);
create index audit_guild_time_idx on app.audit_log(guild_id, created_at desc);

-- Keep updated_at deterministic; all writes still go through domain services.
create or replace function app.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = clock_timestamp();
  return new;
end;
$$;

create trigger users_updated_at before update on app.users
  for each row execute function app.set_updated_at();
create trigger guilds_updated_at before update on app.guilds
  for each row execute function app.set_updated_at();
create trigger channels_updated_at before update on app.channels
  for each row execute function app.set_updated_at();

create or replace function app.seed_guild_defaults() returns trigger
language plpgsql as $$
begin
  insert into app.roles (guild_id, name, position, permissions, is_default)
    values (new.id, '@everyone', 0, 0, true);
  insert into app.guild_members (guild_id, user_id)
    values (new.id, new.owner_id);
  return new;
end;
$$;

create trigger guild_defaults after insert on app.guilds
  for each row execute function app.seed_guild_defaults();

-- Defense in depth for Supabase: do not expose this server-owned schema to
-- anon/authenticated browser roles. A dedicated Gateway DB role gets access
-- during deployment; never ship a service-role key to the browser.
revoke all on schema app from public;
revoke all on all tables in schema app from public;
alter default privileges in schema app revoke all on tables from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on schema app from anon';
    execute 'revoke all on all tables in schema app from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on schema app from authenticated';
    execute 'revoke all on all tables in schema app from authenticated';
  end if;
end $$;

alter table app.users enable row level security;
alter table app.guilds enable row level security;
alter table app.roles enable row level security;
alter table app.guild_members enable row level security;
alter table app.member_roles enable row level security;
alter table app.channels enable row level security;
alter table app.channel_permission_overwrites enable row level security;
alter table app.messages enable row level security;
alter table app.message_reactions enable row level security;
alter table app.audit_log enable row level security;

comment on schema app is 'Private application schema; browser access is through the WebSocket/HTTP gateway.';
