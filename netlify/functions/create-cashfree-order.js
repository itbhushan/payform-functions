// netlify/functions/create-cashfree-order.js
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
  // CORS headers
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
    const { form_id, email, product_name, product_price, customer_name } = JSON.parse(event.body);

    // Validate required fields
    if (!form_id || !email || !product_name || !product_price) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing required fields' })
      };
    }

    // Environment variables
    const CASHFREE_APP_ID = process.env.CASHFREE_APP_ID; // Get from Cashfree dashboard
    const CASHFREE_SECRET_KEY = process.env.CASHFREE_SECRET_KEY;
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!CASHFREE_APP_ID || !CASHFREE_SECRET_KEY) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Cashfree credentials not configured' })
      };
    }

    // Generate unique order ID
    const orderId = `payform_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Calculate commission split
    const totalAmount = parseFloat(product_price);
    const gatewayFee = (totalAmount * 0.025) + 3; // Cashfree: 2.5% + ₹3
    const platformCommission = totalAmount * 0.03; // Your 3%
    const formAdminAmount = totalAmount - gatewayFee - platformCommission;

    // Create Cashfree order
    const cashfreeOrderData = {
      order_id: orderId,
      order_amount: totalAmount,
      order_currency: "INR",
      customer_details: {
        customer_id: email.replace('@', '_').replace('.', '_'),
        customer_name: customer_name || "Customer",
        customer_email: email,
        customer_phone: "9999999999" // You might want to collect this
      },
      order_meta: {
        return_url: `${process.env.URL}/.netlify/functions/verify-cashfree-payment?order_id=${orderId}&form_id=${form_id}&email=${email}`,
        notify_url: `${process.env.URL}/.netlify/functions/cashfree-webhook`
      },
      order_note: `Payment for ${product_name} via PayForm`
    };

    console.log('Creating Cashfree order:', cashfreeOrderData);

    // Call Cashfree API
    const cashfreeResponse = await fetch('https://sandbox-api.cashfree.com/pg/orders', {
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
      console.error('Cashfree API error:', cashfreeResponse.status, errorText);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: 'Failed to create Cashfree order',
          details: errorText
        })
      };
    }

    const cashfreeOrder = await cashfreeResponse.json();
    console.log('Cashfree order created:', cashfreeOrder);

    // Save transaction to database
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    
    const transactionData = {
      form_id: form_id,
      email: email,
      customer_name: customer_name || "Customer",
      product_name: product_name,
      payment_amount: totalAmount,
      payment_currency: 'INR',
      payment_status: 'pending',
      payment_provider: 'cashfree',
      transaction_id: orderId,
      cashfree_order_id: cashfreeOrder.cf_order_id,
      cashfree_payment_session_id: cashfreeOrder.payment_session_id,
      gateway_fee: Number(gatewayFee.toFixed(2)),
      platform_commission: Number(platformCommission.toFixed(2)),
      net_amount_to_admin: Number(formAdminAmount.toFixed(2)),
      created_at: new Date().toISOString()
    };

    const { error: dbError } = await supabase
      .from('transactions')
      .insert([transactionData]);

    if (dbError) {
      console.error('Database error:', dbError);
      // Continue anyway - payment creation is more important
    }

    // Return payment session for frontend
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        order_id: orderId,
        cf_order_id: cashfreeOrder.cf_order_id,
        payment_session_id: cashfreeOrder.payment_session_id,
        checkout_url: `https://sandbox.cashfree.com/pg/view/order/${cashfreeOrder.cf_order_id}`,
        order_amount: totalAmount,
        commission_breakdown: {
          total_amount: totalAmount,
          gateway_fee: Number(gatewayFee.toFixed(2)),
          platform_commission: Number(platformCommission.toFixed(2)),
          form_admin_earnings: Number(formAdminAmount.toFixed(2))
        }
      })
    };

  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Internal server error',
        details: error.message
      })
    };
  }
};
