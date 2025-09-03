// netlify/functions/create-razorpay-order.js - UPDATED WITH FALLBACK HANDLING
const { createClient } = require('@supabase/supabase-js');
const Razorpay = require('razorpay');

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Initialize Razorpay
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
    console.log('🚀 Creating Razorpay order...');
    const requestData = JSON.parse(event.body);
    const { form_id, customer_email, customer_name, product_name, product_price, admin_id } = requestData;

    // Validate input
    if (!form_id || !customer_email || !product_name || !product_price) {
      console.log('❌ Missing required fields');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          success: false,
          error: 'Missing required fields',
          required: ['form_id', 'customer_email', 'product_name', 'product_price']
        })
      };
    }

    console.log(`📝 Order details:`, { form_id, customer_email, product_name, product_price });

    // Get form admin details - SIMPLIFIED QUERY
    const { data: formConfig, error: formError } = await supabase
      .from('form_configs')
      .select(`
        admin_id,
        form_admins!inner(id, email, name)
      `)
      .eq('form_id', form_id)
      .single();

    if (formError || !formConfig) {
      console.log('❌ Form config not found:', formError);
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ 
          success: false,
          error: 'Form configuration not found' 
        })
      };
    }

    // Check if form admin has completed payment setup - SEPARATE QUERY
    const { data: paymentSetup, error: setupError } = await supabase
      .from('sub_account_applications')
      .select('verification_documents, application_status')
      .eq('form_admin_id', formConfig.admin_id)
      .eq('provider_name', 'razorpay_route')
      .eq('application_status', 'approved')
      .single();

    if (setupError || !paymentSetup || !paymentSetup.verification_documents?.linked_account_id) {
      console.log('❌ Payment setup incomplete for admin:', formConfig.admin_id);
      
      // For now, create a basic Razorpay order WITHOUT Route splitting
      console.log('⚠️ Creating basic Razorpay order (no automatic splitting)');
      
      const basicOrder = await razorpay.orders.create({
        amount: product_price * 100, // Convert to paise
        currency: 'INR',
        receipt: `order_${Date.now()}`,
        notes: {
          form_id,
          email: customer_email,
          product_name,
          admin_id: formConfig.admin_id,
          payment_setup_incomplete: 'true'
        }
      });

      // Store transaction in database
      await supabase
        .from('transactions')
        .insert({
          form_id,
          email: customer_email,
          customer_name: customer_name || 'Customer',
          product_name,
          payment_amount: product_price,
          payment_currency: 'INR',
          payment_status: 'created',
          payment_provider: 'razorpay_basic',
          transaction_id: basicOrder.id,
          razorpay_order_id: basicOrder.id,
          admin_id: formConfig.admin_id,
          created_at: new Date().toISOString()
        });

return {
  statusCode: 200,
  headers,
  body: JSON.stringify({
    success: true,
    order_id: basicOrder.id,
    amount: product_price,
    currency: 'INR',
    checkout_url: `https://rzp.io/l/${basicOrder.id}`,
    warning: 'Payment setup incomplete. Using basic payment processing.',
    message: 'Form admin needs to complete Payment Setup for automatic splitting.'
  })
};
    }

    // If we reach here, payment setup is complete - proceed with Route
    console.log('✅ Payment setup complete, using Razorpay Route');
    
    // Continue with the Route logic from the original function...
    // [Rest of the Route implementation would go here]

  } catch (error) {
    console.error('❌ Error creating Razorpay order:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        success: false,
        error: 'Failed to create payment order',
        details: error.message 
      })
    };
  }
};
