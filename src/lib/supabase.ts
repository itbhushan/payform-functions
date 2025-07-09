import { createClient } from '@supabase/supabase-js';

// Get environment variables with fallbacks for development
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://ofzhgpjqmtngrpnltegl.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9memhncGpxbXRuZ3Jwbmx0ZWdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAyNTIxODAsImV4cCI6MjA2NTgyODE4MH0.PQOaTOHfGJqhfr6ariJWNgf64qHuDzMbgKLoMAaOM1c';

// Debug logging (remove in production)
console.log('Supabase URL:', supabaseUrl);
console.log('Supabase Key exists:', !!supabaseAnonKey);

// Create Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
  }
});

// Enhanced Types for Cashfree Integration
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
  // Cashfree specific fields
  cashfree_order_id?: string;
  cashfree_payment_id?: string;
  gateway_fee?: number;
  platform_commission?: number;
  net_amount_to_admin?: number;
  admin_id?: string;
  created_at: string;
  updated_at?: string;
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
  provider_name: 'stripe' | 'cashfree' | 'razorpay' | 'paypal';
  is_enabled: boolean;
  config_data: any;
  // Cashfree specific fields
  cashfree_sub_account_id?: string;
  cashfree_sub_account_status?: 'pending' | 'approved' | 'rejected';
  onboarding_complete?: boolean;
  verification_status?: 'pending' | 'verified' | 'rejected';
  created_at: string;
  updated_at: string;
}

export interface PlatformCommission {
  id: string;
  transaction_id: number;
  form_admin_id: string;
  commission_amount: number;
  commission_rate: number;
  platform_fee: number;
  gateway_fee: number;
  net_amount_to_admin: number;
  status: 'pending' | 'completed' | 'failed';
  cashfree_transfer_id?: string;
  processed_at?: string;
  created_at: string;
}

export interface SubAccountApplication {
  id: string;
  form_admin_id: string;
  provider_name: string;
  sub_account_id?: string;
  application_status: 'pending' | 'under_review' | 'approved' | 'rejected';
  bank_account_number?: string;
  ifsc_code?: string;
  account_holder_name?: string;
  business_type?: string;
  verification_documents?: any;
  rejection_reason?: string;
  created_at: string;
  updated_at: string;
}

export interface PaymentSplit {
  id: string;
  transaction_id: number;
  cashfree_order_id: string;
  total_amount: number;
  gateway_fee: number;
  platform_commission: number;
  form_admin_amount: number;
  form_admin_id: string;
  split_status: 'pending' | 'processing' | 'completed' | 'failed';
  cashfree_split_response?: any;
  created_at: string;
}

export interface CashfreeConfig {
  app_id: string;
  secret_key: string;
  environment: 'sandbox' | 'production';
  webhook_url?: string;
}

export interface FormAdminEarnings {
  admin_id: string;
  email: string;
  name?: string;
  total_transactions: number;
  successful_transactions: number;
  gross_revenue: number;
  net_earnings: number;
  platform_fees_paid: number;
  avg_transaction_value: number;
}

// Cashfree API Types
export interface CashfreeOrderRequest {
  order_amount: number;
  order_currency: string;
  order_id: string;
  customer_details: {
    customer_id: string;
    customer_name?: string;
    customer_email: string;
    customer_phone?: string;
  };
  order_meta?: {
    return_url?: string;
    notify_url?: string;
    payment_methods?: string;
  };
  order_splits?: Array<{
    vendor_id: string;
    amount: number;
    percentage?: number;
  }>;
}

export interface CashfreeOrderResponse {
  cf_order_id: string;
  order_id: string;
  entity: string;
  order_currency: string;
  order_amount: number;
  order_status: string;
  payment_session_id: string;
  order_token: string;
}

export interface CashfreePaymentResponse {
  cf_payment_id: string;
  order_id: string;
  entity: string;
  payment_currency: string;
  payment_amount: number;
  payment_status: string;
  payment_method: string;
  payment_time: string;
}

// Utility Functions
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

// Commission Calculation Utility
export const calculateCommissionSplit = (
  totalAmount: number, 
  commissionRate: number = 3.0,
  gatewayFeeRate: number = 2.0,
  fixedGatewayFee: number = 3.0
) => {
  const gatewayFee = (totalAmount * gatewayFeeRate / 100) + fixedGatewayFee;
  const platformCommission = totalAmount * commissionRate / 100;
  const formAdminAmount = totalAmount - gatewayFee - platformCommission;
  
  return {
    gatewayFee: Number(gatewayFee.toFixed(2)),
    platformCommission: Number(platformCommission.toFixed(2)),
    formAdminAmount: Number(formAdminAmount.toFixed(2))
  };
};

// Format currency for display
export const formatCurrency = (amount: number, currency: string = 'INR') => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currency,
  }).format(amount);
};

// Format date for display
export const formatDate = (dateString: string) => {
  return new Intl.DateTimeFormat('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateString));
};
