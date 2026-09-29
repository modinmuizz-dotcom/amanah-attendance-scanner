-- AMANAH Activity Schedule DELETE support
-- Deleting a project activity must remove its linked equipment schedule rows.

DROP POLICY IF EXISTS "project_activities_authenticated_delete" ON public.project_activities;

CREATE POLICY "project_activities_authenticated_delete"
ON public.project_activities
FOR DELETE
TO authenticated
USING (true);

-- The existing foreign key from project_activity_equipment.activity_id
-- to project_activities.activity_id uses ON DELETE CASCADE.
-- Therefore deleting the activity automatically removes its equipment assignments.
