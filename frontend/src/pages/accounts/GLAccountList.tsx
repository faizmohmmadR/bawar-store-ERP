import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Plus, Pencil, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CurrencyFilterSelect } from '@/components/forms/CurrencyFilterSelect';
import { STATIC_CURRENCIES } from '@/components/forms/CurrencySelect';
import { useLanguage } from '@/contexts/LanguageContext';
import useFetchObjects from '@/api/useFetchObjects';
import useDelete from '@/api/useDelete';
import { toApiList } from '@/lib/utils';
import DataTable, { TableAction, TableColumn } from '@/components/ui/data-table';
import { FALLBACK_BASE_CODE, FALLBACK_BASE_SYMBOL } from '@/lib/currencies';

type GlAccountTotals = {
  total_debit: number;
  total_credit: number;
  balance: number;
  total_base_debit?: number;
  total_base_credit?: number;
  base_balance?: number;
  line_count?: number;
  currencies?: string[];
  is_mixed_currency?: boolean;
  amount_kind?: 'native' | 'afn_equivalent' | string;
};

type GLAccount = {
  id: number;
  code: string;
  name: string;
  category: string;
  category_display?: string;
  currency?: number | null;
  currency_code?: string;
  is_system: boolean;
  is_active: boolean;
  all_time_totals?: GlAccountTotals;
};

const BASE_CURRENCY_ID = '1';

const GLAccountList = () => {
  const { t, language } = useLanguage();
  const baseSymbol =
    STATIC_CURRENCIES.find((c) => c.id === 1)?.symbol || FALLBACK_BASE_SYMBOL;

  const fmtAmount = (value: number, currencyCode?: string | null) => {
    const amount = Number(value || 0).toLocaleString(language === 'fa' ? 'fa-AF' : 'en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
    if (currencyCode && currencyCode !== FALLBACK_BASE_CODE) {
      return `${amount} ${currencyCode}`;
    }
    return `${baseSymbol}${amount}`;
  };

  const summaryForRow = (row: GLAccount) => {
    const totals = row.all_time_totals;
    const mixed =
      totals?.is_mixed_currency ||
      totals?.amount_kind === 'afn_equivalent' ||
      (totals?.currencies?.length || 0) > 1;
    if (mixed) {
      return {
        debit: totals?.total_base_debit ?? totals?.total_debit ?? 0,
        credit: totals?.total_base_credit ?? totals?.total_credit ?? 0,
        balance: totals?.base_balance ?? totals?.balance ?? 0,
        code: FALLBACK_BASE_CODE,
        mixed: true,
      };
    }
    return {
      debit: totals?.total_debit ?? 0,
      credit: totals?.total_credit ?? 0,
      balance: totals?.balance ?? 0,
      code: row.currency_code || FALLBACK_BASE_CODE,
      mixed: false,
    };
  };
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [currencyFilter, setCurrencyFilter] = useState(BASE_CURRENCY_ID);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const currencyParam = useMemo(() => {
    if (!currencyFilter || currencyFilter === 'all') return 'all';
    return currencyFilter;
  }, [currencyFilter]);

  const { data: raw, isLoading } = useFetchObjects<{
    results: GLAccount[];
    count: number;
    next: string | null;
    previous: string | null;
  }>({
    queryKey: [
      'gl-accounts-list',
      currentPage.toString(),
      pageSize.toString(),
      searchTerm,
      categoryFilter,
      currencyParam,
    ],
    endpoint: 'gl-accounts/',
    params: {
      page: currentPage,
      page_size: pageSize,
      ...(searchTerm ? { search: searchTerm } : {}),
      ...(categoryFilter !== 'all' ? { category: categoryFilter } : {}),
      currency: currencyParam,
    },
  });

  const { handleDelete, ConfirmDialog } = useDelete({
    queryKey: ['gl-accounts-list', 'gl-accounts'],
    endpoint: 'gl-accounts',
  });

  const accounts = raw?.results ?? toApiList<GLAccount>(raw);
  const totalItems = raw?.count ?? accounts.length;

  const columns: TableColumn[] = [
    { key: 'code', title: t('accounts.glCode', 'Code'), width: '4.5rem', className: 'whitespace-nowrap' },
    {
      key: 'name',
      title: t('accounts.glName', 'Account Name'),
      width: '11rem',
      className: 'max-w-[11rem]',
      render: (value) => <span className="block truncate" title={value || '—'}>{value || '—'}</span>,
    },
    {
      key: 'currency_code',
      title: t('accounts.currency', 'Currency'),
      width: '7rem',
      className: 'whitespace-nowrap',
      render: (value, row: GLAccount) => {
        const summary = summaryForRow(row);
        const code =
          value || (row.currency === 1 || row.currency == null ? 'AFN' : String(row.currency));
        const symbol =
          STATIC_CURRENCIES.find((c) => c.code === code || c.id === row.currency)?.symbol || '';
        return (
          <div className="inline-flex items-center gap-1.5 flex-nowrap whitespace-nowrap">
            <Badge variant="outline" className="shrink-0">
              {symbol ? `${symbol} ${code}` : code}
            </Badge>
            {summary.mixed && (
              <Badge variant="secondary" className="shrink-0">
                {t('accounts.mixedCurrencies', 'Mixed')}
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      key: 'category',
      title: t('accounts.glCategory', 'Category'),
      width: '7rem',
      className: 'max-w-[7rem]',
      render: (_, row: GLAccount) => {
        const label = row.category_display || row.category;
        return <Badge variant="outline" className="max-w-full truncate" title={label}>{label}</Badge>;
      },
    },
    {
      key: 'total_debit',
      title: t('accounts.totalDebit', 'Total Debit'),
      width: '7.5rem',
      className: 'whitespace-nowrap',
      render: (_, row: GLAccount) => {
        const summary = summaryForRow(row);
        return (
          <span className="font-mono text-sm tabular-nums">
            {fmtAmount(summary.debit, summary.code)}
          </span>
        );
      },
    },
    {
      key: 'total_credit',
      title: t('accounts.totalCredit', 'Total Credit'),
      width: '7.5rem',
      className: 'whitespace-nowrap',
      render: (_, row: GLAccount) => {
        const summary = summaryForRow(row);
        return (
          <span className="font-mono text-sm tabular-nums text-primary">
            {fmtAmount(summary.credit, summary.code)}
          </span>
        );
      },
    },
    {
      key: 'balance',
      title: t('accounts.balance', 'Balance'),
      width: '7.5rem',
      className: 'whitespace-nowrap',
      render: (_, row: GLAccount) => {
        const summary = summaryForRow(row);
        const balance = summary.balance;
        return (
          <span
            className={`font-mono text-sm font-medium tabular-nums ${
              balance === 0 ? 'text-muted-foreground' : balance > 0 ? 'text-foreground' : 'text-red-600'
            }`}
          >
            {fmtAmount(balance, summary.code)}
          </span>
        );
      },
    },
    {
      key: 'is_system',
      title: t('common.type'),
      width: '5.5rem',
      className: 'max-w-[5.5rem]',
      render: (value: boolean) => (
        <Badge variant={value ? 'secondary' : 'outline'}>
          {value ? t('accounts.systemAccount', 'System') : t('accounts.customAccount', 'Custom')}
        </Badge>
      ),
    },
    {
      key: 'is_active',
      title: t('common.status'),
      width: '5rem',
      className: 'max-w-[5rem]',
      render: (value: boolean) => (
        <Badge variant={value ? 'default' : 'destructive'}>
          {value ? t('common.active') : t('common.inactive')}
        </Badge>
      ),
    },
  ];

  const actions: TableAction[] = [
    {
      key: 'view',
      label: t('accounts.viewDetails'),
      icon: <BookOpen className="h-4 w-4" />,
      onClick: (row: GLAccount) => navigate(`/gl-accounts/${row.id}`),
    },
    {
      key: 'edit',
      label: t('common.edit'),
      icon: <Pencil className="h-4 w-4" />,
      onClick: (row: GLAccount) => navigate(`/gl-accounts/${row.id}/edit`),
    },
    {
      key: 'delete',
      label: t('common.delete'),
      icon: <Trash2 className="h-4 w-4" />,
      onClick: (row: GLAccount) => {
        if (!row.is_system) handleDelete(row.id);
      },
      variant: 'ghost',
      className: 'text-red-600 hover:text-red-700',
      show: (row: GLAccount) => !row.is_system,
    },
  ];

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <DataTable
        data={accounts}
        columns={columns}
        loading={isLoading}
        title={t('accounts.chartOfAccounts', 'Chart of Accounts')}
        subtitle={t(
          'accounts.chartOfAccountsDesc',
          'Cash, Bank, and Sarafi are currency-specific. Other GLs are one per branch (AFN chart); transaction currency lives on journal lines.',
        )}
        icon={<BookOpen className="h-5 w-5" />}
        headerActions={
          <Button onClick={() => navigate('/gl-accounts/add')}>
            <Plus className="h-4 w-4" />
            {t('accounts.addGlAccount', 'Add Account')}
          </Button>
        }
        searchable
        searchPlaceholder={t('accounts.searchGlAccounts', 'Search accounts...')}
        searchValue={searchTerm}
        onSearch={(value) => {
          setSearchTerm(value);
          setCurrentPage(1);
        }}
        pagination={{
          current: currentPage,
          pageSize,
          total: totalItems,
          onPageChange: setCurrentPage,
          showSizeChanger: true,
          pageSizeOptions: [10, 25, 50, 100],
          onPageSizeChange: (size) => {
            setPageSize(size);
            setCurrentPage(1);
          },
        }}
        customFilters={[
          {
            key: 'currency',
            label: t('accounts.currency', 'Currency'),
            component: (
              <div className="w-[160px]">
                <CurrencyFilterSelect
                  value={currencyFilter}
                  onChange={(value) => {
                    setCurrencyFilter(value || BASE_CURRENCY_ID);
                    setCurrentPage(1);
                  }}
                />
              </div>
            ),
          },
          {
            key: 'category',
            label: t('accounts.filterByCategory', 'Category'),
            component: (
              <Select
                value={categoryFilter}
                onValueChange={(value) => {
                  setCategoryFilter(value);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder={t('accounts.filterByCategory', 'Filter by category')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('common.all')}</SelectItem>
                  <SelectItem value="asset">Asset</SelectItem>
                  <SelectItem value="liability">Liability</SelectItem>
                  <SelectItem value="equity">Equity</SelectItem>
                  <SelectItem value="revenue">Revenue</SelectItem>
                  <SelectItem value="expense">Expense</SelectItem>
                </SelectContent>
              </Select>
            ),
          },
        ]}
        rowActions={actions}
        emptyIcon={<BookOpen className="h-8 w-8 text-muted-foreground" />}
        emptyTitle={t('accounts.noGlAccounts', 'No GL accounts found')}
        emptyDescription={t(
          'accounts.addFirstGlAccount',
          'Add your first account or initialize defaults in Settings',
        )}
        onRowClick={(row: GLAccount) => navigate(`/gl-accounts/${row.id}`)}
        maxHeight="75vh"
        stickyHeader
      />

      <ConfirmDialog />
    </div>
  );
};

export default GLAccountList;
