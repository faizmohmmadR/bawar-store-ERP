import { formatPayrollPeriod } from '@/lib/calendarDate';
import { useCalendarPreference } from '@/contexts/CalendarPreferenceContext';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useFetchObjects from '@/api/useFetchObjects';
import { useLanguage } from '@/contexts/LanguageContext';
import { EmployeeMoney } from './EmployeeMoney';
import { ListDate } from '@/components/display/ListDate';
import DataTable, { type TableColumn } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Eye, History } from 'lucide-react';
import { usePermissions } from '@/contexts/PermissionContext';
import type { Payroll } from '@/types/payroll';
import type { CurrencyDetails } from '@/lib/currencies';

type HistoryRow = Payroll & { currency_details?: CurrencyDetails };

export function EmployeePayrollHistory({ employeeId }: { employeeId: string }) {
  const { t, language } = useLanguage();
  const { calendar } = useCalendarPreference();
  const navigate = useNavigate();
  const { canView } = usePermissions();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const history = useFetchObjects<{ results: HistoryRow[]; count: number }>({
    queryKey: ['employee-payroll-history', employeeId, String(page), String(pageSize)],
    endpoint: `employees/${employeeId}/payroll_history`, params: { page, page_size: pageSize },
  });
  const columns: TableColumn<HistoryRow>[] = [
    {
      key: 'month',
      title: t('payroll.period'),
      align: 'left',
      className: 'align-top',
      render: (value, row) => {
        const isGoods = row.payment_method === 'goods' || Boolean(row.source_sale);
        const periodLabel = formatPayrollPeriod(
          value,
          row.year,
          row.period_calendar || 'gregorian',
          calendar,
          language,
        );
        return (
          <div className="flex max-w-72 flex-col gap-0.5 py-0 text-start leading-snug">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-medium">{periodLabel}</span>
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-normal">
                {row.payroll_type === 'advance' ? t('payroll.advancePayment') : t('payroll.salaryPayment')}
              </Badge>
              {isGoods && (
                <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-normal">
                  {t('payroll.goodsSettlement', 'Goods')}
                </Badge>
              )}
            </div>
            {row.reference_number && (
              <p className="truncate text-xs text-muted-foreground">
                {t('payroll.referenceNumber', 'Reference number')}: {row.reference_number}
              </p>
            )}
            {row.notes && !(row.reference_number && row.notes.includes(String(row.reference_number))) && (
              <p className="truncate text-xs text-muted-foreground" title={row.notes}>{row.notes}</p>
            )}
          </div>
        );
      },
    },
    {
      key: 'payment_date',
      title: t('payroll.paymentDate'),
      align: 'left',
      className: 'align-middle whitespace-nowrap',
      render: (value) => <ListDate value={value} />,
    },
    {
      key: 'gross_amount',
      title: t('employees.grossPay'),
      align: 'left',
      className: 'align-middle whitespace-nowrap',
      render: (value, row) => (
        <EmployeeMoney
          amount={value ?? Number(row.amount) - Number(row.bonus) - Number(row.overtime) + Number(row.deductions)}
          currency={row.currency_details}
        />
      ),
    },
    {
      key: 'overtime',
      title: t('employees.additions'),
      align: 'left',
      className: 'align-middle whitespace-nowrap',
      render: (_value, row) => (
        <EmployeeMoney amount={Number(row.bonus) + Number(row.overtime)} currency={row.currency_details} />
      ),
    },
    {
      key: 'deductions',
      title: t('payroll.deductions'),
      align: 'left',
      className: 'align-middle whitespace-nowrap',
      render: (value, row) => <EmployeeMoney amount={value} currency={row.currency_details} />,
    },
    {
      key: 'amount',
      title: t('common.paidAmount'),
      align: 'left',
      className: 'align-middle whitespace-nowrap',
      render: (value, row) => (
        <EmployeeMoney amount={value} currency={row.currency_details} className="font-semibold text-primary" />
      ),
    },
  ];
  return (
    <div className="space-y-3">
      {history.isError && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
          <p>{t('employees.payrollLoadError')}</p>
          <Button variant="outline" size="sm" onClick={() => history.refetch()}>{t('employees.retry')}</Button>
        </div>
      )}
      <DataTable
        data={history.data?.results || []}
        columns={columns}
        title={t('employees.payrollHistory')}
        searchable={false}
        subtitle={t('employees.payrollHistoryDescription')}
        icon={<History className="h-5 w-5" />}
        loading={history.isLoading}
        emptyTitle={t('employees.noPayrollHistory')}
        emptyDescription={t('employees.payrollHistoryDescription')}
        maxHeight="auto"
        stickyHeader={false}
        rowActions={canView('payroll') ? [{
          key: 'view',
          label: t('payroll.viewDetails'),
          icon: <Eye className="h-4 w-4" />,
          onClick: (row) => navigate(`/payroll/${row.id}`),
        }] : []}
        pagination={{
          current: page,
          pageSize,
          total: history.data?.count || 0,
          onPageChange: setPage,
          showSizeChanger: true,
          pageSizeOptions: [10, 25, 50],
          onPageSizeChange: (size) => { setPageSize(size); setPage(1); },
        }}
      />
    </div>
  );
}
