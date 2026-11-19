/** V2 amounts stay exact strings. Do not use Number for financial aggregation. */
export type ReportMoney = string;

export interface ReportingV2Meta {
  version: 2;
  period: { start_date: string | null; end_date: string | null };
  timezone: string;
  currency_id: number | null;
  account_id: number | null;
  amount_encoding: 'decimal_string';
  source: 'journal_lines';
  source_reconciliation: 'not_verified';
}

export interface LedgerBalanceV2 {
  account_id: number;
  code: string;
  name: string;
  category: string;
  deleted_account: boolean;
  currency_id: number;
  currency_code: string | null;
  opening_balance: ReportMoney;
  debits: ReportMoney;
  credits: ReportMoney;
  closing_balance: ReportMoney;
  line_count: number;
  unknown_base_count: number;
}

export interface LedgerBalancesV2 {
  meta: ReportingV2Meta & {
    report: 'ledger_balances' | 'cash_balances';
    balance_convention: 'debit_minus_credit';
    coverage: 'recorded_accounts_with_history';
    cash_note: string | null;
  };
  rows: LedgerBalanceV2[];
  totals_by_currency: Array<Pick<LedgerBalanceV2,
    'currency_id' | 'opening_balance' | 'debits' | 'credits' | 'closing_balance'>>;
}

export interface LedgerLineV2 {
  id: number;
  journal_id: number;
  entry_date: string;
  reference_number: string | null;
  description: string | null;
  account_id: number;
  code: string;
  deleted_account: boolean;
  currency_id: number;
  debit: ReportMoney;
  credit: ReportMoney;
  base_debit: ReportMoney | null;
  base_credit: ReportMoney | null;
  exchange_rate: string | null;
  needs_rate_review: boolean;
  source_model: string | null;
  source_id: number | null;
  is_closing_entry: boolean;
}

export interface LedgerEntriesV2 {
  meta: ReportingV2Meta;
  count: number;
  next: string | null;
  previous: string | null;
  results: LedgerLineV2[];
}

export interface CashActivityV2 {
  meta: Omit<ReportingV2Meta, 'source'> & {
    source: 'cash_journal_lines'; report: 'cash_activity';
    balance_convention: 'debit_minus_credit';
  };
  status: 'recorded_cash_activity_unverified';
  rows: Array<{
    account_id: number; code: '1000' | '1050' | '1060'; name: string; currency_id: number;
    deleted_account: boolean;
    currency_code: string | null; opening_balance: ReportMoney; external_inflow: ReportMoney;
    external_outflow: ReportMoney; internal_inflow: ReportMoney; internal_outflow: ReportMoney;
    closing_balance: ReportMoney;
  }>;
  categories: Array<{
    currency_id: number; activity_kind: string; inflow: ReportMoney; outflow: ReportMoney; line_count: number;
  }>;
  review_count: number;
  count: number;
  next: string | null;
  previous: string | null;
  results: Array<{
    cash_line_id: number; journal_id: number; entry_date: string; account_id: number;
    code: '1000' | '1050' | '1060'; currency_id: number; source_model: string | null;
    deleted_account: boolean;
    source_id: number | null; activity_kind: string; is_internal: boolean; direction: 'in' | 'out';
    amount: ReportMoney; reference_number: string | null; description: string | null;
  }>;
  limitations: string[];
}

export interface InventoryMovementReviewV2 {
  meta: Omit<ReportingV2Meta, 'source'> & { source: 'operational_inventory_events'; report: 'inventory_movement_review'; amount_scale: 4 };
  status: 'recorded_inventory_events_unverified';
  summaries: Array<{ location: string; item_type: string; item_id: number; item_name: string; unit: string;
    quantity_in: ReportMoney; quantity_out: ReportMoney;
    value_in_afn: ReportMoney | null; value_out_afn: ReportMoney | null;
    unknown_value_count: number; unknown_value_in_count: number;
    unknown_value_out_count: number; event_count: number }>;
  count: number; next: string | null; previous: string | null;
  results: Array<{ event_model: string; event_id: number; effective_at: string; movement: string; location: string;
    direction: 'in' | 'out'; item_type: string; item_id: number; item_name: string; quantity: ReportMoney; unit: string;
    value_afn: ReportMoney | null; source_id: number; source_number: string | null; date_basis: string; issues: string[] }>;
  limitations: string[];
}

export interface EmployeePayrollActivityV2 {
  meta: Omit<ReportingV2Meta, 'source'> & { source: 'employee_pay_entries_and_payroll'; report: 'employee_payroll_activity' };
  status: 'recorded_payroll_activity_unverified';
  rows: Array<{ employee_id: number; employee_name: string; currency_id: number; currency_code: string | null;
    period_calendar: string; year: number; month: string; overtime: ReportMoney;
    absence_deductions: ReportMoney; food_deductions: ReportMoney; total_deductions: ReportMoney;
    absence_days: ReportMoney; net_adjustments: ReportMoney; salary_paid_money: ReportMoney;
    salary_paid_goods: ReportMoney; advances_paid_money: ReportMoney; advances_paid_goods: ReportMoney;
    total_settled: ReportMoney; pay_rate_snapshot: ReportMoney | null;
    salary_type_snapshot: string | null; pay_rate_conflict: boolean;
    estimated_monthly_net: ReportMoney | null; estimated_remaining: ReportMoney | null;
    balance_review_reasons: string[]; event_count: number; review_count: number }>;
  count: number; next: string | null; previous: string | null;
  results: Array<{ event_model: string; event_id: number; effective_at: string;
    employee_id: number; employee_name: string; currency_id: number; period_calendar: string;
    year: number; month: string; kind: 'overtime' | 'absence_deduction' | 'food_deduction'
      | 'salary_payment' | 'salary_goods' | 'advance_payment' | 'advance_goods';
    amount: ReportMoney; issues: string[]; hours?: ReportMoney | null; days?: ReportMoney | null;
    payment_method?: string; source_sale_id?: number | null; pay_rate_snapshot?: ReportMoney;
    salary_type_snapshot?: string; payment_line_overtime?: ReportMoney;
    payment_line_deductions?: ReportMoney; payment_line_bonus?: ReportMoney;
    payment_gross_snapshot?: ReportMoney | null }>;
  limitations: string[];
}

export interface ExpenseActivityV2 {
  meta: Omit<ReportingV2Meta, 'source'> & {
    source: 'expense_documents_and_journal_lines'; report: 'expense_activity';
  };
  status: 'review_required' | 'supported_expenses_matched';
  review_count: number;
  summaries: Array<{ category_id: number; category_name: string; currency_id: number;
    currency_code: string | null; payment_method: string; recorded_amount: ReportMoney;
    matched_amount: ReportMoney; matched_base_afn: ReportMoney; document_count: number;
    matched_count: number; review_count: number }>;
  count: number; next: string | null; previous: string | null;
  results: Array<{ expense_id: number; expense_date: string; category_id: number;
    category_name: string; currency_id: number; payment_method: string;
    amount: ReportMoney; amount_base_afn: ReportMoney; equipment_id: number | null;
    posting_status: 'matched' | 'review_required'; issues: string[]; journal_ids: number[] }>;
  limitations: string[];
}

export interface TrialBalanceReviewV2 {
  meta: Omit<ReportingV2Meta, 'source'> & {
    source: 'journal_lines_base_afn'; report: 'trial_balance_review'; currency_id: 1;
  };
  status: 'recorded_trial_balance_balanced' | 'review_required';
  rows: Array<{ account_id: number; code: string; name: string; category: string;
    deleted_account: boolean; opening_balance: ReportMoney | null;
    period_debits: ReportMoney | null; period_credits: ReportMoney | null;
    closing_balance: ReportMoney | null; closing_debit: ReportMoney | null;
    closing_credit: ReportMoney | null; unknown_base_count: number; line_count: number }>;
  totals: { opening_debits: ReportMoney | null; opening_credits: ReportMoney | null;
    period_debits: ReportMoney | null; period_credits: ReportMoney | null;
    closing_debits: ReportMoney | null; closing_credits: ReportMoney | null;
    opening_difference: ReportMoney | null; period_difference: ReportMoney | null;
    closing_difference: ReportMoney | null };
  unknown_base_count: number; deleted_account_count: number;
  journal_health_issue_count: number; limitations: string[];
}

export interface ProfitLossReviewV2 {
  meta: Omit<ReportingV2Meta, 'source'> & {
    source: 'journal_lines_base_afn'; report: 'profit_loss_review'; currency_id: 1;
  };
  status: 'recorded_pnl_unverified' | 'review_required';
  rows: Array<{ account_id: number; code: string; name: string; category: string;
    section: 'sales_revenue' | 'sales_returns' | 'other_revenue' | 'cost_of_goods_sold' | 'other_expenses';
    deleted_account: boolean; debit_afn: ReportMoney | null; credit_afn: ReportMoney | null;
    amount_afn: ReportMoney | null; unknown_base_count: number; line_count: number }>;
  totals: { sales_revenue: ReportMoney | null; sales_returns: ReportMoney | null;
    net_sales: ReportMoney | null; cost_of_goods_sold: ReportMoney | null;
    gross_profit: ReportMoney | null; other_revenue: ReportMoney | null;
    other_expenses: ReportMoney | null; net_result: ReportMoney | null };
  unknown_base_count: number; wrong_category_line_count: number;
  deleted_account_count: number; journal_health_issue_count: number; limitations: string[];
}

export interface BalanceSheetReviewV2 {
  meta: Omit<ReportingV2Meta, 'source'> & {
    source: 'journal_lines_base_afn'; report: 'balance_sheet_review'; currency_id: 1;
  };
  status: 'recorded_balance_sheet_balanced' | 'review_required';
  rows: Array<{ account_id: number; code: string; name: string; category: string;
    section: 'assets' | 'liabilities' | 'equity' | 'unclosed_earnings' | null;
    amount_afn: ReportMoney | null; deleted_account: boolean;
    unknown_base_count: number; line_count: number }>;
  totals: { assets: ReportMoney | null; liabilities: ReportMoney | null;
    equity: ReportMoney | null; unclosed_earnings: ReportMoney | null;
    equity_including_unclosed_earnings: ReportMoney | null;
    difference: ReportMoney | null };
  trial_balance_status: TrialBalanceReviewV2['status'];
  unknown_base_count: number; unknown_category_count: number;
  deleted_account_count: number; journal_health_issue_count: number;
  limitations: string[];
}

export interface CustomerArBridgeV2 {
  meta: Omit<ReportingV2Meta, 'source'> & {
    source: 'customer_invoices_and_journal_lines'; report: 'customer_ar_bridge';
    amount_scale: 4; sign_convention: 'debit_minus_credit';
  };
  status: 'comparison_only';
  rows: Array<{ currency_id: number; invoice_balance: ReportMoney;
    trade_gl_balance: ReportMoney; trade_difference: ReportMoney;
    other_gl_balance: ReportMoney; total_gl_balance: ReportMoney;
    total_difference: ReportMoney; invoice_issue_count: number;
    trade_line_count: number; other_line_count: number;
    account_ids: number[]; other_journal_ids: number[] }>;
  limitations: string[];
}

export interface VendorApBridgeV2 {
  meta: Omit<ReportingV2Meta, 'source'> & {
    source: 'supplier_bills_and_journal_lines'; report: 'vendor_ap_bridge';
    amount_scale: 4; sign_convention: 'credit_minus_debit';
  };
  status: 'comparison_only';
  rows: Array<{ currency_id: number; bill_balance: ReportMoney;
    unused_supplier_credit: ReportMoney; trade_gl_balance: ReportMoney;
    trade_difference: ReportMoney; other_gl_balance: ReportMoney;
    total_gl_balance: ReportMoney; total_difference: ReportMoney;
    invoice_issue_count: number; trade_line_count: number;
    other_line_count: number; account_ids: number[]; other_journal_ids: number[] }>;
  limitations: string[];
}

export interface PayrollPostingBridgeV2 {
  meta: Omit<ReportingV2Meta, 'source'> & {
    source: 'payroll_settlements_and_journal_lines';
    report: 'payroll_posting_bridge'; sign_convention: 'debit_minus_credit';
  };
  status: 'comparison_only';
  rows: Array<{ currency_id: number; salary_paid_money: ReportMoney;
    salary_paid_goods: ReportMoney; advance_paid_money: ReportMoney;
    advance_paid_goods_review: ReportMoney; salary_gl_posted: ReportMoney;
    salary_posting_difference: ReportMoney; advance_gl_posted: ReportMoney;
    advance_posting_difference: ReportMoney; other_salary_gl: ReportMoney;
    other_advance_gl: ReportMoney; source_issue_count: number;
    salary_line_count: number; advance_line_count: number; other_line_count: number;
    account_ids: number[]; other_journal_ids: number[] }>;
  limitations: string[];
}

export interface InventoryPurchaseBridgeV2 {
  meta: Omit<ReportingV2Meta, 'source'> & {
    source: 'received_purchase_items_and_inventory_journal_lines';
    report: 'inventory_purchase_bridge'; currency_id: 1;
  };
  status: 'comparison_only';
  rows: Array<{ purchase_id: number; invoice_number: string;
    purchase_date: string; source_currency_id: number;
    item_count: number; inventory_line_count: number;
    item_value_afn: ReportMoney; header_value_afn: ReportMoney;
    items_header_difference_afn: ReportMoney; inventory_gl_afn: ReportMoney | null;
    header_gl_difference_afn: ReportMoney | null;
    unknown_base_count: number; journal_ids: number[]; issues: string[] }>;
  orphan_inventory_line_count: number; orphan_journal_ids: number[];
  limitations: string[];
}

export interface InventorySaleBridgeV2 {
  meta: Omit<ReportingV2Meta, 'source'> & {
    source: 'sale_return_inventory_events_and_journal_lines';
    report: 'inventory_sale_bridge'; currency_id: 1;
  };
  status: 'comparison_only';
  rows: Array<{ source_model: 'sales' | 'return'; source_id: number;
    movement: 'sale_inventory_out' | 'sale_inventory_return'; event_ids: number[];
    event_count: number; expected_cost_afn: ReportMoney | null;
    inventory_gl_afn: ReportMoney | null; difference_afn: ReportMoney | null;
    unknown_event_count: number; unknown_base_count: number;
    inventory_line_count: number; journal_ids: number[]; issues: string[] }>;
  orphan_inventory_line_count: number; orphan_journal_ids: number[];
  limitations: string[];
}

export interface InventoryWasteBridgeV2 {
  meta: Omit<ReportingV2Meta, 'source'> & {
    source: 'waste_adjustment_inventory_events_and_journal_lines';
    report: 'inventory_waste_bridge'; currency_id: 1;
  };
  status: 'comparison_only';
  rows: Array<{ source_model: 'stockbottledamage' | 'storagetankleak' | 'stockadjustment';
    source_id: number; gross_out_afn: ReportMoney | null;
    salvage_in_afn: ReportMoney | null; expected_inventory_change_afn: ReportMoney | null;
    inventory_gl_change_afn: ReportMoney | null; difference_afn: ReportMoney | null;
    event_count: number; event_ids: number[]; unknown_event_count: number;
    unknown_base_count: number; inventory_line_count: number; journal_ids: number[];
    issues: string[] }>;
  orphan_inventory_line_count: number; orphan_journal_ids: number[];
  limitations: string[];
}

export interface InventoryTransformationBridgeV2 {
  meta: Omit<ReportingV2Meta, 'source'> & {
    source: 'production_packing_inventory_events';
    report: 'inventory_transformation_bridge'; currency_id: 1;
  };
  status: 'comparison_only';
  rows: Array<{ source_model: 'rawmaterialprocess' | 'packingrun'; source_id: number;
    source_number: string; source_status: string; input_count: number; output_count: number;
    input_value_afn: ReportMoney; extra_expense_afn: ReportMoney;
    declared_material_afn: ReportMoney; declared_total_afn: ReportMoney;
    input_header_difference_afn: ReportMoney; cost_build_difference_afn: ReportMoney;
    output_value_afn: ReportMoney | null; output_header_difference_afn: ReportMoney | null;
    output_quantity: ReportMoney; declared_output_quantity: ReportMoney | null;
    output_unit: 'liter' | 'piece';
    event_refs: Array<{ event_model: string; event_id: number }>;
    issues: string[] }>;
  limitations: string[];
}

export interface InventoryTransferReviewV2 {
  meta: Omit<ReportingV2Meta, 'source'> & {
    source: 'stock_transfer_documents_and_transfer_adjustments';
    report: 'inventory_transfer_review'; currency_id: 1;
  };
  status: 'review_required';
  rows: Array<{ source_model: 'stocktransfer' | 'stockadjustment'; source_id: number;
    reference_number: string; effective_at: string;
    source_stock_id: number | null; target_stock_id: number | null;
    quantity_pieces: ReportMoney; value_afn: ReportMoney | null;
    paired_movement: boolean; net_change_afn: ReportMoney | null; issues: string[] }>;
  limitations: string[];
}

export interface InventoryCurrentPositionV2 {
  meta: Omit<ReportingV2Meta, 'source'> & {
    source: 'current_operational_pools_and_inventory_journal_lines';
    report: 'inventory_current_position'; currency_id: 1; snapshot_at: string;
  };
  status: 'comparison_only';
  rows: Array<{ pool: 'raw_material' | 'storage_tank' | 'finished_stock'
    | 'packing_return' | 'production_pending_transfer'; item_id: number | null;
    item_name: string; quantity: ReportMoney | null; unit: string;
    value_afn: ReportMoney | null; issues: string[] }>;
  operational_total_afn: ReportMoney | null; inventory_gl_afn: ReportMoney | null;
  difference_afn: ReportMoney | null; unknown_pool_count: number;
  unknown_gl_base_count: number; inventory_line_count: number;
  limitations: string[];
}

export interface SourceCoverageFindingV2 {
  kind: 'missing_journal' | 'unexpected_journal' | 'source_requires_review'
    | 'possible_duplicate_journal' | 'source_journal_date_mismatch'
    | 'automatic_journal_without_source' | 'unresolvable_source_model'
    | 'missing_source' | 'deleted_source' | 'unsupported_source_rule' | 'source_after_cutoff';
  source_model: string | null;
  source_id: number | null;
  journal_ids: number[];
  reason: string | null;
}

export interface SourceCoverageV2 {
  meta: Omit<ReportingV2Meta, 'source'> & {
    source: 'documents_and_journal_links';
    report: 'source_coverage';
  };
  status: 'review_required' | 'coverage_checks_passed';
  summaries: Array<{
    source_model: string;
    source_count: number;
    required: number;
    forbidden: number;
    review: number;
    with_journal: number;
    without_journal: number;
  }>;
  finding_count: number;
  counts_by_kind: Partial<Record<SourceCoverageFindingV2['kind'], number>>;
  count: number;
  next: string | null;
  previous: string | null;
  results: SourceCoverageFindingV2[];
  limitations: string[];
}

export interface OpeningReviewV2 {
  meta: ReportingV2Meta & { report: 'opening_review' };
  status: 'requires_opening_reconciliation';
  opening_as_of: string;
  rows: Array<Omit<LedgerBalanceV2,
    'opening_balance' | 'debits' | 'credits' | 'closing_balance'> & {
    recorded_opening_balance: ReportMoney;
  }>;
  historical_journal_count: number;
  equity_evidence_journal_count: number;
  detail_filters: { end_date: string; currency: number | null; account_id: number | null };
  limitations: string[];
}

export interface DocumentReconciliationV2 {
  meta: Omit<ReportingV2Meta, 'source'> & {
    source: 'documents_and_journal_lines'; report: 'document_reconciliation';
  };
  status: 'review_required' | 'supported_documents_matched';
  supported_models: Array<'expense' | 'withdrawal' | 'rawmaterialpurchase' | 'payroll'>;
  counts: { checked: number; matched: number; mismatched: number; requires_review: number };
  count: number;
  next: string | null;
  previous: string | null;
  results: Array<{
    source_model: string;
    source_id: number;
    kind: 'invalid_source' | 'posting_mismatch';
    errors: string[];
    journal_ids?: number[];
    expected_amount?: ReportMoney;
    expected_base_amount?: ReportMoney;
  }>;
  limitations: string[];
}

export interface SettlementReconciliationV2 extends Omit<DocumentReconciliationV2,
  'meta' | 'status' | 'supported_models' | 'results'> {
  meta: Omit<ReportingV2Meta, 'source'> & {
    source: 'documents_and_journal_lines'; report: 'settlement_reconciliation';
  };
  status: 'review_required' | 'supported_components_matched';
  results: Array<{
    source_model: string;
    source_id: number;
    kind: 'requires_review' | 'settlement_mismatch';
    errors: string[];
    journal_ids: number[];
  }>;
}

export interface InvoiceReconciliationV2 {
  meta: Omit<ReportingV2Meta, 'source'> & {
    source: 'invoice_items_and_journal_lines'; report: 'invoice_reconciliation';
  };
  status: 'review_required' | 'supported_invoice_checks_passed';
  checked_count: number;
  finding_count: number;
  count: number;
  next: string | null;
  previous: string | null;
  results: Array<{ source_model: string; source_id: number;
    kind: 'requires_review' | 'invoice_mismatch'; errors: string[] }>;
  limitations: string[];
}

export interface CustomerInvoiceBalancesV2 {
  meta: Omit<ReportingV2Meta, 'source'> & {
    source: 'invoices_payments_returns'; report: 'customer_invoice_balances';
    amount_scale: 4; scope_note: string;
  };
  status: 'unverified_invoice_positions';
  count: number;
  next: string | null;
  previous: string | null;
  results: Array<{
    sale_id: number; invoice_number: string; customer_id: number; currency_id: number;
    invoice_amount: ReportMoney; settled_amount: ReportMoney; returned_amount: ReportMoney;
    refunded_amount: ReportMoney; opening_balance: ReportMoney; period_change: ReportMoney;
    closing_balance: ReportMoney; payment_ids: number[]; return_ids: number[]; issues: string[];
  }>;
  parties: Array<{
    customer_id: number; customer_name: string; currency_id: number;
    opening_balance: ReportMoney; closing_balance: ReportMoney;
    receivable: ReportMoney; customer_credit: ReportMoney; issue_count: number;
  }>;
  limitations: string[];
}

export interface VendorInvoiceBalancesV2 {
  meta: Omit<ReportingV2Meta, 'source'> & {
    source: 'purchase_invoices_and_supplier_credit'; report: 'vendor_invoice_balances';
    amount_scale: 4; scope_note: string;
  };
  status: 'unverified_invoice_positions';
  count: number;
  next: string | null;
  previous: string | null;
  results: Array<{
    purchase_id: number; invoice_number: string; vendor_id: number; currency_id: number;
    invoice_amount: ReportMoney; settled_amount: ReportMoney; opening_balance: ReportMoney;
    period_change: ReportMoney; closing_balance: ReportMoney; payment_ids: number[]; issues: string[];
  }>;
  credits: Array<{
    receipt_id: number; vendor_id: number; currency_id: number; source_sale_id: number | null;
    origin: 'money_advance' | 'purchase_return' | 'supplier_goods_sale';
    received_amount: ReportMoney; applied_amount: ReportMoney; unused_amount: ReportMoney;
    allocation_ids: number[]; issues: string[];
  }>;
  purchase_returns: Array<{
    sale_id: number; vendor_id: number; currency_id: number; amount: ReportMoney;
    receipt_ids: number[]; issues: string[];
  }>;
  parties: Array<{
    vendor_id: number; vendor_name: string; currency_id: number; opening_balance: ReportMoney;
    outstanding_bills: ReportMoney; unused_credit: ReportMoney; closing_balance: ReportMoney;
    period_change: ReportMoney; payable: ReportMoney; supplier_credit: ReportMoney; issue_count: number;
  }>;
  limitations: string[];
}

export interface PartyLoanBalancesV2 {
  meta: Omit<ReportingV2Meta, 'source'> & {
    source: 'loans_and_repayments'; report: 'party_loan_balances'; amount_scale: 4;
  };
  status: 'unverified_loan_positions';
  count: number;
  next: string | null;
  previous: string | null;
  results: Array<{
    loan_id: number; party_type: string; party_id: number | null; can_attribute: boolean;
    currency_id: number; loan_type: string; origin: 'money' | 'opening' | 'intermediary';
    funding_method: string | null; principal: ReportMoney; repaid: ReportMoney;
    opening_balance: ReportMoney; period_change: ReportMoney; closing_balance: ReportMoney;
    payment_ids: number[]; issues: string[];
  }>;
  parties: Array<{
    party_type: string; party_id: number; party_name: string | null; currency_id: number;
    opening_balance: ReportMoney; closing_balance: ReportMoney; period_change: ReportMoney;
    loan_out_remaining: ReportMoney; loan_in_remaining: ReportMoney; issue_count: number;
  }>;
  limitations: string[];
}

export interface PartyPositionOverviewV2 {
  meta: Omit<ReportingV2Meta, 'source'> & {
    source: 'linked_trade_documents_and_loans'; report: 'party_position_overview';
    amount_scale: 4; sign_convention: 'positive_receivable_negative_payable';
  };
  status: 'unverified_party_positions';
  count: number;
  next: string | null;
  previous: string | null;
  results: Array<{
    party_type: string; party_id: number; party_name: string | null; currency_id: number;
    opening_balance: ReportMoney; closing_balance: ReportMoney; period_change: ReportMoney;
    components: Array<{ kind: string; opening_balance: ReportMoney; closing_balance: ReportMoney }>;
    issue_count: number;
  }>;
  manual_party_account_journals_not_reconciled: number;
  unattributed_loan_count: number;
  unlinked_customer_advance_count: number;
  limitations: string[];
}

export interface CustomerAdvanceBalancesV2 {
  meta: Omit<ReportingV2Meta, 'source'> & {
    source: 'customer_receipts_and_allocations'; report: 'customer_advance_balances';
    amount_scale: 4; sign_convention: 'positive_unused_customer_credit';
  };
  status: 'unverified_customer_advance_positions';
  count: number;
  next: string | null;
  previous: string | null;
  results: Array<{
    receipt_id: number; customer_id: number; currency_id: number; payment_method: string;
    received_amount: ReportMoney; applied_amount: ReportMoney; opening_balance: ReportMoney;
    period_change: ReportMoney; closing_balance: ReportMoney; allocation_ids: number[]; issues: string[];
  }>;
  parties: Array<{
    customer_id: number; customer_name: string | null; currency_id: number;
    opening_balance: ReportMoney; closing_balance: ReportMoney; period_change: ReportMoney; issue_count: number;
  }>;
  unlinked_advance_count: number;
  limitations: string[];
}
