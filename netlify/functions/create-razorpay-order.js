// netlify/functions/create-razorpay-order.js - FIXED VERSION
const { createClient } = require('@supabase/supabase-js');
const Razorpay = require('razorpay');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    console.log('🚀 Creating Razorpay payment link...');
    const requestData = JSON.parse(event.body);
    const { form_id, customer_email, customer_name, product_name, product_price, admin_id } = requestData;

    if (!form_id || !customer_email || !product_name || !product_price) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          success: false,
          error: 'Missing required fields'
        })
      };
    }

    // Get form admin details
    const { data: formConfig, error: formError } = await supabase
      .from('form_configs')
      .select('admin_id, form_admins!inner(id, email, name)')
      .eq('form_id', form_id)
      .single();

    if (formError || !formConfig) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ 
          success: false,
          error: 'Form configuration not found' 
        })
      };
    }

    // Create Payment Link (works better for email)
    const paymentLink = await razorpay.paymentLink.create({
      amount: product_price * 100, // Convert to paise
      currency: 'INR',
      description: product_name,
      customer: {
        name: customer_name || 'Customer',
        email: customer_email
      },
      notify: {
        sms: false,
        email: false // We'll send our own email
      },
      reminder_enable: false,
      callback_url: `${process.env.URL}/.netlify/functions/verify-razorpay-payment`,
      callback_method: 'get',
      notes: {
        form_id,
        admin_id: formConfig.admin_id,
        product_name
      }
    });

    console.log('✅ Payment link created:', paymentLink.id);

    // Generate custom transaction ID with old format
    const { data: lastTransaction } = await supabase
      .from('transactions')
      .select('id')
      .order('id', { ascending: false })
      .limit(1)
      .single();

    const nextId = lastTransaction ? lastTransaction.id + 1 : 9250;

    // Store transaction in database
    await supabase
      .from('transactions')
      .insert({
        id: nextId, // Use sequential ID
        form_id,
        email: customer_email,
        customer_name: customer_name || 'Customer',
        product_name,
        payment_amount: product_price,
        payment_currency: 'INR',
        payment_status: 'pending',
        payment_provider: 'razorpay_link',
        transaction_id: paymentLink.id,
        razorpay_order_id: paymentLink.id,
        admin_id: formConfig.admin_id,
        created_at: new Date().toISOString()
      });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        order_id: paymentLink.id,
        amount: product_price,
        currency: 'INR',
        checkout_url: paymentLink.short_url, // This will work in emails
        message: 'Payment link created successfully'
      })
    };

  } catch (error) {
    console.error('❌ Error creating payment link:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        success: false,
        error: 'Failed to create payment link',
        details: error.message 
      })
    };
  }
};
