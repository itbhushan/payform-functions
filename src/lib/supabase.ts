import { createClient } from '@supabase/supabase-js';

// Get environment variables with fallbacks for development
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://ofzhgpjqmtngrpnltegl.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9memhncGpxbXRuZ3Jwbmx0ZWdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAyNTIxODAsImV4cCI6MjA2NTgyODE4MH0.PQOaTOHfGJqhfr6ariJWNgf64qHuDzMbgKLoMAaOM1c';

// Create Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
  }
});

// Enhanced Types for Razorpay Route Integration
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
  // Razorpay Route specific fields
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
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
  payment_setup_complete?: boolean;
}

export interface ProviderConfig {
  id: string;
  admin_id: string;
  provider_name: 'stripe' | 'razorpay' | 'razorpay_route' | 'cashfree' | 'paypal';
  is_enabled: boolean;
  config_data: any;
  // Razorpay Route specific fields
  razorpay_linked_account_id?: string;
  razorpay_account_status?: 'created' | 'activated' | 'suspended';
  onboarding_complete?: boolean;
  verification_status?: 'pending' | 'verified' | 'rejected';
  created_at: string;
  updated_at: string;
}

export interface PlatformCommission {
  id: string;
  transaction_id: string; // Changed to string for Razorpay order IDs
  form_admin_id: string;
  commission_amount: number;
  commission_rate: number;
  platform_fee: number;
  gateway_fee: number;
  net_amount_to_admin: number;
  status: 'pending' | 'completed' | 'failed';
  razorpay_transfer_id?: string;
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
  business_name?: string; // NEW FIELD
  business_type?: string;
  verification_documents?: {
    pan_number?: string;
    gst_number?: string;
    upi_id?: string; // NEW FIELD
    linked_account_id?: string; // NEW FIELD
    payment_method?: 'bank' | 'upi'; // NEW FIELD
  };
  rejection_reason?: string;
  created_at: string;
  updated_at: string;
}

export interface PaymentSplit {
  id: string;
  transaction_id: string;
  razorpay_order_id: string;
  total_amount: number;
  gateway_fee: number;
  platform_commission: number;
  form_admin_amount: number;
  form_admin_id: string;
  split_status: 'pending' | 'processing' | 'completed' | 'failed';
  razorpay_transfer_id?: string;
  razorpay_split_response?: any;
  created_at: string;
}

// NEW: Razorpay Route specific types
export interface RazorpayRouteConfig {
  key_id: string;
  key_secret: string;
  environment: 'test' | 'live';
  webhook_secret?: string;
  webhook_url?: string;
  linked_account_id?: string;
}

export interface RazorpayLinkedAccount {
  id: string;
  admin_id: string;
  razorpay_account_id: string;
  account_status: 'created' | 'activated' | 'needs_clarification' | 'suspended';
  reference_id: string;
  legal_business_name: string;
  business_type: string;
  contact_name: string;
  email: string;
  phone?: string;
  profile: {
    category: string;
    subcategory: string;
  };
  legal_info: {
    pan: string;
    gst?: string;
  };
  bank_accounts?: Array<{
    id: string;
    ifsc: string;
    account_number: string;
    beneficiary_name: string;
    status: 'created' | 'activated';
  }>;
  created_at: string;
  updated_at: string;
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

// NEW: Razorpay Route API Types
export interface RazorpayRouteOrderRequest {
  amount: number;
  currency: string;
  receipt: string;
  notes?: {
    form_id: string;
    email: string;
    product_name: string;
    admin_id: string;
  };
  transfers: Array<{
    account: string;
    amount: number;
    currency: string;
    notes?: any;
    linked_account_notes?: string[];
    on_hold?: number;
  }>;
}

export interface RazorpayRouteOrderResponse {
  id: string;
  entity: string;
  amount: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  receipt: string;
  status: string;
  attempts: number;
  notes: any;
  created_at: number;
  transfers?: Array<{
    id: string;
    entity: string;
    source: string;
    recipient: string;
    amount: number;
    currency: string;
    status: string;
  }>;
}

export interface RazorpayRoutePaymentResponse {
  id: string;
  entity: string;
  amount: number;
  currency: string;
  status: string;
  order_id: string;
  method: string;
  amount_refunded: number;
  captured: boolean;
  description?: string;
  card_id?: string;
  bank?: string;
  wallet?: string;
  vpa?: string;
  email: string;
  contact: string;
  notes: any;
  fee?: number;
  tax?: number;
  created_at: number;
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

// NEW: Razorpay Route Commission Calculation
export const calculateRazorpayRouteCommissionSplit = (
  totalAmount: number, 
  platformCommissionRate: number = 3.0
) => {
  // Razorpay fees: 2% + ₹3 + 18% GST
  const baseRazorpayFee = (totalAmount * 0.02) + 3;
  const razorpayGST = baseRazorpayFee * 0.18;
  const totalRazorpayFee = baseRazorpayFee + razorpayGST;
  
  // Platform commission (percentage of total amount)
  const platformCommission = totalAmount * (platformCommissionRate / 100);
  
  // Form admin gets remainder after all deductions
  const formAdminAmount = totalAmount - totalRazorpayFee - platformCommission;
  
  return {
    totalAmount: Number(totalAmount.toFixed(2)),
    razorpayFee: Number(totalRazorpayFee.toFixed(2)),
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

// NEW: Check if form admin has completed Razorpay Route setup
export const checkPaymentSetupComplete = async (adminId: string): Promise<boolean> => {
  try {
    const { data, error } = await supabase
      .from('provider_configs')
      .select('is_enabled, verification_status')
      .eq('admin_id', adminId)
      .eq('provider_name', 'razorpay_route')
      .single();

    if (error || !data) {
      return false;
    }

    return data.is_enabled && data.verification_status === 'verified';
  } catch (error) {
    console.error('Error checking payment setup:', error);
    return false;
  }
};

// NEW: Get form admin's linked account details
export const getLinkedAccountDetails = async (adminId: string) => {
  try {
    const { data, error } = await supabase
      .from('sub_account_applications')
      .select('verification_documents')
      .eq('form_admin_id', adminId)
      .eq('provider_name', 'razorpay_route')
      .eq('application_status', 'approved')
      .single();

    if (error || !data) {
      return null;
    }

    return data.verification_documents?.linked_account_id || null;
  } catch (error) {
    console.error('Error getting linked account details:', error);
    return null;
  }
};

// MISSING FUNCTIONS - Adding them back for MyForms.tsx compatibility

// Extract Google Form ID from URL
export const extractGoogleFormId = (url: string): string | null => {
  try {
    // Handle different Google Forms URL formats
    const patterns = [
      /\/forms\/d\/([a-zA-Z0-9-_]+)/,  // Standard format
      /\/forms\/d\/e\/([a-zA-Z0-9-_]+)/, // Alternative format
      /formResponse\?formkey=([a-zA-Z0-9-_]+)/, // Old format
      /forms\.gle\/([a-zA-Z0-9-_]+)/ // Short URL format
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1];
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error extracting form ID:', error);
    return null;
  }
};

// Fetch Google Form structure (placeholder - needs Google APIs)
export const fetchGoogleFormStructure = async (formId: string) => {
  // This function would typically use Google Forms API
  // For now, return a placeholder structure
  return {
    title: 'Form Title',
    fields: [
      { title: 'Email', type: 'email', required: true },
      { title: 'Name', type: 'text', required: true },
      { title: 'Product', type: 'multiple_choice', required: true }
    ]
  };
};

// Test Google Form access (placeholder)
export const testGoogleFormAccess = async (formId: string): Promise<boolean> => {
  try {
    // This would typically test access to the Google Form
    // For now, return true as placeholder
    return true;
  } catch (error) {
    console.error('Error testing Google Form access:', error);
    return false;
  }
};
