import axios from 'axios';

// Create axios instance
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

// Flag to prevent multiple logout calls
let isLoggingOut = false;

// Function to handle logout
const handleLogout = () => {
  if (isLoggingOut) return;
  isLoggingOut = true;

  // Clear user data from localStorage
  localStorage.removeItem('user');

  // Reset flag after a short delay
  setTimeout(() => {
    isLoggingOut = false;
  }, 1000);

  // Redirect to login page
  window.location.href = '/';
};

// Request interceptor to add token
api.interceptors.request.use(
  (config) => {
    // Skip authentication for login and register endpoints
    const isAuthEndpoint = config.url?.includes('/login/') ||
      config.url?.includes('/register/');

    if (isAuthEndpoint) {
      return config;
    }

    const user = localStorage.getItem('user');
    if (user) {
      try {
        const userData = JSON.parse(user);
        if (userData.token) {
          config.headers.Authorization = `Token ${userData.token}`;
        } else {
          console.warn('No token found in user data');
          handleLogout();
          return Promise.reject(new Error('No token found'));
        }
      } catch (error) {
        console.error('Error parsing user data:', error);
        handleLogout();
        return Promise.reject(error);
      }
    } else if (!isAuthEndpoint) {
      console.warn('No user data found for authenticated request');
      handleLogout();
      return Promise.reject(new Error('No authentication data'));
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor to handle token validation and errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Skip logout for auth endpoints
    const isAuthEndpoint = error.config?.url?.includes('/login/') ||
      error.config?.url?.includes('/register/');

    // Logout only when the session is actually invalid (401).
    // 403 is permission denied — the user is still logged in.
    const detail = error.response?.data?.detail;
    const isAuthFailure =
      error.response?.status === 401 ||
      detail === 'Invalid token.' ||
      detail === 'Authentication credentials were not provided.' ||
      detail === 'Token has expired' ||
      error.response?.data?.code === 'token_not_valid';

    if (!isAuthEndpoint && isAuthFailure) {
      console.error('Authentication error:', error.response?.data);
      handleLogout();
    }

    // Check for network errors
    if (!error.response) {
      console.error('Network error:', error.message);
    }

    return Promise.reject(error);
  }
);

export default api;
