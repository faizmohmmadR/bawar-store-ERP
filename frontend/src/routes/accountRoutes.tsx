import { Route } from 'react-router-dom';
import { lazy } from 'react';

const GLAccountList = lazy(() => import('@/pages/accounts/GLAccountList'));
const GLAccountDetail = lazy(() => import('@/pages/accounts/GLAccountDetail'));
const AddGLAccount = lazy(() => import('@/pages/accounts/AddGLAccount'));
const EditGLAccount = lazy(() => import('@/pages/accounts/EditGLAccount'));
const AccountingOverview = lazy(() => import('@/pages/accounting/AccountingOverview'));
const TrialBalancePage = lazy(() => import('@/pages/accounting/TrialBalancePage'));
const BalanceSheetPage = lazy(() => import('@/pages/accounting/BalanceSheetPage'));
const IncomeStatementPage = lazy(() => import('@/pages/accounting/IncomeStatementPage'));
const DailyLedgerPage = lazy(() => import('@/pages/accounting/DailyLedgerPage'));
const FiscalYearPage = lazy(() => import('@/pages/accounting/FiscalYearPage'));
const CurrencyExchangeList = lazy(() =>
  import('@/pages/accounting/CurrencyExchangePages').then((m) => ({ default: m.CurrencyExchangeList })),
);
const AddCurrencyExchange = lazy(() =>
  import('@/pages/accounting/CurrencyExchangePages').then((m) => ({ default: m.AddCurrencyExchange })),
);
const EditCurrencyExchange = lazy(() =>
  import('@/pages/accounting/CurrencyExchangePages').then((m) => ({ default: m.EditCurrencyExchange })),
);
const CurrencyExchangeDetails = lazy(() =>
  import('@/pages/accounting/CurrencyExchangePages').then((m) => ({ default: m.CurrencyExchangeDetails })),
);
const FxRevaluationList = lazy(() =>
  import('@/pages/accounting/FxRevaluationPages').then((m) => ({ default: m.FxRevaluationList })),
);
const AddFxRevaluation = lazy(() =>
  import('@/pages/accounting/FxRevaluationPages').then((m) => ({ default: m.AddFxRevaluation })),
);
const EditFxRevaluation = lazy(() =>
  import('@/pages/accounting/FxRevaluationPages').then((m) => ({ default: m.EditFxRevaluation })),
);
const FxRevaluationDetails = lazy(() =>
  import('@/pages/accounting/FxRevaluationPages').then((m) => ({ default: m.FxRevaluationDetails })),
);

export const accountRoutes = (
  <>
    <Route path="accounting" element={<AccountingOverview />} />
    <Route path="accounting/daily-ledger" element={<DailyLedgerPage />} />
    <Route path="accounting/trial-balance" element={<TrialBalancePage />} />
    <Route path="accounting/balance-sheet" element={<BalanceSheetPage />} />
    <Route path="accounting/income-statement" element={<IncomeStatementPage />} />
    <Route path="accounting/fiscal-years" element={<FiscalYearPage />} />
    <Route path="accounting/currency-exchanges" element={<CurrencyExchangeList />} />
    <Route path="accounting/currency-exchanges/add" element={<AddCurrencyExchange />} />
    <Route path="accounting/currency-exchanges/:id" element={<CurrencyExchangeDetails />} />
    <Route path="accounting/currency-exchanges/:id/edit" element={<EditCurrencyExchange />} />
    <Route path="accounting/fx-revaluations" element={<FxRevaluationList />} />
    <Route path="accounting/fx-revaluations/add" element={<AddFxRevaluation />} />
    <Route path="accounting/fx-revaluations/:id" element={<FxRevaluationDetails />} />
    <Route path="accounting/fx-revaluations/:id/edit" element={<EditFxRevaluation />} />
    <Route path="gl-accounts" element={<GLAccountList />} />
    <Route path="gl-accounts/add" element={<AddGLAccount />} />
    <Route path="gl-accounts/:id" element={<GLAccountDetail />} />
    <Route path="gl-accounts/:id/edit" element={<EditGLAccount />} />
  </>
);
