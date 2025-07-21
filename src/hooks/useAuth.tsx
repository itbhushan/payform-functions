// src/hooks/useAuth.tsx - FIXED VERSION with timeout handling
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

  // ✅ FIX 1: Enhanced profile loading with timeout and retry
  const loadUserProfile = async (userId: string, maxRetries = 3, timeoutMs = 10000): Promise<AuthUser | null> => {
    console.log('🔍 Loading user profile for:', userId);
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`📡 Profile load attempt ${attempt}/${maxRetries}`);
        
        // Create timeout promise
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Profile load timeout')), timeoutMs);
        });

        // Create profile load promise
        const profilePromise = supabase
          .from('form_admins')
          .select('id, email, name, company_name, is_active, created_at')
          .eq('id', userId)
          .single();

        // Race between timeout and profile load
        const { data: profile, error } = await Promise.race([
          profilePromise,
          timeoutPromise
        ]) as any;

        if (error) {
          console.warn(`⚠️ Profile load attempt ${attempt} failed:`, error.message);
          
          if (attempt === maxRetries) {
            // On final attempt, create profile if it doesn't exist
            console.log('🔧 Creating missing profile...');
            return await createMissingProfile(userId);
          }
          
          // Wait before retry (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, attempt * 1000));
          continue;
        }

        if (profile) {
          console.log('✅ Profile loaded successfully:', profile.email);
          return {
            id: profile.id,
            email: profile.email,
            name: profile.name,
            company_name: profile.company_name,
            role: 'form_admin',
            // Add other required User properties with defaults
            aud: 'authenticated',
            created_at: profile.created_at,
            app_metadata: {},
            user_metadata: {
              name: profile.name,
              company_name: profile.company_name
            }
          } as AuthUser;
        }

      } catch (timeoutError) {
        console.warn(`⏰ Profile load attempt ${attempt} timed out`);
        
        if (attempt === maxRetries) {
          console.log('🔧 Creating profile after timeout...');
          return await createMissingProfile(userId);
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, attempt * 1000));
      }
    }

    return null;
  };

  // ✅ FIX 2: Create missing profile for existing auth users
  const createMissingProfile = async (userId: string): Promise<AuthUser | null> => {
    try {
      console.log('🛠️ Creating missing profile for user:', userId);
      
      // Get user email from auth
      const { data: authUser } = await supabase.auth.getUser();
      const userEmail = authUser.user?.email;
      
      if (!userEmail) {
        throw new Error('Cannot create profile: no email found');
      }

      // Create form_admin record
      const { data: newProfile, error: createError } = await supabase
        .from('form_admins')
        .insert([{
          id: userId,
          email: userEmail,
          name: authUser.user?.user_metadata?.name || userEmail.split('@')[0],
          company_name: authUser.user?.user_metadata?.company_name || null,
          is_active: true,
          created_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (createError) {
        console.error('❌ Failed to create profile:', createError);
        return null;
      }

      console.log('✅ Profile created successfully:', newProfile.email);
      
      return {
        id: newProfile.id,
        email: newProfile.email,
        name: newProfile.name,
        company_name: newProfile.company_name,
        role: 'form_admin',
        aud: 'authenticated',
        created_at: newProfile.created_at,
        app_metadata: {},
        user_metadata: {
          name: newProfile.name,
          company_name: newProfile.company_name
        }
      } as AuthUser;

    } catch (error) {
      console.error('❌ Error creating missing profile:', error);
      return null;
    }
  };

  // ✅ FIX 3: Enhanced session handling with proper error management
  const handleAuthStateChange = async (event: string, session: Session | null) => {
    console.log('🔐 Auth state changed:', event, session?.user?.email || 'no user');
    
    try {
      setError(null);
      setSession(session);

      if (session?.user) {
        setLoading(true);
        
        // Load user profile with timeout handling
        const userProfile = await loadUserProfile(session.user.id);
        
        if (userProfile) {
          setUser(userProfile);
        } else {
          console.error('❌ Failed to load or create user profile');
          setError('Failed to load user profile. Please try refreshing the page.');
          setUser(null);
        }
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error('❌ Auth state change error:', error);
      setError('Authentication error occurred. Please try again.');
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  // ✅ FIX 4: Initialize auth with better error handling
  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      try {
        console.log('🚀 Initializing authentication...');
        
        // Get initial session with timeout
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

  // ✅ FIX 5: Enhanced sign in with better error handling
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
    } finally {
      setLoading(false);
    }
  };

  // ✅ FIX 6: Enhanced sign up with profile creation
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

      if (data.user) {
        console.log('👤 User created, creating profile...');
        
        // Create form_admin profile immediately
        const { error: profileError } = await supabase
          .from('form_admins')
          .insert([{
            id: data.user.id,
            email,
            name,
            company_name,
            is_active: true,
            created_at: new Date().toISOString()
          }]);

        if (profileError) {
          console.warn('⚠️ Profile creation warning:', profileError.message);
          // Don't fail signup for this - profile will be created on next login
        } else {
          console.log('✅ Profile created successfully');
        }
      }

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

  // ✅ FIX 7: Enhanced sign out
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

  // ✅ FIX 8: Manual profile refresh
  const refreshProfile = async () => {
    if (!session?.user?.id) return;
    
    try {
      setError(null);
      console.log('🔄 Refreshing user profile...');
      
      const userProfile = await loadUserProfile(session.user.id);
      if (userProfile) {
        setUser(userProfile);
        console.log('✅ Profile refreshed successfully');
      } else {
        throw new Error('Failed to refresh profile');
      }
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
