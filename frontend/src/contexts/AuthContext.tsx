// contexts/auth-context.tsx
import React, { createContext, useContext, useState, useEffect } from "react";
import api from "@/api/client";
import {
  isCompleteSessionUser,
  normalizeStoredUser,
  resolveAuthRole,
} from "@/lib/authSession";

export interface User {
  id: string;
  username?: string;
  email: string;
  name: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  address?: string;
  profile_picture?: string;
  role: "admin" | "staff" | "customer" | "vendor" | "user" | "employee";
  is_buyer: boolean;
  is_seller: boolean;
  is_finance: boolean;
  is_admin: boolean;
  is_superuser?: boolean;
  is_active: boolean;
  is_staff: boolean;
  is_super_admin?: boolean;
  permissions?: string[];
  /** Linked Employee id when this login is a staff employee. */
  employee_id?: number | string | null;
  created_at: string;
  updated_at: string;
  token: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setUser: (userData: User | null) => boolean;
  logout: () => void;
  getUser: () => User | null;
  updateUser: (userData: Partial<User>) => void;
  validateToken: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUserState] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const validateToken = async (): Promise<boolean> => {
    try {
      const storedUser = localStorage.getItem("user");
      if (!storedUser) return false;

      const parsedUser = JSON.parse(storedUser);
      const normalized = normalizeStoredUser(parsedUser);
      if (!normalized) return false;

      const response = await api.get('/profile/');

      if (response.status === 200 && response.data) {
        const profile = response.data;
        const refreshedUser: User = {
          ...normalized,
          email: profile.email ?? normalized.email,
          first_name: profile.first_name ?? normalized.first_name,
          last_name: profile.last_name ?? normalized.last_name,
          phone: profile.phone ?? normalized.phone,
          role: resolveAuthRole(profile.role ?? normalized.role, {
            is_admin: profile.is_admin ?? normalized.is_admin,
            is_superuser: profile.is_superuser ?? normalized.is_superuser,
          }),
          is_buyer: profile.is_buyer ?? normalized.is_buyer,
          is_seller: profile.is_seller ?? normalized.is_seller,
          is_finance: profile.is_finance ?? normalized.is_finance,
          is_admin: profile.is_admin ?? normalized.is_admin,
          is_superuser: profile.is_superuser ?? normalized.is_superuser,
          permissions: profile.permissions ?? normalized.permissions ?? [],
          branch: profile.branch ?? normalized.branch ?? null,
          employee_id: profile.employee_id ?? normalized.employee_id ?? null,
        };

        localStorage.setItem("user", JSON.stringify(refreshedUser));
        setUserState(refreshedUser);
      }

      return response.status === 200;
    } catch (error) {
      console.error("Token validation failed:", error);
      return false;
    }
  };

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const storedUser = localStorage.getItem("user");
        if (!storedUser) return;

        const parsedUser = JSON.parse(storedUser);
        let normalizedUser = normalizeStoredUser(parsedUser);
        if (!normalizedUser) {
          console.warn("Stored user data is incomplete:", parsedUser);
          localStorage.removeItem("user");
          setUserState(null);
          return;
        }

        try {
          const response = await api.get('/profile/');
          if (response.status === 200 && response.data) {
            const profile = response.data;
            normalizedUser = {
              ...normalizedUser,
              employee_id: profile.employee_id ?? normalizedUser.employee_id ?? null,
              permissions: profile.permissions ?? normalizedUser.permissions ?? [],
              is_seller: profile.is_seller ?? normalizedUser.is_seller,
              role: resolveAuthRole(profile.role ?? normalizedUser.role, {
                is_admin: profile.is_admin ?? normalizedUser.is_admin,
                is_superuser: profile.is_superuser ?? normalizedUser.is_superuser,
              }),
            };
          }
        } catch (profileError) {
          console.warn("Profile refresh failed during auth init:", profileError);
        }

        setUserState(normalizedUser);
        localStorage.setItem("user", JSON.stringify(normalizedUser));
      } catch (error) {
        console.error("Failed to initialize auth:", error);
        localStorage.removeItem("user");
        setUserState(null);
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, []);

  const setUser = (userData: User | null): boolean => {
    if (!userData) {
      localStorage.removeItem("user");
      setUserState(null);
      return true;
    }

    const normalizedUser = normalizeStoredUser(userData);
    if (!normalizedUser || !isCompleteSessionUser(normalizedUser)) {
      console.warn("Attempted to set incomplete user object:", userData);
      setUserState(null);
      return false;
    }

    localStorage.setItem("user", JSON.stringify(normalizedUser));
    setUserState(normalizedUser);
    return true;
  };

  const updateUser = (userData: Partial<User>) => {
    if (!user) return;

    const updatedUser = normalizeStoredUser({ ...user, ...userData });
    if (!updatedUser) return;

    localStorage.setItem("user", JSON.stringify(updatedUser));
    setUserState(updatedUser);
  };

  const logout = () => {
    localStorage.removeItem("user");
    setUserState(null);
    if (window.location.pathname !== "/") {
      window.location.href = "/";
    }
  };

  const getUser = (): User | null => {
    return user;
  };

  const value: AuthContextType = {
    user,
    isAuthenticated: isCompleteSessionUser(user),
    isLoading,
    setUser,
    logout,
    getUser,
    updateUser,
    validateToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
