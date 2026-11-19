import React, { useState } from 'react';
import { Button } from './button';
import { Input } from './input';
import { Label } from './label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from './sheet';
import { DatePickerInput } from './date-picker-input';
import { Filter } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';

export interface FilterField {
  key: string;
  label: string;
  type: 'text' | 'select' | 'date' | 'number' | 'dateRange';
  options?: { value: string; label: string }[];
  placeholder?: string;
}

export interface FilterValue {
  [key: string]: any;
}

interface AdvancedFilterProps {
  fields: FilterField[];
  onApplyFilters: (filters: FilterValue) => void;
  onClearFilters: () => void;
  currentFilters: FilterValue;
}

export const AdvancedFilter: React.FC<AdvancedFilterProps> = ({
  fields,
  onApplyFilters,
  onClearFilters,
  currentFilters
}) => {
  const { t, direction } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [localFilters, setLocalFilters] = useState<FilterValue>(currentFilters);

  const updateFilter = (key: string, value: any) => {
    setLocalFilters(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleApply = () => {
    onApplyFilters(localFilters);
    setIsOpen(false);
  };

  const handleClear = () => {
    setLocalFilters({});
    onClearFilters();
    setIsOpen(false);
  };

  const activeFiltersCount = Object.keys(currentFilters).filter(key => 
    currentFilters[key] !== undefined && currentFilters[key] !== ''
  ).length;

  const renderFilterField = (field: FilterField) => {
    switch (field.type) {
      case 'text':
      case 'number':
        return (
          <Input
            type={field.type}
            placeholder={field.placeholder || field.label}
            value={localFilters[field.key] || ''}
            onChange={(e) => updateFilter(field.key, e.target.value)}
            className="w-full"
          />
        );

      case 'select':
        return (
          <Select
            value={localFilters[field.key] || ''}
            onValueChange={(value) => updateFilter(field.key, value)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={field.placeholder || `Select ${field.label}`} />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case 'date':
        return (
          <DatePickerInput
            value={localFilters[field.key] || ''}
            onChange={(value) => updateFilter(field.key, value)}
            placeholder={field.placeholder || `Pick ${field.label}`}
            className="w-full"
          />
        );

      case 'dateRange':
        return (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground">From</Label>
              <DatePickerInput
                value={localFilters[`${field.key}_from`] || ''}
                onChange={(value) => updateFilter(`${field.key}_from`, value)}
                placeholder="From"
                className="w-full"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">To</Label>
              <DatePickerInput
                value={localFilters[`${field.key}_to`] || ''}
                onChange={(value) => updateFilter(`${field.key}_to`, value)}
                placeholder="To"
                className="w-full"
              />
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="relative">
          <Filter size={16} />
          {t('common.filter')}
          {activeFiltersCount > 0 && (
            <span className="absolute -top-2 -right-2 bg-primary text-primary-foreground rounded-full w-5 h-5 text-xs flex items-center justify-center">
              {activeFiltersCount}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className={cn("w-full sm:max-w-md", direction === 'rtl' && "left-0 right-auto")}>
        <SheetHeader>
          <SheetTitle>{t('common.advancedFilter')}</SheetTitle>
          <SheetDescription>
            {t('common.filterDescription')}
          </SheetDescription>
        </SheetHeader>
        
        <div className="grid gap-4 py-4">
          {fields.map((field) => (
            <div key={field.key} className="grid gap-2">
              <Label htmlFor={field.key}>{field.label}</Label>
              {renderFilterField(field)}
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2 pt-4">
          <Button onClick={handleApply} className="w-full">
            {t('common.applyFilters')}
          </Button>
          <Button variant="outline" onClick={handleClear} className="w-full">
            {t('common.clearFilters')}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};