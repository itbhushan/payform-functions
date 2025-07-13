// netlify/functions/create-cashfree-payment.js - FIXED VERSION
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    console.log('Creating Cashfree payment session');
    
    const { form_id, email, product_name, product_price } = JSON.parse(event.body);

    if (!form_id || !email || !product_name || !product_price) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing required parameters' })
      };
    }

    // Environment variables
    const CASHFREE_APP_ID = process.env.CASHFREE_APP_ID;
    const CASHFREE_SECRET_KEY = process.env.CASHFREE_SECRET_KEY;
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!CASHFREE_APP_ID || !CASHFREE_SECRET_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Server configuration error' })
      };
    }

    // Create Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get admin_id for this form
    const { data: formAdmin, error: adminError } = await supabase
      .from('form_configs')
      .select('admin_id')
      .eq('form_id', form_id)
      .single();

    if (adminError || !formAdmin) {
      console.error('Form admin not found:', adminError);
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Form configuration not found' })
      };
    }

    const adminId = formAdmin.admin_id;

    // Generate unique order ID
    const orderId = `ORDER_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const customerId = `CUST_${email.replace('@', '_').replace('.', '_')}_${Date.now()}`;

    // Calculate commission breakdown
    const totalAmount = parseFloat(product_price);
    const gatewayFee = (totalAmount * 2.5 / 100) + 3; // 2.5% + ₹3
    const platformCommission = totalAmount * 3 / 100; // 3%
    const netAmountToAdmin = totalAmount - gatewayFee - platformCommission;

    // ✅ FIXED: Proper return URLs for END USERS (not admin dashboard)
    const baseUrl = 'https://payform2025.netlify.app';
    const returnUrl = `${baseUrl}/payment-success.html?order_id=${orderId}&product=${encodeURIComponent(product_name)}&amount=${totalAmount}&email=${encodeURIComponent(email)}`;
    const notifyUrl = `${baseUrl}/.netlify/functions/verify-cashfree-payment`;

    // Create Cashfree payment link
    const cashfreePayload = {
      link_id: orderId,
      link_amount: totalAmount,
      link_currency: 'INR',
      link_purpose: product_name,
      customer_details: {
        customer_name: email.split('@')[0],
        customer_email: email,
        customer_phone: '9999999999' // Optional, can be collected in form
      },
      link_partial_payments: false,
      link_minimum_partial_amount: totalAmount,
      link_expiry_time: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
      link_notes: {
        form_id: form_id,
        admin_id: adminId,
        product_name: product_name,
        customer_email: email
      },
      link_auto_reminders: true,
      link_notify: {
        send_sms: false,
        send_email: true
      },
      link_meta: {
        return_url: returnUrl, // ✅ END USER success page
        notify_url: notifyUrl,
        upi_intent: true
      }
    };

    console.log('Cashfree payload:', JSON.stringify(cashfreePayload, null, 2));

    // Call Cashfree API
    const cashfreeResponse = await fetch('https://sandbox.cashfree.com/pg/links', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'x-api-version': '2023-08-01',
        'x-client-id': CASHFREE_APP_ID,
        'x-client-secret': CASHFREE_SECRET_KEY
      },
      body: JSON.stringify(cashfreePayload)
    });

    const cashfreeResult = await cashfreeResponse.json();
    console.log('Cashfree response:', JSON.stringify(cashfreeResult, null, 2));

    if (!cashfreeResponse.ok) {
      console.error('Cashfree API error:', cashfreeResult);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: 'Failed to create payment link',
          details: cashfreeResult 
        })
      };
    }

    // Save transaction to database with PENDING status
    const transactionData = {
      form_id: form_id,
      email: email,
      customer_name: email.split('@')[0],
      product_name: product_name,
      payment_amount: totalAmount,
      payment_currency: 'INR',
      payment_status: 'pending', // ✅ Will be updated by webhook
      payment_provider: 'cashfree',
      transaction_id: orderId,
      cashfree_order_id: orderId,
      cashfree_link_id: cashfreeResult.link_id,
      gateway_fee: gatewayFee,
      platform_commission: platformCommission,
      net_amount_to_admin: netAmountToAdmin,
      admin_id: adminId,
      created_at: new Date().toISOString()
    };

    const { error: dbError } = await supabase
      .from('transactions')
      .insert([transactionData]);

    if (dbError) {
      console.error('Database insert error:', dbError);
      // Continue anyway, as payment link is already created
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        checkout_url: cashfreeResult.link_url,
        order_id: orderId,
        amount: totalAmount,
        commission_breakdown: {
          total_amount: totalAmount,
          gateway_fee: gatewayFee,
          platform_commission: platformCommission,
          form_admin_receives: netAmountToAdmin
        }
      })
    };

  } catch (error) {
    console.error('Payment creation error:', error);
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
