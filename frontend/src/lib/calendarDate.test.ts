import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  calendarMonthOptions, calendarPeriodRange, formatAppDate, formatAppDateTime,
  formatPayrollPeriod, parseGregorianIso, payrollPeriodFromDate, payrollPeriodStart,
  toDateObject, toGregorianIsoDate, formatStoredDate,
} from './calendarDate';
import { buildGlReportParams } from './reportPeriod';

test('dates round-trip through all three calendars without changing the API date', () => {
  for (const system of ['gregorian', 'jalali', 'hijri'] as const) {
    for (const iso of ['2024-02-29', '2026-03-21', '2026-10-17', '2026-12-31']) {
      const date = toDateObject(iso, system)!;
      assert.equal(toGregorianIsoDate(date), iso);
      assert.equal(formatAppDate(iso, system, { language: 'en' }), date.format('DD/MM/YYYY'));
    }
  }
});

test('Afghan Solar Hijri uses Afghan month names and its own year', () => {
  assert.equal(formatAppDate('2026-03-21', 'jalali', { language: 'en' }), '01/01/1405');
  assert.equal(calendarMonthOptions('jalali', 'en')[0].label, 'Hamal');
  assert.notEqual(calendarMonthOptions('hijri', 'en')[0].label, 'January');
  assert.equal(calendarMonthOptions('gregorian', 'en')[0].label, 'January');
  assert.equal(calendarMonthOptions('jalali', 'fa')[0].label, 'حمل');
  assert.equal(calendarMonthOptions('gregorian', 'fa')[0].label, 'جنوری');
  assert.equal(calendarMonthOptions('gregorian', 'fa')[10].label, 'نومبر');
});

test('date-only values stay on their day; timestamps preserve their actual time', () => {
  assert.equal(toGregorianIsoDate(parseGregorianIso('2026-10-17')), '2026-10-17');
  assert.equal(parseGregorianIso('2026-10-17T15:42:00Z')!.getUTCHours(), 15);
  assert.equal(parseGregorianIso('2026-10-17T15:42:00Z')!.getUTCMinutes(), 42);
  assert.equal(parseGregorianIso('2026-02-30'), null);
  assert.equal(formatAppDateTime('invalid', 'jalali'), '—');
});

test('month/year report boundaries follow the selected calendar', () => {
  assert.deepEqual(calendarPeriodRange('yearly', 'jalali', '2026-10-17'), {
    dateFrom: '2026-03-21', dateTo: '2026-10-17',
  });
  for (const system of ['gregorian', 'jalali', 'hijri'] as const) {
    const month = calendarPeriodRange('monthly', system, '2026-10-17');
    assert.equal(toDateObject(month.dateFrom, system)!.day, 1);
    const year = calendarPeriodRange('yearly', system, '2026-10-17');
    assert.equal(toDateObject(year.dateFrom, system)!.month.number, 1);
    assert.equal(toDateObject(year.dateFrom, system)!.day, 1);
  }
});

test('payroll periods preserve their calendar and display cross-calendar ranges', () => {
  assert.equal(payrollPeriodStart('january', 1405, 'jalali'), '2026-03-21');
  assert.deepEqual(payrollPeriodFromDate('2026-03-21', 'jalali'), {
    month: 'january', year: 1405, period_calendar: 'jalali',
  });
  assert.equal(formatPayrollPeriod('january', 1405, 'jalali', 'jalali', 'en'), 'Hamal 1405');
  const converted = formatPayrollPeriod('october', 2026, 'gregorian', 'jalali', 'en');
  assert.ok(converted.includes(' – '), 'a Gregorian month spans a range of selected-calendar dates');
  assert.ok(converted.includes('1405'));
});

test('report presets send explicit ISO ranges; fiscal-year selection is preserved', () => {
  const params = buildGlReportParams('monthly', '', '');
  assert.equal(params.period, 'custom');
  assert.match(params.start_date, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(buildGlReportParams('yearly', '', '', '12'), { fiscal_year_id: '12' });
});

test('stored Settings preference controls shared formatting and report requests', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const storage = { getItem: (key: string) => key === 'erp-calendar' ? 'jalali' : 'en' };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    localStorage: storage,
  } });
  try {
    assert.equal(formatStoredDate('2026-03-21'), '01/01/1405');
    const params = buildGlReportParams('yearly', '', '');
    const start = toDateObject(params.start_date, 'jalali')!;
    assert.equal(start.month.number, 1);
    assert.equal(start.day, 1);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else Reflect.deleteProperty(globalThis, 'window');
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
