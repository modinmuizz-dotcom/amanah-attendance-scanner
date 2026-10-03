import { supabase } from '../lib/supabase';

export type EmployeeProfile = {
  employee_id: string;
  employee_name: string;
  position: string | null;
  department: string | null;
  status: string;
  contact_number: string | null;
  daily_rate: number | null;
  rate_basis: string | null;
};

export async function fetchMyEmployeeProfile(): Promise<EmployeeProfile> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!user) throw new Error('No signed-in user was found.');

  const { data: link, error: linkError } = await supabase
    .from('employee_auth_accounts')
    .select('employee_id, mobile_access_enabled')
    .eq('auth_user_id', user.id)
    .eq('mobile_access_enabled', true)
    .maybeSingle();

  if (linkError) throw linkError;
  if (!link) throw new Error('This account is not linked to an active AMANAH mobile employee profile.');

  const { data: employee, error: employeeError } = await supabase
    .from('employees')
    .select('employee_id, employee_name, position, department, status, contact_number, daily_rate, rate_basis')
    .eq('employee_id', link.employee_id)
    .eq('status', 'ACTIVE')
    .single();

  if (employeeError) throw employeeError;
  return employee as EmployeeProfile;
}
