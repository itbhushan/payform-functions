// netlify/functions/create-razorpay-order.js - UPDATED TO FOLLOW CASHFREE PATTERN
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // ✅ Extract all required parameters from request body (same as CashFree)
    const { 
      form_id, 
      email, 
      product_name, 
      product_price, 
      customer_name = "Customer", 
      customer_phone = "9999999999",
      form_admin_id
    } = JSON.parse(event.body || '{}');

    console.log('📥 Request received:', {
      form_id,
      email,
      product_name,
      product_price,
      form_admin_id: form_admin_id || 'NOT PROVIDED'
    });

    // Validate required environment variables
    const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
    const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      throw new Error('Razorpay credentials not configured');
    }

    // Generate unique order ID (same pattern as CashFree)
    const orderId = `payform_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // ✅ Create orderDetails object early for consistent usage (same as CashFree)
    const orderDetails = {
      form_id, 
      email, 
      product_name, 
      product_price, 
      customer_name, 
      customer_phone, 
      form_admin_id
    };

    // ✅ Resolve admin ID using same logic as CashFree
    const adminId = await resolveAdminId(orderDetails);

    // Create Razorpay Order (instead of CashFree)
    const orderData = {
      amount: Math.round(parseFloat(product_price) * 100), // Convert to paise
      currency: "INR",
      receipt: orderId,
      notes: {
        form_id: form_id,
        customer_email: email,
        product_name: product_name,
        admin_id: adminId,
        customer_name: customer_name
      }
    };

    console.log('💳 Creating Razorpay order...');

    const orderResponse = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(orderData)
    });

    if (!orderResponse.ok) {
      const errorText = await orderResponse.text();
      throw new Error(`Razorpay order creation failed: ${errorText}`);
    }

    const razorpayOrder = await orderResponse.json();
    console.log('✅ Order created:', razorpayOrder.id);

    // Generate checkout URL (Razorpay equivalent to CashFree payment link)
    const checkoutUrl = `https://rzp.io/i/${razorpayOrder.id}`;

    // ✅ Log transaction to database (same logic as CashFree)
    await logTransactionToDatabase(orderId, razorpayOrder, orderDetails, adminId);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        order_id: orderId,
        razorpay_order_id: razorpayOrder.id,
        checkout_url: checkoutUrl,
        payment_url: checkoutUrl, // For compatibility
        admin_id_used: adminId
      })
    };

  } catch (error) {
    console.error('❌ Function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        success: false, 
        error: error.message,
        details: 'Check Netlify function logs for more information'
      })
    };
  }
};

// ✅ REUSE EXACT SAME FUNCTIONS FROM CASHFREE (no changes needed)
async function resolveAdminId(orderDetails) {
  const { form_id, form_admin_id } = orderDetails;
  
  console.log('🔍 Resolving admin ID...', {
    received_admin_id: form_admin_id || 'NONE',
    form_id: form_id
  });

  // ✅ STRATEGY 1: Use admin ID from Google Apps Script (highest priority)
  if (form_admin_id && form_admin_id.trim() !== '') {
    console.log('✅ Using admin ID from Google Apps Script:', form_admin_id);
    return form_admin_id;
  }

  // ✅ STRATEGY 2: Look up admin ID from form_configs table
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      
      const { data: formConfig, error } = await supabase
        .from('form_configs')
        .select('admin_id, form_name')
        .eq('form_id', form_id)
        .single();
      
      if (!error && formConfig?.admin_id) {
        console.log('✅ Found admin ID in form_configs:', {
          admin_id: formConfig.admin_id,
          form_name: formConfig.form_name
        });
        return formConfig.admin_id;
      } else {
        console.log('⚠️ Form not found in form_configs:', error?.message || 'No data returned');
      }
    }
  } catch (dbError) {
    console.error('❌ Database lookup error:', dbError.message);
  }

  // ✅ STRATEGY 3: Get the first active admin as fallback
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      
      const { data: activeAdmin, error } = await supabase
        .from('form_admins')
        .select('id, email')
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(1)
        .single();
      
      if (!error && activeAdmin?.id) {
        console.log('⚠️ Using first active admin as fallback:', {
          admin_id: activeAdmin.id,
          email: activeAdmin.email
        });
        return activeAdmin.id;
      }
    }
  } catch (fallbackError) {
    console.error('❌ Fallback admin lookup error:', fallbackError.message);
  }

  throw new Error(`Cannot resolve admin ID for form: ${form_id}. Please ensure the form is registered in PayForm dashboard.`);
}

// ✅ ADAPTED DATABASE LOGGING (similar to CashFree but for Razorpay)
async function logTransactionToDatabase(orderId, razorpayOrder, orderDetails, adminId) {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.log('⚠️ Supabase credentials not configured, skipping database logging');
      return;
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    console.log('💾 Logging transaction with admin ID:', adminId);

    // Calculate commission split (same as CashFree)
    const totalAmount = parseFloat(orderDetails.product_price);
    const gatewayFee = (totalAmount * 2.0 / 100) + 2; // Razorpay: 2% + ₹2
    const platformCommission = totalAmount * 3 / 100; // Platform: 3%
    const netAmountToAdmin = totalAmount - gatewayFee - platformCommission;

    // Insert transaction record (adapted for Razorpay)
    const transactionData = {
      form_id: orderDetails.form_id,
      email: orderDetails.email,
      customer_name: orderDetails.customer_name,
      product_name: orderDetails.product_name,
      payment_amount: totalAmount,
      payment_currency: 'INR',
      payment_status: 'pending',
      payment_provider: 'razorpay', // Changed from 'cashfree'
      transaction_id: orderId,
      razorpay_order_id: razorpayOrder.id, // Changed from cashfree_order_id
      gateway_fee: Number(gatewayFee.toFixed(2)),
      platform_commission: Number(platformCommission.toFixed(2)),
      net_amount_to_admin: Number(netAmountToAdmin.toFixed(2)),
      admin_id: adminId,
      created_at: new Date().toISOString()
    };

    console.log('💾 Transaction data summary:', {
      transaction_id: orderId,
      admin_id: adminId,
      amount: totalAmount,
      form_id: orderDetails.form_id,
      net_amount_to_admin: Number(netAmountToAdmin.toFixed(2))
    });

    const { data, error: dbError } = await supabase
      .from('transactions')
      .insert([transactionData])
      .select('id, admin_id');

    if (dbError) {
      console.error('❌ Database logging error:', dbError);
      throw new Error(`Database logging failed: ${dbError.message}`);
    } else {
      console.log('✅ Transaction logged successfully:', data?.[0]);
    }

    // ✅ Log to platform_commissions table (same as CashFree)
    if (data?.[0]?.id) {
      const commissionData = {
        transaction_id: data[0].id,
        form_admin_id: adminId,
        commission_amount: Number(platformCommission.toFixed(2)),
        commission_rate: 3.0,
        platform_fee: Number(platformCommission.toFixed(2)),
        gateway_fee: Number(gatewayFee.toFixed(2)),
        net_amount_to_admin: Number(netAmountToAdmin.toFixed(2)),
        status: 'pending',
        created_at: new Date().toISOString()
      };

      const { error: commissionError } = await supabase
        .from('platform_commissions')
        .insert([commissionData]);

      if (commissionError) {
        console.error('⚠️ Commission logging error:', commissionError);
      } else {
        console.log('✅ Commission logged successfully');
      }
    }

  } catch (error) {
    console.error('❌ Database logging failed:', error);
    // Don't throw error here - payment creation should still succeed
  }
}
