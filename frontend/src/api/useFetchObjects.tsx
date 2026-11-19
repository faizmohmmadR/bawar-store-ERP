import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import api from '@/api/client';
import { AxiosError, AxiosResponse } from 'axios';

export interface UseFetchObjectsProps<T = unknown> {
  /** React Query key — string or string array. */
  queryKey: string | string[];
  /**
   * API path without leading slash.
   * List: `"stocks"` or `"stocks/"`
   * Detail: `"stocks/12/"` OR pass `id` with `"stocks"`
   * Nested: `"accounts/5/entries/"` or `"employees/3/financial_summary/"`
   */
  endpoint: string;
  /**
   * Optional record id. When set, request becomes `/{endpoint}/{id}/`.
   * Fetch is skipped automatically while id is empty (unless `enabled` is set).
   */
  id?: string | number | null;
  /** Query string params. */
  params?: Record<string, unknown>;
  /** Override auto-enabled behavior. */
  enabled?: boolean;
  /** Extra react-query options (staleTime, placeholderData, etc.). */
  options?: Record<string, unknown>;
}

export interface UseFetchObjectsReturn<T> {
  data: T | undefined;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  isSuccess: boolean;
  error: AxiosError | null;
  refetch: () => void;
}

/** Normalize endpoint + optional id into a clean API path (no leading slash). */
export function buildFetchEndpoint(
  endpoint: string,
  id?: string | number | null,
): string {
  const raw = String(endpoint || '').replace(/^\/+/, '');
  const questionMark = raw.indexOf('?');
  const pathPart = questionMark >= 0 ? raw.slice(0, questionMark) : raw;
  const queryPart = questionMark >= 0 ? raw.slice(questionMark + 1) : '';

  const trimmedPath = pathPart.replace(/\/+$/, '');

  let resolvedPath = trimmedPath;
  if (id != null && String(id).trim() !== '') {
    const idPart = String(id).replace(/^\/+|\/+$/g, '');
    if (trimmedPath.endsWith(`/${idPart}`) || trimmedPath === idPart) {
      resolvedPath = trimmedPath;
    } else {
      resolvedPath = `${trimmedPath}/${idPart}`;
    }
  }

  const withSlash = resolvedPath ? `${resolvedPath}/` : '';
  return queryPart ? `${withSlash}?${queryPart}` : withSlash;
}

const useFetchObjects = <T,>({
  queryKey,
  endpoint,
  id,
  options = {},
  params = {},
  enabled,
}: UseFetchObjectsProps<T>): UseFetchObjectsReturn<T> => {
  const { getUser, logout } = useAuth();

  const normalizedQueryKey = Array.isArray(queryKey) ? queryKey : [queryKey];
  const resolvedEndpoint = buildFetchEndpoint(endpoint, id);
  const hasIdArg = id !== undefined;
  const idReady = id != null && String(id).trim() !== '';
  const resolvedEnabled =
    enabled ?? (hasIdArg ? idReady : Boolean(resolvedEndpoint));

  const fetchFunction = async (): Promise<T> => {
    try {
      const user = getUser();
      if (!user || !user.token) {
        throw new Error('User not authenticated');
      }

      if (!resolvedEndpoint) {
        throw new Error('Fetch endpoint is required');
      }

      const response: AxiosResponse<T> = await api.get(`/${resolvedEndpoint}`, {
        params,
      });
      return response.data;
    } catch (error) {
      if (error instanceof Error && error.message === 'User not authenticated') {
        logout();
      }
      throw error;
    }
  };

  const {
    data,
    isLoading,
    isFetching,
    isError,
    isSuccess,
    error,
    refetch,
  } = useQuery<T, AxiosError>({
    // Caller owns the query key (list filters, id, page, etc.).
    queryKey: normalizedQueryKey,
    queryFn: fetchFunction,
    enabled: resolvedEnabled && Boolean(resolvedEndpoint),
    staleTime: import.meta.env.DEV ? 0 : 30_000,
    gcTime: 1000 * 60 * 5,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    refetchInterval: false,
    refetchOnReconnect: true,
    retry: (failureCount, err) => {
      if (err?.response?.status === 401 || err?.response?.status === 403) {
        return false;
      }
      return failureCount < 3;
    },
    ...options,
  });

  return {
    data,
    isLoading,
    isFetching,
    isError,
    isSuccess,
    error: error ?? null,
    refetch,
  };
};

export default useFetchObjects;
