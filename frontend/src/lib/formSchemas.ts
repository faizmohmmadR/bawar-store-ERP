import { z } from 'zod';

type TranslateFn = (key: string, fallback?: string) => string;

export const formMessages = (t: TranslateFn) => ({
  required: t('validation.required', 'Required'),
  email: t('customers.emailInvalid', 'Invalid email'),
  positive: t('validation.positive', 'Must be positive'),
  maxLength: t('validation.maxLength', 'Maximum length exceeded'),
  passwordsMismatch: t('customers.passwordsDoNotMatch', "Passwords don't match"),
});

export const requiredString = (message: string) => z.string().trim().min(1, message);

export const optionalString = () => z.string().optional().or(z.literal(''));

export const emailString = (requiredMsg: string, invalidMsg: string) =>
  z.string().trim().min(1, requiredMsg).email(invalidMsg);
