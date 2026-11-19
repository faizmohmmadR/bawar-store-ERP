/** Day-based absence amount shown in the Salary deduction field. */
export function dayBasedDeductionAmount(options: {
  deductionDays: number;
  basicSalary: number;
  workingDays: number;
  salaryType: 'monthly' | 'daily' | 'other';
}): number {
  const days = Math.max(0, Number(options.deductionDays) || 0);
  const salary = Number(options.basicSalary) || 0;
  if (days <= 0 || salary <= 0 || options.salaryType === 'other') return 0;
  if (options.salaryType === 'daily') {
    return Number((salary * days).toFixed(2));
  }
  const working = Math.max(1, Number(options.workingDays) || 30);
  return Number(((salary * days) / working).toFixed(2));
}

/**
 * UI shows a single total deduction amount (days auto-fill it; user may edit).
 * Backend still stores deduction_days + salary_deduction separately — split so
 * the day portion is not applied twice.
 */
export function splitSalaryDeductionForApi(options: {
  deductionDays: number;
  salaryDeduction: number;
  basicSalary: number;
  workingDays: number;
  salaryType: 'monthly' | 'daily' | 'other';
}): { deduction_days: number; salary_deduction: number } {
  const auto = dayBasedDeductionAmount(options);
  const total = Math.max(0, Number(options.salaryDeduction) || 0);
  const days = Math.max(0, Math.floor(Number(options.deductionDays) || 0));

  if (options.salaryType === 'other' || days <= 0) {
    return { deduction_days: 0, salary_deduction: total };
  }
  if (Math.abs(total - auto) < 0.005) {
    return { deduction_days: days, salary_deduction: 0 };
  }
  if (total > auto) {
    return { deduction_days: days, salary_deduction: Number((total - auto).toFixed(2)) };
  }
  // Custom amount below the day-based value — amount is source of truth
  return { deduction_days: 0, salary_deduction: total };
}
