export interface Attendance {
  id: string;
  employee: string;
  employee_details?: {
    id: string;
    fullname: string;
    position: string;
    employee_id?: string;
  };
  date: string;
  check_in_time?: string | null;
  check_out_time?: string | null;
  status: 'present' | 'absent' | 'leave' | 'holiday' | 'late';
  device_id?: string | null;
  employee_device_id?: string | null;
  verification_type: 'fingerprint' | 'face' | 'card' | 'password' | 'manual';
  work_hours: number;
  overtime_hours: number;
  break_time: number;
  notes?: string | null;
  work_duration?: string;
  is_late?: boolean;
}

export interface AttendanceFormData {
  employee: string;
  date: string;
  check_in_time?: string;
  check_out_time?: string;
  status: 'present' | 'absent' | 'leave' | 'holiday' | 'late';
  device_id?: string;
  employee_device_id?: string;
  verification_type: 'fingerprint' | 'face' | 'card' | 'password' | 'manual';
  work_hours?: number;
  overtime_hours?: number;
  break_time?: number;
  notes?: string;
}

export interface EmployeeLeave {
  id: string;
  employee: string;
  employee_details?: {
    id: string;
    fullname: string;
    position: string;
  };
  start_date: string;
  end_date: string;
  reason?: string;
  status: 'pending' | 'approved' | 'rejected';
  leave_duration?: string;
}

export interface LeaveFormData {
  employee: string;
  start_date: string;
  end_date: string;
  reason?: string;
  status?: 'pending' | 'approved' | 'rejected';
}

export interface AttendanceSummary {
  total_employees: number;
  present: number;
  absent: number;
  leave: number;
  late: number;
  date: string;
}