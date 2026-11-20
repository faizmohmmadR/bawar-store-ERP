
import { coreEn } from "./languages/core/en";
import { corePs } from "./languages/core/ps";
import { coreFa } from "./languages/core/fa";
import { commonFa } from "./languages/common/fa";
import { commonEn } from "./languages/common/en";
import { commonPs } from "./languages/common/ps";
import { stockEn } from "./languages/stock/en";
import { stockPs } from "./languages/stock/ps";
import { stockFa } from "./languages/stock/fa";
import { customersEn } from "./languages/customer/en";
import { customerPs } from "./languages/customer/ps";
import { customerFa } from "./languages/customer/fa";
import { vendorsEn } from "./languages/vendors/en";
import { vendorsPs } from "./languages/vendors/ps";
import { vendorsFa } from "./languages/vendors/fa";
import { salesmenEn } from "./languages/salesmen/en";
import { salesmenPs } from "./languages/salesmen/ps";
import { salesmenFa } from "./languages/salesmen/fa";
import { employeeEn } from "./languages/employees/en";
import { employeePs } from "./languages/employees/ps";
import { employeeFa } from "./languages/employees/fa";
import { salesEn } from "./languages/sales/en";
import { salesPs } from "./languages/sales/ps";
import { salesFa } from "./languages/sales/fa";
import { payrollEn } from "./languages/payroll/en";
import { payrollFa } from "./languages/payroll/fa";
import { payrollPs } from "./languages/payroll/ps";
import { productsEn } from "./languages/products/en";
import { productsFa } from "./languages/products/fa";
import { productsPs } from "./languages/products/ps";
import { purchasesEn } from "./languages/purchases/en";
import { purchasesFa } from "./languages/purchases/fa";
import { purchasesPs } from "./languages/purchases/ps";
import { expensesEn } from "./languages/expenses/en";
import { expensesFa } from "./languages/expenses/fa";
import { expensesPs } from "./languages/expenses/ps";
import { ordersEn } from "./languages/orders/en";
import { ordersFa } from "./languages/orders/fa";
import { ordersPs } from "./languages/orders/ps";
import { settingsEn } from "./languages/settings/en";
import { settingsPs } from "./languages/settings/ps";
import { settingsFa } from "./languages/settings/fa";
import { userEn } from "./languages/user/en";
import { userPs } from "./languages/user/ps";
import { userFa } from "./languages/user/fa";
import { returnsEn } from "./languages/returns/en";
import { returnsPs } from "./languages/returns/ps";
import { returnsFa } from "./languages/returns/fa";

import { attendanceEn } from "./languages/attendance/en";
import { attendancePs } from "./languages/attendance/ps";
import { attendanceFa } from "./languages/attendance/fa";
import { loansEn } from "./languages/loans/en";
import { loansFa } from "./languages/loans/fa";
import { loansPs } from "./languages/loans/ps";
import { apiEn } from "./languages/api/en";
import { apiFa } from "./languages/api/fa";
import { apiPs } from "./languages/api/ps";
import { activityLogsEn } from "./languages/activityLogs/en";
import { activityLogsFa } from "./languages/activityLogs/fa";
import { activityLogsPs } from "./languages/activityLogs/ps";
import { accountsEn } from "./languages/accounts/en";
import { accountsFa } from "./languages/accounts/fa";
import { accountsPs } from "./languages/accounts/ps";
import { reportsEn } from "./languages/reports/en";
import { reportsFa } from "./languages/reports/fa";
import { reportsPs } from "./languages/reports/ps";
import { paymentsEn } from "./languages/payments/en";
import { paymentsPs } from "./languages/payments/ps";
import { paymentsFa } from "./languages/payments/fa";
import { backupsEn } from "./languages/backups/en";
import { backupsFa } from "./languages/backups/fa";
import { backupsPs } from "./languages/backups/ps";
import { trashEn } from "./languages/trash/en";
import { trashFa } from "./languages/trash/fa";
import { trashPs } from "./languages/trash/ps";
import { authEn } from "./languages/auth/en";
import { authFa } from "./languages/auth/fa";
import { authPs } from "./languages/auth/ps";
import { modulesEn } from "./languages/modules/en";
import { modulesFa } from "./languages/modules/fa";
import { modulesPs } from "./languages/modules/ps";
export type Language = "en" | "ps" | "fa";

// Base translation interface
export interface CoreTranslations {
  common: {
    save: string;
    cancel: string;
    delete: string;
    // ... other common translations
  };
  // ... other core translations
}

export interface CustomerTranslations {
  customer: {
    title: string;
    name: string;
    phone: string;
    // ... other customer-specific translations
  };
}

// Combined translation type
export type Translations = CoreTranslations & {
  [module: string]: any; // Allow module-specific translations
};

// Build language objects from module imports
const en = {
  common: commonEn,
  customers: customersEn,
  vendors: vendorsEn,
  salesmen: salesmenEn,
  sales: salesEn,
  stock: stockEn,
  settings: settingsEn,
  orders: ordersEn,
  returns: returnsEn,
  expenses: expensesEn,
  attendance: attendanceEn,
  payroll: payrollEn,
  products: productsEn,
  purchases: purchasesEn,
  core: coreEn,
  employees: employeeEn,
  user: userEn,
  loans: loansEn,
  payments: paymentsEn,
  api: apiEn,
  activityLogs: activityLogsEn,
  accounts: accountsEn,
  reports: reportsEn,
  backups: backupsEn,
  trash: trashEn,
  auth: authEn,
  ...modulesEn,
};

const fa = {
  common: commonFa,
  customers: customerFa,
  vendors: vendorsFa,
  salesmen: salesmenFa,
  sales: salesFa,
  stock: stockFa,
  settings: settingsFa,
  orders: ordersFa,
  returns: returnsFa,
  expenses: expensesFa,
  attendance: attendanceFa,
  payroll: payrollFa,
  products: productsFa,
  purchases: purchasesFa,
  core: coreFa,
  employees: employeeFa,
  user: userFa,
  loans: loansFa,
  payments: paymentsFa,
  api: apiFa,
  activityLogs: activityLogsFa,
  accounts: accountsFa,
  reports: reportsFa,
  backups: backupsFa,
  trash: trashFa,
  auth: authFa,
  ...modulesFa,
};

const ps = {
  common: commonPs,
  customers: customerPs,
  vendors: vendorsPs,
  salesmen: salesmenPs,
  sales: salesPs,
  stock: stockPs,
  settings: settingsPs,
  orders: ordersPs,
  returns: returnsPs,
  expenses: expensesPs,
  attendance: attendancePs,
  payroll: payrollPs,
  products: productsPs,
  purchases: purchasesPs,
  core: corePs,
  employees: employeePs,
  user: userPs,
  loans: loansPs,
  payments: paymentsPs,
  api: apiPs,
  activityLogs: activityLogsPs,
  accounts: accountsPs,
  reports: reportsPs,
  backups: backupsPs,
  trash: trashPs,
  auth: authPs,
  ...modulesPs,
};

export const languages = {
  en,
  fa,
  ps,
};

export const languageNames = {
  en: "English",
  ps: "پښتو",
  fa: "دری",
};

export const defaultLanguage: Language = "en";
export const LANGUAGE_STORAGE_KEY = "erp-language";

export const getCurrentLanguage = (): Language => {
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return (stored as Language) || defaultLanguage;
  }
  return defaultLanguage;
};

export const saveLanguage = (language: Language): void => {
  if (typeof window !== "undefined") {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  }
};

export const getTranslations = (language: Language): Translations => {
  return languages[language] || languages[defaultLanguage];
};

export const getLanguageDirection = (language: Language): "ltr" | "rtl" => {
  return language === "ps" || language === "fa" ? "rtl" : "ltr";
};

// Helper type for module translations
export type ModuleTranslations<T> = {
  [key in Language]: T;
};
