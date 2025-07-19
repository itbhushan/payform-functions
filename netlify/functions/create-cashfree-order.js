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
    const { form_id, email, product_name, product_price, customer_name = "Customer", customer_phone = "9999999999" } = JSON.parse(event.body || '{}');

    const CASHFREE_APP_ID = process.env.CASHFREE_APP_ID;
    const CASHFREE_SECRET_KEY = process.env.CASHFREE_SECRET_KEY;

    const orderId = `payform_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Step 1: Create Order (this works)
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

    const cashfreeOrder = await orderResponse.json();
    console.log('✅ Order created:', cashfreeOrder.cf_order_id);

    // Step 2: Create Payment Session (NEW APPROACH)
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

    if (sessionResponse.ok) {
      const sessionResult = await sessionResponse.json();
      console.log('✅ Payment session created:', sessionResult);
      
      // Use the session result for checkout
      const checkoutUrl = sessionResult.payment_link || sessionResult.data?.payment_link || `https://payments.cashfree.com/pay/${cashfreeOrder.payment_session_id.replace(/paymentpayment$/, '')}`;
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          order_id: orderId,
          cf_order_id: cashfreeOrder.cf_order_id,
          checkout_url: checkoutUrl
        })
      };
    }

    // Fallback: Use Payment Links API
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
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          order_id: orderId,
          cf_order_id: cashfreeOrder.cf_order_id,
          checkout_url: linkResult.link_url
        })
      };
    }

    // Final fallback
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        order_id: orderId,
        cf_order_id: cashfreeOrder.cf_order_id,
        checkout_url: `https://payments.cashfree.com/forms/${cashfreeOrder.payment_session_id.replace(/paymentpayment$/, '')}`
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
