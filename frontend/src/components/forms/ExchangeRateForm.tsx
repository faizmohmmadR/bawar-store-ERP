import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CurrencySelect } from "@/components/forms/CurrencySelect";
import { useLanguage } from "@/contexts/LanguageContext";
import { ReloadIcon } from "@radix-ui/react-icons";
import useAdd from "@/api/useAdd";
import useUpdate from "@/api/useUpdate";
import useFetchObjects from "@/api/useFetchObjects";
import {
  getBaseCurrency,
} from "@/lib/currencyChoices";
import { resolveCurrencyId, toCurrencyFkId } from "@/lib/currencies";
import { ExchangeRate, ExchangeRateFormData } from "@/types/settings";

interface ExchangeRateFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: ExchangeRateFormData) => void;
  exchangeRate?: ExchangeRate | null;
}

const getCurrentDateTime = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const defaultForm: ExchangeRateFormData = {
  from_currency: "",
  to_currency: "",
  rate: 0,
  date: getCurrentDateTime(),
  is_active: true,
};

export const ExchangeRateForm: React.FC<ExchangeRateFormProps> = ({
  isOpen,
  onClose,
  onSave,
  exchangeRate,
}) => {
  const { t } = useLanguage();
  const baseCurrency = getBaseCurrency();
  const [formData, setFormData] = useState<ExchangeRateFormData>(defaultForm);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { handleAdd, loading: addLoading } = useAdd<ExchangeRateFormData>({
    queryKey: ["exchange-rates"],
    endpoint: "exchange-rates/",
  });

  const { handleUpdate, loading: updateLoading } = useUpdate<ExchangeRateFormData>({
    queryKey: ["exchange-rates"],
    endpoint: "exchange-rates/",
  });

  const loading = addLoading || updateLoading;

  useEffect(() => {
    if (exchangeRate && isOpen) {
      setFormData({
        from_currency: resolveCurrencyId({
          currency: exchangeRate.from_currency,
          currency_details: exchangeRate.from_currency_details,
        }),
        to_currency: resolveCurrencyId({
          currency: exchangeRate.to_currency,
          currency_details: exchangeRate.to_currency_details,
        }) || (baseCurrency?.id ? String(baseCurrency.id) : ''),
        rate: exchangeRate.rate || 0,
        date: exchangeRate.date ? new Date(exchangeRate.date).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16),
        is_active: exchangeRate.is_active ?? true,
      });
    } else if (!isOpen) {
      setFormData(defaultForm);
      setErrors({});
    }
  }, [exchangeRate, isOpen, baseCurrency]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!formData.from_currency) newErrors.from_currency = t("validation.required");
    if (!formData.to_currency) newErrors.to_currency = t("validation.required");
    if (formData.from_currency === formData.to_currency) {
      newErrors.to_currency = t("settings.exchangeRates.sameCurrencyError");
    }
    if (!formData.rate || formData.rate <= 0) newErrors.rate = t("settings.exchangeRates.rateError");
    if (!formData.date) newErrors.date = t("validation.required");
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    try {
      const submitData = {
        ...formData,
        from_currency: toCurrencyFkId(formData.from_currency),
        to_currency: toCurrencyFkId(formData.to_currency),
        date: new Date(formData.date).toISOString(),
      };
      
      if (exchangeRate) {
        await handleUpdate(exchangeRate.id, submitData);
      } else {
        await handleAdd(submitData);
      }
      onSave(formData);
      onClose();
    } catch (err) {
      // Error handled by hooks
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {exchangeRate ? t("settings.exchangeRates.edit") : t("settings.exchangeRates.add")}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <CurrencySelect
            label={t("settings.exchangeRates.fromCurrency")}
            required
            value={formData.from_currency}
            onChange={(value) => {
              setFormData((prev) => ({ ...prev, from_currency: value }));
              if (errors.from_currency) setErrors((prev) => ({ ...prev, from_currency: "" }));
            }}
            excludeBase
            placeholder={t("settings.exchangeRates.selectCurrency")}
            error={errors.from_currency}
          />
          <CurrencySelect
            label={t("settings.exchangeRates.toCurrency")}
            required
            value={formData.to_currency}
            onChange={(value) => {
              setFormData((prev) => ({ ...prev, to_currency: value }));
              if (errors.to_currency) setErrors((prev) => ({ ...prev, to_currency: "" }));
            }}
            includeIds={baseCurrency ? [baseCurrency.id] : undefined}
            disabled
            placeholder={t("settings.exchangeRates.selectCurrency")}
            error={errors.to_currency}
          />
          <div className="grid gap-2">
            <Label htmlFor="rate">{t("settings.exchangeRates.rate")} *</Label>
            <Input
              id="rate"
              type="number"
              step="0.01"
              value={formData.rate}
              onChange={(e) => {
                setFormData((prev) => ({ ...prev, rate: parseFloat(e.target.value) || 0 }));
                if (errors.rate) setErrors((prev) => ({ ...prev, rate: "" }));
              }}
              placeholder="1.00"
            />
            {errors.rate && (
              <p className="text-sm text-destructive">{errors.rate}</p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="date">{t("settings.exchangeRates.date")} *</Label>
            <Input
              id="date"
              type="datetime-local"
              value={formData.date}
              onChange={(e) => {
                setFormData((prev) => ({ ...prev, date: e.target.value }));
                if (errors.date) setErrors((prev) => ({ ...prev, date: "" }));
              }}
            />
            {errors.date && (
              <p className="text-sm text-destructive">{errors.date}</p>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <Switch
              id="is_active"
              checked={formData.is_active}
              onCheckedChange={(checked) =>
                setFormData((prev) => ({ ...prev, is_active: checked }))
              }
            />
            <Label htmlFor="is_active">{t("settings.exchangeRates.active")}</Label>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? (
              <>
                <ReloadIcon className="animate-spin mr-2" />
                {exchangeRate ? t("common.updating") : t("common.adding")}
              </>
            ) : (
              t(exchangeRate ? "common.update" : "common.add")
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};