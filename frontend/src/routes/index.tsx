import { Route } from 'react-router-dom';
import { Navigate } from 'react-router-dom';
import { AppsHome } from '@/pages/AppsHome';
import { Dashboard } from '@/pages/Dashboard';
import { CustomerProfile } from '@/pages/profile/CustomerProfile';
import NotFound from '@/pages/NotFound';

// Import all route modules
import { customerRoutes } from './customerRoutes';
import { vendorRoutes } from './vendorRoutes';
import { salesmanRoutes } from './salesmanRoutes';
import { salesRoutes } from './salesRoutes';
import { stockRoutes } from './stockRoutes';
import { returnRoutes } from './returnRoutes';
import { employeeRoutes } from './employeeRoutes';
import { payrollRoutes } from './payrollRoutes';
import { attendanceRoutes } from './attendanceRoutes';
import { expenseRoutes } from './expenseRoutes';
import { loanRoutes } from './loanRoutes';
import { withdrawalRoutes } from './withdrawalRoutes';
import { equipmentRoutes } from './equipmentRoutes';
import { rawMaterialRoutes } from './rawMaterialRoutes';
import { rawMaterialPurchaseRoutes } from './rawMaterialPurchaseRoutes';
import { rawMaterialStockRoutes } from './rawMaterialStockRoutes';
import { rawMaterialProcessRoutes } from './rawMaterialProcessRoutes';
import { rawMaterialSaleRoutes } from './rawMaterialSaleRoutes';
import { storageTankRoutes } from './storageTankRoutes';
import { packingRoutes } from './packingRoutes';
import { damagedRoutes } from './damagedRoutes';

import { accountRoutes } from './accountRoutes';
import { userRoutes } from './userRoutes';
import { settingsRoutes } from './settingsRoutes';
import { activityLogRoutes } from './activityLogRoutes';
import { reportRoutes } from './reportRoutes';
import { salePaymentRoutes, purchasePaymentRoutes, legacyPaymentRoutes } from './paymentRoutes';
import { salesmanCommissionPaymentRoutes } from './salesmanCommissionPaymentRoutes';

export const appRoutes = (
  <>
    {/* Odoo-style apps launcher (home after login) */}
    <Route index element={<AppsHome />} />
    <Route path="dashboard" element={<Dashboard />} />

    {stockRoutes}
    {equipmentRoutes}
    {/* Raw Materials */}
    {rawMaterialRoutes}
    {rawMaterialPurchaseRoutes}
    {rawMaterialStockRoutes}
    {rawMaterialSaleRoutes}
    {/* Raw Material Production */}
    {rawMaterialProcessRoutes}
    {storageTankRoutes}
    {packingRoutes}
    {damagedRoutes}
    {/* Sales */}
    {salesRoutes}
    {returnRoutes}
    <Route path="products/*" element={<Navigate to="/stock" replace />} />
    <Route path="purchases/*" element={<Navigate to="/raw-material-purchases" replace />} />

    {/* Customer, Vendor & Salesman Management */}
    {customerRoutes}
    {vendorRoutes}
    {salesmanRoutes}

    {/* Financial Management */}
    {accountRoutes}
    {expenseRoutes}
    {withdrawalRoutes}
    {salePaymentRoutes}
    {purchasePaymentRoutes}
    {salesmanCommissionPaymentRoutes}
    {legacyPaymentRoutes}

    {/* Human Resources */}
    {employeeRoutes}
    {payrollRoutes}
    {attendanceRoutes}
    {loanRoutes}

    {/* User Management */}
    {userRoutes}

    {/* Activity Logs */}
    {activityLogRoutes}

    {/* Reports */}
    {reportRoutes}

    {/* Settings */}
    {settingsRoutes}

    {/* Other Routes */}
    <Route path="profile" element={<CustomerProfile />} />
    <Route path="*" element={<NotFound />} />
  </>
);