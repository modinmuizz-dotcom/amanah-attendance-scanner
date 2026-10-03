import { supabase } from '../lib/supabase';

export type Equipment = {
  equipment_id: string;
  equipment_name: string;
  equipment_type: string | null;
  meter_type: string | null;
  status: string;
};

export type ApprovedActivity = {
  activity_id: string;
  project_id: string;
  project_name: string;
  activity_date: string;
  activity: string;
  activity_item: string | null;
  activity_quantity: number | null;
  description: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  priority: string;
  activity_status: string;
  approval_status: string;
  equipment_id: string;
  equipment_name: string;
};

function localDay(days: number) {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, 0, 0, 0, 0);
}

export async function fetchActiveEquipment(): Promise<Equipment[]> {
  const { data, error } = await supabase
    .from('equipment')
    .select('equipment_id, equipment_name, equipment_type, meter_type, status')
    .eq('status', 'ACTIVE')
    .order('equipment_name');

  if (error) throw error;
  return (data ?? []) as Equipment[];
}

export async function fetchApprovedActivities(
  equipmentId?: string | null
): Promise<ApprovedActivity[]> {
  let assignmentsQuery = supabase
    .from('project_activity_equipment')
    .select('activity_id, equipment_id');

  if (equipmentId) assignmentsQuery = assignmentsQuery.eq('equipment_id', equipmentId);

  const { data: assignments, error: assignmentError } = await assignmentsQuery;
  if (assignmentError) throw assignmentError;

  const ids = [...new Set((assignments ?? []).map((r: any) => r.activity_id))];
  if (!ids.length) return [];

  const { data: activities, error } = await supabase
    .from('project_activities')
    .select('activity_id, project_id, project_name, activity_date, activity, activity_item, activity_quantity, description, scheduled_start, scheduled_end, priority, activity_status, approval_status')
    .in('activity_id', ids)
    .eq('approval_status', 'APPROVED')
    .not('activity_status', 'in', '(CANCELLED,REJECTED,DONE)')
    .gte('scheduled_start', localDay(0).toISOString())
    .lt('scheduled_start', localDay(7).toISOString())
    .order('scheduled_start', { ascending: true });

  if (error) throw error;

  const equipmentIds = [...new Set((assignments ?? []).map((r: any) => r.equipment_id))];
  const { data: equipment, error: equipmentError } = await supabase
    .from('equipment')
    .select('equipment_id, equipment_name')
    .in('equipment_id', equipmentIds);

  if (equipmentError) throw equipmentError;

  const names = new Map((equipment ?? []).map((e: any) => [e.equipment_id, e.equipment_name]));
  const assignmentMap = new Map<string, any>();
  for (const row of assignments ?? []) {
    assignmentMap.set(row.activity_id, row);
  }

  return (activities ?? []).map((a: any) => {
    const assignment = assignmentMap.get(a.activity_id);
    return {
      ...a,
      equipment_id: assignment.equipment_id,
      equipment_name: names.get(assignment.equipment_id) ?? 'Equipment',
    };
  });
}
