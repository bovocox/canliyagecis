-- Özeti olmayan videoları ve takipçilerini getiren fonksiyon
create or replace function get_videos_without_summary(limit_count integer)
returns table (
  video_id text,
  channel_id text,
  user_id text
) as $$
begin
  return query
  select 
    cv.video_id,
    cv.channel_id,
    uc.user_id
  from channel_videos cv
  left join channels c on c.id = cv.channel_id
  left join user_channels uc on uc.channel_id = c.id
  where cv.has_summary = false
  order by cv.created_at desc
  limit limit_count;
end;
$$ language plpgsql; 