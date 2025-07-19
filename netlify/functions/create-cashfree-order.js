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
    
    const { form_id, email, product_name, product_price, customer_name = "Customer", customer_phone = "9999999999" } = JSON.parse(event.body || '{}');

    const CASHFREE_APP_ID = process.env.CASHFREE_APP_ID;
    const CASHFREE_SECRET_KEY = process.env.CASHFREE_SECRET_KEY;

    const orderId = `payform_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

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

    const response = await fetch('https://sandbox.cashfree.com/pg/orders', {
      method: 'POST',
      headers: {
        'x-client-id': CASHFREE_APP_ID,
        'x-client-secret': CASHFREE_SECRET_KEY,
        'x-api-version': '2023-08-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(orderData)
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ success: false, error: errorText })
      };
    }

    const cashfreeOrder = await response.json();
    console.log('✅ Order created:', cashfreeOrder.cf_order_id);

    // Use the WORKING checkout URL format
    const checkoutUrl = `https://sandbox.cashfree.com/pg/view/order/${cashfreeOrder.cf_order_id}`;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        order_id: orderId,
        cf_order_id: cashfreeOrder.cf_order_id,
        checkout_url: checkoutUrl,
        payment_session_id: cashfreeOrder.payment_session_id
      })
    };

  } catch (error) {
    console.error('❌ Function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: error.message })
    };
  }
};
