alter table public.applications
  add column if not exists contacted_comment text,
  add column if not exists interview_at timestamptz;

alter table public.applications
  drop constraint if exists applications_status_check;

alter table public.applications
  add constraint applications_status_check check (
    status in (
      'PREPARING', 'READY', 'SUBMITTED', 'CONTACTED',
      'INTERVIEW', 'OFFER', 'REJECTED', 'WITHDRAWN'
    )
  );

create index if not exists applications_user_interview_at_idx
  on public.applications (user_id, interview_at)
  where interview_at is not null;
