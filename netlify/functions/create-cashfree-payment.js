const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const { form_id, email, amount, product_name } = JSON.parse(event.body);

    // Environment variables
    const CASHFREE_APP_ID = process.env.CASHFREE_APP_ID;
    const CASHFREE_SECRET_KEY = process.env.CASHFREE_SECRET_KEY;
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // Calculate commission (3% platform + 2.5% gateway fee)
    const platformCommission = amount * 0.03;
    const gatewayFee = amount * 0.025;
    const adminAmount = amount - platformCommission - gatewayFee;

    // Create order ID
    const orderId = `ORDER_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Cashfree API call
    const cashfreeResponse = await fetch('https://sandbox.cashfree.com/pg/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-id': CASHFREE_APP_ID,
        'x-client-secret': CASHFREE_SECRET_KEY,
        'x-api-version': '2023-08-01'
      },
      body: JSON.stringify({
        order_id: orderId,
        order_amount: amount,
        order_currency: 'INR',
        customer_details: {
          customer_id: email.replace('@', '_').replace('.', '_'),
          customer_email: email,
          customer_name: email.split('@')[0]
        },
        order_meta: {
          return_url: `${event.headers.origin}/.netlify/functions/verify-cashfree-payment?order_id=${orderId}&form_id=${form_id}&email=${email}`,
          notify_url: `${event.headers.origin}/.netlify/functions/cashfree-webhook`
        }
      })
    });

    const cashfreeData = await cashfreeResponse.json();

    if (!cashfreeResponse.ok) {
      throw new Error(`Cashfree API Error: ${JSON.stringify(cashfreeData)}`);
    }

    // Log to Supabase
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    await supabase.from('transactions').insert({
      form_id,
      email,
      product_name,
      payment_amount: amount,
      payment_currency: 'INR',
      payment_status: 'pending',
      payment_provider: 'cashfree',
      transaction_id: orderId,
      cashfree_order_id: cashfreeData.cf_order_id,
      gateway_fee: gatewayFee,
      platform_commission: platformCommission,
      net_amount_to_admin: adminAmount
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        payment_session_id: cashfreeData.payment_session_id,
        order_id: orderId,
        cf_order_id: cashfreeData.cf_order_id
      })
    };

  } catch (error) {
    console.error('Payment creation error:', error);
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
