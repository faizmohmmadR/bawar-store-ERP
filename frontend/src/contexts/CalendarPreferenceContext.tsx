import React, { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export type CalendarSystem = 'gregorian' | 'jalali' | 'hijri';

const STORAGE_KEY = 'erp-calendar';

const CALENDAR_SYSTEMS: CalendarSystem[] = ['gregorian', 'jalali', 'hijri'];

export function isCalendarSystem(value: unknown): value is CalendarSystem {
  return typeof value === 'string' && CALENDAR_SYSTEMS.includes(value as CalendarSystem);
}

export function getStoredCalendarSystem(): CalendarSystem {
  if (typeof window === 'undefined') return 'gregorian';
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (isCalendarSystem(raw)) return raw;
  } catch {
    // ignore storage errors
  }
  return 'gregorian';
}

export function saveCalendarSystem(calendar: CalendarSystem) {
  try {
    window.localStorage.setItem(STORAGE_KEY, calendar);
  } catch {
    // ignore storage errors
  }
}

type CalendarPreferenceContextType = {
  calendar: CalendarSystem;
  setCalendar: (calendar: CalendarSystem) => void;
};

const CalendarPreferenceContext = createContext<CalendarPreferenceContextType | undefined>(
  undefined,
);

export function CalendarPreferenceProvider({ children }: { children: ReactNode }) {
  const [calendar, setCalendarState] = useState<CalendarSystem>(() => getStoredCalendarSystem());

  const setCalendar = (next: CalendarSystem) => {
    setCalendarState(next);
    saveCalendarSystem(next);
  };

  const value = useMemo(
    () => ({
      calendar,
      setCalendar,
    }),
    [calendar],
  );

  return (
    <CalendarPreferenceContext.Provider value={value}>
      {children}
    </CalendarPreferenceContext.Provider>
  );
}

export function useCalendarPreference(): CalendarPreferenceContextType {
  const context = useContext(CalendarPreferenceContext);
  if (!context) {
    throw new Error('useCalendarPreference must be used within a CalendarPreferenceProvider');
  }
  return context;
}
