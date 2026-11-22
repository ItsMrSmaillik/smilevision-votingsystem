create table if not exists public.settings (
  id text primary key,
  title text not null default 'SMILEVISION',
  event_name text not null default 'Grand Final',
  phase text not null default 'jury',
  visible boolean not null default true,
  overlay_scene text not null default 'hidden',
  active_jury_id text,
  step_index integer not null default 0
);

create table if not exists public.countries (
  id text primary key,
  name text not null,
  code text not null,
  flag text not null default '🏳️',
  video_url text,
  audio_url text,
  jury integer not null default 0,
  televote integer not null default 0,
  revealed_jury integer not null default 0,
  revealed_televote integer not null default 0,
  order_index integer not null default 0
);

create table if not exists public.jury_votes (
  jury_country_id text not null references public.countries(id) on delete cascade,
  recipient_country_id text not null references public.countries(id) on delete cascade,
  points integer not null,
  primary key (jury_country_id, recipient_country_id),
  unique (jury_country_id, points)
);

alter table public.settings add column if not exists overlay_scene text not null default 'hidden';
alter table public.settings add column if not exists active_jury_id text;
alter table public.settings add column if not exists step_index integer not null default 0;
alter table public.countries add column if not exists video_url text;
alter table public.countries add column if not exists audio_url text;
alter table public.countries add column if not exists order_index integer not null default 0;

alter table public.settings enable row level security;
alter table public.countries enable row level security;
alter table public.jury_votes enable row level security;

grant usage on schema public to anon, authenticated;
grant select on public.settings to anon, authenticated;
grant select on public.countries to anon, authenticated;
grant select on public.jury_votes to anon, authenticated;
grant insert, update, delete on public.settings to authenticated;
grant insert, update, delete on public.countries to authenticated;
grant insert, update, delete on public.jury_votes to authenticated;

drop policy if exists "Public read settings" on public.settings;
create policy "Public read settings" on public.settings for select to anon, authenticated using (true);
drop policy if exists "Authenticated update settings" on public.settings;
create policy "Authenticated update settings" on public.settings for all to authenticated using (true) with check (true);

drop policy if exists "Public read countries" on public.countries;
create policy "Public read countries" on public.countries for select to anon, authenticated using (true);
drop policy if exists "Authenticated change countries" on public.countries;
create policy "Authenticated change countries" on public.countries for all to authenticated using (true) with check (true);

drop policy if exists "Public read jury votes" on public.jury_votes;
create policy "Public read jury votes" on public.jury_votes for select to anon, authenticated using (true);
drop policy if exists "Authenticated change jury votes" on public.jury_votes;
create policy "Authenticated change jury votes" on public.jury_votes for all to authenticated using (true) with check (true);

insert into public.settings (id, title, event_name, phase, visible, overlay_scene)
select 'main', 'SMILEVISION', 'Grand Final', 'jury', true, 'hidden'
where not exists (select 1 from public.settings where id = 'main');

insert into storage.buckets (id, name, public)
select 'spokespersons', 'spokespersons', true
where not exists (select 1 from storage.buckets where id = 'spokespersons');

drop policy if exists "Public spokesperson downloads" on storage.objects;
create policy "Public spokesperson downloads"
on storage.objects for select
using (bucket_id = 'spokespersons');

drop policy if exists "Authenticated spokesperson uploads" on storage.objects;
create policy "Authenticated spokesperson uploads"
on storage.objects for all
to authenticated
using (bucket_id = 'spokespersons')
with check (bucket_id = 'spokespersons');
