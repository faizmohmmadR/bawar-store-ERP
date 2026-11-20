import { Route } from 'react-router-dom';
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
import { productRoutes } from './productRoutes';
import { purchaseRoutes } from './purchaseRoutes';

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
    {productRoutes}
    {purchaseRoutes}
    {/* Sales */}
    {salesRoutes}
    {returnRoutes}

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