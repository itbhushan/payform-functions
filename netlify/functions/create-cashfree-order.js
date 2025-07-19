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
  
  // ✅ ADD DATABASE LOGGING
  await logTransactionToDatabase(orderId, cashfreeOrder, {
    form_id, email, product_name, product_price, customer_name, customer_phone
  });
  
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
    // ✅ ADD DATABASE LOGGING HERE TOO
    await logTransactionToDatabase(orderId, cashfreeOrder, {
      form_id, email, product_name, product_price, customer_name, customer_phone
    });
    
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

// ✅ ADD THIS ENTIRE FUNCTION:
async function logTransactionToDatabase(orderId, cashfreeOrder, orderDetails) {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.log('⚠️ Supabase credentials not configured, skipping database logging');
      return;
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Look up form admin from form_configs table
    let adminId = 'f807a8c3-316b-4df0-90e7-5f7796c86f71'; // fallback for bhuvnagreens@gmail.com
    try {
      const { data: formConfig } = await supabase
        .from('form_configs')
        .select('admin_id')
        .eq('form_id', orderDetails.form_id)
        .single();
      
      if (formConfig?.admin_id) {
        adminId = formConfig.admin_id;
        console.log('✅ Found form admin:', adminId);
      } else {
        console.log('⚠️ Form config not found, using fallback admin ID');
      }
    } catch (formLookupError) {
      console.warn('⚠️ Form lookup failed, using fallback admin ID:', formLookupError.message);
    }

    // Calculate commission split
    const totalAmount = parseFloat(orderDetails.product_price);
    const gatewayFee = (totalAmount * 2.5 / 100) + 3; // Cashfree: 2.5% + ₹3
    const platformCommission = totalAmount * 3 / 100; // Your 3%
    const netAmountToAdmin = totalAmount - gatewayFee - platformCommission;

    // Insert transaction record
    const transactionData = {
      form_id: orderDetails.form_id,
      email: orderDetails.email,
      customer_name: orderDetails.customer_name,
      product_name: orderDetails.product_name,
      payment_amount: totalAmount,
      payment_currency: 'INR',
      payment_status: 'pending',
      payment_provider: 'cashfree',
      transaction_id: orderId,
      cashfree_order_id: cashfreeOrder.cf_order_id,
      gateway_fee: Number(gatewayFee.toFixed(2)),
      platform_commission: Number(platformCommission.toFixed(2)),
      net_amount_to_admin: Number(netAmountToAdmin.toFixed(2)),
      admin_id: adminId, // ✅ Now dynamic
      created_at: new Date().toISOString()
    };

    console.log('💾 Logging transaction to database:', {
      transaction_id: orderId,
      admin_id: adminId,
      amount: totalAmount
    });

    const { error: dbError } = await supabase
      .from('transactions')
      .insert([transactionData]);

    if (dbError) {
      console.error('❌ Database logging error:', dbError);
    } else {
      console.log('✅ Transaction logged to database successfully');
    }

  } catch (error) {
    console.error('❌ Database logging failed:', error);
  }
}
};
