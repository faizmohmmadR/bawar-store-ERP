import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Edit, Package, Barcode, FileText } from 'lucide-react';
import useFetchObjects from '@/api/useFetchObjects';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatOrderNumeric } from '@/lib/orderNumeric';

const ProductDetails = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  const getIdFromPath = () => {
    const pathParts = location.pathname.split('/').filter(Boolean);
    if (pathParts.length >= 2 && !Number.isNaN(Number(pathParts[1]))) {
      return pathParts[1];
    }
    return null;
  };

  const id = getIdFromPath();

  const { data: productData, isLoading } = useFetchObjects({
    queryKey: ['product', id],
    endpoint: `products/${id}`,
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  if (!productData) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <Package className="mx-auto mb-4 h-16 w-16 text-muted-foreground" />
          <h2 className="mb-2 text-xl font-semibold">{t('products.notFound', 'Product Not Found')}</h2>
          <Button onClick={() => navigate('/products')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('products.backToProducts', 'Back to Products')}
          </Button>
        </div>
      </div>
    );
  }

  const packagings = productData.packagings || [];
  const baseUom =
    productData.base_uom_details?.symbol
    || productData.base_uom_details?.name
    || productData.base_uom
    || '—';

  return (
    <div className="min-h-screen bg-muted/20 pb-8">
      <div className="sticky top-0 z-10 border-b bg-background shadow-sm">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => navigate('/products')}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-xl font-bold sm:text-2xl">{productData.name}</h1>
                <p className="text-sm text-muted-foreground">
                  {t('products.baseUom', 'Base UOM')}: {baseUom}
                  {productData.sku ? ` · SKU ${productData.sku}` : ''}
                </p>
              </div>
            </div>
            <Button onClick={() => navigate(`/products/${id}/edit`)} size="sm">
              <Edit className="mr-2 h-4 w-4" />
              {t('common.edit')}
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto mt-6 max-w-7xl space-y-6 px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <div className="border-b bg-muted/30 p-4">
                <h2 className="flex items-center gap-2 font-semibold">
                  <Package className="h-5 w-5 text-primary" />
                  {t('products.productInformation', 'Product Information')}
                </h2>
              </div>
              <CardContent className="space-y-6 p-6">
                {productData.image || productData.image_url ? (
                  <img
                    src={productData.image || productData.image_url}
                    alt={productData.name}
                    className="h-40 w-40 rounded-lg border object-cover"
                  />
                ) : null}
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                      {t('products.productName')}
                    </p>
                    <p className="text-lg font-semibold">{productData.name}</p>
                  </div>
                  {productData.barcode ? (
                    <div>
                      <p className="mb-2 flex items-center gap-1 text-xs font-medium uppercase text-muted-foreground">
                        <Barcode className="h-3 w-3" />
                        {t('products.barcode')}
                      </p>
                      <Badge variant="outline" className="px-3 py-1 font-mono text-sm">
                        {productData.barcode}
                      </Badge>
                    </div>
                  ) : null}
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                      {t('products.baseUom', 'Base UOM')}
                    </p>
                    <p className="font-medium">{baseUom}</p>
                  </div>
                  {productData.brand ? (
                    <div>
                      <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                        {t('products.brand', 'Brand')}
                      </p>
                      <p className="font-medium">{productData.brand}</p>
                    </div>
                  ) : null}
                </div>
                {productData.description ? (
                  <div className="border-t pt-4">
                    <p className="mb-2 flex items-center gap-1 text-xs font-medium uppercase text-muted-foreground">
                      <FileText className="h-3 w-3" />
                      {t('products.description')}
                    </p>
                    <p className="leading-relaxed text-muted-foreground">{productData.description}</p>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <div className="border-b bg-muted/30 p-4">
                <h2 className="font-semibold">{t('products.packagingUnits', 'Packaging / units')}</h2>
              </div>
              <CardContent className="p-0">
                {packagings.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('products.unitName', 'Unit')}</TableHead>
                        <TableHead>{t('products.qtyInBase', 'Qty in base')}</TableHead>
                        <TableHead>{t('products.barcode', 'Barcode')}</TableHead>
                        <TableHead>{t('products.flags', 'Flags')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {packagings.map((pack: any) => (
                        <TableRow key={pack.id}>
                          <TableCell className="font-medium">{pack.name}</TableCell>
                          <TableCell className="tabular-nums">
                            {formatOrderNumeric(Number(pack.qty_in_base) || 0)}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{pack.barcode || '—'}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {pack.is_base ? <Badge variant="secondary">{t('products.base', 'Base')}</Badge> : null}
                              {pack.for_purchase ? <Badge variant="outline">{t('products.buy', 'Buy')}</Badge> : null}
                              {pack.for_sale ? <Badge variant="outline">{t('products.sell', 'Sell')}</Badge> : null}
                              {pack.is_default_purchase ? (
                                <Badge variant="outline">{t('products.defBuy', 'Def buy')}</Badge>
                              ) : null}
                              {pack.is_default_sale ? (
                                <Badge variant="outline">{t('products.defSell', 'Def sell')}</Badge>
                              ) : null}
                              {pack.is_variable_weight ? (
                                <Badge variant="outline">{t('products.varWeight', 'Var wt')}</Badge>
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="p-6 text-sm text-muted-foreground">
                    {t('products.noPackagings', 'No packaging units configured')}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <div>
            <Card>
              <div className="border-b bg-muted/30 p-4">
                <h2 className="font-semibold">{t('products.quickActions', 'Quick Actions')}</h2>
              </div>
              <CardContent className="space-y-3 p-4">
                <Button
                  onClick={() => navigate(`/products/${id}/edit`)}
                  className="w-full justify-start"
                  variant="outline"
                >
                  <Edit className="mr-2 h-4 w-4" />
                  {t('products.editProduct')}
                </Button>
                <Button
                  onClick={() => navigate('/products')}
                  className="w-full justify-start"
                  variant="outline"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
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
