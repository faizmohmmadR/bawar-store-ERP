import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useLanguage } from '@/contexts/LanguageContext';
import { useFormatAppDate } from '@/hooks/useFormatAppDate';
import useFetchObjects from '@/api/useFetchObjects';
import { 
  DollarSign, 
  Users, 
  Truck, 
  ArrowDownLeft, 
  ArrowUpRight,
} from 'lucide-react';
import { getLoanScenarioDescription } from '@/lib/loanUtils';
import { formatLoanMoney } from '@/lib/loanFormat';

// Loan Scenarios:
// 1. Customer Receivable: من به مشتری قرض دادم (loan_out to customer)
// 2. Customer Payable: مشتری به من قرض داد (loan_in from customer)
// 3. Vendor Receivable: من به ویندور قرض دادم (loan_out to vendor)
// 4. Vendor Payable: ویندور به من قرض داد (loan_in from vendor)

const LoanManagement = () => {
  const { t } = useLanguage();
  const { formatDate } = useFormatAppDate();
  const [activeTab, setActiveTab] = useState('customer_receivable');

  const { data: summaryData } = useFetchObjects({
    queryKey: ['loan-summary'],
    endpoint: 'loans/summary/',
  });

  const { data: loansData } = useFetchObjects<{ results: any[] }>({
    queryKey: ['loans-all'],
    endpoint: 'loans/',
    params: { page_size: 1000 },
  });

  const loans = loansData?.results || [];

  // Categorize loans
  const customerReceivables = loans.filter(
    l => l.loaner_details?.loaner_type === 'customer' && l.loan_type === 'loan_out'
  );
  const customerPayables = loans.filter(
    l => l.loaner_details?.loaner_type === 'customer' && l.loan_type === 'loan_in'
  );
  const vendorReceivables = loans.filter(
    l => l.loaner_details?.loaner_type === 'vendor' && l.loan_type === 'loan_out'
  );
  const vendorPayables = loans.filter(
    l => l.loaner_details?.loaner_type === 'vendor' && l.loan_type === 'loan_in'
  );

  const calculateTotals = (loanList: any[]) => {
    const total = loanList.reduce((sum, l) => sum + Number(l.amount), 0);
    const unpaid = loanList.filter(l => !l.is_paid).reduce((sum, l) => sum + Number(l.amount), 0);
    const paid = loanList.reduce((sum, l) => sum + Number(l.amount_paid || 0), 0);
    return { total, unpaid, paid, count: loanList.length };
  };

  const stats = {
    customer_receivable: calculateTotals(customerReceivables),
    customer_payable: calculateTotals(customerPayables),
    vendor_receivable: calculateTotals(vendorReceivables),
    vendor_payable: calculateTotals(vendorPayables),
  };

  const StatCard = ({ title, icon: Icon, total, unpaid, paid, count, color }: any) => (
    <Card className="relative overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Icon className={`h-4 w-4 ${color}`} />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-2xl font-bold">{formatLoanMoney(total, null)}</span>
            <Badge variant="outline">{count} {t('loans.loansCount')}</Badge>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="text-red-600">
              <span className="text-xs block">{t('loans.unpaid')}</span>
              <span className="font-semibold">{formatLoanMoney(unpaid, null)}</span>
            </div>
            <div className="text-primary">
              <span className="text-xs block">{t('loans.paid')}</span>
              <span className="font-semibold">{formatLoanMoney(paid, null)}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('loans.loanManagement')}</h1>
          <p className="text-muted-foreground">{t('loans.manageAllLoans')}</p>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title={t('loans.customerReceivable')}
          icon={ArrowUpRight}
          total={stats.customer_receivable.total}
          unpaid={stats.customer_receivable.unpaid}
          paid={stats.customer_receivable.paid}
          count={stats.customer_receivable.count}
          color="text-orange-500"
        />
        <StatCard
          title={t('loans.customerPayable')}
          icon={ArrowDownLeft}
          total={stats.customer_payable.total}
          unpaid={stats.customer_payable.unpaid}
          paid={stats.customer_payable.paid}
          count={stats.customer_payable.count}
          color="text-primary"
        />
        <StatCard
          title={t('loans.vendorReceivable')}
          icon={ArrowUpRight}
          total={stats.vendor_receivable.total}
          unpaid={stats.vendor_receivable.unpaid}
          paid={stats.vendor_receivable.paid}
          count={stats.vendor_receivable.count}
          color="text-orange-500"
        />
        <StatCard
          title={t('loans.vendorPayable')}
          icon={ArrowDownLeft}
          total={stats.vendor_payable.total}
          unpaid={stats.vendor_payable.unpaid}
          paid={stats.vendor_payable.paid}
          count={stats.vendor_payable.count}
          color="text-primary"
        />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="customer_receivable" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            {t('loans.customersOweMe')}
          </TabsTrigger>
          <TabsTrigger value="customer_payable" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            {t('loans.iOweCustomers')}
          </TabsTrigger>
          <TabsTrigger value="vendor_receivable" className="flex items-center gap-2">
            <Truck className="h-4 w-4" />
            {t('loans.vendorsOweMe')}
          </TabsTrigger>
          <TabsTrigger value="vendor_payable" className="flex items-center gap-2">
            <Truck className="h-4 w-4" />
            {t('loans.iOweVendors')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="customer_receivable" className="mt-4">
          <LoanListByScenario 
            loans={customerReceivables} 
            loanerType="customer"
            loanType="loan_out"
            title={t('loans.customersOweMe')}
          />
        </TabsContent>

        <TabsContent value="customer_payable" className="mt-4">
          <LoanListByScenario 
            loans={customerPayables} 
            loanerType="customer"
            loanType="loan_in"
            title={t('loans.iOweCustomers')}
          />
        </TabsContent>

        <TabsContent value="vendor_receivable" className="mt-4">
          <LoanListByScenario 
            loans={vendorReceivables} 
            loanerType="vendor"
            loanType="loan_out"
            title={t('loans.vendorsOweMe')}
          />
        </TabsContent>

        <TabsContent value="vendor_payable" className="mt-4">
          <LoanListByScenario 
            loans={vendorPayables} 
            loanerType="vendor"
            loanType="loan_in"
            title={t('loans.iOweVendors')}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

const LoanListByScenario = ({
  loans,
  loanerType,
  loanType,
  title,
}: {
  loans: any[];
  loanerType: string;
  loanType: string;
  title: string;
}) => {
  const { t } = useLanguage();
  const description = getLoanScenarioDescription(loanerType, loanType, t);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {description} · {loans.length} {t('loans.loanRecords')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {loans.map((loan: any) => (
            <div key={loan.id} className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex-1">
                <div className="font-medium">{loan.loaner_details?.name}</div>
                <div className="text-sm text-muted-foreground">
                  {formatDate(loan.loan_date)}
                </div>
              </div>
              <div className="text-right">
                <div className="font-bold text-lg">
                  {formatLoanMoney(loan.amount, loan)}
                </div>
                <div className="flex items-center gap-2">
                  {loan.is_paid ? (
                    <Badge className="bg-primary/15 text-primary">{t('loans.paid')}</Badge>
                  ) : (
                    <>
                      <Badge className="bg-red-100 text-red-700">{t('loans.unpaid')}</Badge>
                      <span className="text-sm text-muted-foreground">
                        {formatLoanMoney(loan.balance_due, loan)} {t('loans.balanceRemaining')}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
          {loans.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              {t('loans.noLoansFound')}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default LoanManagement;
