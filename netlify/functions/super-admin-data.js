// netlify/functions/dashboard-data.js - Real Dashboard Data Fetcher
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // Environment variables
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Server configuration error' })
      };
    }

    // Get admin_id from query parameters (default to test admin)
    const adminId = event.queryStringParameters?.admin_id || 'f807a8c3-316b-4df0-90e7-5f7796c86f71';

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch dashboard statistics
    const stats = await fetchDashboardStats(supabase, adminId);
    
    // Fetch recent transactions
    const transactions = await fetchRecentTransactions(supabase, adminId);

    // Fetch commission data
    const commissions = await fetchCommissionData(supabase, adminId);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        stats,
        transactions,
        commissions,
        adminId
      })
    };

  } catch (error) {
    console.error('Dashboard data error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to fetch dashboard data' })
    };
  }
};

async function fetchDashboardStats(supabase, adminId) {
  try {
    // Get transaction statistics
    const { data: allTransactions, error: transactionError } = await supabase
      .from('transactions')
      .select('*')
      .eq('admin_id', adminId);

    if (transactionError) throw transactionError;

    const totalTransactions = allTransactions.length;
    const paidTransactions = allTransactions.filter(t => t.payment_status === 'paid');
    const pendingTransactions = allTransactions.filter(t => t.payment_status === 'pending');
    const failedTransactions = allTransactions.filter(t => t.payment_status === 'failed');

    const totalRevenue = paidTransactions.reduce((sum, t) => sum + (t.payment_amount || 0), 0);
    const totalCommissions = paidTransactions.reduce((sum, t) => sum + (t.platform_commission || 0), 0);
    const totalNetEarnings = paidTransactions.reduce((sum, t) => sum + (t.net_amount_to_admin || 0), 0);

    return {
      totalTransactions,
      paidCount: paidTransactions.length,
      pendingCount: pendingTransactions.length,
      failedCount: failedTransactions.length,
      totalRevenue: totalRevenue.toFixed(2),
      totalCommissions: totalCommissions.toFixed(2),
      totalNetEarnings: totalNetEarnings.toFixed(2),
      averageOrderValue: totalTransactions > 0 ? (totalRevenue / totalTransactions).toFixed(2) : '0.00',
      conversionRate: totalTransactions > 0 ? ((paidTransactions.length / totalTransactions) * 100).toFixed(1) : '0.0'
    };

  } catch (error) {
    console.error('Error fetching stats:', error);
    return {
      totalTransactions: 0,
      paidCount: 0,
      pendingCount: 0,
      failedCount: 0,
      totalRevenue: '0.00',
      totalCommissions: '0.00',
      totalNetEarnings: '0.00',
      averageOrderValue: '0.00',
      conversionRate: '0.0'
    };
  }
}

async function fetchRecentTransactions(supabase, adminId) {
  try {
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('admin_id', adminId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    return transactions.map(t => ({
      id: t.id,
      transactionId: t.cashfree_payment_id || t.transaction_id || `TXN_${t.id.slice(0, 8)}`,
      email: t.email,
      productName: t.product_name || 'Unknown Product',
      amount: parseFloat(t.payment_amount || 0).toFixed(2),
      commission: parseFloat(t.platform_commission || 0).toFixed(2),
      netAmount: parseFloat(t.net_amount_to_admin || 0).toFixed(2),
      status: t.payment_status || 'pending',
      paymentMethod: t.payment_method || 'Cashfree',
      createdAt: t.created_at,
      formattedDate: new Date(t.created_at).toLocaleDateString('en-IN'),
      formattedTime: new Date(t.created_at).toLocaleTimeString('en-IN', { 
        hour: '2-digit', 
        minute: '2-digit' 
      })
    }));

  } catch (error) {
    console.error('Error fetching transactions:', error);
    return [];
  }
}

async function fetchCommissionData(supabase, adminId) {
  try {
    const { data: commissions, error } = await supabase
      .from('platform_commissions')
      .select('*')
      .eq('form_admin_id', adminId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;

    const totalCommissionAmount = commissions.reduce((sum, c) => sum + (c.commission_amount || 0), 0);
    const completedCommissions = commissions.filter(c => c.status === 'completed');
    const pendingCommissions = commissions.filter(c => c.status === 'pending');

    return {
      totalCommissions: commissions.length,
      completedCount: completedCommissions.length,
      pendingCount: pendingCommissions.length,
      totalAmount: totalCommissionAmount.toFixed(2),
      averageCommission: commissions.length > 0 ? (totalCommissionAmount / commissions.length).toFixed(2) : '0.00',
      recentCommissions: commissions.map(c => ({
        id: c.id,
        transactionId: c.transaction_id,
        amount: parseFloat(c.commission_amount || 0).toFixed(2),
        status: c.status,
        createdAt: c.created_at,
        formattedDate: new Date(c.created_at).toLocaleDateString('en-IN')
      }))
    };

  } catch (error) {
    console.error('Error fetching commissions:', error);
    return {
      totalCommissions: 0,
      completedCount: 0,
      pendingCount: 0,
      totalAmount: '0.00',
      averageCommission: '0.00',
      recentCommissions: []
    };
  }
}
