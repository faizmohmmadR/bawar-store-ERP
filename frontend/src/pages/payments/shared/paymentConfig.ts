export type PaymentModuleType = 'sale' | 'purchase';

export const PAYMENT_MODULE_CONFIG = {
  sale: {
    paymentType: 'sale' as const,
    contentType: 'sales',
    ordersEndpoint: 'sales',
    partyEndpoint: 'customers',
    partyParam: 'customer',
    listPath: '/sale-payments',
    addPath: '/sale-payments/add',
    detailPath: (id: number | string) => `/sale-payments/${id}`,
    editPath: (id: number | string) => `/sale-payments/${id}/edit`,
    orderPath: (orderId: number | string) => `/sale-payments/order/${orderId}`,
    orderAddPath: (orderId: number | string) => `/sale-payments/add?sale_id=${orderId}`,
    forOrderEndpoint: (orderId: number | string) => `payments/for_sale/?sale_id=${orderId}`,
    orderQueryParam: 'sale_id',
    queryKey: 'sale-payments',
    icon: 'sale' as const,
  },
  purchase: {
    paymentType: 'purchase' as const,
    contentType: 'rawmaterialpurchase',
    ordersEndpoint: 'raw-material-purchases',
    partyEndpoint: 'vendors',
    partyParam: 'vendor',
    listPath: '/purchase-payments',
    addPath: '/purchase-payments/add',
    detailPath: (id: number | string) => `/purchase-payments/${id}`,
    editPath: (id: number | string) => `/purchase-payments/${id}/edit`,
    orderPath: (orderId: number | string) => `/purchase-payments/order/${orderId}`,
    orderAddPath: (orderId: number | string) =>
      `/purchase-payments/add?purchase_id=${orderId}`,
    forOrderEndpoint: (orderId: number | string) =>
      `payments/for_purchase/?purchase_id=${orderId}`,
    orderQueryParam: 'purchase_id',
    queryKey: 'purchase-payments',
    icon: 'purchase' as const,
  },
};

export const getPaymentConfig = (type: PaymentModuleType = 'sale') =>
  PAYMENT_MODULE_CONFIG[type] || PAYMENT_MODULE_CONFIG.sale;
