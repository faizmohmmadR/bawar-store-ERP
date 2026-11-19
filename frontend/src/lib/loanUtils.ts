type TranslateFn = (key: string) => string;

export type LoanScenarioKey =
  | 'customerReceivable'
  | 'customerPayable'
  | 'vendorReceivable'
  | 'vendorPayable';

export function getLoanScenarioKey(
  loanerType: string | undefined,
  loanType: string,
): LoanScenarioKey | null {
  if (loanerType === 'customer' && loanType === 'loan_out') return 'customerReceivable';
  if (loanerType === 'customer' && loanType === 'loan_in') return 'customerPayable';
  if (loanerType === 'vendor' && loanType === 'loan_out') return 'vendorReceivable';
  if (loanerType === 'vendor' && loanType === 'loan_in') return 'vendorPayable';
  return null;
}

export function getLoanScenarioLabel(
  loanerType: string | undefined,
  loanType: string,
  t: TranslateFn,
): string {
  const key = getLoanScenarioKey(loanerType, loanType);
  if (key) return t(`loans.scenario.${key}`);
  return loanType === 'loan_in' ? t('loans.type.loanIn') : t('loans.type.loanOut');
}

export function getLoanScenarioDescription(
  loanerType: string | undefined,
  loanType: string,
  t: TranslateFn,
): string {
  const key = getLoanScenarioKey(loanerType, loanType);
  if (key) return t(`loans.scenarioDesc.${key}`);
  return loanType === 'loan_in' ? t('loans.scenarioDesc.loanInGeneric') : t('loans.scenarioDesc.loanOutGeneric');
}

/** Short badge: "We owe" or "They owe us" */
export function getLoanDirectionLabel(
  loanerType: string | undefined,
  loanType: string,
  t: TranslateFn,
): string {
  const key = getLoanScenarioKey(loanerType, loanType);
  if (!key) return '';
  if (key === 'customerPayable' || key === 'vendorPayable') {
    return t('loans.direction.weOwe');
  }
  return t('loans.direction.theyOweUs');
}

export function getLoanTypeOptions(loanerType: string | undefined, t: TranslateFn) {
  if (loanerType === 'customer') {
    return [
      { value: 'loan_out', label: t('loans.scenario.customerReceivable') },
      { value: 'loan_in', label: t('loans.scenario.customerPayable') },
    ];
  }
  if (loanerType === 'vendor') {
    return [
      { value: 'loan_out', label: t('loans.scenario.vendorReceivable') },
      { value: 'loan_in', label: t('loans.scenario.vendorPayable') },
    ];
  }
  return [
    { value: 'loan_in', label: t('loans.type.loanIn') },
    { value: 'loan_out', label: t('loans.type.loanOut') },
  ];
}

export function getDefaultLoanTypeForLoaner(loanerType: string | undefined): 'loan_in' | 'loan_out' {
  return loanerType === 'customer' || loanerType === 'vendor' ? 'loan_out' : 'loan_in';
}
