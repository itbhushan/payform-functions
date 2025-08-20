// netlify/functions/create-razorpay-order.js - FIXED VERSION
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// CORS headers
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json'
};

exports.handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    console.log('🔄 Razorpay order creation started');
    
    const { 
      form_id, 
      email, 
      product_name, 
      product_price, 
      customer_name,
      customer_phone 
    } = JSON.parse(event.body || '{}');

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

    console.log(`📦 Creating Razorpay order for: ${email}, Product: ${product_name}, Amount: ₹${product_price}`);

    // Get form configuration to find admin_id
    const { data: formConfig, error: configError } = await supabase
      .from('form_configs')
      .select('admin_id')
      .eq('form_id', form_id)
      .single();

    if (configError || !formConfig) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Form configuration not found'
        })
      };
    }

    const admin_id = formConfig.admin_id;
    console.log(`👤 Form admin ID: ${admin_id}`);

    // 🔧 FIXED: Check for provider config but allow basic Razorpay without it
    const { data: providerConfig } = await supabase
      .from('provider_configs')
      .select('*')
      .eq('admin_id', admin_id)
      .eq('provider_name', 'razorpay')
      .single();

    // NEW: Allow basic Razorpay orders even without provider config
    if (!providerConfig && !process.env.RAZORPAY_KEY_ID) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Razorpay credentials not configured in environment'
        })
      };
    }

    // Check if provider config exists and is disabled
    if (providerConfig && !providerConfig.is_enabled) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Razorpay is disabled for this form admin'
        })
      };
    }

    console.log('✅ Razorpay validation passed, creating order...');

    // Create Razorpay order
    const razorpayOrderData = {
      amount: Math.round(product_price * 100), // Convert to paise
      currency: 'INR',
      receipt: `receipt_${Date.now()}`,
      notes: {
        form_id: form_id,
        customer_email: email,
        product_name: product_name,
        admin_id: admin_id
      }
    };

    console.log('📤 Calling Razorpay API...');

    // Call Razorpay API
    const razorpayResponse = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(razorpayOrderData)
    });

    if (!razorpayResponse.ok) {
      const errorText = await razorpayResponse.text();
      console.error('❌ Razorpay API error:', razorpayResponse.status, errorText);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          error: `Razorpay API error: ${errorText}`
        })
      };
    }

    const razorpayOrder = await razorpayResponse.json();
    console.log('✅ Razorpay order created:', razorpayOrder.id);

    // Calculate commission (3% platform fee)
    const platformCommission = Math.round(product_price * 0.03 * 100) / 100;
    const netAmountToAdmin = Math.round((product_price - platformCommission) * 100) / 100;

    // Log transaction to database
    const { error: transactionError } = await supabase
      .from('transactions')
      .insert({
        form_id: form_id,
        email: email,
        customer_name: customer_name || null,
        product_name: product_name,
        payment_amount: product_price,
        payment_currency: 'INR',
        payment_status: 'pending',
        payment_provider: 'razorpay',
        transaction_id: razorpayOrder.id,
        platform_commission: platformCommission,
        net_amount_to_admin: netAmountToAdmin,
        admin_id: admin_id,
        created_at: new Date().toISOString()
      });

    if (transactionError) {
      console.error('❌ Transaction logging error:', transactionError);
      // Continue anyway - payment is more important than logging
    } else {
      console.log('✅ Transaction logged successfully');
    }

    // Generate payment URL
    const paymentUrl = `https://checkout.razorpay.com/v1/checkout.js?key_id=${process.env.RAZORPAY_KEY_ID}&order_id=${razorpayOrder.id}`;

    console.log('🎉 Razorpay order creation completed successfully');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        order_id: razorpayOrder.id,
        amount: product_price,
        currency: 'INR',
        payment_url: paymentUrl,
        checkout_url: `https://razorpay.com/checkout/?order_id=${razorpayOrder.id}`,
        message: 'Razorpay order created successfully'
      })
    };

  } catch (error) {
    console.error('❌ Error creating Razorpay order:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Failed to create Razorpay order',
        details: error.message
      })
    };
  }
};
