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
    // ✅ FIX 1: Extract form_admin_id from request body
    const { 
      form_id, 
      email, 
      product_name, 
      product_price, 
      customer_name = "Customer", 
      customer_phone = "9999999999",
      form_admin_id  // ✅ CRITICAL: Extract admin ID sent from Google Apps Script
    } = JSON.parse(event.body || '{}');

    console.log('📥 Request received:', {
      form_id,
      email,
      product_name,
      product_price,
      form_admin_id: form_admin_id || 'NOT PROVIDED'
    });

    const CASHFREE_APP_ID = process.env.CASHFREE_APP_ID;
    const CASHFREE_SECRET_KEY = process.env.CASHFREE_SECRET_KEY;

    if (!CASHFREE_APP_ID || !CASHFREE_SECRET_KEY) {
      throw new Error('Cashfree credentials not configured');
    }

    const orderId = `payform_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Step 1: Create Order
    const orderData = {
      order_id: orderId,
      order_amount: parseFloat(product_price),
      order_currency: "INR",
      customer_details: {
        customer_id: email.replace('@', '_').replace('.', '_'),
        customer_name: customer_name,
        customer_email: email,
        customer_phone: customer_phone
      },
      order_meta: {
        return_url: `https://payform2025.netlify.app/.netlify/functions/verify-cashfree-payment?order_id=${orderId}&form_id=${form_id}&email=${encodeURIComponent(email)}`
      }
    };

    const orderResponse = await fetch('https://sandbox.cashfree.com/pg/orders', {
      method: 'POST',
      headers: {
        'x-client-id': CASHFREE_APP_ID,
        'x-client-secret': CASHFREE_SECRET_KEY,
        'x-api-version': '2023-08-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(orderData)
    });

    if (!orderResponse.ok) {
      const errorText = await orderResponse.text();
      throw new Error(`Cashfree order creation failed: ${errorText}`);
    }

    const cashfreeOrder = await orderResponse.json();
    console.log('✅ Order created:', cashfreeOrder.cf_order_id);

    // Step 2: Create Payment Session
    const sessionData = {
      order_id: cashfreeOrder.cf_order_id,
      payment_methods: {}
    };

    const sessionResponse = await fetch(`https://sandbox.cashfree.com/pg/orders/${cashfreeOrder.cf_order_id}/payments`, {
      method: 'POST',
      headers: {
        'x-client-id': CASHFREE_APP_ID,
        'x-client-secret': CASHFREE_SECRET_KEY,
        'x-api-version': '2023-08-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(sessionData)
    });

    let checkoutUrl = null;

    if (sessionResponse.ok) {
      const sessionResult = await sessionResponse.json();
      console.log('✅ Payment session created:', sessionResult);
      checkoutUrl = sessionResult.payment_link || sessionResult.data?.payment_link;
    }

    // Fallback: Use Payment Links API if session creation failed
    if (!checkoutUrl) {
      console.log('🔄 Trying Payment Links API...');
      const linkData = {
        link_id: `link_${orderId}`,
        link_amount: parseFloat(product_price),
        link_currency: "INR",
        link_purpose: `Payment for ${product_name}`,
        customer_details: {
          customer_name: customer_name,
          customer_email: email,
          customer_phone: customer_phone
        },
        link_meta: {
          return_url: `https://payform2025.netlify.app/.netlify/functions/verify-cashfree-payment?order_id=${orderId}&form_id=${form_id}&email=${encodeURIComponent(email)}`
        }
      };

      const linkResponse = await fetch('https://sandbox.cashfree.com/pg/links', {
        method: 'POST',
        headers: {
          'x-client-id': CASHFREE_APP_ID,
          'x-client-secret': CASHFREE_SECRET_KEY,
          'x-api-version': '2023-08-01',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(linkData)
      });

      if (linkResponse.ok) {
        const linkResult = await linkResponse.json();
        console.log('✅ Payment link created:', linkResult.link_url);
        checkoutUrl = linkResult.link_url;
      }
    }

    // Final fallback checkout URL
    if (!checkoutUrl) {
      checkoutUrl = `https://payments.cashfree.com/forms/${cashfreeOrder.payment_session_id.replace(/paymentpayment$/, '')}`;
    }

    // ✅ FIX 2: Pass form_admin_id to database logging
    await logTransactionToDatabase(orderId, cashfreeOrder, {
      form_id, 
      email, 
      product_name, 
      product_price, 
      customer_name, 
      customer_phone, 
      form_admin_id  // ✅ CRITICAL: Pass admin ID to database function
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        order_id: orderId,
        cf_order_id: cashfreeOrder.cf_order_id,
        checkout_url: checkoutUrl,
        admin_id_used: adminId // ✅ Use already resolved adminId
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

// ✅ FIX 3: Enhanced Admin ID Resolution with Multiple Strategies
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

  // ✅ STRATEGY 3: Get the first active admin as fallback (no hardcoding)
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

  // ✅ STRATEGY 4: Throw error instead of hardcoding
  throw new Error(`Cannot resolve admin ID for form: ${form_id}. Please ensure the form is registered in PayForm dashboard.`);
}

// ✅ FIX 4: Enhanced Database Logging with Robust Admin ID Resolution
async function logTransactionToDatabase(orderId, cashfreeOrder, orderDetails) {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.log('⚠️ Supabase credentials not configured, skipping database logging');
      return;
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
// ✅ FIX: Define orderDetails before using it
const orderDetails = {
  form_id, 
  email, 
  product_name, 
  product_price, 
  customer_name, 
  customer_phone, 
  form_admin_id
};

const adminId = await resolveAdminId(orderDetails);
    
    console.log('💾 Logging transaction with admin ID:', adminId);

    // Calculate commission split
    const totalAmount = parseFloat(orderDetails.product_price);
    const gatewayFee = (totalAmount * 2.5 / 100) + 3; // Cashfree: 2.5% + ₹3
    const platformCommission = totalAmount * 3 / 100; // Platform: 3%
    const netAmountToAdmin = totalAmount - gatewayFee - platformCommission;

    // Insert transaction record
    const transactionData = {
      form_id: orderDetails.form_id,
      email: orderDetails.email,
      customer_name: orderDetails.customer_name,
      product_name: orderDetails.product_name,
      payment_amount: totalAmount,
      payment_currency: 'INR',
      payment_status: 'pending',
      payment_provider: 'cashfree',
      transaction_id: orderId,
      cashfree_order_id: cashfreeOrder.cf_order_id,
      gateway_fee: Number(gatewayFee.toFixed(2)),
      platform_commission: Number(platformCommission.toFixed(2)),
      net_amount_to_admin: Number(netAmountToAdmin.toFixed(2)),
      admin_id: adminId, // ✅ Dynamically resolved admin ID
      created_at: new Date().toISOString()
    };

    console.log('💾 Transaction data:', {
      transaction_id: orderId,
      admin_id: adminId,
      amount: totalAmount,
      form_id: orderDetails.form_id
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

// ✅ Also log to platform_commissions table for revenue tracking
const commissionData = {
  transaction_id: data?.[0]?.id,
  form_admin_id: adminId,
  commission_amount: Number(platformCommission.toFixed(2)),
  commission_rate: 3.0,
  platform_fee: Number(platformCommission.toFixed(2)),
  gateway_fee: Number(gatewayFee.toFixed(2)),
  net_amount_to_admin: Number(netAmountToAdmin.toFixed(2)), // ✅ ADD this missing field
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

  } catch (error) {
    console.error('❌ Database logging failed:', error);
    // Don't throw error here - payment creation should still succeed
    // even if database logging fails
  }
}
