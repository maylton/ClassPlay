alter table public.activity_sets
  add column if not exists ai_generated boolean not null default false;

create or replace view public.community_catalog
with (security_invoker = true)
as
select
  l.activity_set_id,
  l.author_name,
  l.published_at,
  a.title,
  a.description,
  a.subject,
  a.topic,
  a.cefr_level,
  a.grade,
  a.kind,
  (
    select i.image_url
    from public.activity_items i
    where i.activity_set_id = a.id
      and i.image_url is not null
    order by i.sort_order
    limit 1
  ) as cover_image_url,
  (
    select count(*)::integer
    from public.activity_items i
    where i.activity_set_id = a.id
  ) as item_count,
  array(
    select g.game_type
    from public.activity_games g
    where g.activity_set_id = a.id
    order by g.game_type
  ) as game_modes,
  a.ai_generated
from public.community_listings l
join public.activity_sets a on a.id = l.activity_set_id
where a.visibility = 'unlisted';
