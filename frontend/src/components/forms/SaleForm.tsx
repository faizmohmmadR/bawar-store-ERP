import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePickerInput } from '@/components/ui/date-picker-input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLanguage } from '@/contexts/LanguageContext';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2 } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface FormFieldProps {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  error?: string;
}

const FormField: React.FC<FormFieldProps> = ({ label, children, required, error }) => (
  <div className="space-y-2">
    <Label className="text-sm font-medium text-foreground">
      {label}
      {required && <span className="text-destructive ml-1">*</span>}
    </Label>
    {children}
    {error && <p className="text-sm text-destructive">{error}</p>}
  </div>
);

interface SaleItem {
  productId: string;
  productName: string;
  quantity: number;
  sellPrice: number;
  total: number;
}

interface Sale {
  id?: string;
  invoiceNumber: string;
  customerId: string;
  customerName?: string;
  saleDate: string;
  status: 'draft' | 'confirmed' | 'delivered' | 'cancelled';
  discountAmount: number;
  totalAmount: number;
  paidAmount: number;
  notes: string;
  items: SaleItem[];
}

interface Customer {
  id: string;
  name: string;
}

interface Product {
  id: string;
  name: string;
  sellPrice: number;
  stock: number;
}

interface SaleFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (sale: Sale) => void;
  sale?: Sale | null;
  customers: Customer[];
  products: Product[];
}

export const SaleForm: React.FC<SaleFormProps> = ({
  isOpen,
  onClose,
  onSave,
  sale,
  customers,
  products
}) => {
  const { t } = useLanguage();
  const [formData, setFormData] = useState<Sale>({
    invoiceNumber: `INV-${Date.now()}`,
    customerId: '',
    saleDate: new Date().toISOString().split('T')[0],
    status: 'draft',
    discountAmount: 0,
    totalAmount: 0,
    paidAmount: 0,
    notes: '',
    items: [],
    ...sale
  });

  const [errors, setErrors] = useState<any>({});
  const [newItem, setNewItem] = useState({
    productId: '',
    quantity: 1,
    sellPrice: 0
  });

  const statusOptions = [
    { value: 'draft', label: 'Draft' },
    { value: 'confirmed', label: 'Confirmed' },
    { value: 'delivered', label: 'Delivered' },
    { value: 'cancelled', label: 'Cancelled' }
  ];

  const calculateTotal = (items: SaleItem[], discountAmount: number = 0) => {
    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    return subtotal - discountAmount;
  };

  const addItem = () => {
    if (!newItem.productId || newItem.quantity <= 0) return;

    const product = products.find(p => p.id === newItem.productId);
    if (!product) return;

    const item: SaleItem = {
      productId: newItem.productId,
      productName: product.name,
      quantity: newItem.quantity,
      sellPrice: newItem.sellPrice || product.sellPrice,
      total: newItem.quantity * (newItem.sellPrice || product.sellPrice)
    };

    const updatedItems = [...formData.items, item];
    const totalAmount = calculateTotal(updatedItems, formData.discountAmount);

    setFormData(prev => ({
      ...prev,
      items: updatedItems,
      totalAmount
    }));

    setNewItem({ productId: '', quantity: 1, sellPrice: 0 });
  };

  const removeItem = (index: number) => {
    const updatedItems = formData.items.filter((_, i) => i !== index);
    const totalAmount = calculateTotal(updatedItems, formData.discountAmount);

    setFormData(prev => ({
      ...prev,
      items: updatedItems,
      totalAmount
    }));
  };

  const handleChange = (field: keyof Sale, value: any) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value };
      
      if (field === 'discountAmount') {
        updated.totalAmount = calculateTotal(prev.items, value);
      }
      
      return updated;
    });

    if (errors[field]) {
      setErrors((prev: any) => ({ ...prev, [field]: undefined }));
    }
  };

  const validateForm = (): boolean => {
    const newErrors: any = {};

    if (!formData.customerId) {
      newErrors.customerId = t('validation.required');
    }
    if (formData.items.length === 0) {
      newErrors.items = 'At least one item is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = () => {
    if (validateForm()) {
      const customerName = customers.find(c => c.id === formData.customerId)?.name;
      onSave({ ...formData, customerName });
      onClose();
    }
  };

  const selectedProduct = products.find(p => p.id === newItem.productId);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">
            {sale ? t('sales.editSale') : t('sales.addSale')}
          </DialogTitle>
          <DialogDescription>
            Create a new sale order with customer and product details.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Sale Header */}
          <Card>
            <CardHeader>
              <CardTitle>Sale Information</CardTitle>
            </CardHeader>
            <CardContent className="form-grid">
              <FormField
                label={t('sales.invoiceNumber')}
                required
              >
                <Input
                  value={formData.invoiceNumber}
                  onChange={(e) => handleChange('invoiceNumber', e.target.value)}
                  placeholder="INV-001"
                />
              </FormField>

              <FormField
                label={t('sales.customer')}
                required
                error={errors.customerId}
              >
                <Select
                  value={formData.customerId}
                  onValueChange={(value) => handleChange('customerId', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>

              <FormField label={t('sales.saleDate')}>
                <DatePickerInput
                  value={formData.saleDate}
                  onChange={(value) => handleChange('saleDate', value)}
                />
              </FormField>

              <FormField label={t('sales.status')}>
                <Select
                  value={formData.status}
                  onValueChange={(value) => handleChange('status', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((status) => (
                      <SelectItem key={status.value} value={status.value}>
                        {status.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            </CardContent>
          </Card>

          {/* Add Item Section */}
          <Card>
            <CardHeader>
              <CardTitle>Add Product</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <FormField label="Product">
                  <Select
                    value={newItem.productId}
                    onValueChange={(value) => {
                      const product = products.find(p => p.id === value);
                      setNewItem(prev => ({
                        ...prev,
                        productId: value,
                        sellPrice: product?.sellPrice || 0
                      }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select product" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((product) => (
                        <SelectItem key={product.id} value={product.id}>
                          {product.name} (Stock: {product.stock})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>

                <FormField label="Quantity">
                  <Input
                    type="number"
                    min="1"
                    max={selectedProduct?.stock || 999}
                    value={newItem.quantity}
                    onChange={(e) => setNewItem(prev => ({
                      ...prev,
                      quantity: parseInt(e.target.value) || 1
                    }))}
                  />
                </FormField>

                <FormField label="Unit Price">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newItem.sellPrice}
                    onChange={(e) => setNewItem(prev => ({
                      ...prev,
                      sellPrice: parseFloat(e.target.value) || 0
                    }))}
                  />
                </FormField>

                <Button onClick={addItem} disabled={!newItem.productId}>
                  <Plus size={16} />
                  Add Item
                </Button>
              </div>

              {selectedProduct && (
                <div className="mt-3 p-3 bg-muted/50 rounded-lg">
                  <p className="text-sm">
                    <strong>Available Stock:</strong> {selectedProduct.stock} units |
                    <strong> Suggested Price:</strong> ${selectedProduct.sellPrice} |
                    <strong> Total:</strong> ${(newItem.quantity * newItem.sellPrice).toFixed(2)}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Items Table */}
          {formData.items.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Sale Items</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Unit Price</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {formData.items.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell>{item.productName}</TableCell>
                        <TableCell>{item.quantity}</TableCell>
                        <TableCell>${item.sellPrice.toFixed(2)}</TableCell>
                        <TableCell>${item.total.toFixed(2)}</TableCell>
                        <TableCell>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => removeItem(index)}
                          >
                            <Trash2 size={16} />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {errors.items && (
                  <p className="text-sm text-destructive mt-2">{errors.items}</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Totals */}
          <Card>
            <CardHeader>
              <CardTitle>Sale Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField label="Discount Amount">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.discountAmount}
                    onChange={(e) => handleChange('discountAmount', parseFloat(e.target.value) || 0)}
                  />
                </FormField>

                <FormField label={t('sales.paidAmount')}>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max={formData.totalAmount}
                    value={formData.paidAmount}
                    onChange={(e) => handleChange('paidAmount', parseFloat(e.target.value) || 0)}
                  />
                </FormField>

                <div className="space-y-2">
                  <Label>Payment Status</Label>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-lg font-semibold">
                      Total: ${formData.totalAmount.toFixed(2)}
                    </p>
                    <Badge variant={
                      formData.paidAmount === 0 ? 'destructive' :
                      formData.paidAmount >= formData.totalAmount ? 'default' : 'secondary'
                    }>
                      {formData.paidAmount === 0 ? 'Unpaid' :
                       formData.paidAmount >= formData.totalAmount ? 'Paid' : 'Partial'}
                    </Badge>
                  </div>
                </div>
              </div>

              <FormField label="Notes">
                <Input
                  value={formData.notes}
                  onChange={(e) => handleChange('notes', e.target.value)}
                  placeholder="Add any notes for this sale"
                />
              </FormField>
            </CardContent>
          </Card>
        </div>

        <DialogFooter className="gap-3">
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave}>
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};