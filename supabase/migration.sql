create table if not exists public.settings (
  id text primary key,
  title text not null default 'SMILEVISION',
  event_name text not null default 'Grand Final',
  phase text not null default 'jury',
  visible boolean not null default true,
  last_award jsonb,
  spokesperson jsonb
);

create table if not exists public.countries (
  id text primary key,
  name text not null,
  code text not null,
  flag text not null default '🏳️',
  video_url text,
  jury integer not null default 0,
  televote integer not null default 0,
  revealed_jury integer not null default 0,
  revealed_televote integer not null default 0
);

alter table public.settings add column if not exists last_award jsonb;
alter table public.settings add column if not exists spokesperson jsonb;
alter table public.countries add column if not exists video_url text;

alter table public.settings enable row level security;
alter table public.countries enable row level security;

drop policy if exists "Public read settings" on public.settings;
create policy "Public read settings" on public.settings for select using (true);
drop policy if exists "Public update settings" on public.settings;
create policy "Authenticated update settings"
on public.settings for all
to authenticated
using (true)
with check (true);

drop policy if exists "Public read countries" on public.countries;
create policy "Public read countries" on public.countries for select using (true);
drop policy if exists "Public change countries" on public.countries;
create policy "Authenticated change countries"
on public.countries for all
to authenticated
using (true)
with check (true);

insert into public.settings (id, title, event_name, phase, visible)
select 'main', 'SMILEVISION', 'Grand Final', 'jury', true
where not exists (select 1 from public.settings where id = 'main');

insert into public.countries (id, name, code, flag)
select 'smile', 'SmileLand', 'SM', '🌞'
where not exists (select 1 from public.countries where id = 'smile');

insert into public.countries (id, name, code, flag)
select 'sweden', 'Sweden', 'SE', '🇸🇪'
where not exists (select 1 from public.countries where id = 'sweden');

insert into public.countries (id, name, code, flag)
select 'ukraine', 'Ukraine', 'UA', '🇺🇦'
where not exists (select 1 from public.countries where id = 'ukraine');

insert into storage.buckets (id, name, public)
select 'spokespersons', 'spokespersons', true
where not exists (
  select 1 from storage.buckets where id = 'spokespersons'
);

drop policy if exists "Public spokesperson downloads" on storage.objects;
create policy "Public spokesperson downloads"
on storage.objects for select
using (bucket_id = 'spokespersons');

drop policy if exists "Public spokesperson uploads" on storage.objects;
create policy "Authenticated spokesperson uploads"
on storage.objects for all
to authenticated
using (bucket_id = 'spokespersons')
with check (bucket_id = 'spokespersons');

grant usage on schema public to anon, authenticated;
grant select on public.settings to anon, authenticated;
grant select on public.countries to anon, authenticated;
grant insert, update, delete on public.settings to authenticated;
grant insert, update, delete on public.countries to authenticated;
