'use client';
import React, { createContext, useContext, useState, useEffect } from 'react';
import { authApi } from './api';

interface User {
  id: string;
  username: string;
  role: string;
  tenantId: string | null;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  isPlatformAdmin: boolean;
  selectedTenantId: string | null;
  setSelectedTenantId: (id: string | null) => void;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTenantId, setSelectedTenantIdState] = useState<string | null>(null);

  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    const savedScope = localStorage.getItem('selectedTenantId');
    if (savedToken && savedUser) {
      const parsedUser: User = JSON.parse(savedUser);
      setToken(savedToken);
      setUser(parsedUser);
      // Tenant admin: always scoped to their own tenant; platform admin: restore last selection
      if (parsedUser.tenantId) {
        setSelectedTenantIdState(parsedUser.tenantId);
      } else {
        setSelectedTenantIdState(savedScope || null);
      }
    }
    setLoading(false);
  }, []);

  const setSelectedTenantId = (id: string | null) => {
    setSelectedTenantIdState(id);
    if (id) {
      localStorage.setItem('selectedTenantId', id);
    } else {
      localStorage.removeItem('selectedTenantId');
    }
  };

  const login = async (username: string, password: string) => {
    // Không có fallback credential mặc định: mọi phiên đăng nhập phải qua backend auth thật.
    const { data } = await authApi.login(username, password);
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    // Tenant admin auto-scoped; platform admin starts with no scope (global view)
    if (data.user.tenantId) {
      setSelectedTenantIdState(data.user.tenantId);
      localStorage.setItem('selectedTenantId', data.user.tenantId);
    } else {
      setSelectedTenantIdState(null);
      localStorage.removeItem('selectedTenantId');
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setSelectedTenantIdState(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('selectedTenantId');
    window.location.href = '/login';
  };

  const isPlatformAdmin = user !== null && !user.tenantId;

  return (
    <AuthContext.Provider value={{ user, token, loading, isPlatformAdmin, selectedTenantId, setSelectedTenantId, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
