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
    console.log('🚀 Creating Cashfree order...');
    console.log('Request body:', event.body);

    // ✅ FIX 2: Safe JSON parsing
    let requestData;
    try {
      requestData = JSON.parse(event.body || '{}');
    } catch (parseError) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'Invalid JSON' })
      };
    }

    const { form_id, email, product_name, product_price, customer_name = "Customer", customer_phone = "9999999999" } = requestData;

    if (!form_id || !email || !product_name || !product_price) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'Missing required fields' })
      };
    }

    const CASHFREE_APP_ID = process.env.CASHFREE_APP_ID;
    const CASHFREE_SECRET_KEY = process.env.CASHFREE_SECRET_KEY;

    if (!CASHFREE_APP_ID || !CASHFREE_SECRET_KEY) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ success: false, error: 'Cashfree credentials not configured' })
      };
    }

    const orderId = `payform_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const totalAmount = parseFloat(product_price);

    const cashfreeOrderData = {
      order_id: orderId,
      order_amount: totalAmount,
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

    console.log('📝 Cashfree order data:', cashfreeOrderData);

    // ✅ FIX 1: Correct API URL
    const cashfreeResponse = await fetch('https://sandbox.cashfree.com/pg/orders', {
      method: 'POST',
      headers: {
        'x-client-id': CASHFREE_APP_ID,
        'x-client-secret': CASHFREE_SECRET_KEY,
        'x-api-version': '2023-08-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(cashfreeOrderData)
    });

    if (!cashfreeResponse.ok) {
      const errorText = await cashfreeResponse.text();
      console.error('❌ Cashfree API error:', errorText);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ success: false, error: 'Cashfree API error', details: errorText })
      };
    }

    const cashfreeOrder = await cashfreeResponse.json();
    console.log('✅ Cashfree order created:', cashfreeOrder);
    // Log specific fields we need
    console.log('🔍 Available fields:', Object.keys(cashfreeOrder));
    console.log('🔍 cf_order_id:', cashfreeOrder.cf_order_id);
    console.log('🔍 payment_session_id:', cashfreeOrder.payment_session_id);
    console.log('🔍 order_token:', cashfreeOrder.order_token);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        order_id: orderId,
        cf_order_id: cashfreeOrder.cf_order_id,
        checkout_url: `https://payments.cashfree.com/forms/${cashfreeOrder.payment_session_id}`, // ✅ CORRECT FORMAT
        payment_session_id: cashfreeOrder.payment_session_id
      })
    };

  } catch (error) {
    console.error('❌ Function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: 'Internal server error', details: error.message })
    };
  }
};
