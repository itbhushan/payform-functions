// Fixed netlify/functions/create-cashfree-payment.js with correct URL format
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
  console.log('🚀 Function started');

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    let requestData;
    try {
      requestData = JSON.parse(event.body);
      console.log('📥 Request data:', JSON.stringify(requestData, null, 2));
    } catch (e) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid JSON in request body' })
      };
    }

    const { form_id, email, product_name, product_price, form_admin_id } = requestData;
    const customer_name = requestData.customer_name || email?.split('@')[0] || 'Customer';

    // Validate required fields
    if (!form_id || !email || !product_name || !product_price) {
      console.log('❌ Missing required fields');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'Missing required fields',
          required: ['form_id', 'email', 'product_name', 'product_price']
        })
      };
    }

    // Environment variables
    const CASHFREE_APP_ID = process.env.CASHFREE_APP_ID;
    const CASHFREE_SECRET_KEY = process.env.CASHFREE_SECRET_KEY;
    const CASHFREE_ENVIRONMENT = process.env.CASHFREE_ENVIRONMENT || 'sandbox';
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const SITE_URL = process.env.URL || 'https://payform2025.netlify.app';

    console.log('🔐 Environment check:');
    console.log('- CASHFREE_APP_ID:', CASHFREE_APP_ID ? '✅ Set' : '❌ Missing');
    console.log('- CASHFREE_SECRET_KEY:', CASHFREE_SECRET_KEY ? '✅ Set' : '❌ Missing');
    console.log('- CASHFREE_ENVIRONMENT:', CASHFREE_ENVIRONMENT);

    if (!CASHFREE_APP_ID || !CASHFREE_SECRET_KEY) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Server configuration error - Missing Cashfree credentials' })
      };
    }

    // Generate unique order ID
    const orderId = `payform_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log('🆔 Generated order ID:', orderId);

    // Commission calculation
    const totalAmount = parseFloat(product_price);
    const gatewayFee = (totalAmount * 2.5 / 100) + 3;
    const platformCommission = totalAmount * 3 / 100;
    const formAdminAmount = totalAmount - gatewayFee - platformCommission;

    console.log('💰 Commission breakdown:');
    console.log('- Total amount:', totalAmount);
    console.log('- Gateway fee:', gatewayFee.toFixed(2));
    console.log('- Platform commission:', platformCommission.toFixed(2));
    console.log('- Form admin amount:', formAdminAmount.toFixed(2));

    // Cashfree API endpoint
    const cashfreeBaseUrl = CASHFREE_ENVIRONMENT === 'production' 
      ? 'https://api.cashfree.com/pg' 
      : 'https://sandbox.cashfree.com/pg';
    
    const cashfreeUrl = `${cashfreeBaseUrl}/orders`;
    console.log('🌐 Cashfree API URL:', cashfreeUrl);

    // Prepare Cashfree payment request
    const cashfreePayload = {
      order_id: orderId,
      order_amount: totalAmount,
      order_currency: 'INR',
      customer_details: {
        customer_id: email.replace('@', '_at_').replace(/\./g, '_dot_'),
        customer_name: customer_name,
        customer_email: email,
        customer_phone: '9999999999'
      },
      order_meta: {
        return_url: `${SITE_URL}/payment-success.html?order_id=${orderId}&email=${encodeURIComponent(email)}&product=${encodeURIComponent(product_name)}&amount=${totalAmount}`,
        notify_url: `${SITE_URL}/.netlify/functions/verify-cashfree-payment`
      },
      order_note: `Payment for ${product_name}`
    };

    console.log('📤 Cashfree payload:', JSON.stringify(cashfreePayload, null, 2));

    // Call Cashfree API
    console.log('📡 Making request to Cashfree...');
    const cashfreeResponse = await fetch(cashfreeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-version': '2023-08-01',
        'x-client-id': CASHFREE_APP_ID,
        'x-client-secret': CASHFREE_SECRET_KEY
      },
      body: JSON.stringify(cashfreePayload)
    });

    console.log('📡 Cashfree response status:', cashfreeResponse.status);
    
    const cashfreeData = await cashfreeResponse.text();
    console.log('📄 Cashfree raw response:', cashfreeData);

    let cashfreeResult;
    try {
      cashfreeResult = JSON.parse(cashfreeData);
      console.log('✅ Cashfree parsed response:', JSON.stringify(cashfreeResult, null, 2));
    } catch (e) {
      console.log('❌ Failed to parse Cashfree response as JSON');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: 'Invalid response from payment provider',
          raw_response: cashfreeData.substring(0, 500)
        })
      };
    }

    if (!cashfreeResponse.ok) {
      console.log('❌ Cashfree API error:', cashfreeResult);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: 'Payment provider error',
          details: cashfreeResult,
          status: cashfreeResponse.status
        })
      };
    }

    // FIXED: Correct Cashfree URL format based on official documentation
    let paymentUrl = null;
    
    console.log('🔍 Available fields in Cashfree response:', Object.keys(cashfreeResult));
    
    if (cashfreeResult.payment_session_id) {
      // CORRECT format for Cashfree Checkout - use payment_session_id directly
      paymentUrl = `https://payments${CASHFREE_ENVIRONMENT === 'production' ? '' : '-test'}.cashfree.com/order/#${cashfreeResult.payment_session_id}`;
      console.log('🔗 Using Cashfree Checkout URL format:', paymentUrl);
    } else if (cashfreeResult.cf_order_id) {
      // Alternative: Use cf_order_id
      paymentUrl = `https://payments${CASHFREE_ENVIRONMENT === 'production' ? '' : '-test'}.cashfree.com/order/${cashfreeResult.cf_order_id}`;
      console.log('🔗 Using cf_order_id URL format:', paymentUrl);
    }
    
    if (!paymentUrl) {
      console.log('❌ No payment URL could be constructed');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: 'No payment URL generated',
          debug_info: {
            cashfree_response: cashfreeResult,
            available_fields: Object.keys(cashfreeResult)
          }
        })
      };
    }

    console.log('✅ Final payment URL:', paymentUrl);

    // Save transaction to database - FIXED: Remove non-existent column
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      try {
        console.log('💾 Saving to database...');
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        
        const { error: dbError } = await supabase.from('transactions').insert([{
          form_id: form_id,
          email: email,
          customer_name: customer_name,
          product_name: product_name,
          payment_amount: totalAmount,
          payment_currency: 'INR',
          payment_status: 'pending',
          payment_provider: 'cashfree',
          transaction_id: orderId,
          cashfree_order_id: cashfreeResult.cf_order_id || orderId,
          // REMOVED: cashfree_payment_session_id (column doesn't exist)
          gateway_fee: gatewayFee,
          platform_commission: platformCommission,
          net_amount_to_admin: formAdminAmount,
          admin_id: form_admin_id || 'default',
          created_at: new Date().toISOString()
        }]);

        if (dbError) {
          console.log('⚠️ Database save error:', dbError);
        } else {
          console.log('✅ Transaction saved to database');
        }
      } catch (dbError) {
        console.log('⚠️ Database error:', dbError);
      }
    }

    // Return success response
    const response = {
      success: true,
      payment_url: paymentUrl,
      order_id: orderId,
      cf_order_id: cashfreeResult.cf_order_id,
      payment_session_id: cashfreeResult.payment_session_id,
      amount: totalAmount,
      currency: 'INR',
      customer_email: email,
      product_name: product_name,
      commission_breakdown: {
        total_amount: totalAmount,
        gateway_fee: gatewayFee.toFixed(2),
        platform_commission: platformCommission.toFixed(2),
        form_admin_amount: formAdminAmount.toFixed(2)
      }
    };

    console.log('✅ Success response:', JSON.stringify(response, null, 2));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response)
    };

  } catch (error) {
    console.error('🚨 Function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Internal server error',
        message: error.message
      })
    };
  }
};
