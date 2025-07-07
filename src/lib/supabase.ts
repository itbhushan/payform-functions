import { createClient } from '@supabase/supabase-js';

// Get environment variables with fallbacks for development
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://ofzhgpjqmtngrpnltegl.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9memhncGpxbXRuZ3Jwbmx0ZWdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAyNTIxODAsImV4cCI6MjA2NTgyODE4MH0.PQOaTOHfGJqhfr6ariJWNgf64qHuDzMbgKLoMAaOM1c';

// Debug logging (remove in production)
console.log('Supabase URL:', supabaseUrl);
console.log('Supabase Key exists:', !!supabaseAnonKey);

if (!supabaseUrl) {
  console.error('VITE_SUPABASE_URL is not defined');
}

if (!supabaseAnonKey) {
  console.error('VITE_SUPABASE_ANON_KEY is not defined');
}

// Create Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
  }
});

// Types for PayForm data
export interface Transaction {
  id: number;
  form_id: string;
  email: string;
  customer_name?: string;
  product_name?: string;
  payment_amount: number;
  payment_currency: string;
  payment_status: string;
  payment_provider: string;
  transaction_id: string;
  discount_code?: string;
  discount_amount?: number;
  created_at: string;
}

export interface FormAdmin {
  id: string;
  email: string;
  name?: string;
  company_name?: string;
  created_at: string;
  is_active: boolean;
}

export interface ProviderConfig {
  id: string;
  admin_id: string;
  provider_name: string;
  is_enabled: boolean;
  config_data: any;
  created_at: string;
  updated_at: string;
}

export interface DiscountCoupon {
  id: string;
  admin_id: string;
  code: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  max_uses?: number;
  current_uses: number;
  valid_from: string;
  valid_until?: string;
  is_active: boolean;
  created_at: string;
}

// Test connection function
export const testSupabaseConnection = async () => {
  try {
    const { data, error } = await supabase.from('form_admins').select('count', { count: 'exact' });
    if (error) {
      console.error('Supabase connection test failed:', error);
      return false;
    }
    console.log('Supabase connection successful');
    return true;
  } catch (error) {
    console.error('Supabase connection error:', error);
    return false;
  }
};
