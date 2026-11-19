import * as React from "react"

import { cn } from "@/lib/utils"
import { getNumericInputMode, normalizeWesternDigits, numericDraftMatches } from "@/lib/numericInput"
import { CalendarInput } from './calendar-input'

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, onChange, onInput, onCompositionEnd, inputMode, dir, lang, step, onBlur, ...props }, ref) => {
    const isNumeric = type === "number" || inputMode === "decimal" || inputMode === "numeric"
    const [draft, setDraft] = React.useState<string | null>(null)
    const normalizedValue = props.value == null ? props.value : normalizeWesternDigits(String(props.value))
    const numericValue = draft !== null && numericDraftMatches(normalizedValue, draft) ? draft : normalizedValue

    if (type === 'date' || type === 'datetime-local' || type === 'month') {
      return <CalendarInput ref={ref} type={type} className={className} onChange={onChange} onBlur={onBlur} step={step} {...props} />
    }

    const applyWesternDigits = (input: HTMLInputElement) => {
      const normalized = normalizeWesternDigits(input.value)
      if (normalized !== input.value) {
        const position = input.selectionStart
        const normalizedPosition = position == null ? null : normalizeWesternDigits(input.value.slice(0, position)).length
        input.value = normalized
        if (normalizedPosition != null) input.setSelectionRange(normalizedPosition, normalizedPosition)
      }
      return normalized
    }

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      if (isNumeric) {
        const normalized = applyWesternDigits(event.target)
        setDraft(normalized)
      }
      onChange?.(event)
    }

    const handleInput = (event: React.FormEvent<HTMLInputElement>) => {
      if (isNumeric) {
        applyWesternDigits(event.currentTarget)
      }
      onInput?.(event)
    }

    const handleCompositionEnd = (event: React.CompositionEvent<HTMLInputElement>) => {
      if (isNumeric) {
        applyWesternDigits(event.currentTarget)
      }
      onCompositionEnd?.(event)
    }

    if (isNumeric) {
      return (
        <input
          type="text"
          inputMode={inputMode ?? getNumericInputMode(step)}
          dir="ltr"
          lang="en"
          step={step ?? "any"}
          className={cn(
            "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base text-left tabular-nums ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
          ref={ref}
          onChange={handleChange}
          onInput={handleInput}
          onCompositionEnd={handleCompositionEnd}
          {...props}
          value={numericValue}
          defaultValue={props.defaultValue == null ? props.defaultValue : normalizeWesternDigits(String(props.defaultValue))}
          onBlur={(event) => { setDraft(null); onBlur?.(event) }}
        />
      )
    }

    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        onChange={onChange}
        onBlur={onBlur}
        onInput={onInput}
        onCompositionEnd={onCompositionEnd}
        inputMode={inputMode}
        dir={dir}
        lang={lang}
        step={step}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
