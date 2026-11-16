-- Run once in Supabase SQL Editor. NEXORA uses a server-only backend-for-frontend.
-- Browser database access is denied: the Express API enforces all user permissions.
begin;
create table public.profiles (
 id uuid primary key, username text not null unique check (username ~ '^[a-z0-9_]{3,31}$'),
 display_name text not null check (length(display_name)<=100), bio text not null default '',
 color text not null default 'violet', status text not null default 'online' check(status in ('online','idle','dnd','offline')),
 avatar_url text not null default '', activity text not null default '', allow_dms boolean not null default true,
 created_at timestamptz not null default now()
);
create table public.communities (
 id uuid primary key, name text not null, description text not null default '', icon text not null default 'sparkles',
 color text not null default 'violet', category text not null default 'Community', owner_id uuid not null references profiles(id),
 is_public boolean not null default true, created_at timestamptz not null default now()
);
create table public.roles (id uuid primary key,community_id uuid not null references communities(id) on delete cascade,name text not null,permissions jsonb not null default '[]');
create table public.members (id uuid primary key,community_id uuid not null references communities(id) on delete cascade,user_id uuid not null references profiles(id) on delete cascade,role_id uuid references roles(id) on delete set null,joined_at timestamptz not null default now(),unique(community_id,user_id));
create table public.channels (id uuid primary key,community_id uuid not null references communities(id) on delete cascade,name text not null,kind text not null check(kind in ('text','voice','announcement')),description text not null default '',created_at timestamptz not null default now());
create table public.conversations (id uuid primary key,name text not null,created_at timestamptz not null default now());
create table public.conversation_members (id uuid primary key,conversation_id uuid not null references conversations(id) on delete cascade,user_id uuid not null references profiles(id) on delete cascade,unique(conversation_id,user_id));
-- room_id identifies either a channel or a private conversation; API validates membership.
create table public.attachments (id uuid primary key,room_id uuid not null,user_id uuid not null references profiles(id),name text not null,mime text not null,size integer not null check(size between 1 and 10485760),storage_key text not null unique,created_at timestamptz not null default now());
create table public.messages (id uuid primary key,room_id uuid not null,user_id uuid not null references profiles(id),content text not null check(length(content)<=4000),reply_to uuid references messages(id) on delete set null,attachment_id uuid references attachments(id),created_at timestamptz not null default now(),edited_at timestamptz,deleted boolean not null default false);
create table public.reactions (id uuid primary key,message_id uuid not null references messages(id) on delete cascade,user_id uuid not null references profiles(id),emoji text not null,unique(message_id,user_id,emoji));
create table public.friendships (id uuid primary key,sender_id uuid not null references profiles(id),receiver_id uuid not null references profiles(id),status text not null check(status in ('pending','accepted')),created_at timestamptz not null default now(),check(sender_id<>receiver_id));
create unique index friendships_pair on friendships(least(sender_id,receiver_id),greatest(sender_id,receiver_id));
create table public.blocks (id uuid primary key,user_id uuid not null references profiles(id),target_id uuid not null references profiles(id),unique(user_id,target_id),check(user_id<>target_id));
create table public.invites (id text primary key,community_id uuid not null references communities(id) on delete cascade,creator_id uuid not null references profiles(id),expires_at timestamptz not null);
create table public.reports (id uuid primary key,reporter_id uuid not null references profiles(id),message_id uuid not null references messages(id),reason text not null,status text not null default 'open',created_at timestamptz not null default now());
create table public.reads (id uuid primary key,user_id uuid not null references profiles(id),room_id uuid not null,read_at timestamptz not null,unique(user_id,room_id));
create table public.notifications (id uuid primary key,user_id uuid not null references profiles(id),text text not null,read boolean not null default false,created_at timestamptz not null default now());
create table public.sessions (id text primary key,user_id uuid not null references profiles(id) on delete cascade,expires_at timestamptz not null);
create table public.bans (id uuid primary key,community_id uuid not null references communities(id) on delete cascade,user_id uuid not null references profiles(id),created_at timestamptz not null default now(),unique(community_id,user_id));
create index messages_room_history on messages(room_id,created_at desc);
create index members_user on members(user_id);
create index conversation_user on conversation_members(user_id);
create index notifications_user on notifications(user_id,created_at desc);
create index sessions_expiration on sessions(expires_at);
create index blocks_target on blocks(target_id);
do $$ declare t text; begin
 foreach t in array array['profiles','communities','roles','members','channels','conversations','conversation_members','attachments','messages','reactions','friendships','blocks','invites','reports','reads','notifications','sessions','bans'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon, authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
-- No anon/authenticated RLS policies: access is deliberately denied.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('attachments','attachments',false,10485760,array['image/png','image/jpeg','image/webp','image/gif','video/mp4','video/webm','audio/mpeg','audio/ogg','application/pdf','text/plain','application/zip'])
on conflict(id) do update set public=false,file_size_limit=10485760,allowed_mime_types=excluded.allowed_mime_types;
commit;
