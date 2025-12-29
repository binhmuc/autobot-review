import React, { createContext, useState, type ReactNode } from 'react';
import { apiClient } from '@/api/client';
import type { User, AuthResponse } from '@/types';

interface AuthContextType {
  user: User | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

const getUserFromToken = (): User | null => {
  const token = localStorage.getItem('accessToken');
  if (!token) return null;

  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return {
      username: payload.username,
      role: payload.role,
    };
  } catch {
    localStorage.removeItem('accessToken');
    return null;
  }
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(getUserFromToken);
  const isLoading = false;

  const login = async (username: string, password: string) => {
    const { data } = await apiClient.post<AuthResponse>('/api/auth/login', {
      username,
      password,
    });

    localStorage.setItem('accessToken', data.accessToken);
    setUser(data.user);
  };

  const logout = () => {
    localStorage.removeItem('accessToken');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

