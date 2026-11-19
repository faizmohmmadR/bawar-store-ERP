import React, { ReactNode, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, X, MoreHorizontal } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useFormatAppDate } from '@/hooks/useFormatAppDate';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface TableColumn<T = any> {
  key: string;
  title: string;
  render?: (value: any, record: T, index: number) => ReactNode;
  sortable?: boolean;
  width?: string;
  align?: 'left' | 'center' | 'right';
  className?: string;
}

export interface TableAction<T = any> {
  key: string;
  label: string;
  icon?: ReactNode;
  onClick: (record: T) => void;
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  className?: string;
  tooltip?: string;
  show?: (record: T) => boolean;
}

export interface FilterOption {
  key: string;
  label: string;
  placeholder: string;
  options: { value: string; label: string }[];
  width?: string;
}



export interface CustomFilter {
  key: string;
  label: string;
  width?: string;
  component: ReactNode;
}

export interface DataTableProps<T = any> {
  data: T[];
  columns: TableColumn<T>[];
  loading?: boolean;
  title?: string;
  subtitle?: string;
  icon?: ReactNode;
  headerActions?: ReactNode;
  searchable?: boolean;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearch?: (value: string) => void;
  filters?: FilterOption[];
  customFilters?: CustomFilter[];
  singleRowFilters?: boolean;
  filterValues?: Record<string, string>;
  customFilterValues?: Record<string, string>;
  onFilterChange?: (key: string, value: string) => void;
  showClearFilters?: boolean;
  clearFiltersLabel?: string;
  onClearFilters?: () => void;
  /** When set, overrides automatic active-filter detection (e.g. period filters with defaults). */
  hasActiveFiltersOverride?: boolean;
  rowActions?: TableAction<T>[];
  /** Render row actions as a compact dropdown menu (labels) instead of icon buttons. */
  rowActionsAsMenu?: boolean;
  bulkActions?: TableAction<T[]>[];
  selectable?: boolean;
  selectedRows?: string[] | number[];
  onSelectionChange?: (selectedRows: string[] | number[]) => void;
  pagination?: {
    current: number;
    pageSize: number;
    total: number;
    onPageChange: (page: number) => void;
    showSizeChanger?: boolean;
    pageSizeOptions?: number[];
    onPageSizeChange?: (size: number) => void;
  };
  emptyIcon?: ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  loadingText?: string;
  className?: string;
  tableClassName?: string;
  headerClassName?: string;
  /** Called when user clears a custom filter badge (key from customFilters). */
  onCustomFilterChange?: (key: string, value: string) => void;
  rowKey?: string | ((record: T) => string | number);
  onRowClick?: (record: T) => void;
  rowClassName?: string | ((record: T, index: number) => string);
  maxHeight?: string;
  stickyHeader?: boolean;
  footerContent?: ReactNode;
}

function DataTable<T extends Record<string, any>>({
  data = [],
  columns,
  loading = false,
  title,
  subtitle,
  icon,
  headerActions,
  searchable = true,
  searchPlaceholder,
  searchValue = '',
  onSearch,
  filters = [],
  customFilters = [],
  singleRowFilters = false,
  filterValues = {},
  customFilterValues = {},
  onFilterChange,
  showClearFilters = true,
  clearFiltersLabel,
  onClearFilters,
  hasActiveFiltersOverride,
  rowActions = [],
  rowActionsAsMenu = false,
  bulkActions = [],
  selectable = false,
  selectedRows = [],
  onSelectionChange,
  pagination,
  emptyIcon,
  emptyTitle,
  emptyDescription,
  emptyAction,
  loadingText,
  className,
  tableClassName,
  headerClassName,
  rowKey = 'id',
  onRowClick,
  rowClassName,
  maxHeight = 'calc(100dvh - 13rem)',
  stickyHeader = true,
  footerContent,
  onCustomFilterChange,
}: DataTableProps<T>) {
  const { direction, t } = useLanguage();
  const { formatDate, formatDateTime } = useFormatAppDate();
  // `auto` / `none` size to content (embedded tables). Fixed values keep list pages viewport-tall.
  const autoHeight = maxHeight === 'auto' || maxHeight === 'none';
  const tableAreaStyle = autoHeight
    ? { maxHeight: undefined }
    : {
        height: maxHeight,
        minHeight: maxHeight,
        maxHeight,
      };

  const renderActionButton = (action: TableAction<T>, record: T) => {
    const isDestructive =
      action.variant === 'destructive' ||
      action.key === 'delete' ||
      action.className?.includes('text-red');

    return (
      <Button
        key={action.key}
        type="button"
        variant="ghost"
        size="sm"
        title={action.tooltip || action.label}
        aria-label={action.tooltip || action.label}
        onClick={() => action.onClick(record)}
        className={cn(
          'h-8 w-8 shrink-0 p-0 text-muted-foreground hover:text-foreground',
          isDestructive && 'text-destructive hover:text-destructive hover:bg-destructive/10',
          action.className,
        )}
      >
        {action.icon ? (
          <span className="flex h-4 w-4 items-center justify-center [&>svg]:h-4 [&>svg]:w-4">
            {action.icon}
          </span>
        ) : (
          <span className="text-xs font-medium">{action.label}</span>
        )}
      </Button>
    );
  };

  const renderActionsMenu = (actions: TableAction<T>[], record: T) => {
    if (actions.length === 0) return null;

    const destructiveKeys = new Set(
      actions
        .filter(
          (action) =>
            action.variant === 'destructive' ||
            action.key === 'delete' ||
            action.className?.includes('text-red'),
        )
        .map((action) => action.key),
    );
    const normalActions = actions.filter((action) => !destructiveKeys.has(action.key));
    const destructiveActions = actions.filter((action) => destructiveKeys.has(action.key));

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
            aria-label={t('common.actions')}
            title={t('common.actions')}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={direction === 'rtl' ? 'start' : 'end'} className="min-w-[10.5rem]">
          {normalActions.map((action) => (
            <DropdownMenuItem
              key={action.key}
              className="cursor-pointer gap-2"
              onClick={() => action.onClick(record)}
            >
              {action.icon ? (
                <span className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground [&>svg]:h-4 [&>svg]:w-4">
                  {action.icon}
                </span>
              ) : null}
              <span>{action.label}</span>
            </DropdownMenuItem>
          ))}
          {normalActions.length > 0 && destructiveActions.length > 0 && (
            <DropdownMenuSeparator />
          )}
          {destructiveActions.map((action) => (
            <DropdownMenuItem
              key={action.key}
              className="cursor-pointer gap-2 text-destructive focus:text-destructive"
              onClick={() => action.onClick(record)}
            >
              {action.icon ? (
                <span className="flex h-4 w-4 shrink-0 items-center justify-center [&>svg]:h-4 [&>svg]:w-4">
                  {action.icon}
                </span>
              ) : null}
              <span>{action.label}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const getRowKey = useCallback((record: T, index: number): string => {
    if (typeof rowKey === 'function') {
      return String(rowKey(record));
    }
    const value = record?.[rowKey];
    return value == null ? String(index) : String(value);
  }, [rowKey]);

  const isRowSelected = useCallback(
    (key: string) => selectedRows.some((id) => String(id) === key),
    [selectedRows],
  );

  const getRowClassName = useCallback((record: T, index: number): string => {
    let className = '';
    if (onRowClick) {
      className += ' cursor-pointer';
    }
    if (typeof rowClassName === 'function') {
      className += ' ' + rowClassName(record, index);
    } else if (rowClassName) {
      className += ' ' + rowClassName;
    }
    return className.trim();
  }, [onRowClick, rowClassName]);

  const renderCell = useCallback((column: TableColumn<T>, record: T, index: number) => {
    const value = record?.[column.key];
    
    if (column.render) {
      return column.render(value, record, index);
    }
    
    if (value === null || value === undefined) {
      return <span className="text-muted-foreground">-</span>;
    }

    if (typeof value === 'string' && /(^date$|_date$|_at$|^date_)/.test(column.key)
      && /^\d{4}-\d{2}-\d{2}(?:T| |$)/.test(value)) {
      return value.length > 10 ? formatDateTime(value) : formatDate(value);
    }
    
    if (typeof value === 'boolean') {
      return (
        <Badge variant={value ? 'default' : 'secondary'}>
          {value ? t('common.yes') : t('common.no')}
        </Badge>
      );
    }
    
    return value?.toString?.() || value || '';
  }, [formatDate, formatDateTime, t]);

  const hasFilters = filters.length > 0 || customFilters.length > 0;
  const hasActiveFilters = useMemo(() => {
    const hasFilterValues = Object.values(filterValues).some(value => value && value !== 'all');
    const hasCustomFilterValues = Object.values(customFilterValues || {}).some(value => value && value !== '' && value !== 'all');
    const hasSearchValue = searchValue && searchValue.trim() !== '';
    return hasFilterValues || hasCustomFilterValues || hasSearchValue;
  }, [filterValues, customFilterValues, searchValue]);
  const showActiveFilters = hasActiveFiltersOverride ?? hasActiveFilters;

  const PaginationComponent = useMemo(() => {
    if (!pagination) return null;

    const isShowAll = pagination.pageSize >= pagination.total || (pagination.pageSizeOptions || []).includes(0);
    const totalPages = isShowAll ? 1 : Math.ceil(pagination.total / pagination.pageSize);
    const startItem = isShowAll ? 1 : (pagination.current - 1) * pagination.pageSize + 1;
    const endItem = pagination.total;
    
    const getVisiblePages = () => {
      const delta = 2;
      const range = [];
      const rangeWithDots = [];
      
      for (let i = Math.max(2, pagination.current - delta); 
           i <= Math.min(totalPages - 1, pagination.current + delta); 
           i++) {
        range.push(i);
      }
      
      if (pagination.current - delta > 2) {
        rangeWithDots.push(1, '...');
      } else {
        rangeWithDots.push(1);
      }
      
      rangeWithDots.push(...range);
      
      if (pagination.current + delta < totalPages - 1) {
        rangeWithDots.push('...', totalPages);
      } else if (totalPages > 1) {
        rangeWithDots.push(totalPages);
      }
      
      return rangeWithDots;
    };
    
    return (
      <div className="flex flex-col lg:flex-row justify-between items-center gap-4">
        <div className="flex flex-col sm:flex-row items-center gap-4 text-sm text-muted-foreground">
          <span className="whitespace-nowrap">
            {t('common.showing')} <span className="font-medium text-foreground">{startItem}</span> {t('common.to')}{' '}
            <span className="font-medium text-foreground">{endItem}</span> {t('common.of')}{' '}
            <span className="font-medium text-foreground">{pagination.total}</span> {t('common.entries')}
          </span>
          {pagination.showSizeChanger && (
            <div className="flex items-center gap-2">
              <span className="text-xs">{t('common.show')}:</span>
              <Select
                value={pagination.pageSize >= pagination.total && pagination.total > 0 ? 'all' : pagination.pageSize.toString()}
                onValueChange={(value) => {
                  if (value === 'all') {
                    pagination.onPageSizeChange?.(pagination.total || 99999);
                  } else {
                    pagination.onPageSizeChange?.(Number(value));
                  }
                }}
              >
                <SelectTrigger className="w-20 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(pagination.pageSizeOptions || [10, 25, 50, 100]).map(size => (
                    <SelectItem key={size} value={size.toString()} className="text-xs">
                      {size}
                    </SelectItem>
                  ))}
                  <SelectItem value="all" className="text-xs">
                    {t('common.all', 'All')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        
        {!isShowAll && (
          <div className="flex items-center">
            <div className="flex sm:hidden items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => pagination.onPageChange(pagination.current - 1)}
                disabled={pagination.current === 1}
                className="h-9 px-3"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                {t('common.prev')}
              </Button>
              <div className="flex items-center gap-1 px-3 py-1 bg-muted rounded-md">
                <span className="text-sm font-medium">{pagination.current}</span>
                <span className="text-xs text-muted-foreground">of {totalPages}</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => pagination.onPageChange(pagination.current + 1)}
                disabled={pagination.current === totalPages}
                className="h-9 px-3"
              >
                {t('common.next')}
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>

            <div className="hidden sm:flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => pagination.onPageChange(1)}
                disabled={pagination.current === 1}
                className="h-9 w-9 p-0"
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => pagination.onPageChange(pagination.current - 1)}
                disabled={pagination.current === 1}
                className="h-9 w-9 p-0"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>

              {getVisiblePages().map((page, index) => (
                <Button
                  key={index}
                  variant={page === pagination.current ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => typeof page === 'number' && pagination.onPageChange(page)}
                  disabled={page === '...'}
                  className="h-9 min-w-9 px-3"
                >
                  {page}
                </Button>
              ))}

              <Button
                variant="outline"
                size="sm"
                onClick={() => pagination.onPageChange(pagination.current + 1)}
                disabled={pagination.current === totalPages}
                className="h-9 w-9 p-0"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => pagination.onPageChange(totalPages)}
                disabled={pagination.current === totalPages}
                className="h-9 w-9 p-0"
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }, [pagination]);

  return (
    <Card className={cn('flex flex-col border border-border/70 shadow-sm', className)}>
      {(title || subtitle || headerActions || searchable || hasFilters) && (
        <CardHeader className={cn('shrink-0 space-y-4 border-b border-border/60 bg-card pb-4', headerClassName)}>
          {(title || subtitle || headerActions) && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1">
                {title && (
                  <CardTitle className="flex flex-wrap items-center gap-2 text-base font-heading font-semibold tracking-tight sm:text-lg">
                    {icon}
                    {title}
                  </CardTitle>
                )}
                {subtitle && (
                  <p className="text-sm text-muted-foreground">
                    {subtitle}
                  </p>
                )}
              </div>
              {headerActions ? (
                <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:shrink-0 sm:justify-end">
                  {headerActions}
                </div>
              ) : null}
            </div>
          )}
          
          {(searchable || hasFilters) && (
            <div className="space-y-3 rounded-lg border border-border/50 bg-muted/25 p-3">
              <div className={cn(singleRowFilters ? "flex flex-nowrap items-end gap-3 overflow-x-auto pb-1 [&>div]:!w-40 [&>div]:shrink-0 [&>div]:grow" : "flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end")}>
                {searchable && (
                  <div className="flex w-full min-w-0 flex-col gap-1.5 sm:w-64 md:w-72">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t('common.search')}
                    </span>
                    <div className="relative w-full">
                      <Search className={cn(
                        "absolute top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none",
                        direction === 'rtl' ? 'right-3' : 'left-3'
                      )} />
                      <Input
                        placeholder={searchPlaceholder}
                        value={searchValue}
                        onChange={(e) => onSearch?.(e.target.value)}
                        className={cn(
                          "h-9 w-full border border-border/70 bg-background shadow-none focus-visible:ring-primary/30",
                          direction === 'rtl' ? 'pr-9 text-right' : 'pl-9 text-left'
                        )}
                      />
                    </div>
                  </div>
                )}

                {Array.isArray(customFilters) && customFilters.length > 0 && customFilters.map((filter: CustomFilter) => (
                  <div
                    key={filter.key}
                    className={cn(
                      'flex w-full min-w-0 flex-col gap-1.5 sm:w-48',
                      filter.width,
                    )}
                  >
                    <span className="text-xs font-medium text-muted-foreground">{filter.label}</span>
                    {filter.component}
                  </div>
                ))}

                {filters.map((filter) => (
                  <div
                    key={filter.key}
                    className={cn(
                      'flex w-full min-w-0 flex-col gap-1.5 sm:w-44',
                      filter.width,
                    )}
                  >
                    <span className="text-xs font-medium text-muted-foreground">{filter.label}</span>
                    <Select
                      value={filterValues[filter.key] || 'all'}
                      onValueChange={(value) => onFilterChange?.(filter.key, value)}
                    >
                      <SelectTrigger className={cn(
                        'h-9 w-full border border-border/70 bg-background text-sm shadow-none focus:ring-primary/30',
                      )}>
                        <SelectValue placeholder={filter.placeholder} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">
                          <span className="text-muted-foreground">{t('common.all')} {filter.label}</span>
                        </SelectItem>
                        {filter.options?.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>

              {(showActiveFilters || (showClearFilters && showActiveFilters)) && (
                <div className="flex flex-wrap items-center gap-2 border-t border-border/40 pt-2">
                  {Object.entries(filterValues).map(([key, value]) => {
                    if (value && value !== 'all') {
                      const filter = filters.find(f => f.key === key);
                      const option = filter?.options.find(o => o.value === value);
                      return (
                        <Badge key={key} variant="secondary" className="h-6 gap-1 px-2 text-xs bg-primary/10 text-primary border-primary/20">
                          {filter?.label}: {option?.label || value}
                          <button
                            type="button"
                            onClick={() => onFilterChange?.(key, 'all')}
                            className="rounded-full p-0.5 hover:bg-primary/20"
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </Badge>
                      );
                    }
                    return null;
                  })}
                  {Object.entries(customFilterValues || {}).map(([key, value]) => {
                    if (!value || value === '' || value === 'all') return null;
                    const filter = customFilters.find(f => f.key === key);
                    return (
                      <Badge key={`custom-${key}`} variant="secondary" className="h-6 gap-1 px-2 text-xs bg-primary/10 text-primary border-primary/20">
                        {filter?.label}: {value}
                        <button
                          type="button"
                          onClick={() => onCustomFilterChange?.(key, '')}
                          className="rounded-full p-0.5 hover:bg-primary/20"
                        >
                          <X className="h-2.5 w-2.5" />
                          </button>
                      </Badge>
                    );
                  })}
                  {searchValue && (
                    <Badge variant="secondary" className="h-6 gap-1 px-2 text-xs bg-primary/10 text-primary border-primary/20">
                      {t('common.search')}: "{searchValue}"
                      <button
                        type="button"
                        onClick={() => onSearch?.('')}
                        className="rounded-full p-0.5 hover:bg-primary/20"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </Badge>
                  )}
                  {showClearFilters && showActiveFilters && (
                    <Button
                      variant="outline"
                      onClick={onClearFilters}
                      size="sm"
                      className="h-7 px-3 ms-auto border-destructive/30 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                    >
                      <X className="h-3.5 w-3.5 me-1" />
                      {clearFiltersLabel || t('common.clear')}
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </CardHeader>
      )}
      
      <CardContent className="flex min-h-0 flex-1 flex-col p-0">
        {bulkActions.length > 0 && selectedRows.length > 0 && Array.isArray(data) && (
          <div className="flex shrink-0 items-center gap-2 border-b border-border/60 bg-primary/5 px-4 py-2.5">
            <span className="text-sm font-medium text-foreground">
              {selectedRows.length} {t('common.items')}
            </span>
            <div className="flex gap-2">
              {bulkActions.map((action) => (
                <Button
                  key={action.key}
                  variant={action.variant || 'outline'}
                  size="sm"
                  onClick={() =>
                    action.onClick(
                      data.filter((item, index) => isRowSelected(getRowKey(item, index))),
                    )
                  }
                  className={action.className}
                >
                  {action.icon}
                  {action.label}
                </Button>
              ))}
            </div>
          </div>
        )}
        
        <div className="w-full overflow-auto" style={tableAreaStyle}>
          <Table
            containerClassName="overflow-visible"
            className={cn('min-w-max w-full border-separate border-spacing-0', tableClassName)}
          >
            <TableHeader className="bg-muted [&_tr]:border-border/70">
              <TableRow className="hover:bg-transparent border-b border-border/70">
                {selectable && (
                  <TableHead
                    className={cn(
                      'w-12 bg-muted px-3',
                      stickyHeader && 'sticky top-0 z-20',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={
                        Array.isArray(data) &&
                        data.length > 0 &&
                        data.every((item, index) => isRowSelected(getRowKey(item, index)))
                      }
                      onChange={(e) => {
                        if (e.target.checked && Array.isArray(data)) {
                          onSelectionChange?.(data.map((item, index) => getRowKey(item, index)));
                        } else {
                          onSelectionChange?.([]);
                        }
                      }}
                      className="rounded border-input focus:ring-2 focus:ring-primary/20"
                    />
                  </TableHead>
                )}
                {columns.map((column) => (
                  <TableHead
                    key={column.key}
                    className={cn(
                      'bg-muted overflow-hidden',
                      stickyHeader && 'sticky top-0 z-20',
                      !column.width && !column.className && 'max-w-[12rem]',
                      column.className,
                    )}
                    style={{
                      width: column.width,
                      maxWidth: column.width || undefined,
                      textAlign: column.align || 'start',
                    }}
                  >
                    <span className="block truncate" title={column.title}>
                      {column.title}
                    </span>
                  </TableHead>
                ))}
                {rowActions.length > 0 && (
                  <TableHead
                    className={cn(
                      'bg-muted w-12 whitespace-nowrap text-start',
                      stickyHeader && 'sticky top-0 z-20',
                    )}
                  >
                    {t('common.actions')}
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={columns.length + (selectable ? 1 : 0) + (rowActions.length > 0 ? 1 : 0)}
                    className="text-center align-middle"
                    style={autoHeight ? undefined : { height: `calc(${maxHeight} - 2.75rem)` }}
                  >
                    <div className={cn(
                      'flex flex-col items-center justify-center gap-3',
                      autoHeight ? 'min-h-[8rem] py-8' : 'h-full min-h-[12rem]',
                    )}>
                      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
                      <p className="text-sm font-medium text-muted-foreground">{loadingText || t('common.loading')}</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : !Array.isArray(data) || data.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={columns.length + (selectable ? 1 : 0) + (rowActions.length > 0 ? 1 : 0)}
                    className="text-center align-middle"
                    style={autoHeight ? undefined : { height: `calc(${maxHeight} - 2.75rem)` }}
                  >
                    <div className={cn(
                      'flex flex-col items-center justify-center gap-3',
                      autoHeight ? 'min-h-[8rem] py-8' : 'h-full min-h-[12rem]',
                    )}>
                      <div className="rounded-full bg-muted p-3 text-muted-foreground">
                        {emptyIcon}
                      </div>
                      <div className="space-y-1">
                        <p className="text-base font-semibold text-foreground">{emptyTitle || t('common.noDataFound')}</p>
                        <p className="text-sm text-muted-foreground">{emptyDescription || t('common.noSearchResults')}</p>
                      </div>
                      {emptyAction}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                Array.isArray(data) && data.map((record, index) => {
                  const visibleActions = rowActions.filter(
                    (action) => !action.show || action.show(record),
                  );

                  return (
                  <TableRow
                    key={getRowKey(record, index)}
                    className={cn(
                      getRowClassName(record, index),
                      'group border-b border-border/50 odd:bg-background even:bg-muted/20 hover:bg-primary/[0.04]',
                    )}
                    onClick={() => onRowClick?.(record)}
                  >
                    {selectable && (
                      <TableCell className="px-3">
                        <input
                          type="checkbox"
                          checked={isRowSelected(getRowKey(record, index))}
                          onChange={(e) => {
                            const key = getRowKey(record, index);
                            if (e.target.checked) {
                              onSelectionChange?.([...selectedRows.map(String), key]);
                            } else {
                              onSelectionChange?.(
                                selectedRows.filter((id) => String(id) !== key),
                              );
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="rounded border-input focus:ring-2 focus:ring-primary/20"
                        />
                      </TableCell>
                    )}
                    {columns.map((column) => (
                      <TableCell
                        key={column.key}
                        className={cn(
                          'overflow-hidden align-middle',
                          !column.width && !column.className && 'max-w-[12rem]',
                          column.className,
                        )}
                        style={{
                          width: column.width,
                          maxWidth: column.width || undefined,
                          textAlign: column.align || 'start',
                        }}
                      >
                        {renderCell(column, record, index)}
                      </TableCell>
                    ))}
                    {rowActions.length > 0 && (
                      <TableCell className="w-12 whitespace-nowrap text-start">
                        <div
                          className="inline-flex items-center justify-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {rowActionsAsMenu
                            ? renderActionsMenu(visibleActions, record)
                            : visibleActions.map((action) => renderActionButton(action, record))}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                  );
                })
              )}
              {footerContent && (
                <>{footerContent}</>
              )}
            </TableBody>
          </Table>
        </div>
        
        
        {pagination && (
          <div className="shrink-0 border-t border-border/60 bg-card px-4 py-3">
            {PaginationComponent}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export { DataTable };
export default DataTable;
