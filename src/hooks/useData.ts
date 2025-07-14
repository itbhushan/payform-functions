// src/hooks/useData.ts
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export interface Transaction {
  id: number;
  transaction_id: string;
  email: string;
  customer_name?: string;
  product_name?: string;
  payment_amount: number;
  payment_currency: string;
  payment_status: string;
  payment_provider: string;
  admin_id?: string;
  created_at: string;
  // Commission fields (calculated)
  gateway_fee?: number;
  platform_commission?: number;
  net_amount_to_admin?: number;
}

export interface DashboardStats {
  totalSales: number;
  totalTransactions: number;
  completedTransactions: number;
  pendingTransactions: number;
  totalEarnings: number;
  platformCommission: number;
}

// Commission calculation functions
const calculateGatewayFee = (amount: number): number => {
  return (amount * 0.025) + 3; // 2.5% + ₹3 for Cashfree
};

const calculatePlatformCommission = (amount: number): number => {
  return amount * 0.03; // 3% platform commission
};

const calculateNetAmount = (amount: number): number => {
  const gatewayFee = calculateGatewayFee(amount);
  const platformCommission = calculatePlatformCommission(amount);
  return amount - gatewayFee - platformCommission;
};

// Hook for dashboard data (Form Admin view)
export const useDashboardData = (adminId?: string) => {
  const [data, setData] = useState<DashboardStats | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    if (!adminId) {
      setData(null);
      setTransactions([]);
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      console.log('Loading data for admin:', adminId);
      
      // Fetch transactions for this admin
      const { data: transactionData, error: transactionError } = await supabase
        .from('transactions')
        .select('*')
        .eq('admin_id', adminId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (transactionError) {
        console.error('Transaction error:', transactionError);
        throw transactionError;
      }

      const transactions = transactionData || [];
      console.log('Loaded transactions:', transactions.length);

      // Calculate commission for each transaction
      const enrichedTransactions = transactions.map(t => ({
        ...t,
        gateway_fee: calculateGatewayFee(t.payment_amount),
        platform_commission: calculatePlatformCommission(t.payment_amount),
        net_amount_to_admin: calculateNetAmount(t.payment_amount)
      }));

      setTransactions(enrichedTransactions);

      // Calculate dashboard stats
      const stats: DashboardStats = {
        totalSales: transactions.reduce((sum, t) => sum + t.payment_amount, 0),
        totalTransactions: transactions.length,
        completedTransactions: transactions.filter(t => t.payment_status === 'paid').length,
        pendingTransactions: transactions.filter(t => t.payment_status === 'pending').length,
        totalEarnings: enrichedTransactions.reduce((sum, t) => sum + (t.net_amount_to_admin || 0), 0),
        platformCommission: enrichedTransactions.reduce((sum, t) => sum + (t.platform_commission || 0), 0)
      };

      setData(stats);
      console.log('Calculated stats:', stats);
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load data';
      setError(errorMessage);
      console.error('Error loading dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [adminId]);

  return { data, transactions, loading, error, refetch: loadData };
};

// Hook for form admin profile
export const useFormAdmin = (adminId?: string) => {
  const [admin, setAdmin] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadAdmin = async () => {
      if (!adminId) return;
      
      setLoading(true);
      setError(null);
      
      try {
        console.log('Loading admin profile for:', adminId);
        
        const { data, error } = await supabase
          .from('form_admins')
          .select('*')
          .eq('id', adminId)
          .single();

        if (error) {
          console.error('Admin profile error:', error);
          throw error;
        }
        
        setAdmin(data);
        console.log('Loaded admin profile:', data);
        
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load admin profile';
        setError(errorMessage);
        console.error('Error loading admin:', err);
      } finally {
        setLoading(false);
      }
    };

    loadAdmin();
  }, [adminId]);

  return { admin, loading, error };
};

// Hook for super admin data (platform overview)
export const usePlatformData = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPlatformData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      console.log('Loading platform data...');
      
      // Get all transactions across all admins
      const { data: allTransactions, error: transError } = await supabase
        .from('transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      // Get all form admins
      const { data: allAdmins, error: adminError } = await supabase
        .from('form_admins')
        .select('*')
        .eq('is_active', true);

      if (transError) {
        console.error('Platform transactions error:', transError);
        throw transError;
      }
      
      if (adminError) {
        console.error('Platform admins error:', adminError);
        throw adminError;
      }

      const transactions = allTransactions || [];
      const admins = allAdmins || [];
      
      console.log('Platform data loaded:', { 
        transactionCount: transactions.length, 
        adminCount: admins.length 
      });

      const totalRevenue = transactions.reduce((sum, t) => sum + t.payment_amount, 0);
      const totalCommission = totalRevenue * 0.03; // 3% platform commission
      const completedTransactions = transactions.filter(t => t.payment_status === 'paid').length;

      setData({
        totalFormAdmins: admins.length,
        totalTransactions: transactions.length,
        completedTransactions,
        pendingTransactions: transactions.length - completedTransactions,
        totalRevenue,
        platformCommission: totalCommission,
        monthlyGrowth: 15.5, // Mock data for now
        recentTransactions: transactions.slice(0, 10)
      });

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load platform data';
      setError(errorMessage);
      console.error('Error loading platform data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlatformData();
  }, []);

  return { data, loading, error, refetch: loadPlatformData };
};

// Hook for Cashfree configuration
export const useCashfreeConfig = (adminId?: string) => {
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadConfig = async () => {
    if (!adminId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      console.log('Loading Cashfree config for:', adminId);
      
      const { data, error } = await supabase
        .from('provider_configs')
        .select('*')
        .eq('admin_id', adminId)
        .eq('provider_name', 'cashfree')
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('Cashfree config error:', error);
        throw error;
      }
      
      setConfig(data);
      console.log('Loaded Cashfree config:', data);
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load Cashfree config';
      setError(errorMessage);
      console.error('Error loading Cashfree config:', err);
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async (configData: any) => {
    if (!adminId) return { success: false, error: 'Admin ID required' };
    
    try {
      console.log('Saving Cashfree config:', configData);
      
      const { error } = await supabase
        .from('provider_configs')
        .upsert({
          admin_id: adminId,
          provider_name: 'cashfree',
          config_data: configData,
          is_enabled: true,
          verification_status: 'pending',
          updated_at: new Date().toISOString()
        });

      if (error) {
        console.error('Save config error:', error);
        throw error;
      }
      
      console.log('Cashfree config saved successfully');
      await loadConfig(); // Reload config after save
      return { success: true };
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save config';
      console.error('Error saving Cashfree config:', err);
      return { success: false, error: errorMessage };
    }
  };

  useEffect(() => {
    loadConfig();
  }, [adminId]);

  return { config, loading, error, saveConfig, refetch: loadConfig };
};

// Hook for form configurations (CORRECTED COLUMN NAME)
export const useFormConfigs = (adminId?: string) => {
  const [forms, setForms] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadForms = async () => {
    if (!adminId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      console.log('Loading forms for admin:', adminId);
      
      // CORRECTED: Use 'admin_id' instead of 'form_admin_id'
      const { data, error } = await supabase
        .from('form_configs')
        .select('*')
        .eq('admin_id', adminId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Forms error:', error);
        throw error;
      }
      
      setForms(data || []);
      console.log('Loaded forms:', data?.length || 0);
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load forms';
      setError(errorMessage);
      console.error('Error loading forms:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadForms();
  }, [adminId]);

  return { forms, loading, error, refetch: loadForms };
};
