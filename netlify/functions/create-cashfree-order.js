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
    console.log('🚀 Starting comprehensive Cashfree test...');
    
    const { form_id, email, product_name, product_price, customer_name = "Customer", customer_phone = "9999999999" } = JSON.parse(event.body || '{}');

    const CASHFREE_APP_ID = process.env.CASHFREE_APP_ID;
    const CASHFREE_SECRET_KEY = process.env.CASHFREE_SECRET_KEY;

    // Test 1: Check credentials format
    console.log('🔍 Credentials check:');
    console.log('- App ID exists:', !!CASHFREE_APP_ID);
    console.log('- App ID starts with CF:', CASHFREE_APP_ID?.startsWith?.('CF'));
    console.log('- Secret exists:', !!CASHFREE_SECRET_KEY);
    console.log('- App ID length:', CASHFREE_APP_ID?.length);

    const orderId = `payform_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Test 2: Try minimal order creation with detailed logging
    const minimalOrderData = {
      order_id: orderId,
      order_amount: parseFloat(product_price),
      order_currency: "INR",
      customer_details: {
        customer_id: email.replace('@', '_').replace('.', '_'),
        customer_name: customer_name,
        customer_email: email,
        customer_phone: customer_phone
      }
    };

    console.log('📝 Minimal order data:', JSON.stringify(minimalOrderData, null, 2));

    // Test 3: Try different API versions
    const apiVersions = ['2023-08-01', '2022-09-01', '2021-05-21'];
    
    for (const version of apiVersions) {
      console.log(`🧪 Testing API version: ${version}`);
      
      try {
        const response = await fetch('https://sandbox.cashfree.com/pg/orders', {
          method: 'POST',
          headers: {
            'x-client-id': CASHFREE_APP_ID,
            'x-client-secret': CASHFREE_SECRET_KEY,
            'x-api-version': version,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(minimalOrderData)
        });

        console.log(`📊 Version ${version} - Status: ${response.status}`);
        const responseText = await response.text();
        console.log(`📊 Version ${version} - Response:`, responseText);

        if (response.ok) {
          const orderData = JSON.parse(responseText);
          console.log('✅ SUCCESS with version:', version);
          
          // Test different checkout URL formats
          const checkoutUrls = [
            `https://sandbox.cashfree.com/pg/checkout?order_id=${orderData.cf_order_id}`,
            `https://payments.cashfree.com/pay/${orderData.payment_session_id}`,
            `https://sandbox.cashfree.com/pg/orders/pay/${orderData.cf_order_id}`,
            `https://test.cashfree.com/billpay/checkout/post/submit/${orderData.payment_session_id}`
          ];

          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              success: true,
              order_id: orderId,
              cf_order_id: orderData.cf_order_id,
              working_api_version: version,
              possible_checkout_urls: checkoutUrls,
              recommended_url: checkoutUrls[0],
              full_order_response: orderData
            })
          };
        }
      } catch (versionError) {
        console.log(`❌ Version ${version} failed:`, versionError.message);
      }
    }

    // If all versions fail, return diagnostic info
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'All API versions failed',
        credentials_check: {
          app_id_exists: !!CASHFREE_APP_ID,
          secret_exists: !!CASHFREE_SECRET_KEY,
          app_id_format: CASHFREE_APP_ID?.substring(0, 3) + '***'
        },
        next_steps: [
          'Check Cashfree dashboard for correct credentials',
          'Verify sandbox environment is enabled',
          'Check API documentation for latest version'
        ]
      })
    };

  } catch (error) {
    console.error('❌ Diagnostic error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        success: false, 
        error: 'Diagnostic failed', 
        details: error.message 
      })
    };
  }
};
