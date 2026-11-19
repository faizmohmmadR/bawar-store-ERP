import * as React from 'react';
import { DatePickerInput } from './date-picker-input';
import { cn } from '@/lib/utils';

/** Native input contract, with a calendar-aware date and a separate local time. */
export const CalendarInput = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ type, value, defaultValue, onChange, onBlur, disabled, readOnly, name, id, className, min, max, ...props }, forwardedRef) => {
    const [internal, setInternal] = React.useState(String(defaultValue ?? ''));
    const input = React.useRef<HTMLInputElement>(null);
    const wrapper = React.useRef<HTMLDivElement>(null);
    const current = String(value ?? internal);
    const hasTime = type === 'datetime-local';
    const date = current.slice(0, 10);
    const time = current.includes('T') ? current.split('T')[1].slice(0, 8) : '';
    React.useImperativeHandle(forwardedRef, () => {
      const element = input.current!;
      element.focus = () => wrapper.current?.querySelector('button')?.focus();
      return element;
    });
    const change = (next: string) => {
      setInternal(next);
      if (!input.current) return;
      input.current.value = next;
      onChange?.({ target: input.current, currentTarget: input.current, type: 'change' } as React.ChangeEvent<HTMLInputElement>);
    };
    return <div ref={wrapper} className={cn('flex min-w-0 items-center gap-2', className)} style={props.style}
      aria-invalid={props['aria-invalid']} aria-describedby={props['aria-describedby']}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onBlur?.(event as unknown as React.FocusEvent<HTMLInputElement>);
      }}>
      <input ref={input} type="hidden" name={name} value={current} disabled={disabled} />
      <div className="min-w-0 flex-1"><DatePickerInput id={id} ariaLabel={props['aria-label']}
        ariaDescribedBy={props['aria-describedby']} ariaInvalid={props['aria-invalid']}
        value={type === 'month' && date ? `${date}-01` : date}
        onChange={(next) => change(!next ? '' : type === 'month' ? next.slice(0, 7) : hasTime ? `${next}T${time || '12:00'}` : next)}
        disabled={disabled || readOnly} onlyMonthPicker={type === 'month'}
        min={typeof min === 'string' ? min.slice(0, 10) : undefined} max={typeof max === 'string' ? max.slice(0, 10) : undefined} /></div>
      {hasTime && <input type="time" aria-label="Time" value={time} disabled={disabled} readOnly={readOnly}
        className="h-9 w-28 shrink-0 rounded-md border border-input bg-background px-2 text-sm" step={props.step}
        onChange={(event) => change(date ? `${date}T${event.target.value || '00:00'}` : '')} />}
    </div>;
  },
);
CalendarInput.displayName = 'CalendarInput';
