export interface ActivityLog {
  id: number;
  user: number | null;
  user_name: string;
  user_email?: string | null;
  user_role?: string | null;
  action: 'create' | 'update' | 'delete' | 'login' | 'logout' | 'view' | 'export' | 'payment';
  model_name: string;
  object_id?: number | null;
  description: string;
  ip_address?: string | null;
  user_agent?: string | null;
  changes?: Record<string, unknown> | null;
  branch?: number | null;
  branch_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActivityLogStats {
  total_activities: number;
  by_action: Array<{ action: string; count: number }>;
  by_user: Array<{
    user__username?: string;
    user__first_name?: string;
    user__last_name?: string;
    user__role?: string;
    count: number;
  }>;
  by_model: Array<{ model_name: string; count: number }>;
}
