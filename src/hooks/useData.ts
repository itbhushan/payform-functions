// src/hooks/useAuth.ts
import { useState, useEffect, createContext, useContext } from 'react';
import { supabase } from '../lib/supabase';

interface User {
  id: string;
  email: string;
  user_metadata?: {
    role?: 'form_admin' | 'super_admin';
    name?: string;
  };
  profile?: {
    name?: string;
    company_name?: string;
    is_active?: boolean;
  };
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signUp: (email: string, password: string, name: string) => Promise<any>;
  signIn: (email: string, password: string) => Promise<any>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<any>;
  updateProfile: (updates: any) => Promise<any>;
  isFormAdmin: boolean;
  isSuperAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for stored user first (for demo purposes)
    const storedUser = localStorage.getItem('payform_user');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (error) {
        console.error('Error parsing stored user:', error);
        localStorage.removeItem('payform_user');
      }
    }
    setLoading(false);
  }, []);

  const signUp = async (email: string, password: string, name: string) => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name }
        }
      });

      if (error) throw error;

      console.log('Sign up successful:', data);
      return { data, error: null };
    } catch (error) {
      console.error('Sign up error:', error);
      return { data: null, error };
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      setLoading(true);
      
      // Handle demo super admin
      if (email === 'admin@payform.com' && password === 'admin123') {
        const superAdminUser: User = {
          id: 'super-admin-123',
          email: 'admin@payform.com',
          user_metadata: { role: 'super_admin', name: 'PayForm Admin' },
          profile: { name: 'PayForm Admin', is_active: true }
        };
        
        setUser(superAdminUser);
        localStorage.setItem('payform_user', JSON.stringify(superAdminUser));
        return { data: { user: superAdminUser }, error: null };
      }

      // Handle demo form admin
      if (email === 'formadmin@example.com' && password === 'form123') {
        const formAdminUser: User = {
          id: 'f807a8c3-316b-4df0-90e7-5f7796c86f71',
          email: 'formadmin@example.com',
          user_metadata: { role: 'form_admin', name: 'Bhushan Agrawal' },
          profile: { name: 'Bhushan Agrawal', is_active: true }
        };
        
        setUser(formAdminUser);
        localStorage.setItem('payform_user', JSON.stringify(formAdminUser));
        return { data: { user: formAdminUser }, error: null };
      }

      // For real users, use Supabase auth
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      if (data.user) {
        // Load user profile from form_admins table
        const { data: profile } = await supabase
          .from('form_admins')
          .select('*')
          .eq('id', data.user.id)
          .single();

        const userWithProfile: User = {
          id: data.user.id,
          email: data.user.email!,
          user_metadata: data.user.user_metadata,
          profile: profile || undefined
        };

        setUser(userWithProfile);
        localStorage.setItem('payform_user', JSON.stringify(userWithProfile));
      }

      return { data, error: null };
    } catch (error) {
      console.error('Sign in error:', error);
      return { data: null, error };
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    try {
      // Handle demo users
      if (user?.email === 'admin@payform.com' || user?.email === 'formadmin@example.com') {
        setUser(null);
        localStorage.removeItem('payform_user');
        return;
      }

      // For real users
      await supabase.auth.signOut();
      setUser(null);
      localStorage.removeItem('payform_user');
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  const resetPassword = async (email: string) => {
    try {
      const { data, error } = await supabase.auth.resetPasswordForEmail(email);
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  };

  const updateProfile = async (updates: any) => {
    try {
      if (!user) throw new Error('No user logged in');

      const { error } = await supabase
        .from('form_admins')
        .update(updates)
        .eq('id', user.id);

      if (error) throw error;

      // Update local user state
      const updatedUser = {
        ...user,
        profile: { ...user.profile, ...updates }
      };
      setUser(updatedUser);
      localStorage.setItem('payform_user', JSON.stringify(updatedUser));

      return { error: null };
    } catch (error) {
      return { error };
    }
  };

  const value: AuthContextType = {
    user,
    loading,
    signUp,
    signIn,
    signOut,
    resetPassword,
    updateProfile,
    isFormAdmin: user?.email !== 'admin@payform.com',
    isSuperAdmin: user?.email === 'admin@payform.com'
  };
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
