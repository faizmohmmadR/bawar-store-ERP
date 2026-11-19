import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Edit, Eye, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Autocomplete } from '@/components/ui/autocomplete';
import { CurrencySelect } from '@/components/forms/CurrencySelect';
import { FormSelect } from '@/components/forms/FormSelect';
import { FormActions, type FormSubmitIntent } from '@/components/forms/FormActions';
import { FormPage, FormPageFields, FormPageSection } from '@/components/forms/FormPage';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import DataTable, { type CustomFilter, type FilterOption, type TableAction, type TableColumn } from '@/components/ui/data-table';
import { useLanguage } from '@/contexts/LanguageContext';
import useFetchObjects from '@/api/useFetchObjects';
import useAdd from '@/api/useAdd';
import useUpdate from '@/api/useUpdate';
import { DatePickerInput } from '@/components/ui/date-picker-input';
import useDelete from '@/api/useDelete';
import { toCurrencyFkId } from '@/lib/currencies';
import { useRedirectOnSuccess } from '@/hooks/useRedirectOnSuccess';
import { cn } from '@/lib/utils';

export type CrudFieldOptionSummary = {
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'danger';
};

export type CrudFieldContext = Record<string, unknown>;

export type CrudField = {
  name: string;
  label: string;
  type?: 'text' | 'number' | 'date' | 'datetime-local' | 'textarea' | 'boolean' | 'autocomplete' | 'currency' | 'select';
  endpoint?: string;
  /** Extra query params for autocomplete endpoints */
  queryParams?: Record<string, string | number>;
  required?: boolean;
  /** Shown disabled in the form (e.g. auto-generated serial). */
  readOnly?: boolean;
  /** Placeholder for inputs and select triggers. */
  placeholder?: string;
  /** Helper text shown below the field (never inside the dropdown). */
  description?: string;
  /** Initial create value (e.g. payment method default). */
  defaultValue?: string | boolean | number;
  options?: { value: string; label: string; description?: string }[];
  getOptionLabel?: (item: any) => string;
  /** Shown under an autocomplete after an option is selected */
  optionSummary?: (option: any) => CrudFieldOptionSummary[];
  /** Seed optionSummary on edit from the loaded record */
  optionSummaryFromItem?: (item: any) => any | null;
  /** Hide the field when this returns false */
  visibleWhen?: (values: CrudFieldContext) => boolean;
  /** Disable editing when this returns true */
  disabledWhen?: (values: CrudFieldContext) => boolean;
  /** Reset value when the field becomes hidden */
  clearValue?: string | boolean | number | null;
  /** Group fields under a section id (see formSections on CrudConfig). */
  section?: string;
  /** Show only on edit pages (e.g. auto-generated serial). */
  editOnly?: boolean;
};

export type CrudFormSection = {
  id: string;
  title: string;
  description?: string;
};

export type CrudFilter = {
  key: string;
  label: string;
  placeholder?: string;
  type?: 'select' | 'autocomplete';
  options?: { value: string; label: string }[];
  endpoint?: string;
  getOptionLabel?: (item: any) => string;
  width?: string;
};

export type CrudConfig = {
  endpoint: string;
  queryKey: string;
  basePath: string;
  title: string;
  singular: string;
  fields: CrudField[];
  columns: TableColumn[];
  filters?: CrudFilter[];
  display?: (item: any) => string;
  searchPlaceholder?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  subtitle?: string;
  extraRowActions?: TableAction[];
  /** Extra buttons rendered next to the primary Add action on the list page. */
  extraHeaderActions?: ReactNode;
  /** Enables row checkboxes and shows these actions when rows are selected. */
  bulkActions?: TableAction[];
  /** Runs when driving fields change (e.g. acquisition type / status). */
  syncFormValues?: (
    values: CrudFieldContext,
    setValue: (name: string, value: unknown) => void,
  ) => void;
  /** Field names that trigger syncFormValues when changed */
  syncFormWatchFields?: string[];
  /** Ordered sections for add/edit forms. Fields reference section by id. */
  formSections?: CrudFormSection[];
};

const fill = (template: string, vars: Record<string, string>) =>
  Object.entries(vars).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, value), template);

const valuesFor = (fields: CrudField[]) =>
  Object.fromEntries(
    fields.map((field) => {
      if (field.defaultValue !== undefined) {
        return [field.name, field.defaultValue];
      }
      if (field.type === 'boolean') return [field.name, false];
      if (field.type === 'date') return [field.name, new Date().toISOString().slice(0, 10)];
      return [field.name, ''];
    }),
  );

const isFieldVisible = (field: CrudField, values: CrudFieldContext) =>
  !field.visibleWhen || field.visibleWhen(values);

const isFieldDisabled = (field: CrudField, values: CrudFieldContext) =>
  Boolean(field.readOnly || (field.disabledWhen && field.disabledWhen(values)));

const schemaFor = (fields: CrudField[], requiredMsg: string, values: CrudFieldContext = {}) =>
  z.object(Object.fromEntries(fields.map((field) => {
    const visible = isFieldVisible(field, values);
    const required = Boolean(field.required && visible);
    return [
      field.name,
      field.type === 'boolean'
        ? z.boolean()
        : required
          ? z.string().min(1, requiredMsg)
          : z.string().optional(),
    ];
  })));

const payloadFor = (data: Record<string, any>, fields: CrudField[]) =>
  Object.fromEntries(fields.map((field) => {
    if (field.visibleWhen && !field.visibleWhen(data)) {
      const cleared = field.clearValue !== undefined ? field.clearValue : '';
      return [field.name, cleared === '' ? null : cleared];
    }
    let value = data[field.name];
    if (field.type === 'number' && value !== '') value = Number(value);
    if (field.type === 'currency' && value) value = toCurrencyFkId(value);
    if (field.type === 'autocomplete') {
      if (value === '' || value == null) value = null;
      else {
        const parsed = Number.parseInt(String(value), 10);
        value = Number.isInteger(parsed) && parsed > 0 ? parsed : null;
      }
    }
    return [field.name, value === '' ? null : value];
  }));

const emptyFilterValues = (filters: CrudFilter[] = []) =>
  Object.fromEntries(
    filters.map((filter) => [filter.key, filter.type === 'autocomplete' ? '' : 'all']),
  );

export function CrudList({ config }: { config: CrudConfig }) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedRows, setSelectedRows] = useState<(string | number)[]>([]);
  const [filterValues, setFilterValues] = useState<Record<string, string>>(() =>
    emptyFilterValues(config.filters),
  );
  const hasBulkActions = (config.bulkActions || []).length > 0;

  const queryParams = useMemo(() => {
    const params: Record<string, string | number> = {
      page,
      page_size: pageSize,
      search,
    };
    for (const filter of config.filters || []) {
      const value = filterValues[filter.key];
      if (value && value !== 'all') params[filter.key] = value;
    }
    return params;
  }, [config.filters, filterValues, page, pageSize, search]);

  const { data, isLoading } = useFetchObjects<{ results: any[]; count: number }>({
    queryKey: [config.queryKey, JSON.stringify(queryParams)],
    endpoint: `${config.endpoint}/`,
    params: queryParams,
  });
  const { handleDelete, ConfirmDialog } = useDelete({ queryKey: [config.queryKey], endpoint: config.endpoint });
  const actions: TableAction[] = [
    { key: 'view', label: t('common.view'), icon: <Eye className="h-4 w-4" />, onClick: (row) => navigate(`${config.basePath}/${row.id}`) },
    { key: 'edit', label: t('common.edit'), icon: <Edit className="h-4 w-4" />, onClick: (row) => navigate(`${config.basePath}/${row.id}/edit`) },
    ...(config.extraRowActions || []),
    { key: 'delete', label: t('common.delete'), icon: <Trash2 className="h-4 w-4" />, onClick: (row) => handleDelete(row.id, config.display?.(row) || row.name || `${config.singular} #${row.id}`), className: 'text-red-600 hover:text-red-700' },
  ];

  const selectFilters: FilterOption[] = (config.filters || [])
    .filter((filter) => filter.type !== 'autocomplete')
    .map((filter) => ({
      key: filter.key,
      label: filter.label,
      placeholder: filter.placeholder || filter.label,
      options: filter.options || [],
      width: filter.width,
    }));

  const autocompleteFilters = (config.filters || []).filter(
    (filter) => filter.type === 'autocomplete' && filter.endpoint,
  );

  const customFilters: CustomFilter[] = autocompleteFilters.map((filter) => ({
    key: filter.key,
    label: filter.label,
    width: filter.width,
    component: (
      <Autocomplete
        endpoint={filter.endpoint!}
        value={filterValues[filter.key] || ''}
        onChange={(value) => {
          setFilterValues((prev) => ({ ...prev, [filter.key]: value ? String(value) : '' }));
          setSelectedRows([]);
          setPage(1);
        }}
        placeholder={filter.placeholder || filter.label}
        getOptionLabel={filter.getOptionLabel || ((item) => item.name || item.fullname || item.email || item.username)}
        getOptionValue={(item) => item.id.toString()}
      />
    ),
  }));

  const selectFilterValues = useMemo(
    () =>
      Object.fromEntries(
        selectFilters.map((filter) => [filter.key, filterValues[filter.key] || 'all']),
      ),
    [filterValues, selectFilters],
  );

  const customFilterValues = useMemo(
    () =>
      Object.fromEntries(
        autocompleteFilters.map((filter) => [filter.key, filterValues[filter.key] || '']),
      ),
    [autocompleteFilters, filterValues],
  );

  const handleFilterChange = (key: string, value: string) => {
    setFilterValues((prev) => ({ ...prev, [key]: value }));
    setSelectedRows([]);
    setPage(1);
  };

  const handleClearFilters = () => {
    setFilterValues(emptyFilterValues(config.filters));
    setSearch('');
    setSelectedRows([]);
    setPage(1);
  };

  const hasActiveFilters =
    !!search ||
    Object.entries(filterValues).some(([key, value]) => {
      const filter = config.filters?.find((item) => item.key === key);
      if (filter?.type === 'autocomplete') return !!value;
      return !!value && value !== 'all';
    });

  return <div className="space-y-4 p-4 sm:p-6">
    <DataTable data={data?.results || []} columns={config.columns} loading={isLoading} title={config.title}
      subtitle={config.subtitle || fill(t('crud.manage'), { title: config.title.toLowerCase() })}
      headerActions={
        <div className="flex flex-wrap items-center gap-2">
          {config.extraHeaderActions}
          <Button onClick={() => navigate(`${config.basePath}/add`)}>
            <Plus className="h-4 w-4" />
            {fill(t('crud.addButton'), { singular: config.singular })}
          </Button>
        </div>
      }
      searchable searchPlaceholder={config.searchPlaceholder || fill(t('crud.search'), { title: config.title.toLowerCase() })} searchValue={search} onSearch={(value) => { setSearch(value); setSelectedRows([]); setPage(1); }}
      filters={selectFilters}
      customFilters={customFilters}
      filterValues={selectFilterValues}
      customFilterValues={customFilterValues}
      onFilterChange={handleFilterChange}
      showClearFilters={hasActiveFilters}
      onClearFilters={handleClearFilters}
      rowActions={actions}
      selectable={hasBulkActions}
      selectedRows={selectedRows}
      onSelectionChange={setSelectedRows}
      bulkActions={config.bulkActions || []}
      pagination={{ current: page, pageSize, total: data?.count || 0, onPageChange: (next) => { setPage(next); setSelectedRows([]); }, showSizeChanger: true, pageSizeOptions: [10, 25, 50, 100], onPageSizeChange: (size) => { setPageSize(size); setSelectedRows([]); setPage(1); } }}
      emptyTitle={config.emptyTitle || fill(t('crud.noFound'), { title: config.title.toLowerCase() })}
      emptyDescription={config.emptyDescription || fill(t('crud.addFirst'), { singular: config.singular.toLowerCase() })}
      loadingText={t('common.loading')} stickyHeader maxHeight="75vh" />
    <ConfirmDialog />
  </div>;
}

export function CrudForm({ config, edit = false }: { config: CrudConfig; edit?: boolean }) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { id } = useParams();
  const submitIntent = useRef<FormSubmitIntent>('save');
  const form = useForm<any>({
    defaultValues: valuesFor(config.fields),
    resolver: (values, context, options) =>
      zodResolver(schemaFor(config.fields, t('crud.required'), values))(values, context, options),
  });
  const [selectedOptions, setSelectedOptions] = useState<Record<string, any>>({});
  const formValues = form.watch();
  const { data: item } = useFetchObjects<any>({ queryKey: [config.queryKey, id || 'new'], endpoint: `${config.endpoint}/${id}/`, enabled: edit && !!id });
  const add = useAdd<any>({ queryKey: [config.queryKey], endpoint: `${config.endpoint}/` });
  const update = useUpdate<any>({ queryKey: [config.queryKey], endpoint: config.endpoint });

  useEffect(() => {
    if (!item) return;
    form.reset(Object.fromEntries(config.fields.map((field) => [field.name, field.type === 'boolean' ? Boolean(item[field.name]) : item[field.name]?.toString() || ''])));
    const seeded: Record<string, any> = {};
    for (const field of config.fields) {
      if (!field.optionSummary) continue;
      const option = field.optionSummaryFromItem?.(item);
      if (option) seeded[field.name] = option;
    }
    setSelectedOptions(seeded);
  }, [item, form, config.fields]);

  useEffect(() => {
    for (const field of config.fields) {
      if (!field.visibleWhen || field.visibleWhen(formValues)) continue;
      const next = field.clearValue !== undefined ? field.clearValue : '';
      const current = form.getValues(field.name);
      if (current !== next) {
        form.setValue(field.name, next, { shouldValidate: true });
      }
      if (field.type === 'autocomplete') {
        setSelectedOptions((prev) => {
          if (!prev[field.name]) return prev;
          const nextOptions = { ...prev };
          delete nextOptions[field.name];
          return nextOptions;
        });
      }
    }
  }, [config.fields, form, formValues]);

  const watchedSyncKey = (config.syncFormWatchFields || [])
    .map((name) => String(formValues[name] ?? ''))
    .join('|');

  useEffect(() => {
    if (!config.syncFormValues) return;
    config.syncFormValues(form.getValues(), (name, value) => {
      form.setValue(name, value, { shouldValidate: true });
    });
  }, [config, form, watchedSyncKey]);

  useRedirectOnSuccess(edit && update.isSuccess, config.basePath);

  useEffect(() => {
    if (edit || !add.isSuccess) return;
    if (submitIntent.current === 'save_and_new') {
      form.reset(valuesFor(config.fields));
      setSelectedOptions({});
      submitIntent.current = 'save';
      return;
    }
    navigate(config.basePath);
  }, [add.isSuccess, config.basePath, config.fields, edit, form, navigate]);

  const submit = (data: any) => {
    const payload = payloadFor(data, config.fields);
    if (edit && id) update.handleUpdate(id, payload);
    else add.handleAdd(payload);
  };

  const visibleFormFields = useMemo(
    () =>
      config.fields.filter(
        (field) => isFieldVisible(field, formValues) && !(field.editOnly && !edit),
      ),
    [config.fields, edit, formValues],
  );

  const formFieldGroups = useMemo(() => {
    if (!config.formSections?.length) {
      return [{ section: null as CrudFormSection | null, fields: visibleFormFields }];
    }
    return config.formSections
      .map((section) => ({
        section,
        fields: visibleFormFields.filter((field) => field.section === section.id),
      }))
      .filter((group) => group.fields.length > 0);
  }, [config.formSections, visibleFormFields]);

  const fieldDisabled = (field: CrudField) => isFieldDisabled(field, formValues);

  const renderFormField = (field: CrudField) => {
    const summaryOption = selectedOptions[field.name];
    const summaryRows = field.optionSummary && summaryOption
      ? field.optionSummary(summaryOption)
      : [];

    if (field.type === 'boolean') {
      return (
        <FormField
          key={field.name}
          control={form.control}
          name={field.name}
          render={({ field: formField }) => (
            <FormItem>
              <FormControl>
                <label className="flex h-10 cursor-pointer items-center justify-between gap-3 rounded-md border border-input bg-background px-3 transition-colors hover:bg-muted/40">
                  <span className="text-sm font-medium leading-none">
                    {field.label}
                    {field.required ? ' *' : ''}
                  </span>
                  <Switch
                    checked={Boolean(formField.value)}
                    onCheckedChange={formField.onChange}
                    disabled={fieldDisabled(field)}
                  />
                </label>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      );
    }

    return (
      <FormField
        key={field.name}
        control={form.control}
        name={field.name}
        render={({ field: formField }) => (
          <FormItem className={field.type === 'textarea' || summaryRows.length > 0 ? 'sm:col-span-2' : ''}>
            <FormLabel>
              {field.label}
              {field.required ? ' *' : ''}
            </FormLabel>
            <FormControl>
              {field.type === 'textarea' ? (
                <Textarea {...formField} disabled={fieldDisabled(field)} placeholder={field.placeholder} />
              ) : field.type === 'autocomplete' ? (
                <Autocomplete
                  endpoint={field.endpoint!}
                  queryParams={field.queryParams}
                  value={formField.value}
                  onChange={(value, option) => {
                    formField.onChange(value ?? '');
                    setSelectedOptions((prev) => {
                      const next = { ...prev };
                      if (option) next[field.name] = option;
                      else delete next[field.name];
                      return next;
                    });
                  }}
                  getOptionLabel={
                    field.getOptionLabel ||
                    ((item) => item.name || item.fullname || item.email || item.username)
                  }
                  getOptionValue={(item) => item.id.toString()}
                  placeholder={field.placeholder || fill(t('crud.selectField'), { label: field.label })}
                  disabled={fieldDisabled(field)}
                />
              ) : field.type === 'currency' ? (
                <CurrencySelect
                  value={formField.value}
                  onChange={formField.onChange}
                  placeholder={field.placeholder || t('crud.selectCurrency')}
                  disabled={fieldDisabled(field)}
                />
              ) : field.type === 'select' ? (
                <FormSelect
                  value={String(formField.value ?? '')}
                  onChange={formField.onChange}
                  options={field.options || []}
                  placeholder={
                    field.placeholder ||
                    fill(t('crud.selectField'), { label: field.label.toLowerCase() })
                  }
                  disabled={fieldDisabled(field)}
                />
              ) : field.type === 'date' ? (
                <DatePickerInput
                  value={String(formField.value ?? '')}
                  onChange={formField.onChange}
                  disabled={fieldDisabled(field) || field.readOnly}
                  placeholder={field.placeholder || 'dd/mm/yyyy'}
                />
              ) : (
                <Input
                  type={field.type || 'text'}
                  {...formField}
                  disabled={fieldDisabled(field)}
                  placeholder={field.placeholder}
                  readOnly={field.readOnly}
                />
              )}
            </FormControl>
            {field.description ? (
              <FormDescription className="text-xs leading-relaxed">
                {field.description}
              </FormDescription>
            ) : null}
            {summaryRows.length > 0 && (
              <div className="mt-3 grid grid-cols-1 gap-2 rounded-lg border border-border bg-muted/30 p-3 sm:grid-cols-3">
                {summaryRows.map((row) => (
                  <div key={row.label} className="min-w-0">
                    <p className="text-xs text-muted-foreground">{row.label}</p>
                    <p
                      className={cn(
                        'truncate text-sm font-semibold',
                        row.tone === 'danger' && 'text-destructive',
                        row.tone === 'success' && 'text-primary',
                      )}
                    >
                      {row.value}
                    </p>
                  </div>
                ))}
              </div>
            )}
            <FormMessage />
          </FormItem>
        )}
      />
    );
  };

  return (
    <FormPage
      title={fill(edit ? t('crud.editTitle') : t('crud.addTitle'), { singular: config.singular })}
      backTo={config.basePath}
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(submit)} className="space-y-5">
          {formFieldGroups.map((group) =>
            group.section ? (
              <FormPageSection
                key={group.section.id}
                title={group.section.title}
                description={group.section.description}
              >
                <FormPageFields>{group.fields.map(renderFormField)}</FormPageFields>
              </FormPageSection>
            ) : (
              <FormPageFields key="__default__">{group.fields.map(renderFormField)}</FormPageFields>
            ),
          )}

          <FormActions
            mode={edit ? 'edit' : 'create'}
            onCancel={() => navigate(config.basePath)}
            loading={edit ? update.loading : add.loading}
            submitLabel={edit ? t('common.update') : t('common.add')}
            loadingLabel={t('common.saving')}
            showSaveAndCreateNew={!edit}
            onIntent={(intent) => {
              submitIntent.current = intent;
            }}
          />
        </form>
      </Form>
    </FormPage>
  );
}

export function CrudDetails({ config }: { config: CrudConfig }) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { id } = useParams();
  const { data: item, isLoading } = useFetchObjects<any>({
    queryKey: [config.queryKey, id || ''],
    endpoint: `${config.endpoint}/${id}/`,
    enabled: !!id,
  });
  if (isLoading) return <div className="p-6 text-center">{t('common.loading')}</div>;
  if (!item) return <div className="p-6 text-center">{t('crud.notFound')}</div>;
  return (
    <FormPage
      title={fill(t('crud.detailsTitle'), { singular: config.singular })}
      backTo={config.basePath}
    >
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {config.fields.map((field) => (
          <div key={field.name}>
            <p className="text-sm text-muted-foreground">{field.label}</p>
            <p className="break-words font-medium">
              {field.type === 'boolean' ? (
                <Badge variant={item[field.name] ? 'default' : 'secondary'}>
                  {item[field.name] ? t('common.yes') : t('common.no')}
                </Badge>
              ) : (
                item[`${field.name}_details`]?.name || item[field.name] || '—'
              )}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-border/60 pt-4">
        {(config.extraRowActions || []).map((action) => (
          <Button
            key={action.key}
            type="button"
            variant="outline"
            onClick={() => action.onClick(item)}
          >
            {action.icon}
            {action.label}
          </Button>
        ))}
        <Button type="button" variant="outline" onClick={() => navigate(config.basePath)}>
          {t('common.back')}
        </Button>
      </div>
    </FormPage>
  );
}
