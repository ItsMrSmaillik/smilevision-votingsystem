create table if not exists public.settings (
  id text primary key,
  title text not null default 'SMILEVISION',
  event_name text not null default 'Grand Final',
  phase text not null default 'jury' check (phase in ('jury', 'televote')),
  visible boolean not null default true,
  last_award jsonb
);

create table if not exists public.countries (
  id text primary key,
  name text not null,
  code text not null,
  flag text not null default '🏳️',
  jury integer not null default 0,
  televote integer not null default 0,
  revealed_jury integer not null default 0,
  revealed_televote integer not null default 0
);

alter table public.settings enable row level security;
alter table public.countries enable row level security;

drop policy if exists "Public read settings" on public.settings;
create policy "Public read settings" on public.settings for select using (true);
drop policy if exists "Public update settings" on public.settings;
create policy "Public update settings" on public.settings for all using (true) with check (true);

drop policy if exists "Public read countries" on public.countries;
create policy "Public read countries" on public.countries for select using (true);
drop policy if exists "Public change countries" on public.countries;
create policy "Public change countries" on public.countries for all using (true) with check (true);

insert into public.settings (id, title, event_name, phase, visible, last_award)
values ('main', 'SMILEVISION', 'Grand Final', 'jury', true, null)
on conflict (id) do nothing;

insert into public.countries (id, name, code, flag)
values
  ('smile', 'SmileLand', 'SM', '🌞'),
  ('sweden', 'Sweden', 'SE', '🇸🇪'),
  ('ukraine', 'Ukraine', 'UA', '🇺🇦')
on conflict (id) do nothing;

do $$
begin
  begin
    alter publication supabase_realtime add table public.settings;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.countries;
  exception when duplicate_object then null;
  end;
end $$;
