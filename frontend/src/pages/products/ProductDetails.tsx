import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, Edit, Package, Barcode, FileText } from 'lucide-react';
import useFetchObjects from '@/api/useFetchObjects';
import { useLanguage } from '@/contexts/LanguageContext';

const ProductDetails = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  
  const getIdFromPath = () => {
    const pathParts = location.pathname.split('/').filter(Boolean);
    if (pathParts.length >= 2 && !isNaN(Number(pathParts[1]))) {
      return pathParts[1];
    }
    return null;
  };
  
  const id = getIdFromPath();

  const { data: productData, isLoading } = useFetchObjects({
    queryKey: ['product', id],
    endpoint: `products/${id}`,
    enabled: !!id
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!productData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Package className="h-16 w-16 mx-auto mb-4 text-gray-400" />
          <h2 className="text-xl font-semibold mb-2">{t('products.notFound', 'Product Not Found')}</h2>
          <Button onClick={() => navigate('/products')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('products.backToProducts', 'Back to Products')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      <div className="bg-white border-b sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => navigate('/products')}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{productData.name}</h1>
                {productData.barcode && (
                  <p className="text-sm text-gray-600">{productData.barcode}</p>
                )}
              </div>
            </div>
            <Button onClick={() => navigate(`/products/${id}/edit`)} size="sm">
              <Edit className="h-4 w-4 mr-2" />
              {t('common.edit')}
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card>
              <div className="p-4 border-b bg-gray-50">
                <h2 className="font-semibold flex items-center gap-2">
                  <Package className="h-5 w-5 text-primary" />
                  {t('products.productInformation', 'Product Information')}
                </h2>
              </div>
              <CardContent className="p-6 space-y-6">
                {productData.image && (
                  <img
                    src={productData.image}
                    alt={productData.name}
                    className="h-40 w-40 rounded-lg border object-cover"
                  />
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase mb-2">{t('products.productName')}</p>
                    <p className="font-semibold text-gray-900 text-lg">{productData.name}</p>
                  </div>

                  {productData.barcode && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase mb-2 flex items-center gap-1">
                        <Barcode className="h-3 w-3" />
                        {t('products.barcode')}
                      </p>
                      <Badge variant="outline" className="font-mono text-sm px-3 py-1">
                        {productData.barcode}
                      </Badge>
                    </div>
                  )}
                </div>

                {productData.description && (
                  <div className="pt-4 border-t">
                    <p className="text-xs font-medium text-gray-500 uppercase mb-2 flex items-center gap-1">
                      <FileText className="h-3 w-3" />
                      {t('products.description')}
                    </p>
                    <p className="text-gray-700 leading-relaxed">{productData.description}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div>
            <Card>
              <div className="p-4 border-b bg-gray-50">
                <h2 className="font-semibold">{t('products.quickActions', 'Quick Actions')}</h2>
              </div>
              <CardContent className="p-4 space-y-3">
                <Button 
                  onClick={() => navigate(`/products/${id}/edit`)} 
                  className="w-full justify-start"
                  variant="outline"
                >
                  <Edit className="h-4 w-4 mr-2" />
                  {t('products.editProduct')}
                </Button>
                <Button 
                  onClick={() => navigate('/products')} 
                  className="w-full justify-start"
                  variant="outline"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  {t('products.backToProducts', 'Back to Products')}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductDetails;
