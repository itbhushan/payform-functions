import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

// Add these missing functions before the useDashboardData hook:
export const fetchAdmin = async (userId: string) => {
  try {
    const { data, error } = await supabase
      .from('form_admins')
      .select('*')
      .eq('id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    return data;
  } catch (err) {
    console.error('fetchAdmin error:', err);
    throw err;
  }
};

export const createAdmin = async (adminData: any) => {
  try {
    const { data, error } = await supabase
      .from('form_admins')
      .insert([adminData])
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (err) {
    console.error('createAdmin error:', err);
    throw err;
  }
};

// Type definitions
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

export interface DashboardStats {
  totalSales: number;
  totalTransactions: number;
  completedTransactions: number;
  pendingTransactions: number;
  totalEarnings: number;
}

export interface PlatformData {
  totalFormAdmins: number;
  totalRevenue: number;
  platformCommission: number;
  totalTransactions: number;
  recentTransactions: Transaction[];
}

export interface CashfreeConfig {
  id?: string;
  admin_id: string;
  provider_name: string;
  is_enabled: boolean;
  config_data: any;
  verification_status?: string;
  created_at?: string;
  updated_at?: string;
}

export interface FormConfig {
  id: string;
  form_id: string;
  form_name: string;
  form_url: string;
  admin_id: string;
  is_active: boolean;
  created_at: string;
}

// Add this state at the top of useDashboardData hook
//const [abortController, setAbortController] = useState<AbortController | null>(null);
// Dashboard Data Hook
export const useDashboardData = (adminId?: string) => {
  const [data, setData] = useState<DashboardStats | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

const fetchData = async () => {
  if (!adminId) {
    setLoading(false);
    return;
  }
  console.log('🚀 FETCHDATA CALLED WITH ADMIN_ID:', adminId);
  console.log('🔍 CURRENT USER CONTEXT:', { adminId });
  
  try {
    setLoading(true);
    setError(null);
    
// Fetch transactions for this admin
const { data: transactionsData, error: transactionsError } = await supabase
  .from('transactions')
  .select('*')
  .eq('admin_id', adminId)
  .order('created_at', { ascending: false })
  // Remove the abortSignal line completely
  .order('created_at', { ascending: false });
    
      if (transactionsError) {
        throw transactionsError;
      }

      const allTransactions = transactionsData || [];
      setTransactions(allTransactions);
  
      // Calculate stats
      const totalSales = allTransactions.reduce((sum, t) => sum + (t.payment_amount || 0), 0);
      const completedTransactions = allTransactions.filter(t => t.payment_status === 'paid').length;
      const pendingTransactions = allTransactions.filter(t => t.payment_status === 'pending').length;
      const totalEarnings = allTransactions.reduce((sum, t) => sum + (t.net_amount_to_admin || 0), 0);

// Enhanced debug logs
console.log('🔍 DEBUG: Admin ID:', adminId);
console.log('🔍 DEBUG: Transactions found:', allTransactions?.length || 0);
console.log('🔍 DEBUG: Sample transaction:', allTransactions?.[0]);
console.log('🔍 DEBUG: Stats calculated:', {
  totalSales,
  totalTransactions: allTransactions.length,
  completedTransactions,
  pendingTransactions,
  totalEarnings
});      
      const stats: DashboardStats = {
        totalSales,
        totalTransactions: allTransactions.length,
        completedTransactions,
        pendingTransactions,
        totalEarnings
      };

      setData(stats);
      
} catch (err: any) {
  if (err.name === 'AbortError') {
    console.log('Dashboard request cancelled');
    return;
  }
  console.error('Error fetching dashboard data:', err);
  setError(err.message || 'Failed to load dashboard data');
  
  // Show empty state - no mock data
  setData({
    totalSales: 0,
    totalTransactions: 0,
    completedTransactions: 0,
    pendingTransactions: 0,
    totalEarnings: 0
  });
  setTransactions([]);
    
  } finally {
      setLoading(false);
    }
  };

// Fix the useEffect in useDashboardData:
useEffect(() => {
  const timeoutId = setTimeout(() => {
    fetchData(); // ✅ Call fetchData instead of fetchAdmin
  }, 300);

  return () => clearTimeout(timeoutId);
}, [adminId]);
  
  return {
    data,
    transactions,
    loading,
    error,
    refetch: fetchData
  };
};

// Form Admin Hook
export const useFormAdmin = (adminId?: string) => {
  const [admin, setAdmin] = useState<FormAdmin | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAdmin = async () => {
      if (!adminId) {
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('form_admins')
          .select('*')
          .eq('id', adminId)
          .single();

        if (error && error.code !== 'PGRST116') {
          throw error;
        }

        setAdmin(data);
      } catch (err) {
        console.error('Error fetching admin data:', err);
        // Set mock admin data
        setAdmin({
          id: adminId,
          email: 'demo@example.com',
          name: 'Demo User',
          company_name: 'Demo Company',
          created_at: new Date().toISOString(),
          is_active: true
        });
      } finally {
        setLoading(false);
      }
    };

    fetchAdmin();
  }, [adminId]);

  return { admin, loading };
};

// Platform Data Hook (for Super Admin)
export const usePlatformData = () => {
  const [data, setData] = useState<PlatformData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPlatformData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch all form admins
        const { data: adminsData, error: adminsError } = await supabase
          .from('form_admins')
          .select('id')
          .eq('is_active', true);

        if (adminsError) throw adminsError;

        // Fetch all transactions
        const { data: transactionsData, error: transactionsError } = await supabase
          .from('transactions')
          .select('*')
          .order('created_at', { ascending: false });

        if (transactionsError) throw transactionsError;

        const allTransactions = transactionsData || [];
        const totalRevenue = allTransactions.reduce((sum, t) => sum + (t.payment_amount || 0), 0);
        const platformCommission = allTransactions.reduce((sum, t) => sum + (t.platform_commission || 0), 0);

        const platformData: PlatformData = {
          totalFormAdmins: adminsData?.length || 0,
          totalRevenue,
          platformCommission,
          totalTransactions: allTransactions.length,
          recentTransactions: allTransactions.slice(0, 10)
        };

        setData(platformData);

      } catch (err: any) {
        console.error('Error fetching platform data:', err);
        setError(err.message || 'Failed to load platform data');
        
        // Set mock platform data
        setData({
          totalFormAdmins: 25,
          totalRevenue: 125000,
          platformCommission: 3750,
          totalTransactions: 450,
          recentTransactions: []
        });
      } finally {
        setLoading(false);
      }
    };

    fetchPlatformData();
  }, []);

  return { data, loading, error };
};

// Cashfree Config Hook
export const useCashfreeConfig = (adminId?: string) => {
  const [config, setConfig] = useState<CashfreeConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchConfig = async () => {
      if (!adminId) {
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('provider_configs')
          .select('*')
          .eq('admin_id', adminId)
          .eq('provider_name', 'cashfree')
          .single();

        if (error && error.code !== 'PGRST116') {
          throw error;
        }

        setConfig(data);
      } catch (err) {
        console.error('Error fetching Cashfree config:', err);
        // Set null config for new users
        setConfig(null);
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, [adminId]);

  const saveConfig = async (configData: any) => {
    if (!adminId) {
      return { success: false, error: 'No admin ID provided' };
    }

    try {
      const { data, error } = await supabase
        .from('provider_configs')
        .upsert({
          admin_id: adminId,
          provider_name: 'cashfree',
          is_enabled: true,
          config_data: configData,
          verification_status: 'pending',
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      setConfig(data);
      return { success: true };
    } catch (err: any) {
      console.error('Error saving Cashfree config:', err);
      return { success: false, error: err.message };
    }
  };

  return { config, loading, saveConfig };
};

// Form Configs Hook
export const useFormConfigs = (adminId?: string) => {
  const [forms, setForms] = useState<FormConfig[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchForms = async () => {
      if (!adminId) {
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('form_configs')
          .select('*')
          .eq('admin_id', adminId)
          .order('created_at', { ascending: false });

        if (error) throw error;

        setForms(data || []);
      } catch (err) {
        console.error('Error fetching form configs:', err);
        // Set empty forms for new users
        setForms([]);
      } finally {
        setLoading(false);
      }
    };

    fetchForms();
  }, [adminId]);

  return { forms, loading };
};

// Utility function to calculate commission splits
export const calculateCommissionSplit = (
  totalAmount: number, 
  commissionRate: number = 3.0,
  gatewayFeeRate: number = 2.5,
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
