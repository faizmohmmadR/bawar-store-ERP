import { Route } from 'react-router-dom';
import StockList from '@/pages/stock/StockList';
import StockReportPage from '@/pages/stock/StockReportPage';
import ExpiringStockList from '@/pages/stock/ExpiringStockList';
import LowStockList from '@/pages/stock/LowStockList';
import DamagedStockList from '@/pages/stock/DamagedStockList';
import AddDamagedStock from '@/pages/stock/AddDamagedStock';
import EditStock from '@/pages/stock/EditStock';
import StockDetails from '@/pages/stock/StockDetails';

export const stockRoutes = (
  <>
    <Route path="stock" element={<StockList />} />
    <Route path="stock/report" element={<StockReportPage />} />
    <Route path="stock/expiring" element={<ExpiringStockList />} />
    <Route path="stock/low-stock" element={<LowStockList />} />
    <Route path="stock/damaged" element={<DamagedStockList />} />
    <Route path="stock/damaged/add" element={<AddDamagedStock />} />
    <Route path="stock/:id" element={<StockDetails />} />
    <Route path="stock/:id/edit" element={<EditStock />} />
  </>
);