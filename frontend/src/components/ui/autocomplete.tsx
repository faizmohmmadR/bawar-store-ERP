import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, X, Search, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '@/api/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';

// Debounce hook
const useDebounce = (value: string, delay: number) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};

interface Option {
  [key: string]: any;
}

interface AutocompleteProps {
  value?: string | number;
  onChange: (value: string | number | null, option?: any) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  endpoint?: string;
  searchParam?: string;
  pageSize?: number;
  disabled?: boolean;
  className?: string;
  options?: Option[];
  renderOption?: (option: Option) => React.ReactNode;
  getOptionLabel?: (option: Option) => string;
  getOptionValue?: (option: Option) => string | number;
  labelKey?: string;
  valueKey?: string;
  apiUrl?: string;
  queryParams?: Record<string, string | number>;
  /** Option values hidden from the dropdown (e.g. already picked on another row). */
  excludeValues?: Array<string | number>;
  /** When set, forwarded to the trigger for tab order control. */
  tabIndex?: number;
  /** Minimum width for the dropdown menu, useful when the trigger sits in a narrow table cell. */
  dropdownMinWidth?: number;
  /** Pre-set display label when value is known before options load. */
  initialLabel?: string;
  /** Match list-page filter toolbar styling (DataTable). */
  variant?: 'default' | 'filter';
  /**
   * When Enter is pressed in the search box with text (and no arrow highlight),
   * call this first — used for barcode/SKU exact resolve. Return true if handled.
   */
  onCodeSubmit?: (code: string) => boolean | Promise<boolean>;
  /** Keep the dropdown open and clear search after a successful onCodeSubmit. */
  keepOpenAfterCodeSubmit?: boolean;
}

export const Autocomplete: React.FC<AutocompleteProps> = ({
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  endpoint,
  searchParam = 'search',
  pageSize = 20,
  disabled = false,
  className,
  options: staticOptions,
  renderOption,
  getOptionLabel,
  getOptionValue,
  labelKey = 'label',
  valueKey = 'value',
  apiUrl,
  queryParams,
  excludeValues,
  dropdownMinWidth = 360,
  tabIndex = 0,
  initialLabel,
  variant = 'default',
  onCodeSubmit,
  keepOpenAfterCodeSubmit = false,
}) => {
  const { user } = useAuth();
  const { t, direction } = useLanguage();
  const [codeSubmitting, setCodeSubmitting] = useState(false);

  const defaultGetOptionLabel = useCallback((option: Option) => {
    if (getOptionLabel) return getOptionLabel(option);
    return option[labelKey] || option.name || option.title || '';
  }, [getOptionLabel, labelKey]);

  const defaultGetOptionValue = useCallback((option: Option) => {
    if (getOptionValue) return getOptionValue(option);
    const value = option[valueKey] || option.id || option.value || '';
    return typeof value === 'number' ? value.toString() : value;
  }, [getOptionValue, valueKey]);

  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [options, setOptions] = useState<Option[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const [selectedOption, setSelectedOption] = useState<Option | null>(null);
  const [selectedLabel, setSelectedLabel] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [initialValueFetched, setInitialValueFetched] = useState(false);

  const excludeSet = useMemo(
    () => new Set((excludeValues ?? []).map((v) => v.toString())),
    [excludeValues],
  );

  const visibleOptions = useMemo(() => {
    const withoutExcluded = options.filter(
      (option) => !excludeSet.has(defaultGetOptionValue(option).toString()),
    );
    if (!staticOptions || !searchTerm.trim()) return withoutExcluded;
    const q = searchTerm.trim().toLowerCase();
    return withoutExcluded.filter((option) =>
      defaultGetOptionLabel(option).toLowerCase().includes(q),
    );
  }, [options, excludeSet, defaultGetOptionValue, staticOptions, searchTerm, defaultGetOptionLabel]);

  const debouncedSearchTerm = useDebounce(staticOptions ? '' : searchTerm, 400);
  // Stabilize object identity so parent re-renders don't refetch / reset selection
  const queryParamsKey = JSON.stringify(queryParams ?? {});
  const stableQueryParams = useMemo(() => {
    try {
      return queryParamsKey === '{}' ? undefined : (JSON.parse(queryParamsKey) as Record<string, string | number>);
    } catch {
      return undefined;
    }
  }, [queryParamsKey]);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState({
    top: 0,
    bottom: 0,
    left: 0,
    width: 0,
    maxHeight: 300,
    placement: 'bottom' as 'top' | 'bottom',
  });

  const updateDropdownPosition = useCallback(() => {
    const el = triggerRef.current ?? dropdownRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gutter = 8;
    const gap = 4;
    const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - gap - gutter);
    const spaceAbove = Math.max(0, rect.top - gap - gutter);
    // Open upward when the lower space is too short for search + a wrapped option.
    const placement = spaceBelow < 140 && spaceAbove > spaceBelow ? 'top' : 'bottom';
    const availableHeight = placement === 'top' ? spaceAbove : spaceBelow;
    const width = Math.min(
      Math.max(rect.width, dropdownMinWidth),
      Math.max(0, window.innerWidth - gutter * 2),
    );
    setDropdownPosition({
      top: rect.bottom + gap,
      bottom: window.innerHeight - rect.top + gap,
      left: Math.min(Math.max(gutter, rect.left), window.innerWidth - gutter - width),
      width,
      maxHeight: Math.min(320, availableHeight),
      placement,
    });
  }, [dropdownMinWidth]);

  const highlightText = (text: string, query: string) => {
    if (!query.trim()) return text;
    const parts = text.split(new RegExp(`(${query})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase()
        ? <mark key={i} className="bg-yellow-200 text-black">{part}</mark>
        : part
    );
  };

  const fetchOptions = useCallback(async (searchQuery: string, pageNum: number, reset = false) => {
    if (!endpoint && !apiUrl) return;

    if (reset) {
      setLoading(true);
      setOptions([]);
    } else {
      setLoadingMore(true);
    }

    try {
      const params = new URLSearchParams({
        page: pageNum.toString(),
        page_size: pageSize.toString(),
      });

      if (searchQuery.trim()) {
        params.append(searchParam, searchQuery.trim());
      }

      if (stableQueryParams) {
        Object.entries(stableQueryParams).forEach(([key, value]) => {
          params.append(key, value.toString());
        });
      }

      const baseUrl = apiUrl || `${(endpoint || '').replace(/^\/+|\/+$/g, '')}/`;
      const { data } = await api.get(baseUrl, { params });

      let newOptions = [];
      let hasNextPage = false;

      if (Array.isArray(data)) {
        newOptions = data;
        hasNextPage = data.length === pageSize;
      } else if (data.results && Array.isArray(data.results)) {
        newOptions = data.results;
        hasNextPage = !!data.next;
      }

      setOptions(prev => reset ? newOptions : [...prev, ...newOptions]);
      setHasMore(hasNextPage);

    } catch (error) {
      console.error('Error fetching options:', error);
      if (reset) setOptions([]);
      setHasMore(false);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [endpoint, apiUrl, pageSize, searchParam, stableQueryParams]);

  useEffect(() => {
    if (staticOptions) {
      setOptions(staticOptions);
      setHasMore(false);
      return;
    }

    if ((endpoint || apiUrl) && isOpen) {
      setPage(1);
      setHasMore(true);
      fetchOptions(debouncedSearchTerm, 1, true);
    }
  }, [debouncedSearchTerm, endpoint, apiUrl, staticOptions, isOpen, fetchOptions]);

  useEffect(() => {
    if (initialLabel && value !== null && value !== undefined && value !== '') {
      setSelectedLabel(initialLabel);
      setInitialValueFetched(true);
    }
  }, [initialLabel, value]);

  useEffect(() => {
    const fetchInitialValue = async () => {
      if (!value || !endpoint || initialValueFetched) return;
      if (initialLabel) return;

      try {
        const baseUrl = apiUrl || `${(endpoint || '').replace(/^\/+|\/+$/g, '')}/`;
        const { data } = await api.get(`${baseUrl.replace(/\/+$/, '')}/${value}/`);
        setSelectedOption(data);
        setSelectedLabel(defaultGetOptionLabel(data));
        setInitialValueFetched(true);
      } catch (error) {
        console.error('Error fetching initial value:', error);
      }
    };

    if (value !== null && value !== undefined && value !== '') {
      const valueStr = value.toString();
      if (options.length > 0) {
        const selected = options.find(opt => defaultGetOptionValue(opt).toString() === valueStr);
        if (selected) {
          setSelectedOption(selected);
          setSelectedLabel(defaultGetOptionLabel(selected));
          setInitialValueFetched(true);
        } else if (!initialValueFetched && !isOpen) {
          fetchInitialValue();
        }
      } else if (!initialValueFetched && !isOpen && !staticOptions) {
        fetchInitialValue();
      }
    } else {
      setSelectedOption(null);
      setSelectedLabel('');
      setInitialValueFetched(false);
    }
  }, [value, options, defaultGetOptionValue, defaultGetOptionLabel, endpoint, apiUrl, user?.token, initialValueFetched, isOpen, staticOptions, initialLabel]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;

    if (scrollHeight - scrollTop <= clientHeight + 50 && hasMore && !loadingMore && (endpoint || apiUrl)) {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchOptions(debouncedSearchTerm, nextPage, false);
    }
  }, [hasMore, loadingMore, page, debouncedSearchTerm, fetchOptions, endpoint, apiUrl]);

  const handleSelect = (option: Option) => {
    const nextValue = defaultGetOptionValue(option);
    setSelectedOption(option);
    setSelectedLabel(defaultGetOptionLabel(option));
    setInitialValueFetched(true);
    onChange(nextValue, option);
    setIsOpen(false);
    setSearchTerm('');
    setHighlightedIndex(-1);
  };

  const handleClear = () => {
    setSelectedOption(null);
    setSelectedLabel('');
    setInitialValueFetched(false);
    onChange(null, null);
    setSearchTerm('');
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setHighlightedIndex(-1);
  };

  const handleListKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;

    if (e.key === 'Tab') {
      setIsOpen(false);
      setSearchTerm('');
      setHighlightedIndex(-1);
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      setSearchTerm('');
      setHighlightedIndex(-1);
      triggerRef.current?.focus();
      return;
    }

    if (e.key === 'ArrowDown') {
      if (visibleOptions.length === 0) return;
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < visibleOptions.length - 1 ? prev + 1 : prev));
      return;
    }

    if (e.key === 'ArrowUp') {
      if (visibleOptions.length === 0) return;
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1));
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const code = searchTerm.trim();

      // Arrow-highlighted row wins (typed navigation).
      if (highlightedIndex >= 0 && visibleOptions[highlightedIndex]) {
        handleSelect(visibleOptions[highlightedIndex]);
        return;
      }

      // Scanner / exact code: resolve before waiting on debounced search results.
      if (code && onCodeSubmit && !codeSubmitting) {
        setCodeSubmitting(true);
        Promise.resolve(onCodeSubmit(code))
          .then((handled) => {
            if (!handled) return;
            setSearchTerm('');
            setHighlightedIndex(-1);
            if (keepOpenAfterCodeSubmit) {
              setIsOpen(true);
              requestAnimationFrame(() => searchInputRef.current?.focus());
            } else {
              setIsOpen(false);
            }
          })
          .finally(() => setCodeSubmitting(false));
        return;
      }

      // Single visible match — select it (typed search + Enter).
      if (visibleOptions.length === 1) {
        handleSelect(visibleOptions[0]);
      }
    }
  };

  const handleTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setIsOpen((open) => !open);
    } else if (e.key === 'Tab' && isOpen) {
      setIsOpen(false);
      setSearchTerm('');
      setHighlightedIndex(-1);
    } else if (e.key === 'Escape' && isOpen) {
      e.preventDefault();
      setIsOpen(false);
      setSearchTerm('');
      setHighlightedIndex(-1);
    } else if (e.key === 'ArrowDown' && !isOpen) {
      e.preventDefault();
      setIsOpen(true);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const portalElement = document.querySelector('[data-autocomplete-portal]');

      if (dropdownRef.current &&
        !dropdownRef.current.contains(target) &&
        (!portalElement || !portalElement.contains(target))) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };

    const updatePosition = () => {
      if (isOpen) updateDropdownPosition();
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen, updateDropdownPosition]);

  useEffect(() => {
    if (isOpen) {
      if (searchInputRef.current) {
        searchInputRef.current.focus();
        setHighlightedIndex(-1);
      }
      updateDropdownPosition();
    }
  }, [isOpen, updateDropdownPosition]);

  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const item = listRef.current.children[highlightedIndex] as HTMLElement;
      if (item) item.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex]);

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <div
        ref={triggerRef}
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        tabIndex={disabled ? -1 : tabIndex}
        className={cn(
          'flex h-10 min-h-10 w-full items-center justify-between rounded-md border bg-background px-3 py-2 text-sm ring-offset-background',
          variant === 'filter'
            ? 'h-9 min-h-9 border-border/70 py-1.5 shadow-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30'
            : 'border-input focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
          'placeholder:text-muted-foreground',
          disabled && 'cursor-not-allowed opacity-50',
          !disabled && (variant === 'filter' ? 'cursor-pointer hover:border-border' : 'cursor-pointer hover:bg-accent'),
          className
        )}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleTriggerKeyDown}
      >
        <span
          className={cn(
            'truncate',
            !selectedOption && !selectedLabel && placeholder === undefined && 'text-muted-foreground',
          )}
        >
          {selectedOption
            ? defaultGetOptionLabel(selectedOption)
            : selectedLabel || (placeholder ?? t('common.selectOption', 'Select option...'))}
        </span>
        <div className="flex items-center gap-1">
          {(selectedOption || selectedLabel) && !disabled && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleClear();
              }}
              className="rounded-sm opacity-70 hover:opacity-100"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <ChevronDown className={cn('h-4 w-4 opacity-50 transition-transform', isOpen && 'rotate-180')} />
        </div>
      </div>

      {isOpen && createPortal(
        <div
          data-autocomplete-portal
          className="fixed z-[9999] overflow-hidden rounded-md border bg-popover shadow-lg"
          style={{
            top: dropdownPosition.placement === 'bottom' ? `${dropdownPosition.top}px` : 'auto',
            bottom: dropdownPosition.placement === 'top' ? `${dropdownPosition.bottom}px` : 'auto',
            left: `${dropdownPosition.left}px`,
            width: `${dropdownPosition.width}px`,
            minWidth: `${dropdownPosition.width}px`,
            maxWidth: `${dropdownPosition.width}px`,
            maxHeight: `${dropdownPosition.maxHeight}px`,
            boxSizing: 'border-box',
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={cn(
            "flex shrink-0 items-center border-b px-3 py-2",
            direction === 'rtl' ? 'flex-row-reverse' : 'flex-row'
          )}>
            <Search className={cn(
              "h-4 w-4 shrink-0 opacity-50",
              direction === 'rtl' ? 'ml-2' : 'mr-2'
            )} />
            <input
              ref={searchInputRef}
              type="text"
              placeholder={searchPlaceholder || t('common.search', 'Search...')}
              value={searchTerm}
              onChange={handleSearchChange}
              onKeyDown={handleListKeyDown}
              className={cn(
                "flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground",
                direction === 'rtl' ? 'text-right' : 'text-left'
              )}
            />
          </div>

          <div
            ref={listRef}
            className="overflow-auto p-1"
            style={{ maxHeight: `${Math.max(0, dropdownPosition.maxHeight - 44)}px` }}
            onScroll={handleScroll}
          >
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className={cn(
                  "text-sm text-muted-foreground",
                  direction === 'rtl' ? 'mr-2' : 'ml-2'
                )}>{t('common.loading', 'Loading...')}</span>
              </div>
            ) : visibleOptions.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                {t('common.noOptionsFound', 'No options found')}
              </div>
            ) : (
              <>
                {visibleOptions.map((option, index) => {
                  const label = defaultGetOptionLabel(option);
                  return (
                    <div
                      key={`${defaultGetOptionValue(option)}-${index}`}
                      className={cn(
                        'group relative flex cursor-pointer select-none items-start rounded-sm px-2 py-2 text-sm outline-none',
                        'whitespace-normal break-words leading-snug text-foreground',
                        'hover:bg-muted focus:bg-muted',
                        highlightedIndex === index && 'bg-muted',
                        defaultGetOptionValue(option).toString() === value?.toString() && 'bg-muted/70',
                      )}
                      onMouseEnter={() => setHighlightedIndex(index)}
                      onClick={() => handleSelect(option)}
                    >
                      <span className="min-w-0 flex-1 text-foreground">
                        {renderOption ? renderOption(option) : highlightText(label, searchTerm)}
                      </span>
                    </div>
                  );
                })}

                {loadingMore && (
                  <div className="flex items-center justify-center py-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className={cn(
                      "text-sm text-muted-foreground",
                      direction === 'rtl' ? 'mr-2' : 'ml-2'
                    )}>{t('common.loadingMore', 'Loading more...')}</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default Autocomplete;
