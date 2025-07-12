// netlify/functions/create-cashfree-payment.js
// Enhanced version with database integration

const { createClient } = require('@supabase/supabase-js');

// Cashfree configuration
const CASHFREE_CONFIG = {
  base_url: process.env.CASHFREE_ENVIRONMENT === 'production' 
    ? 'https://api.cashfree.com' 
    : 'https://sandbox.cashfree.com',
  app_id: process.env.CASHFREE_APP_ID,
  secret_key: process.env.CASHFREE_SECRET_KEY,
  api_version: '2023-08-01'
};

// Supabase configuration
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Commission rates configuration
const COMMISSION_CONFIG = {
  platform_rate: 3.0, // 3% platform commission
  gateway_rate: 2.5,  // 2.5% Cashfree gateway fee
  fixed_fee: 3.0      // ₹3 fixed fee
};

exports.handler = async (event, context) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ 
        success: false, 
        error: 'Method not allowed. Use POST.' 
      })
    };
  }

  try {
    console.log('🚀 Creating Cashfree payment session with database integration...');
    console.log('Request body:', event.body);

    // Parse and validate request data
    const requestData = JSON.parse(event.body);
    const validationResult = validateRequestData(requestData);
    
    if (!validationResult.isValid) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: validationResult.error
        })
      };
    }

    // Check if we have Cashfree credentials
    if (!CASHFREE_CONFIG.app_id || !CASHFREE_CONFIG.secret_key) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Cashfree credentials not configured. Please set CASHFREE_APP_ID and CASHFREE_SECRET_KEY environment variables.'
        })
      };
    }

    // Verify admin configuration in database
    const adminVerification = await verifyAdminConfig(requestData.form_admin_id);
    if (!adminVerification.success) {
      console.warn('⚠️ Admin verification failed, but continuing with payment:', adminVerification.error);
      // Continue anyway - don't block payments due to DB issues
    }

    // Generate unique order ID
    const orderId = generateOrderId();
    const totalAmount = parseFloat(requestData.product_price);
    
    console.log('Generated order ID:', orderId);
    console.log('Total amount:', totalAmount);

    // Calculate commission split
    const commissionSplit = calculateCommissionSplit(totalAmount);
    console.log('Commission split:', commissionSplit);

    // Create Cashfree order
    const cashfreeResult = await createCashfreeOrder({
      order_id: orderId,
      order_amount: totalAmount,
      customer_details: {
        email: requestData.customer_email,
        name: requestData.customer_name || 'Customer',
        phone: requestData.customer_phone || '9999999999'
      },
      product_name: requestData.product_name,
      return_url: buildReturnUrl(orderId, totalAmount),
      notify_url: buildNotifyUrl(),
      commission_split: commissionSplit
    });

    if (!cashfreeResult.success) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          error: cashfreeResult.error
        })
      };
    }

    // Log transaction to database
    const dbResult = await logTransactionToDatabase({
      form_id: requestData.form_id,
      customer_email: requestData.customer_email,
      customer_name: requestData.customer_name || 'Customer',
      product_name: requestData.product_name,
      total_amount: totalAmount,
      order_id: orderId,
      cashfree_order_id: cashfreeResult.data.cf_order_id,
      form_admin_id: requestData.form_admin_id,
      commission_split: commissionSplit,
      metadata: {
        source: 'google_forms',
        timestamp: new Date().toISOString(),
        user_agent: event.headers['user-agent'],
        request_data: requestData
      }
    });

    if (!dbResult.success) {
      console.error('⚠️ Database logging failed:', dbResult.error);
      // Continue anyway - payment should not fail due to DB logging issues
    } else {
      console.log('✅ Transaction logged to database:', dbResult.data.id);
    }

    // Build payment URL
    const paymentUrl = `${CASHFREE_CONFIG.base_url}/checkout/pay/${cashfreeResult.data.payment_session_id}`;
    
    console.log('✅ Payment session created successfully');
    console.log('Payment URL:', paymentUrl);

    // Return success response
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        payment_url: paymentUrl,
        order_id: orderId,
        cf_order_id: cashfreeResult.data.cf_order_id,
        amount: totalAmount,
        commission_split: commissionSplit,
        database_logged: dbResult.success,
        transaction_id: dbResult.success ? dbResult.data.id : null,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      })
    };

  } catch (error) {
    console.error('❌ Function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Internal server error',
        message: error.message,
        timestamp: new Date().toISOString()
      })
    };
  }
};

/**
 * Validate incoming request data
 */
function validateRequestData(data) {
  const requiredFields = [
    'customer_email',
    'product_name', 
    'product_price',
    'form_id',
    'form_admin_id'
  ];

  // Check required fields
  for (const field of requiredFields) {
    if (!data[field]) {
      return {
        isValid: false,
        error: `Missing required field: ${field}`
      };
    }
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(data.customer_email)) {
    return {
      isValid: false,
      error: 'Invalid email address format'
    };
  }

  // Validate price
  const price = parseFloat(data.product_price);
  if (isNaN(price) || price <= 0) {
    return {
      isValid: false,
      error: 'Invalid product price. Must be a positive number.'
    };
  }

  if (price < 10) {
    return {
      isValid: false,
      error: 'Minimum payment amount is ₹10'
    };
  }

  if (price > 100000) {
    return {
      isValid: false,
      error: 'Maximum payment amount is ₹1,00,000'
    };
  }

  return { isValid: true };
}

/**
 * Verify admin configuration (soft check - doesn't block payment)
 */
async function verifyAdminConfig(adminId) {
  try {
    console.log('🔍 Verifying admin config for:', adminId);

    // Check if admin exists
    const { data: adminData, error: adminError } = await supabase
      .from('form_admins')
      .select('*')
      .eq('id', adminId)
      .single();

    if (adminError || !adminData) {
      console.log('ℹ️ Admin not found in database, but payment can proceed');
      return {
        success: false,
        error: 'Admin not found in database'
      };
    }

    // Check provider config
    const { data: configData, error: configError } = await supabase
      .from('provider_configs')
      .select('*')
      .eq('admin_id', adminId)
      .eq('provider_name', 'cashfree');

    if (configError || !configData || configData.length === 0) {
      console.log('ℹ️ Provider config not found, but payment can proceed');
      return {
        success: false,
        error: 'Provider config not found'
      };
    }

    console.log('✅ Admin verification successful');
    return {
      success: true,
      data: {
        admin: adminData,
        config: configData[0]
      }
    };

  } catch (error) {
    console.error('Error verifying admin config:', error);
    return {
      success: false,
      error: 'Database error during verification'
    };
  }
}

/**
 * Log transaction to database
 */
async function logTransactionToDatabase(transactionData) {
  try {
    console.log('💾 Logging transaction to database...');

    const { data, error } = await supabase
      .from('transactions')
      .insert([{
        form_id: transactionData.form_id,
        email: transactionData.customer_email,
        customer_name: transactionData.customer_name,
        product_name: transactionData.product_name,
        payment_amount: transactionData.total_amount,
        payment_currency: 'INR',
        payment_status: 'pending',
        payment_provider: 'cashfree',
        transaction_id: transactionData.order_id,
        cashfree_order_id: transactionData.cashfree_order_id,
        admin_id: transactionData.form_admin_id,
        gateway_fee: transactionData.commission_split.gatewayFee,
        platform_commission: transactionData.commission_split.platformCommission,
        net_amount_to_admin: transactionData.commission_split.formAdminAmount,
        metadata: transactionData.metadata,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) {
      console.error('Database insert error:', error);
      return {
        success: false,
        error: error.message
      };
    }

    console.log('✅ Transaction logged successfully:', data.id);
    return {
      success: true,
      data: data
    };

  } catch (error) {
    console.error('Error logging transaction:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Generate unique order ID
 */
function generateOrderId() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 8);
  return `PF_${timestamp}_${random}`;
}

/**
 * Calculate commission split
 */
function calculateCommissionSplit(totalAmount) {
  const gatewayFee = (totalAmount * COMMISSION_CONFIG.gateway_rate / 100) + COMMISSION_CONFIG.fixed_fee;
  const platformCommission = totalAmount * COMMISSION_CONFIG.platform_rate / 100;
  const formAdminAmount = totalAmount - gatewayFee - platformCommission;
  
  return {
    totalAmount: Number(totalAmount.toFixed(2)),
    gatewayFee: Number(gatewayFee.toFixed(2)),
    platformCommission: Number(platformCommission.toFixed(2)),
    formAdminAmount: Number(formAdminAmount.toFixed(2)),
    platformRate: COMMISSION_CONFIG.platform_rate,
    gatewayRate: COMMISSION_CONFIG.gateway_rate
  };
}

/**
 * Create Cashfree order
 */
async function createCashfreeOrder(orderData) {
  try {
    console.log('💳 Creating Cashfree order...');

    const cashfreePayload = {
      order_id: orderData.order_id,
      order_amount: orderData.order_amount,
      order_currency: 'INR',
      customer_details: {
        customer_id: orderData.customer_details.email.replace(/[@.]/g, '_'),
        customer_name: orderData.customer_details.name,
        customer_email: orderData.customer_details.email,
        customer_phone: orderData.customer_details.phone
      },
      order_meta: {
        return_url: orderData.return_url,
        notify_url: orderData.notify_url,
        payment_methods: 'cc,dc,nb,upi,app'
      },
      order_note: `Payment for ${orderData.product_name}`,
      order_tags: {
        source: 'payform',
        product: orderData.product_name,
        form_admin_id: 'f807a8c3-316b-4df0-90e7-5f7796c86f71'
      }
    };

    console.log('Cashfree payload:', JSON.stringify(cashfreePayload, null, 2));

    const response = await fetch(`${CASHFREE_CONFIG.base_url}/pg/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-version': CASHFREE_CONFIG.api_version,
        'x-client-id': CASHFREE_CONFIG.app_id,
        'x-client-secret': CASHFREE_CONFIG.secret_key
      },
      body: JSON.stringify(cashfreePayload)
    });

    const responseText = await response.text();
    console.log('Cashfree API response status:', response.status);
    console.log('Cashfree API response:', responseText);

    if (!response.ok) {
      return {
        success: false,
        error: `Cashfree API error (${response.status}): ${responseText}`
      };
    }

    const responseData = JSON.parse(responseText);

    if (responseData.cf_order_id && responseData.payment_session_id) {
      return {
        success: true,
        data: responseData
      };
    } else {
      return {
        success: false,
        error: 'Invalid response from Cashfree API'
      };
    }

  } catch (error) {
    console.error('Error creating Cashfree order:', error);
    return {
      success: false,
      error: `Network error: ${error.message}`
    };
  }
}

/**
 * Build return URL for payment completion
 */
function buildReturnUrl(orderId, amount) {
  const baseUrl = process.env.URL || 'https://payform2025.netlify.app';
  return `${baseUrl}/payment-success.html?order_id=${orderId}&amount=${amount}`;
}

/**
 * Build notify URL for webhooks
 */
function buildNotifyUrl() {
  const baseUrl = process.env.URL || 'https://payform2025.netlify.app';
  return `${baseUrl}/.netlify/functions/cashfree-webhook`;
}
