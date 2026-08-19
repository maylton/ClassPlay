-- The UNIQUE(username_key) constraint already creates a covering unique index.
-- Keep only that index and add the missing owner lookup used by teacher Community management.

drop index if exists public.student_profiles_username_idx;
create index if not exists community_listings_owner_idx on public.community_listings(owner_id);
