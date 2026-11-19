import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import { AxiosError, AxiosResponse } from "axios";
import { useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { formatApiError, notifyError, notifySuccess } from "@/lib/notify";

interface UseAddProps<T> {
  queryKey: string | string[];
  endpoint?: string;
  customSuccessMessage?: string;
  customErrorMessage?: string;
  showSuccessToast?: boolean;
  showErrorToast?: boolean;
  invalidateQueries?: boolean;
  headers?: Record<string, string>;
}

interface UseAddReturn<T> {
  handleAdd: (data?: T | FormData | null, overrideEndpoint?: string) => void;
  isSuccess: boolean;
  loading: boolean;
  responseData: T | null;
  error: AxiosError | null;
}

const useAdd = <T,>({
  queryKey,
  endpoint,
  customSuccessMessage = null,
  customErrorMessage = null,
  showSuccessToast = true,
  showErrorToast = true,
  invalidateQueries = true,
  headers = {},
}: UseAddProps<T>): UseAddReturn<T> => {
  const normalizedQueryKey = Array.isArray(queryKey) ? queryKey : [queryKey];
  const { t } = useLanguage();
  const { getUser, logout } = useAuth();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [responseData, setResponseData] = useState<T | null>(null);
  const [error, setError] = useState<AxiosError | null>(null);



  // Default messages
  const defaultSuccessMessage =
    t("api.use_add.dataAddedSuccess") || "Data added successfully";
  const defaultErrorMessage = t("api.use_add.addFailed") || "Failed to add data";
  const successMessage = customSuccessMessage || defaultSuccessMessage;
  const errorMessage = customErrorMessage || defaultErrorMessage;

  const addMutation = useMutation<
    T,
    AxiosError<Record<string, string | string[]>>,
    { data: T | FormData | null | undefined; overrideEndpoint?: string }
  >({
    mutationFn: async ({ data, overrideEndpoint }) => {
      try {
        setLoading(true);
        setError(null);
        setIsSuccess(false);
        
        const isLoginRequest = normalizedQueryKey[0] === 'login' || endpoint === 'login/';
        
        if (!isLoginRequest) {
          // Check if user is authenticated for non-login requests
          const user = getUser();
          if (!user || !user.token) {
            throw new Error('User not authenticated');
          }
        }
        
        const requestHeaders: Record<string, string> = { ...headers };
        
        // Don't set Content-Type for FormData, let browser set it with boundary
        if (!(data instanceof FormData)) {
          requestHeaders['Content-Type'] = 'application/json';
        }
        
        const apiEndpoint = overrideEndpoint || endpoint || `${normalizedQueryKey[0]}/`;
        const payload = data ?? {};
        
        const response: AxiosResponse<T> = await api.post(
          `/${apiEndpoint.replace(/^\/+/, '')}`,
          payload,
          { headers: requestHeaders },
        );
        setResponseData(response.data);
        return response.data;
      } catch (error) {
        // Handle authentication errors for non-login requests
        if (error instanceof Error && error.message === 'User not authenticated' && normalizedQueryKey[0] !== 'login') {
          logout();
        }
        throw error;
      }
    },
    onSuccess: (data) => {
      setLoading(false);
      setIsSuccess(true);
      if (showSuccessToast) {
        notifySuccess(successMessage, {
          title: t("common.success") || "Success",
          dismissLabel: t("common.dismiss") || "Dismiss",
        });
      }
      setTimeout(() => { setIsSuccess(false); }, 100);
      if (invalidateQueries) {
        queryClient.invalidateQueries({ queryKey: normalizedQueryKey, exact: false });
      }
    },
    onError: (error: AxiosError<Record<string, string | string[]>>) => {
      setLoading(false);
      setIsSuccess(false);
      setError(error);
      if (showErrorToast) {
        const backendErrors = error.response?.data;
        if (backendErrors && typeof backendErrors === "object") {
          notifyError(formatApiError(error, errorMessage), {
            title: t("common.validationError", "Validation Error"),
            dismissLabel: t("common.dismiss") || "Dismiss",
          });
        } else {
          const statusCode = error.response?.status || "Unknown";
          const statusText = error.response?.statusText || "Error";
          notifyError(
            error.message || errorMessage || "An unexpected error occurred",
            {
              title: `${statusText} (${statusCode})`,
              dismissLabel: t("common.dismiss") || "Dismiss",
            },
          );
        }
      }
    },
  });

  const handleAdd = (data?: T | FormData | null, overrideEndpoint?: string) => {
    addMutation.mutate({ data, overrideEndpoint });
  };

  return {
    handleAdd,
    isSuccess,
    loading,
    responseData,
    error,
  };
};

export default useAdd;
