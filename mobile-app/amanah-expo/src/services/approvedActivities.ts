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
  actual_quantity: number;
  remaining_quantity: number;
  description: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  priority: string;
  activity_status: string;
  approval_status: string;
  equipment_id: string;
  equipment_name: string;
  assigned_equipment_count: number;
  claimed_equipment_count: number;
  eligible_equipment_count: number;
  is_carryover: boolean;
  carryover_from_date: string | null;
  selection_available: boolean;
  selection_reason: string | null;
}

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
  if (equipmentId) {
    const { data, error } = await supabase.rpc('get_mobile_approved_work', {
      p_equipment_id: equipmentId,
    });

    if (error) throw error;
    return (data ?? []) as ApprovedActivity[];
  }

  const { data: equipment, error: equipmentError } = await supabase
    .from('equipment')
    .select('equipment_id')
    .eq('status', 'ACTIVE')
    .order('equipment_id');

  if (equipmentError) throw equipmentError;

  const responses = await Promise.all(
    (equipment ?? []).map(async (row: any) => {
      const { data, error } = await supabase.rpc('get_mobile_approved_work', {
        p_equipment_id: row.equipment_id,
      });
      if (error) throw error;
      return (data ?? []) as ApprovedActivity[];
    }),
  );

  const byActivity = new Map<string, ApprovedActivity>();

  for (const item of responses.flat()) {
    const existing = byActivity.get(item.activity_id);
    if (!existing) {
      byActivity.set(item.activity_id, { ...item });
      continue;
    }

    const equipmentNames = new Set(
      existing.equipment_name
        .split(' • ')
        .concat(item.equipment_name.split(' • '))
        .filter(Boolean),
    );

    existing.equipment_name = Array.from(equipmentNames).join(' • ');
    existing.assigned_equipment_count = Math.max(
      existing.assigned_equipment_count,
      item.assigned_equipment_count,
    );
    existing.actual_quantity = Math.max(existing.actual_quantity, item.actual_quantity);
    existing.remaining_quantity = Math.min(existing.remaining_quantity, item.remaining_quantity);
    existing.selection_available =
      existing.selection_available || item.selection_available;
  }

  return Array.from(byActivity.values()).sort((a, b) => {
    if (a.is_carryover !== b.is_carryover) return a.is_carryover ? -1 : 1;
    return new Date(a.scheduled_start ?? a.activity_date).getTime()
      - new Date(b.scheduled_start ?? b.activity_date).getTime();
  });
}
