import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import { AxiosError, AxiosResponse } from "axios";
import { useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatApiError, notifyError, notifySuccess } from "@/lib/notify";
import { useAuth } from "@/contexts/AuthContext";

interface UseUpdateProps<T> {
  queryKey: string | string[];
  endpoint?: string;
  customSuccessMessage?: string;
  customErrorMessage?: string;
  showSuccessToast?: boolean;
  showErrorToast?: boolean;
  invalidateQueries?: boolean;
}

interface UseUpdateReturn<T> {
  handleUpdate: (
    idOrData: string | number | Partial<T> | FormData,
    data?: Partial<T> | FormData,
  ) => void;
  loading: boolean;
  success: boolean;
  isSuccess: boolean;
}

const useUpdate = <T,>({
  queryKey,
  endpoint,
  customSuccessMessage,
  customErrorMessage,
  showSuccessToast = true,
  showErrorToast = true,
  invalidateQueries = true,
}: UseUpdateProps<T>): UseUpdateReturn<T> => {
  const normalizedQueryKey = Array.isArray(queryKey) ? queryKey : [queryKey];
  const { t } = useLanguage();
  const { getUser, logout } = useAuth();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const resolvePatchUrl = (id?: string | number) => {
    if (endpoint) {
      const trimmed = endpoint.replace(/^\/+|\/+$/g, "");
      if (!id) {
        return `/${trimmed}/`;
      }
      if (trimmed.endsWith(String(id))) {
        return `/${trimmed}/`;
      }
      return `/${trimmed}/${id}/`;
    }
    return `/${normalizedQueryKey[0]}/${id}/`;
  };

  const updateMutation = useMutation<
    T,
    AxiosError<Record<string, string | string[]>>,
    { id?: string | number; data: Partial<T> | FormData }
  >({
    mutationFn: async ({ id, data }) => {
      try {
        setLoading(true);

        const user = getUser();
        if (!user || !user.token) {
          throw new Error("User not authenticated");
        }

        const headers: Record<string, string> = {};
        if (!(data instanceof FormData)) {
          headers["Content-Type"] = "application/json";
        }

        const response: AxiosResponse<T> = await api.patch(
          resolvePatchUrl(id),
          data,
          { headers },
        );
        return response.data;
      } catch (error) {
        if (error instanceof Error && error.message === "User not authenticated") {
          logout();
        }
        throw error;
      }
    },
    onSuccess: () => {
      setLoading(false);
      setSuccess(true);
      setIsSuccess(true);
      if (showSuccessToast) {
        const successMessage = customSuccessMessage || t("api.use_update.dataUpdatedSuccess") || "Data updated successfully";
        notifySuccess(successMessage, {
          title: t("common.success") || "Success",
          dismissLabel: t("common.dismiss") || "Dismiss",
        });
      }
      setTimeout(() => {
        setSuccess(false);
        setIsSuccess(false);
      }, 100);
      if (invalidateQueries) {
        queryClient.invalidateQueries({
          queryKey: normalizedQueryKey,
          exact: false,
        });
      }
    },
    onError: (error: AxiosError<Record<string, string | string[]>>) => {
      setLoading(false);
      setSuccess(false);
      setIsSuccess(false);
      if (!showErrorToast) return;

      const backendErrors = error.response?.data;
      if (backendErrors && typeof backendErrors === "object") {
        notifyError(
          customErrorMessage || formatApiError(error, t("api.use_update.updateFailed") || "Update failed"),
          {
            title: t("common.validationError", "Validation Error"),
            dismissLabel: t("common.dismiss") || "Dismiss",
          },
        );
      } else {
        const statusCode = error.response?.status || "Unknown";
        const statusText = error.response?.statusText || "Error";
        notifyError(
          customErrorMessage
            || error.message
            || t("api.use_update.updateFailed")
            || "An unexpected error occurred",
          {
            title: `${statusText} (${statusCode})`,
            dismissLabel: t("common.dismiss") || "Dismiss",
          },
        );
      }
    },
    onSettled: () => {
      setLoading(false);
    },
  });

  const handleUpdate = (
    idOrData: string | number | Partial<T> | FormData,
    data?: Partial<T> | FormData,
  ) => {
    if (data === undefined) {
      updateMutation.mutate({ data: idOrData as Partial<T> | FormData });
      return;
    }
    updateMutation.mutate({
      id: idOrData as string | number,
      data,
    });
  };

  return {
    handleUpdate,
    loading,
    success,
    isSuccess,
  };
};

export default useUpdate;
