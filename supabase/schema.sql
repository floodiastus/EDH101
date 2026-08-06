-- Run this once in the Supabase SQL editor.
-- Anonymous Auth must also be enabled in Authentication > Providers.

create table if not exists public.commander_votes (
  voter_id uuid not null references auth.users(id) on delete cascade,
  card_id text not null,
  reaction text not null check (reaction in ('pass', 'intrigue', 'love')),
  updated_at timestamptz not null default now(),
  primary key (voter_id, card_id)
);

alter table public.commander_votes enable row level security;
revoke all on table public.commander_votes from anon, authenticated;

create or replace function public.cast_commander_vote(
  p_card_id text,
  p_reaction text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_reaction not in ('pass', 'intrigue', 'love') then
    raise exception 'Invalid reaction';
  end if;

  insert into public.commander_votes (voter_id, card_id, reaction, updated_at)
  values (auth.uid(), p_card_id, p_reaction, now())
  on conflict (voter_id, card_id)
  do update set reaction = excluded.reaction, updated_at = excluded.updated_at;
end;
$$;

create or replace function public.get_community_shitlist()
returns table (
  card_id text,
  total_votes bigint,
  rejects bigint,
  rejection_rate numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    votes.card_id,
    count(*)::bigint as total_votes,
    count(*) filter (where votes.reaction = 'pass')::bigint as rejects,
    round(
      100 * count(*) filter (where votes.reaction = 'pass')::numeric
      / nullif(count(*), 0),
      1
    ) as rejection_rate
  from public.commander_votes as votes
  group by votes.card_id
  having count(*) >= 25
    and count(*) filter (where votes.reaction = 'pass')::numeric / count(*) >= .70
  order by rejection_rate desc, total_votes desc;
$$;

revoke all on function public.cast_commander_vote(text, text) from public;
revoke all on function public.get_community_shitlist() from public;
grant execute on function public.cast_commander_vote(text, text) to authenticated;
grant execute on function public.get_community_shitlist() to anon, authenticated;
