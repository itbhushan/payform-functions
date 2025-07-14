// src/hooks/useAuth.ts
import { useState, useEffect, createContext, useContext } from 'react';
import { supabase } from '../lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

interface AuthUser extends User {
  profile?: {
    name?: string;
    company_name?: string;
    is_active?: boolean;
  };
}

interface AuthContextType {
  user: AuthUser | null;
  session: Session | null;
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
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    getInitialSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event, session);
      
      if (session?.user) {
        await loadUserProfile(session.user);
      } else {
        setUser(null);
      }
      
      setSession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const getInitialSession = async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error) {
        console.error('Error getting session:', error);
        return;
      }

      if (session?.user) {
        await loadUserProfile(session.user);
      }
      
      setSession(session);
    } catch (error) {
      console.error('Error in getInitialSession:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadUserProfile = async (authUser: User) => {
    try {
      console.log('Loading profile for user:', authUser.id);
      
      const { data: profile, error } = await supabase
        .from('form_admins')
        .select('*')
        .eq('id', authUser.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading profile:', error);
        // If profile doesn't exist, create it
        if (error.code === 'PGRST116') {
          await createUserProfile(authUser);
          return;
        }
      }

      const userWithProfile: AuthUser = {
        ...authUser,
        profile: profile || undefined
      };

      setUser(userWithProfile);
      console.log('User profile loaded:', userWithProfile);
    } catch (error) {
      console.error('Error loading user profile:', error);
      setUser(authUser as AuthUser);
    }
  };

  const createUserProfile = async (authUser: User) => {
    try {
      const { error } = await supabase
        .from('form_admins')
        .insert({
          id: authUser.id,
          email: authUser.email!,
          name: authUser.user_metadata?.name || authUser.email?.split('@')[0],
          is_active: true
        });

      if (error) {
        console.error('Error creating profile:', error);
      } else {
        console.log('Profile created successfully');
        await loadUserProfile(authUser);
      }
    } catch (error) {
      console.error('Error in createUserProfile:', error);
    }
  };

  const signUp = async (email: string, password: string, name: string) => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: name
          }
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
      
      // For super admin demo access (still using demo credentials for convenience)
      if (email === 'admin@payform.com' && password === 'admin123') {
        // Check if super admin exists in database
        const { data: superAdmin, error } = await supabase
          .from('form_admins')
          .select('*')
          .eq('email', 'admin@payform.com')
          .single();

        if (superAdmin) {
          // Create a session-like object for super admin
          const superAdminUser: AuthUser = {
            id: superAdmin.id, // Use the real UUID from database
            email: 'admin@payform.com',
            created_at: new Date().toISOString(),
            aud: 'authenticated',
            role: 'authenticated',
            app_metadata: {},
            user_metadata: { role: 'super_admin', name: 'PayForm Admin' },
            profile: {
              name: 'PayForm Admin',
              is_active: true
            }
          };
          
          setUser(superAdminUser);
          setSession({
            access_token: 'super-admin-token',
            refresh_token: 'super-admin-refresh',
            expires_in: 3600,
            token_type: 'bearer',
            user: superAdminUser
          } as Session);
          
          return { data: { user: superAdminUser }, error: null };
        }
      }

      // For all other users, use real Supabase auth
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      console.log('Sign in successful:', data);
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
      // Handle super admin logout (demo credentials)
      if (user?.email === 'admin@payform.com' && session?.access_token === 'super-admin-token') {
        setUser(null);
        setSession(null);
        return;
      }

      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      
      setUser(null);
      setSession(null);
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  const resetPassword = async (email: string) => {
    try {
      const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`
      });

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('Password reset error:', error);
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

      // Reload user profile
      await loadUserProfile(user);
      return { error: null };
    } catch (error) {
      console.error('Profile update error:', error);
      return { error };
    }
  };

  const value: AuthContextType = {
    user,
    session,
    loading,
    signUp,
    signIn,
    signOut,
    resetPassword,
    updateProfile,
    isFormAdmin: user?.email !== 'admin@payform.com',
    isSuperAdmin: user?.email === 'admin@payform.com'
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
