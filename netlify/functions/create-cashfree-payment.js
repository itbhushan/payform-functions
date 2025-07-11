// netlify/functions/create-cashfree-payment.js
// Complete Cashfree payment session creation with commission splitting

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
    console.log('🚀 Creating Cashfree payment session...');
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

    // Generate unique order ID
    const orderId = generateOrderId();
    const totalAmount = parseFloat(requestData.product_price);
    
    console.log('Generated order ID:', orderId);
    console.log('Total amount:', totalAmount);

    // Calculate commission split
    const commissionSplit = calculateCommissionSplit(totalAmount);
    console.log('Commission split:', commissionSplit);

    // Get form admin's Cashfree configuration
    const adminConfig = await getFormAdminConfig(requestData.form_admin_id);
    if (!adminConfig.success) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: adminConfig.error
        })
      };
    }

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
      return_url: buildReturnUrl(orderId),
      notify_url: buildNotifyUrl(),
      commission_split: commissionSplit,
      admin_config: adminConfig.data
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
      ...requestData,
      order_id: orderId,
      cashfree_order_id: cashfreeResult.data.cf_order_id,
      total_amount: totalAmount,
      commission_split: commissionSplit
    });

    if (!dbResult.success) {
      console.error('⚠️ Database logging failed:', dbResult.error);
      // Continue anyway - payment can still proceed
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
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
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
        message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
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
 * Get form admin's Cashfree configuration
 */
async function getFormAdminConfig(adminId) {
  try {
    console.log('🔍 Fetching admin config for:', adminId);

    const { data: adminData, error: adminError } = await supabase
      .from('form_admins')
      .select('*')
      .eq('id', adminId)
      .eq('is_active', true)
      .single();

    if (adminError || !adminData) {
      return {
        success: false,
        error: 'Form admin not found or inactive'
      };
    }

    const { data: configData, error: configError } = await supabase
      .from('provider_configs')
      .select('*')
      .eq('admin_id', adminId)
      .eq('provider_name', 'cashfree')
      .eq('is_enabled', true)
      .single();

    if (configError || !configData) {
      return {
        success: false,
        error: 'Cashfree configuration not found or disabled. Please complete setup first.'
      };
    }

    if (configData.verification_status !== 'verified') {
      return {
        success: false,
        error: 'Cashfree account not verified. Please complete verification process.'
      };
    }

    return {
      success: true,
      data: {
        admin: adminData,
        config: configData
      }
    };

  } catch (error) {
    console.error('Error fetching admin config:', error);
    return {
      success: false,
      error: 'Database error while fetching configuration'
    };
  }
}

/**
 * Create Cashfree order with commission splitting
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
        payment_methods: 'cc,dc,nb,upi,wallet'
      },
      order_note: `Payment for ${orderData.product_name}`,
      order_tags: {
        source: 'payform',
        product: orderData.product_name,
        form_admin_id: orderData.admin_config.admin.id
      }
    };

    // Add order splits for automatic commission (if sub-account is configured)
    if (orderData.admin_config.config.config_data?.sub_account_id) {
      cashfreePayload.order_splits = [
        {
          vendor_id: orderData.admin_config.config.config_data.sub_account_id,
          amount: orderData.commission_split.formAdminAmount
        }
      ];
    }

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
        customer_name: transactionData.customer_name || null,
        product_name: transactionData.product_name,
        payment_amount: transactionData.total_amount,
        payment_currency: transactionData.currency || 'INR',
        payment_status: 'pending',
        payment_provider: 'cashfree',
        transaction_id: transactionData.order_id,
        cashfree_order_id: transactionData.cashfree_order_id,
        admin_id: transactionData.form_admin_id,
        gateway_fee: transactionData.commission_split.gatewayFee,
        platform_commission: transactionData.commission_split.platformCommission,
        net_amount_to_admin: transactionData.commission_split.formAdminAmount,
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
 * Build return URL for payment completion
 */
function buildReturnUrl(orderId) {
  const baseUrl = process.env.URL || 'https://payform-admin.netlify.app';
  return `${baseUrl}/.netlify/functions/verify-cashfree-payment?order_id=${orderId}`;
}

/**
 * Build notify URL for webhooks
 */
function buildNotifyUrl() {
  const baseUrl = process.env.URL || 'https://payform-admin.netlify.app';
  return `${baseUrl}/.netlify/functions/cashfree-webhook`;
}

/**
 * Helper function to format error responses
 */
function formatErrorResponse(statusCode, error, details = null) {
  const response = {
    success: false,
    error: error
  };

  if (details && process.env.NODE_ENV === 'development') {
    response.details = details;
  }

  return {
    statusCode,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(response)
  };
}
