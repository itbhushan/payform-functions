// src/lib/supabase.ts - Supabase Configuration
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Types
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
}

export interface ProviderConfig {
  id: string;
  provider_name: string;
  is_enabled: boolean;
  config_data: any;
}

export interface DiscountCoupon {
  id: string;
  code: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  max_uses?: number;
  current_uses: number;
  valid_from: string;
  valid_until?: string;
  is_active: boolean;
}
