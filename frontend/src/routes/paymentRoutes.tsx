import { Navigate, Route, useParams } from 'react-router-dom';
import GeneralPaymentForm from '@/pages/payments/shared/GeneralPaymentForm';
import { GeneralPaymentList, GeneralPaymentDetails } from '@/pages/payments/shared/GeneralPaymentPages';
import PaymentListPage from '@/pages/payments/shared/PaymentListPage';
import AddPaymentPage from '@/pages/payments/shared/AddPaymentPage';
import EditPaymentPage from '@/pages/payments/shared/EditPaymentPage';
import PaymentDetailPage from '@/pages/payments/shared/PaymentDetailPage';
import OrderPaymentsPage from '@/pages/payments/shared/OrderPaymentsPage';

export const salePaymentRoutes = (
  <>
    <Route path="sale-payments" element={<PaymentListPage type="sale" />} />
    <Route path="sale-payments/add" element={<AddPaymentPage type="sale" />} />
    <Route path="sale-payments/general" element={<GeneralPaymentList type="sale" />} />
    <Route path="sale-payments/general/:id" element={<GeneralPaymentDetails type="sale" />} />
    <Route path="sale-payments/general/:id/edit" element={<GeneralPaymentForm type="sale" />} />
    <Route path="sale-payments/order/:orderId" element={<OrderPaymentsPage type="sale" />} />
    <Route path="sale-payments/:id/edit" element={<EditPaymentPage type="sale" />} />
    <Route path="sale-payments/:id" element={<PaymentDetailPage type="sale" />} />
  </>
);

export const purchasePaymentRoutes = (
  <>
    <Route path="purchase-payments" element={<PaymentListPage type="purchase" />} />
    <Route path="purchase-payments/add" element={<AddPaymentPage type="purchase" />} />
    <Route path="purchase-payments/general" element={<GeneralPaymentList type="purchase" />} />
    <Route path="purchase-payments/general/:id" element={<GeneralPaymentDetails type="purchase" />} />
    <Route path="purchase-payments/general/:id/edit" element={<GeneralPaymentForm type="purchase" />} />
    <Route
      path="purchase-payments/order/:orderId"
      element={<OrderPaymentsPage type="purchase" />}
    />
    <Route path="purchase-payments/:id/edit" element={<EditPaymentPage type="purchase" />} />
    <Route path="purchase-payments/:id" element={<PaymentDetailPage type="purchase" />} />
  </>
);

/** Legacy payment URLs redirect to the current sale/purchase payment modules. */
const LegacySaleOrderRedirect = () => {
  const { id } = useParams();
  return <Navigate to={`/sale-payments/order/${id}`} replace />;
};

const LegacySaleAddRedirect = () => {
  const { id } = useParams();
  return <Navigate to={`/sale-payments/add?sale_id=${id}`} replace />;
};

const LegacySalePaymentEditRedirect = () => {
  const { paymentId } = useParams();
  return <Navigate to={`/sale-payments/${paymentId}/edit`} replace />;
};

export const legacyPaymentRoutes = (
  <>
    <Route path="payments" element={<Navigate to="/sale-payments" replace />} />
    <Route path="payments/sale/:id" element={<LegacySaleOrderRedirect />} />
    <Route path="payments/sale/:id/add" element={<LegacySaleAddRedirect />} />
    <Route path="payments/sale/:id/edit/:paymentId" element={<LegacySalePaymentEditRedirect />} />
    <Route path="payments/purchase/*" element={<Navigate to="/purchase-payments" replace />} />
    <Route path="third-party-settlements/*" element={<Navigate to="/sale-payments" replace />} />
  </>
);
