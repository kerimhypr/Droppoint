-- 002_supabase_rls_friends_profiles.sql
-- Supabase direct Data API için opsiyonel public schema (gateway-owned app schema'ye alternatif değil, ek).
-- architecture.md §8'e göre low-risk read modelleri için kullanılırsa RLS + explicit grant zorunlu.
-- Bu migration public schema'da friends/profiles gibi uygulama-özeli tabloları RLS ile açar.
-- Gateway yine yetkilendirme sınırıdır; bu tablolar sadece arkadaşlık/social graph için.

create extension if not exists pgcrypto;
create extension if not exists citext;

-- Profiles mirror app.users auth_user_id ile senkronize edilir (Supabase Auth hook)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username citext not null unique,
  display_name varchar(64) not null,
  avatar_url text,
  status varchar(16) not null default 'offline',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_len check (char_length(username::text) between 2 and 32)
);

create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references public.profiles(id) on delete cascade,
  to_user uuid not null references public.profiles(id) on delete cascade,
  status varchar(16) not null default 'pending' check (status in ('pending','accepted','rejected','blocked')),
  created_at timestamptz not null default now(),
  unique (from_user, to_user)
);
create index if not exists friend_requests_to_idx on public.friend_requests(to_user, status);
create index if not exists friend_requests_from_idx on public.friend_requests(from_user, status);

create table if not exists public.friends (
  user_id uuid not null references public.profiles(id) on delete cascade,
  friend_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id)
);
create index if not exists friends_friend_idx on public.friends(friend_id);

create table if not exists public.servers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  name varchar(100) not null,
  icon_url text,
  invite_code varchar(16) unique default substr(md5(random()::text),1,8),
  created_at timestamptz not null default now()
);

create table if not exists public.server_members (
  server_id uuid not null references public.servers(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (server_id, user_id)
);

create table if not exists public.server_channels (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers(id) on delete cascade,
  name varchar(100) not null,
  kind varchar(16) not null check (kind in ('text','voice','category')),
  parent_id uuid references public.server_channels(id) on delete set null,
  position int not null default 0,
  created_at timestamptz not null default now()
);

-- RLS enable
alter table public.profiles enable row level security;
alter table public.friend_requests enable row level security;
alter table public.friends enable row level security;
alter table public.servers enable row level security;
alter table public.server_members enable row level security;
alter table public.server_channels enable row level security;

-- Revoke default public grants, will add explicit policies
revoke all on table public.profiles from public, anon, authenticated;
revoke all on table public.friend_requests from public, anon, authenticated;
revoke all on table public.friends from public, anon, authenticated;
revoke all on table public.servers from public, anon, authenticated;
revoke all on table public.server_members from public, anon, authenticated;
revoke all on table public.server_channels from public, anon, authenticated;

-- Grants (policy will still enforce)
grant select on public.profiles to anon, authenticated;
grant all on public.profiles to authenticated;
grant all on public.friend_requests to authenticated;
grant all on public.friends to authenticated;
grant all on public.servers to authenticated;
grant all on public.server_members to authenticated;
grant all on public.server_channels to authenticated;

-- Policies

-- profiles: anyone can read, only self can update/insert via auth.uid()
drop policy if exists "profiles_read_all" on public.profiles;
create policy "profiles_read_all" on public.profiles for select using (true);

drop policy if exists "profiles_self_insert" on public.profiles;
create policy "profiles_self_insert" on public.profiles for insert with check (auth.uid() = id);

drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_self_update" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "profiles_self_delete" on public.profiles;
create policy "profiles_self_delete" on public.profiles for delete using (auth.uid() = id);

-- friend_requests: sender can insert if from_user = auth.uid(), receiver can select/update where to_user = auth.uid()
drop policy if exists "fr_select_own" on public.friend_requests;
create policy "fr_select_own" on public.friend_requests for select using (auth.uid() = from_user or auth.uid() = to_user);

drop policy if exists "fr_insert_self" on public.friend_requests;
create policy "fr_insert_self" on public.friend_requests for insert with check (auth.uid() = from_user and from_user <> to_user);

drop policy if exists "fr_update_receiver" on public.friend_requests;
create policy "fr_update_receiver" on public.friend_requests for update using (auth.uid() = to_user) with check (auth.uid() = to_user);

drop policy if exists "fr_delete_own" on public.friend_requests;
create policy "fr_delete_own" on public.friend_requests for delete using (auth.uid() = from_user or auth.uid() = to_user);

-- friends: only participants can see row; insertion via trigger after friend_requests accepted (or via RPC)
drop policy if exists "friends_select_own" on public.friends;
create policy "friends_select_own" on public.friends for select using (auth.uid() = user_id or auth.uid() = friend_id);

drop policy if exists "friends_mutate_own" on public.friends;
create policy "friends_mutate_own" on public.friends for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- servers: owner or member can select; any authenticated can insert (owner = self), owner can update/delete
drop policy if exists "servers_select_member_or_owner" on public.servers;
create policy "servers_select_member_or_owner" on public.servers for select using (
  auth.uid() = owner_id or exists (select 1 from public.server_members sm where sm.server_id = id and sm.user_id = auth.uid())
);

drop policy if exists "servers_insert_owner_self" on public.servers;
create policy "servers_insert_owner_self" on public.servers for insert with check (auth.uid() = owner_id);

drop policy if exists "servers_update_owner" on public.servers;
create policy "servers_update_owner" on public.servers for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "servers_delete_owner" on public.servers;
create policy "servers_delete_owner" on public.servers for delete using (auth.uid() = owner_id);

-- server_members: member or server owner can select; self join/leave; owner can insert/remove member (invite)
drop policy if exists "sm_select_own_server" on public.server_members;
create policy "sm_select_own_server" on public.server_members for select using (
  auth.uid() = user_id or exists (select 1 from public.servers s where s.id = server_id and s.owner_id = auth.uid())
);

drop policy if exists "sm_insert_self_or_owner" on public.server_members;
create policy "sm_insert_self_or_owner" on public.server_members for insert with check (
  auth.uid() = user_id or exists (select 1 from public.servers s where s.id = server_id and s.owner_id = auth.uid())
);

drop policy if exists "sm_delete_self_or_owner" on public.server_members;
create policy "sm_delete_self_or_owner" on public.server_members for delete using (
  auth.uid() = user_id or exists (select 1 from public.servers s where s.id = server_id and s.owner_id = auth.uid())
);

-- server_channels: member of server can select; owner can mutate
drop policy if exists "sc_select_member" on public.server_channels;
create policy "sc_select_member" on public.server_channels for select using (
  exists (select 1 from public.server_members sm where sm.server_id = server_id and sm.user_id = auth.uid())
  or exists (select 1 from public.servers s where s.id = server_id and s.owner_id = auth.uid())
);

drop policy if exists "sc_mutate_owner" on public.server_channels;
create policy "sc_mutate_owner" on public.server_channels for all using (
  exists (select 1 from public.servers s where s.id = server_id and s.owner_id = auth.uid())
) with check (
  exists (select 1 from public.servers s where s.id = server_id and s.owner_id = auth.uid())
);

-- Helper: auto-friend on accept
create or replace function public.accept_friend_request(req_id uuid)
returns void language plpgsql security definer as $$
declare r public.friend_requests%rowtype;
begin
  select * into r from public.friend_requests where id = req_id and to_user = auth.uid() and status='pending';
  if not found then raise exception 'request not found or not pending'; end if;
  update public.friend_requests set status='accepted' where id=req_id;
  insert into public.friends(user_id, friend_id) values (r.from_user, r.to_user) on conflict do nothing;
  insert into public.friends(user_id, friend_id) values (r.to_user, r.from_user) on conflict do nothing;
end; $$;

-- Supabase Realtime enable (for direct Data API fallback)
-- alter publication supabase_realtime add table public.server_channels; -- requires replica identity full if needed
