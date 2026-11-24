import axios from 'axios';

const AUTH_EXPIRED_EVENT = 'auth:expired';

let isLoggingOut = false;

/** Clear the stored session without forcing a hard browser reload loop. */
export const clearAuthSession = () => {
  localStorage.removeItem('user');
};

const handleLogout = () => {
  if (isLoggingOut) return;
  isLoggingOut = true;

  clearAuthSession();

  // Let AuthProvider drop React state — AppContent will show Login.
  // Avoid window.location.href reloads (they re-run init and can loop).
  window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));

  setTimeout(() => {
    isLoggingOut = false;
  }, 1500);
};

const isAuthEndpoint = (url?: string) =>
  Boolean(url?.includes('/login/') || url?.includes('/register/'));

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

api.interceptors.request.use(
  (config) => {
    if (isAuthEndpoint(config.url)) {
      return config;
    }

    const user = localStorage.getItem('user');
    if (!user) {
      // No session — reject quietly. Do NOT hard-logout/reload here.
      return Promise.reject(new Error('No authentication data'));
    }

    try {
      const userData = JSON.parse(user);
      if (!userData?.token) {
        clearAuthSession();
        window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
        return Promise.reject(new Error('No token found'));
      }
      config.headers.Authorization = `Token ${userData.token}`;
    } catch (error) {
      clearAuthSession();
      window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
      return Promise.reject(error);
    }

    return config;
  },
  (error) => Promise.reject(error),
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (isAuthEndpoint(error.config?.url)) {
      return Promise.reject(error);
    }

    const detail = error.response?.data?.detail;
    const isAuthFailure =
      error.response?.status === 401 ||
      detail === 'Invalid token.' ||
      detail === 'Authentication credentials were not provided.' ||
      detail === 'Token has expired' ||
      error.response?.data?.code === 'token_not_valid';

    if (isAuthFailure) {
      console.error('Authentication error:', error.response?.data);
      handleLogout();
    } else if (!error.response) {
      console.error('Network error:', error.message);
    }

    return Promise.reject(error);
  },
);

export { AUTH_EXPIRED_EVENT };
export default api;
