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
  if (!equipmentId) return [];

  const { data, error } = await supabase.rpc('get_mobile_approved_work', {
    p_equipment_id: equipmentId,
  });

  if (error) throw error;
  return (data ?? []) as ApprovedActivity[];
}
