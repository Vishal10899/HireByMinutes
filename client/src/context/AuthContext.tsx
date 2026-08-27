import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User } from '../types';
import { api } from '../services/api';

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  authInitialized: boolean;
  login: (email: string, password?: string) => Promise<User>;
  register: (data: {
    email: string;
    password?: string;
    full_name: string;
    role: string;
    avatar_url?: string;
    username?: string;
    headline?: string;
    bio?: string;
    location?: string;
    languages?: string[];
    skills?: string[];
    experience_years?: number;
  }) => Promise<void>;
  updateUser: (updated: User) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('hbm_token'));
  const [loading, setLoading] = useState<boolean>(true);
  const [authInitialized, setAuthInitialized] = useState<boolean>(false);

  const refreshUser = useCallback(async () => {
    const currentToken = localStorage.getItem('hbm_token');
    if (!currentToken) {
      setUser(null);
      setToken(null);
      setLoading(false);
      setAuthInitialized(true);
      return;
    }

    try {
      setLoading(true);
      const data = await api.getMe();
      if (data.user) {
        setUser(data.user);
        setToken(currentToken);
      } else {
        localStorage.removeItem('hbm_token');
        setUser(null);
        setToken(null);
      }
    } catch {
      localStorage.removeItem('hbm_token');
      setUser(null);
      setToken(null);
    } finally {
      setLoading(false);
      setAuthInitialized(true);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (email: string, password?: string): Promise<User> => {
    const data = await api.login(email, password);
    if (data.user && data.token) {
      localStorage.setItem('hbm_token', data.token);
      setToken(data.token);
      setUser(data.user);
      setAuthInitialized(true);
      setLoading(false);
      return data.user;
    }
    throw new Error('Authentication failed');
  };

  const register = async (regData: {
    email: string;
    password?: string;
    full_name: string;
    role: string;
    avatar_url?: string;
    username?: string;
    headline?: string;
    bio?: string;
    location?: string;
    languages?: string[];
    skills?: string[];
    experience_years?: number;
  }) => {
    const data = await api.register(regData);
    if (data.user && data.token) {
      localStorage.setItem('hbm_token', data.token);
      setToken(data.token);
      setUser(data.user);
      setAuthInitialized(true);
      setLoading(false);
    }
  };

  const updateUser = (updated: User) => {
    setUser((prev) => (prev ? { ...prev, ...updated } : updated));
  };

  const logout = () => {
    localStorage.removeItem('hbm_token');
    setUser(null);
    setToken(null);
    setAuthInitialized(true);
    setLoading(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        authInitialized,
        login,
        register,
        updateUser,
        logout,
        refreshUser
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
export default AuthContext;
