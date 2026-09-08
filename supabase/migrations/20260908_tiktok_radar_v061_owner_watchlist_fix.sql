-- Ensure monitoring/watchlist internals are not visible to managers.
drop policy if exists tiktok_watchlist_manage on public.tiktok_watchlist;
