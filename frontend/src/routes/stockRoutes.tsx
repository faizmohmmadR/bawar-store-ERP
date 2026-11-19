import ReturnedForPacking from '@/pages/stock/ReturnedForPacking';
import BottleDamageHistory from '@/pages/stock/BottleDamageHistory';
import { Navigate, Route } from 'react-router-dom';
import StockList from '@/pages/stock/StockList';
import StockReportPage from '@/pages/stock/StockReportPage';
import ExpiringStockList from '@/pages/stock/ExpiringStockList';
import LowStockList from '@/pages/stock/LowStockList';
import AddMaterialStock from '@/pages/stock/AddMaterialStock';
import EditStock from '@/pages/stock/EditStock';
import StockDetails from '@/pages/stock/StockDetails';

export const stockRoutes = (
  <>
    <Route path="stock" element={<StockList />} />
    <Route path="stock/report" element={<StockReportPage />} />
    <Route path="stock/returned-for-packing" element={<ReturnedForPacking />} />
    <Route path="stock/bottle-damages" element={<BottleDamageHistory />} />
    <Route path="stock/expiring" element={<ExpiringStockList />} />
    <Route path="stock/low-stock" element={<LowStockList />} />
    <Route path="stock/damaged/*" element={<Navigate to="/damaged" replace />} />
    <Route path="stock/add-material" element={<AddMaterialStock />} />
    <Route path="stock/add" element={<Navigate to="/stock/add-material" replace />} />
    <Route path="stock/:id" element={<StockDetails />} />
    <Route path="stock/:id/edit" element={<EditStock />} />
  </>
);
