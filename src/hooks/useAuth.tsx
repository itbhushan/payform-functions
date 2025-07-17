// src/hooks/useAuth.tsx - Complete Fixed Version
import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { fetchAdmin, createAdmin } from './useData'; // ✅ Add this import

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, userData: any) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  profile: any;
  isFormAdmin: boolean;
  isSuperAdmin: boolean;
  clearAuthData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    let mounted = true;
    
    const initializeAuth = async () => {
      try {
        console.log('🔄 Initializing auth...');
        
        // Clear any stale auth state first
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (mounted) {
          console.log('✅ Auth session:', session?.user?.email || 'No session');
          setSession(session);
          setUser(session?.user ?? null);
          
          if (session?.user) {
            await loadUserProfile(session.user.id);
          }
          
          setLoading(false);
        }
      } catch (error) {
        console.error('❌ Auth initialization error:', error);
        if (mounted) {
          // Clear auth state on error
          setSession(null);
          setUser(null);
          setProfile(null);
          setLoading(false);
        }
      }
    };

    // Initialize auth
    initializeAuth();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      
      console.log('🔄 Auth state changed:', event, session?.user?.email || 'No user');
      
      try {
        // Handle different auth events
        if (event === 'SIGNED_OUT') {
          setSession(null);
          setUser(null);
          setProfile(null);
        } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          setSession(session);
          setUser(session?.user ?? null);
          
          if (session?.user) {
            await loadUserProfile(session.user.id);
          } else {
            setProfile(null);
          }
        } else if (event === 'USER_UPDATED') {
          setSession(session);
          setUser(session?.user ?? null);
        }
        
        setLoading(false);
      } catch (error) {
        console.error('❌ Auth state change error:', error);
        setLoading(false);
      }
    });

    // Fallback timeout to prevent infinite loading
    const fallbackTimeout = setTimeout(() => {
      if (mounted && loading) {
      console.warn('⚠️ Auth loading timeout - stopping loading state');
      setLoading(false);
      setUser(null);
      setSession(null);
      setProfile(null);
      }
    }, 5000); // 5 second timeout
    
    return () => {
      mounted = false;
      clearTimeout(fallbackTimeout);
      subscription.unsubscribe();
    };
  }, []);

  const loadUserProfile = async (userId: string) => {
    try {
      console.log('📝 Loading user profile for:', userId);
      
      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Profile load timeout')), 8000)
      );
      
const data = await Promise.race([
  fetchAdmin(userId), // ✅ Use the imported function
  timeoutPromise
]) as any;
      
      if (error && error.code !== 'PGRST116') {
        console.error('❌ Error loading profile:', error);
        return;
      }

      console.log('✅ Profile loaded:', data?.email || 'No profile');
      setProfile(data);
    } catch (error) {
      console.error('❌ Profile load error or timeout:', error);
      // Don't block auth flow if profile fails
      setProfile(null);
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      setLoading(true);
      console.log('🔑 Signing in:', email);
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error('❌ Sign in error:', error);
        return { error };
      }

      console.log('✅ Sign in successful:', email);
      return { error: null };
    } catch (error) {
      console.error('❌ Sign in exception:', error);
      return { error };
    } finally {
      // Don't set loading false here - let auth state change handle it
    }
  };

  const signUp = async (email: string, password: string, userData: any) => {
    try {
      setLoading(true);
      console.log('📝 Signing up:', email);
      
      // First, sign up the user
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: userData.name,
            role: userData.role || 'form_admin'
          }
        }
      });

      if (error) {
        console.error('❌ Sign up error:', error);
        return { error };
      }

      // If user was created, create profile
      if (data.user) {
        console.log('👤 Creating user profile...');
        
// Use the imported createAdmin function:
try {
  await createAdmin({
    id: data.user.id,
    email: email,
    name: userData.name,
    company_name: userData.company_name || null,
    is_active: true
  });
  console.log('✅ Profile created successfully');
} catch (profileError) {
  console.error('❌ Error creating profile:', profileError);
}
        
        if (profileError) {
          console.error('❌ Error creating profile:', profileError);
          // Don't return error here as auth was successful
        } else {
          console.log('✅ Profile created successfully');
        }
      }

      return { error: null };
    } catch (error) {
      console.error('❌ Sign up exception:', error);
      return { error };
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    try {
      console.log('🚪 Signing out...');
      setLoading(true);
      
      await supabase.auth.signOut();
      setProfile(null);
      
      console.log('✅ Signed out successfully');
    } catch (error) {
      console.error('❌ Sign out error:', error);
    } finally {
      setLoading(false);
    }
  };

  const clearAuthData = async () => {
    try {
      console.log('🧹 Clearing all auth data...');
      
      await supabase.auth.signOut();
      setSession(null);
      setUser(null);
      setProfile(null);
      
      // Clear browser storage
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch (e) {
        console.warn('Could not clear storage:', e);
      }
      
      console.log('✅ Auth data cleared');
      
      // Reload page to ensure clean state
    // Let React handle the state change naturally
    console.log('✅ Auth data cleared - React will handle UI updates');
    } catch (error) {
      console.error('❌ Error clearing auth data:', error);
      // Force reload anyway
      window.location.reload();
    }
  };

  // Calculate user roles
  const isFormAdmin = user?.email !== 'admin@payform.com';
  const isSuperAdmin = user?.email === 'admin@payform.com';

  const value: AuthContextType = {
    user,
    session,
    loading,
    signIn,
    signUp,
    signOut,
    profile,
    isFormAdmin,
    isSuperAdmin,
    clearAuthData,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
