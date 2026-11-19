export type ValidationIssue = { path: string; message: string };
export type ErrorPathLabel = (path: string) => string;

export function collectFormIssues(errors: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const walk = (value: unknown, path: string) => {
    if (!value || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    if (typeof record.message === 'string' && record.message.trim()) {
      issues.push({ path, message: record.message.trim() });
      return;
    }
    for (const [key, child] of Object.entries(record)) {
      if (['ref', 'type', 'types'].includes(key)) continue;
      walk(child, path ? `${path}.${key}` : key);
    }
  };
  walk(errors, '');
  return issues;
}

export function collectApiIssues(payload: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const walk = (value: unknown, path: string) => {
    if (typeof value === 'string' && value.trim()) issues.push({ path, message: value.trim() });
    else if (Array.isArray(value)) {
      const messages = value.every(entry => typeof entry === 'string');
      value.forEach((entry, index) => walk(entry, messages ? path : path ? `${path}.${index}` : `${index}`));
    } else if (value && typeof value === 'object') {
      for (const [key, entry] of Object.entries(value)) walk(entry, path ? `${path}.${key}` : key);
    }
  };
  walk(payload, '');
  return issues;
}

export function defaultErrorLabel(path: string): string {
  return path.split('.').filter(part => !['root', 'server', 'detail', 'non_field_errors'].includes(part))
    .map(part => /^\d+$/.test(part) ? String(Number(part) + 1) : part.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2'))
    .join(' · ').replace(/^./, character => character.toUpperCase());
}

export function formatValidationIssues(issues: ValidationIssue[], fallback: string, label: ErrorPathLabel = defaultErrorLabel): string {
  return [...new Set(issues.map(issue => {
    const field = label(issue.path);
    return field ? `${field}: ${issue.message}` : issue.message;
  }))].join('\n') || fallback;
}
