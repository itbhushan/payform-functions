// netlify/functions/create-razorpay-order.js
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    console.log('Creating Razorpay order with splits...');
    
    const requestBody = JSON.parse(event.body);
    const { form_id, email, product_name, product_price } = requestBody;

    // Validate required fields
    if (!form_id || !email || !product_name || !product_price) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Missing required fields: form_id, email, product_name, product_price'
        })
      };
    }

    // Environment variables
    const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
    const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      throw new Error('Razorpay credentials not configured');
    }

    // Initialize Supabase
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get Form configuration
    const { data: formConfig } = await supabase
      .from('form_configs')
      .select('*, form_admins(*)')
      .eq('form_id', form_id)
      .single();

    if (!formConfig) {
      throw new Error('Form configuration not found');
    }

    const formAdmin = formConfig.form_admins;
    const totalAmount = parseFloat(product_price);
    const amountInPaise = Math.round(totalAmount * 100);

    // Check if Form Admin has Razorpay linked account
    const { data: linkedAccount } = await supabase
      .from('razorpay_linked_accounts')
      .select('*')
      .eq('form_admin_id', formAdmin.id)
      .eq('account_status', 'activated')
      .single();

    if (!linkedAccount) {
      throw new Error('Form Admin does not have an activated Razorpay account');
    }

    // Calculate commission split
    const platformCommissionRate = 3.0; // 3%
    const platformCommission = Math.round(totalAmount * platformCommissionRate / 100 * 100); // in paise
    const formAdminAmount = amountInPaise - platformCommission;

    console.log('Split calculation:', {
      totalAmount: amountInPaise,
      platformCommission,
      formAdminAmount,
      formAdminAccountId: linkedAccount.razorpay_account_id
    });

    // Create order ID
    const orderId = `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Razorpay order payload with transfers
    const orderPayload = {
      amount: amountInPaise,
      currency: 'INR',
      receipt: orderId,
      transfers: [
        {
          account: linkedAccount.razorpay_account_id,
          amount: formAdminAmount,
          currency: 'INR',
          on_hold: false // Instant transfer
        }
      ],
      notes: {
        form_id: form_id,
        email: email,
        product_name: product_name,
        form_admin_id: formAdmin.id,
        platform_commission: platformCommission,
        form_admin_amount: formAdminAmount
      }
    };

    console.log('Creating Razorpay order with payload:', JSON.stringify(orderPayload));

    // Create order with Razorpay
    const razorpayResponse = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(orderPayload)
    });

    const razorpayOrder = await razorpayResponse.json();
    console.log('Razorpay order response:', razorpayOrder);

    if (!razorpayResponse.ok) {
      throw new Error(`Razorpay API error: ${JSON.stringify(razorpayOrder)}`);
    }

    // Log transaction in database
    const { data: transaction, error: transactionError } = await supabase
      .from('transactions')
      .insert({
        form_id: form_id,
        email: email,
        customer_name: email.split('@')[0], // Extract name from email
        product_name: product_name,
        payment_amount: totalAmount,
        payment_currency: 'INR',
        payment_status: 'pending',
        payment_provider: 'razorpay',
        transaction_id: razorpayOrder.id,
        razorpay_order_id: razorpayOrder.id,
        gateway_used: 'razorpay',
        auto_split_enabled: true,
        split_details: {
          platform_commission: platformCommission / 100, // store in rupees
          form_admin_amount: formAdminAmount / 100,
          form_admin_account_id: linkedAccount.razorpay_account_id
        },
        admin_id: formAdmin.id,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (transactionError) {
      console.error('Transaction logging error:', transactionError);
      throw new Error(`Transaction logging failed: ${transactionError.message}`);
    }

    // Log split payment details
    await supabase
      .from('split_payment_logs')
      .insert({
        transaction_id: transaction.id,
        razorpay_order_id: razorpayOrder.id,
        total_amount: totalAmount,
        platform_commission: platformCommission / 100,
        gateway_fee: 0, // Razorpay handles this separately
        form_admin_amount: formAdminAmount / 100,
        form_admin_id: formAdmin.id,
        platform_account_id: 'PLATFORM_MAIN', // Our platform account
        form_admin_account_id: linkedAccount.razorpay_account_id,
        split_status: 'pending',
        razorpay_response: razorpayOrder
      });

    console.log('Transaction logged with ID:', transaction.id);

    // Create payment URL
    const paymentUrl = `https://checkout.razorpay.com/v1/checkout.js?order_id=${razorpayOrder.id}&key_id=${RAZORPAY_KEY_ID}`;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        order_id: razorpayOrder.id,
        payment_url: paymentUrl,
        amount: totalAmount,
        currency: 'INR',
        key_id: RAZORPAY_KEY_ID,
        split_details: {
          platform_commission: platformCommission / 100,
          form_admin_amount: formAdminAmount / 100
        },
        message: 'Order created with automatic splits'
      })
    };

  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message
      })
    };
  }
};
