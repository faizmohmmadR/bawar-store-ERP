import { Route } from 'react-router-dom';
import ProductList from '@/pages/products/ProductList';
import AddProduct from '@/pages/products/AddProduct';
import EditProduct from '@/pages/products/EditProduct';
import ProductDetails from '@/pages/products/ProductDetails';

export const productRoutes = (
  <>
    <Route path="products" element={<ProductList />} />
    <Route path="products/add" element={<AddProduct />} />
    <Route path="products/:id" element={<ProductDetails />} />
    <Route path="products/:id/edit" element={<EditProduct />} />
  </>
);
