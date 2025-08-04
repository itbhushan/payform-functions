// netlify/functions/dashboard-data.js - CORRECTED VERSION
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
    console.log('🚀 Dashboard data request started');
    
    // Get admin_id from request body (POST) or query params (GET)
    let adminId;
    
    if (event.httpMethod === 'POST' && event.body) {
      const body = JSON.parse(event.body);
      adminId = body.adminId;
    } else {
      adminId = event.queryStringParameters?.admin_id;
    }

    if (!adminId) {
      console.error('❌ No admin_id provided');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'admin_id is required',
          message: 'Please provide adminId in request body or admin_id in query params'
        })
      };
    }

    console.log('Admin ID:', adminId);

    // Environment variables
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error('❌ Missing environment variables');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: 'Server configuration error',
          details: 'Missing environment variables'
        })
      };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Test database connection first
    console.log('🔍 Testing database connection...');
    const { data: testData, error: testError } = await supabase
      .from('form_admins')
      .select('count', { count: 'exact' });

    if (testError) {
      console.error('❌ Database connection error:', testError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: 'Database connection failed',
          details: testError.message
        })
      };
    }

    console.log('✅ Database connected successfully');

    // Fetch forms data 
    console.log('📝 Fetching forms data...');
    const forms = await fetchFormsData(supabase, adminId);

    // Fetch dashboard statistics
    console.log('📊 Fetching dashboard stats...');
    const stats = await fetchDashboardStats(supabase, adminId);
    
    // Fetch recent transactions
    console.log('💳 Fetching recent transactions...');
    const transactions = await fetchRecentTransactions(supabase, adminId);

    // Fetch commission data
    console.log('💰 Fetching commission data...');
    const commissions = await fetchCommissionData(supabase, adminId);

    console.log('✅ Dashboard data compiled successfully');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        forms,
        stats,
        transactions,
        commissions,
        adminId,
        timestamp: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error('❌ Dashboard data error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to fetch dashboard data',
        message: error.message,
        stack: error.stack
      })
    };
  }
};

// ADD this new function to fetch forms data
async function fetchFormsData(supabase, adminId) {
  try {
    console.log('📝 Fetching forms for admin:', adminId);

    const { data: forms, error } = await supabase
      .from('form_configs')
      .select('*')
      .eq('admin_id', adminId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Forms fetch error:', error);
      throw error;
    }

    console.log('Found forms:', forms?.length || 0);
    return forms || [];

  } catch (error) {
    console.error('Error fetching forms:', error);
    return [];
  }
}

async function fetchDashboardStats(supabase, adminId) {
  try {
    console.log('📈 Fetching transaction stats for admin:', adminId);

    // Get transaction statistics
    const { data: allTransactions, error: transactionError } = await supabase
      .from('transactions')
      .select('*')
      .eq('admin_id', adminId);

    if (transactionError) {
      console.error('Transaction query error:', transactionError);
      throw transactionError;
    }

    console.log('Found transactions:', allTransactions?.length || 0);

    const transactions = allTransactions || [];
    const totalTransactions = transactions.length;
    const paidTransactions = transactions.filter(t => t.payment_status === 'paid');
    const pendingTransactions = transactions.filter(t => t.payment_status === 'pending');
    const failedTransactions = transactions.filter(t => t.payment_status === 'failed');

    const totalRevenue = paidTransactions.reduce((sum, t) => sum + (parseFloat(t.payment_amount) || 0), 0);
    const totalCommissions = paidTransactions.reduce((sum, t) => sum + (parseFloat(t.platform_commission) || 0), 0);
    const totalNetEarnings = paidTransactions.reduce((sum, t) => sum + (parseFloat(t.net_amount_to_admin) || 0), 0);

    const stats = {
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

    console.log('📊 Stats calculated:', stats);
    return stats;

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
      conversionRate: '0.0',
      error: error.message
    };
  }
}

// REPLACE the entire fetchRecentTransactions function with this updated version

async function fetchRecentTransactions(supabase, adminId) {
  try {
    console.log('💳 Fetching transactions for admin:', adminId);

    // Updated query to JOIN with form_configs to get form names
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select(`
        *,
        form_configs (
          form_name,
          form_url
        )
      `)
      .eq('admin_id', adminId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Transactions fetch error:', error);
      throw error;
    }

    console.log('Found transactions:', transactions?.length || 0);

    if (!transactions || transactions.length === 0) {
      return [];
    }

    return transactions.map(t => ({
      id: t.id,
      transactionId: t.cashfree_payment_id || t.transaction_id || `TXN_${t.id.toString().slice(0, 8)}`,
      email: t.email,
      customerName: t.customer_name || 'Unknown',
      productName: t.product_name || 'Unknown Product',
      
      // 🆕 NEW: Add form name from the joined form_configs table
      formName: t.form_configs?.form_name || 'Unknown Form',
      formUrl: t.form_configs?.form_url || null,
      
      amount: parseFloat(t.payment_amount || 0).toFixed(2),
      commission: parseFloat(t.platform_commission || 0).toFixed(2),
      netAmount: parseFloat(t.net_amount_to_admin || 0).toFixed(2),
      gatewayFee: parseFloat(t.gateway_fee || 0).toFixed(2),
      status: t.payment_status || 'pending',
      paymentMethod: t.payment_method || 'Cashfree',
      createdAt: t.created_at,
      formattedDate: new Date(t.created_at).toLocaleDateString('en-IN'),
      formattedTime: new Date(t.created_at).toLocaleTimeString('en-IN', { 
        hour: '2-digit', 
        minute: '2-digit' 
      }),
      
      // 🆕 NEW: Add form ID for reference
      formId: t.form_id
    }));

  } catch (error) {
    console.error('Error fetching transactions:', error);
    return [];
  }
}

async function fetchCommissionData(supabase, adminId) {
  try {
    console.log('💰 Fetching commissions for admin:', adminId);

    const { data: commissions, error } = await supabase
      .from('platform_commissions')
      .select('*')
      .eq('form_admin_id', adminId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('Commissions fetch error:', error);
      console.log('⚠️ Commissions table might not exist yet, returning empty data');
      return {
        totalCommissions: 0,
        completedCount: 0,
        pendingCount: 0,
        totalAmount: '0.00',
        averageCommission: '0.00',
        recentCommissions: []
      };
    }

    const commissionList = commissions || [];
    const totalCommissionAmount = commissionList.reduce((sum, c) => sum + (parseFloat(c.commission_amount) || 0), 0);
    const completedCommissions = commissionList.filter(c => c.status === 'completed');
    const pendingCommissions = commissionList.filter(c => c.status === 'pending');

    return {
      totalCommissions: commissionList.length,
      completedCount: completedCommissions.length,
      pendingCount: pendingCommissions.length,
      totalAmount: totalCommissionAmount.toFixed(2),
      averageCommission: commissionList.length > 0 ? (totalCommissionAmount / commissionList.length).toFixed(2) : '0.00',
      recentCommissions: commissionList.map(c => ({
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
      recentCommissions: [],
      error: error.message
    };
  }
}
