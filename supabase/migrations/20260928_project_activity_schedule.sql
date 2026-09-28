-- =========================================================
-- AMANAH: PROJECT ACTIVITY SCHEDULING
-- Migration: 20260928_project_activity_schedule.sql
--
-- Turns project activities into schedulable site tasks:
-- PLANNED -> IN PROGRESS -> DONE / NOT DONE / CANCELLED
-- Each task can have a planned time window and multiple
-- assigned equipment through project_activity_equipment.
-- =========================================================

BEGIN;

ALTER TABLE public.project_activities
  ADD COLUMN IF NOT EXISTS activity_status text NOT NULL DEFAULT 'PLANNED',
  ADD COLUMN IF NOT EXISTS scheduled_start timestamptz,
  ADD COLUMN IF NOT EXISTS scheduled_end timestamptz,
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS completion_remarks text;

-- Existing records were already entered as completed site history.
UPDATE public.project_activities
SET
  activity_status = 'DONE',
  completed_at = COALESCE(completed_at, created_at)
WHERE activity_status = 'PLANNED'
  AND scheduled_start IS NULL
  AND scheduled_end IS NULL;

CREATE INDEX IF NOT EXISTS idx_project_activities_schedule_date
  ON public.project_activities (activity_date);

CREATE INDEX IF NOT EXISTS idx_project_activities_status
  ON public.project_activities (activity_status);

CREATE INDEX IF NOT EXISTS idx_project_activities_scheduled_start
  ON public.project_activities (scheduled_start);

-- Keep future scheduling inserts/updates constrained to the
-- workflow used by the AMANAH project scheduling module.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'project_activities_activity_status_check'
  ) THEN
    ALTER TABLE public.project_activities
      ADD CONSTRAINT project_activities_activity_status_check
      CHECK (
        activity_status IN (
          'PLANNED',
          'IN PROGRESS',
          'DONE',
          'NOT DONE',
          'CANCELLED'
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'project_activities_priority_check'
  ) THEN
    ALTER TABLE public.project_activities
      ADD CONSTRAINT project_activities_priority_check
      CHECK (
        priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'project_activities_schedule_window_check'
  ) THEN
    ALTER TABLE public.project_activities
      ADD CONSTRAINT project_activities_schedule_window_check
      CHECK (
        scheduled_end IS NULL
        OR scheduled_start IS NULL
        OR scheduled_end >= scheduled_start
      );
  END IF;
END $$;

COMMENT ON COLUMN public.project_activities.activity_status
IS 'AMANAH workflow: PLANNED, IN PROGRESS, DONE, NOT DONE, CANCELLED';

COMMENT ON COLUMN public.project_activities.scheduled_start
IS 'Planned start date/time for the site activity.';

COMMENT ON COLUMN public.project_activities.scheduled_end
IS 'Planned end date/time for the site activity.';

COMMENT ON COLUMN public.project_activities.priority
IS 'Planning priority: LOW, NORMAL, HIGH, URGENT.';

COMMENT ON COLUMN public.project_activities.completed_at
IS 'Timestamp recorded when the activity is marked DONE.';

COMMENT ON COLUMN public.project_activities.completion_remarks
IS 'Engineer remarks entered when the activity status is updated.';

COMMIT;
