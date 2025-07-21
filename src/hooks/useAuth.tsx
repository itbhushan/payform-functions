// src/hooks/useAuth.tsx - EMERGENCY SIMPLIFIED VERSION
import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

interface AuthUser extends User {
  name?: string;
  company_name?: string;
  role?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, name: string, company_name?: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  error: null,
  signIn: async () => ({ error: null }),
  signUp: async () => ({ error: null }),
  signOut: async () => {},
  refreshProfile: async () => {}
});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ✅ EMERGENCY FIX: Simplified profile loading with immediate fallback
  const loadUserProfile = async (userId: string, userEmail: string): Promise<AuthUser> => {
    console.log('🔍 Loading user profile for:', userEmail);
    
    try {
      // Try to load from database with short timeout
      const { data: profile, error } = await Promise.race([
        supabase
          .from('form_admins')
          .select('id, email, name, company_name, is_active')
          .eq('id', userId)
          .single(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('timeout')), 3000) // 3 second timeout
        )
      ]) as any;

      if (!error && profile) {
        console.log('✅ Profile loaded from database:', profile.email);
        return {
          ...profile,
          role: 'form_admin',
          aud: 'authenticated',
          created_at: new Date().toISOString(),
          app_metadata: {},
          user_metadata: { name: profile.name, company_name: profile.company_name }
        } as AuthUser;
      }
    } catch (dbError) {
      console.warn('⚠️ Database profile load failed, using auth user data');
    }

    // ✅ IMMEDIATE FALLBACK: Use auth user data directly (no database dependency)
    console.log('🔄 Using auth user data as profile');
    return {
      id: userId,
      email: userEmail,
      name: userEmail.split('@')[0], // Extract name from email
      company_name: null,
      role: 'form_admin',
      aud: 'authenticated',
      created_at: new Date().toISOString(),
      app_metadata: {},
      user_metadata: {}
    } as AuthUser;
  };

  // ✅ SIMPLIFIED: Auth state handler with immediate fallback
  const handleAuthStateChange = async (event: string, session: Session | null) => {
    console.log('🔐 Auth state changed:', event, session?.user?.email || 'no user');
    
    try {
      setError(null);
      setSession(session);

      if (session?.user) {
        // ✅ CRITICAL: Don't set loading here to avoid infinite loop
        const userProfile = await loadUserProfile(session.user.id, session.user.email!);
        setUser(userProfile);
        console.log('✅ User profile set successfully');
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error('❌ Auth state change error:', error);
      // ✅ FALLBACK: Set basic user data even if profile loading fails
      if (session?.user) {
        setUser({
          id: session.user.id,
          email: session.user.email!,
          name: session.user.email!.split('@')[0],
          role: 'form_admin',
          aud: 'authenticated',
          created_at: new Date().toISOString(),
          app_metadata: {},
          user_metadata: {}
        } as AuthUser);
      } else {
        setUser(null);
      }
    } finally {
      setLoading(false); // ✅ CRITICAL: Always stop loading
    }
  };

  // ✅ SIMPLIFIED: Initialize auth
  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      try {
        console.log('🚀 Initializing authentication...');
        
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('❌ Session initialization error:', error);
          setError('Failed to initialize authentication.');
          setLoading(false);
          return;
        }

        if (mounted) {
          await handleAuthStateChange('INITIAL_SESSION', session);
        }
      } catch (error) {
        console.error('❌ Auth initialization failed:', error);
        if (mounted) {
          setError('Authentication system unavailable.');
          setLoading(false);
        }
      }
    };

    initializeAuth();

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(handleAuthStateChange);

    // Cleanup
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // ✅ SIMPLIFIED: Sign in
  const signIn = async (email: string, password: string) => {
    try {
      setError(null);
      setLoading(true);
      
      console.log('🔐 Signing in user:', email);
      
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        console.error('❌ Sign in error:', error.message);
        setError(error.message);
        return { error };
      }

      console.log('✅ Sign in successful');
      return { error: null };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Sign in failed';
      console.error('❌ Sign in exception:', errorMessage);
      setError(errorMessage);
      return { error: new Error(errorMessage) };
    }
    // ✅ Don't set loading false here - let auth state change handle it
  };

  // ✅ SIMPLIFIED: Sign up
  const signUp = async (email: string, password: string, name: string, company_name?: string) => {
    try {
      setError(null);
      setLoading(true);
      
      console.log('📝 Signing up user:', email);

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name,
            company_name,
            role: 'form_admin'
          }
        }
      });

      if (error) {
        console.error('❌ Sign up error:', error.message);
        setError(error.message);
        return { error };
      }

      // ✅ SIMPLIFIED: Don't try to create profile immediately
      // It will be handled by auth state change or created on first use
      console.log('✅ Sign up successful');
      return { error: null };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Sign up failed';
      console.error('❌ Sign up exception:', errorMessage);
      setError(errorMessage);
      return { error: new Error(errorMessage) };
    } finally {
      setLoading(false);
    }
  };

  // ✅ SIMPLIFIED: Sign out
  const signOut = async () => {
    try {
      setError(null);
      console.log('👋 Signing out user');
      
      await supabase.auth.signOut();
      setUser(null);
      setSession(null);
      
      console.log('✅ Sign out successful');
    } catch (error) {
      console.error('❌ Sign out error:', error);
      setError('Sign out failed');
    }
  };

  // ✅ SIMPLIFIED: Manual profile refresh
  const refreshProfile = async () => {
    if (!session?.user?.id || !session?.user?.email) return;
    
    try {
      setError(null);
      console.log('🔄 Refreshing user profile...');
      
      const userProfile = await loadUserProfile(session.user.id, session.user.email);
      setUser(userProfile);
      console.log('✅ Profile refreshed successfully');
    } catch (error) {
      console.error('❌ Profile refresh error:', error);
      setError('Failed to refresh profile');
    }
  };

  const value: AuthContextType = {
    user,
    session,
    loading,
    error,
    signIn,
    signUp,
    signOut,
    refreshProfile
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
