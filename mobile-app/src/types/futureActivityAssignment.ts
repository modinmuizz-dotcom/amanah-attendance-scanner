/**
 * Design placeholder only.
 *
 * Employee activity assignment is intentionally NOT implemented yet.
 */

export type FutureActivityAssignment = {
  activityId: string;
  employeeId: string;
  assignedAt: string;
  assignedBy: string | null;
  status: 'ASSIGNED' | 'IN PROGRESS' | 'COMPLETED' | 'CANCELLED';
};
