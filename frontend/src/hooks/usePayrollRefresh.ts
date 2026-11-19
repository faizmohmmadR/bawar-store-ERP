import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export function usePayrollRefresh(isSuccess: boolean) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!isSuccess) return;
    for (const key of [
      'employees',
      'employee',
      'employee-financial-summary',
      'employee-yearly-summary',
      'employee-payroll-history',
      'employee-overtime-entries',
      'employee-absence-entries',
      'payroll',
    ]) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
  }, [isSuccess, queryClient]);
}
