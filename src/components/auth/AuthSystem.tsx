// src/components/auth/AuthSystem.tsx - Complete Authentication Hierarchy
import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

// User Types
type UserRole = 'super_admin' | 'form_admin' | 'end_user';

interface User {
  id: string;
  email: string;
  role: UserRole;
  name?: string;
  company_name?: string;
  is_active: boolean;
  created_at: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string, role: UserRole) => Promise<boolean>;
  signOut: () => void;
  signUp: (email: string, password: string, role: UserRole, metadata?: any) => Promise<boolean>;
}

// Auth Context
const AuthContext = React.createContext<AuthContextType | null>(null);

// Auth Provider Component
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check current session
    checkSession();
    
    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        await loadUserProfile(session.user.id);
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkSession = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        await loadUserProfile(session.user.id);
      }
    } catch (error) {
      console.error('Session check error:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadUserProfile = async (userId: string) => {
    try {
      // Check if user is super admin first
      const { data: superAdmin } = await supabase
        .from('super_admins')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (superAdmin) {
        setUser({
          id: superAdmin.id,
          email: superAdmin.email,
          role: 'super_admin',
          name: superAdmin.name,
          is_active: superAdmin.is_active,
          created_at: superAdmin.created_at
        });
        return;
      }

      // Check if user is form admin
      const { data: formAdmin } = await supabase
        .from('form_admins')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (formAdmin) {
        setUser({
          id: formAdmin.id,
          email: formAdmin.email,
          role: 'form_admin',
          name: formAdmin.name,
          company_name: formAdmin.company_name,
          is_active: formAdmin.is_active,
          created_at: formAdmin.created_at
        });
        return;
      }

      // Default to end user (shouldn't access admin systems)
      setUser({
        id: userId,
        email: '',
        role: 'end_user',
        is_active: false,
        created_at: new Date().toISOString()
      });

    } catch (error) {
      console.error('Error loading user profile:', error);
      setUser(null);
    }
  };

  const signIn = async (email: string, password: string, role: UserRole): Promise<boolean> => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      if (data.user) {
        await loadUserProfile(data.user.id);
        
        // Verify role matches
        if (user?.role !== role) {
          await signOut();
          return false;
        }
        
        return true;
      }

      return false;
    } catch (error) {
      console.error('Sign in error:', error);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (email: string, password: string, role: UserRole, metadata?: any): Promise<boolean> => {
    try {
      setLoading(true);

      // Only allow super admins to create accounts, or self-registration for form admins
      if (role === 'super_admin' && user?.role !== 'super_admin') {
        return false; // Only existing super admins can create new super admins
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { role, ...metadata }
        }
      });

      if (error) throw error;

      if (data.user) {
        // Create profile in appropriate table
        if (role === 'super_admin') {
          await supabase.from('super_admins').insert({
            user_id: data.user.id,
            email,
            name: metadata?.name,
            is_active: true
          });
        } else if (role === 'form_admin') {
          await supabase.from('form_admins').insert({
            user_id: data.user.id,
            email,
            name: metadata?.name,
            company_name: metadata?.company_name,
            is_active: true
          });
        }

        return true;
      }

      return false;
    } catch (error) {
      console.error('Sign up error:', error);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut, signUp }}>
      {children}
    </AuthContext.Provider>
  );
};

// Hook to use auth context
export const useAuth = (): AuthContextType => {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Login Component with Role Selection
export const LoginForm: React.FC<{ onLogin: (user: User) => void }> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('form_admin');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { signIn } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const success = await signIn(email, password, role);
    
    if (success) {
      // User will be set in context, component will re-render
    } else {
      setError('Invalid credentials or insufficient permissions');
    }
    
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            PayForm Admin Login
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Access your payment dashboard
          </p>
        </div>
        
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <div className="text-red-800 text-sm">{error}</div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Login Type
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="form_admin">Form Admin (Form Owner)</option>
              <option value="super_admin">Super Admin (Platform Owner)</option>
            </select>
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter your email"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter your password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        {/* Role Descriptions */}
        <div className="mt-6 text-xs text-gray-600 space-y-2">
          <div className="bg-blue-50 p-3 rounded">
            <strong>Form Admin:</strong> Manage your own forms, view your transactions, configure payment settings
          </div>
          <div className="bg-purple-50 p-3 rounded">
            <strong>Super Admin:</strong> Platform owner, manage all form admins, view platform analytics
          </div>
        </div>
      </div>
    </div>
  );
};

// Route Guard Component
export const ProtectedRoute: React.FC<{ 
  children: React.ReactNode;
  requiredRole?: UserRole[];
  fallback?: React.ReactNode;
}> = ({ children, requiredRole = ['form_admin', 'super_admin'], fallback }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!user || !requiredRole.includes(user.role)) {
    return fallback || <LoginForm onLogin={() => {}} />;
  }

  return <>{children}</>;
};

// User Role Badge Component
export const UserRoleBadge: React.FC<{ role: UserRole }> = ({ role }) => {
  const roleConfig = {
    super_admin: { bg: 'bg-purple-100', text: 'text-purple-800', label: '👑 Super Admin' },
    form_admin: { bg: 'bg-blue-100', text: 'text-blue-800', label: '📋 Form Admin' },
    end_user: { bg: 'bg-gray-100', text: 'text-gray-800', label: '👤 End User' }
  };

  const config = roleConfig[role];

  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  );
};
