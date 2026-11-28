import { useCalendarPreference } from '@/contexts/CalendarPreferenceContext';
import { useCallback, useMemo, useState } from 'react';
import {
  type PartyPeriod,
  resolvePartyPeriodRange,
} from '@/lib/partyPeriod';

type UsePartyPeriodFilterOptions = {
  /** Called whenever the effective filter range may change. */
  onFilterChange?: () => void;
  initialPeriod?: PartyPeriod;
};

/**
 * Shared daily / weekly / monthly / yearly / custom range state for
 * customer and vendor list + details pages.
 */
export function usePartyPeriodFilter(options: UsePartyPeriodFilterOptions = {}) {
  const { onFilterChange, initialPeriod = 'monthly' } = options;
  const { calendar } = useCalendarPreference();
  const [period, setPeriodState] = useState<PartyPeriod>(initialPeriod);
  const [customFrom, setCustomFromState] = useState('');
  const [customTo, setCustomToState] = useState('');

  const { dateFrom, dateTo } = useMemo(
    () => resolvePartyPeriodRange(period, customFrom, customTo, calendar),
    [period, customFrom, customTo, calendar],
  );

  const bump = useCallback(() => {
    onFilterChange?.();
  }, [onFilterChange]);

  const setPeriod = useCallback(
    (next: PartyPeriod) => {
      setPeriodState(next);
      bump();
    },
    [bump],
  );

  const setCustomFrom = useCallback(
    (value: string) => {
      setCustomFromState(value);
      setPeriodState('custom');
      bump();
    },
    [bump],
  );

  const setCustomTo = useCallback(
    (value: string) => {
      setCustomToState(value);
      setPeriodState('custom');
      bump();
    },
    [bump],
  );

  const clear = useCallback(() => {
    setPeriodState('all');
    setCustomFromState('');
    setCustomToState('');
    bump();
  }, [bump]);

  const isFiltered =
    period !== 'all'
    && (period !== 'custom' || Boolean(customFrom || customTo));

  return {
    period,
    setPeriod,
    customFrom,
    setCustomFrom,
    customTo,
    setCustomTo,
    dateFrom,
    dateTo,
    clear,
    isFiltered,
  };
}
