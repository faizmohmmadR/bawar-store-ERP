import { BaseEntity } from './common';

export interface ExchangeRate extends BaseEntity {
  from_currency: number;
  to_currency: number;
  from_currency_details?: { id: number; code: string; name: string; symbol: string };
  to_currency_details?: { id: number; code: string; name: string; symbol: string };
  rate: number;
  date: string;
  is_active: boolean;
}

export interface ExchangeRateFormData {
  from_currency: string;
  to_currency: string;
  rate: number;
  date: string;
  is_active: boolean;
}