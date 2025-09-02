// netlify/functions/create-razorpay-order.js - UPGRADED FOR RAZORPAY ROUTE
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

// Commission and fee calculation
const calculatePaymentSplit = (amount) => {
  // Razorpay fees: 2% + ₹3 + 18% GST
  const baseRazorpayFee = (amount * 0.02) + 3;
  const razorpayGST = baseRazorpayFee * 0.18;
  const totalRazorpayFee = baseRazorpayFee + razorpayGST;
  
  // Platform commission: 3% of original amount
  const platformCommission = amount * 0.03;
  
  // Form admin receives: Original amount - Razorpay fee - Platform commission
  const formAdminAmount = amount - totalRazorpayFee - platformCommission;
  
  return {
    totalAmount: amount,
    razorpayFee: Number(totalRazorpayFee.toFixed(2)),
    platformCommission: Number(platformCommission.toFixed(2)),
    formAdminAmount: Number(formAdminAmount.toFixed(2))
  };
};

exports.handler = async (event, context) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    console.log('🚀 Creating Razorpay Route order...');
    const requestData = JSON.parse(event.body);
    const { form_id, email, product_name, product_price } = requestData;

    // Validate input
    if (!form_id || !email || !product_name || !product_price) {
      console.log('❌ Missing required fields');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing required fields' })
      };
    }

    console.log(`📝 Order details:`, { form_id, email, product_name, product_price });

    // Get form admin details and linked account
    const { data: formConfig, error: formError } = await supabase
      .from('form_configs')
      .select(`
        admin_id,
        form_admins!inner(id, email, name),
        sub_account_applications!inner(verification_documents)
      `)
      .eq('form_id', form_id)
      .single();

    if (formError || !formConfig) {
      console.log('❌ Form config not found:', formError);
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Form configuration not found' })
      };
    }

    const linkedAccountId = formConfig.sub_account_applications?.verification_documents?.linked_account_id;
    
    if (!linkedAccountId) {
      console.log('❌ Linked account not found for form admin');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Payment setup incomplete. Please complete payment setup first.' })
      };
    }

    console.log(`🔗 Found linked account: ${linkedAccountId}`);

    // Calculate payment splits
    const splits = calculatePaymentSplit(product_price);
    console.log('💰 Payment splits:', splits);

    // Generate unique order ID
    const orderId = `order_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // Create Razorpay order with Route transfers
    const razorpayOrder = {
      amount: product_price * 100, // Convert to paise
      currency: 'INR',
      receipt: orderId,
      notes: {
        form_id,
        email,
        product_name,
        admin_id: formConfig.admin_id
      },
      transfers: [
        {
          account: linkedAccountId,
          amount: splits.formAdminAmount * 100, // Convert to paise
          currency: 'INR',
          notes: {
            purpose: 'Form admin payment for ' + product_name,
            admin_email: formConfig.form_admins.email
          },
          linked_account_notes: [
            'Payment for ' + product_name
          ],
          on_hold: 0 // Transfer immediately after payment capture
        }
      ]
    };

    console.log('📦 Creating Razorpay order with transfers...');
    const order = await razorpay.orders.create(razorpayOrder);
    console.log('✅ Razorpay order created:', order.id);

    // Store transaction in database
    const { error: dbError } = await supabase
      .from('transactions')
      .insert({
        form_id,
        email,
        customer_name: 'Customer', // Will be updated after payment
        product_name,
        payment_amount: product_price,
        payment_currency: 'INR',
        payment_status: 'created',
        payment_provider: 'razorpay_route',
        transaction_id: order.id,
        razorpay_order_id: order.id,
        gateway_fee: splits.razorpayFee,
        platform_commission: splits.platformCommission,
        net_amount_to_admin: splits.formAdminAmount,
        admin_id: formConfig.admin_id,
        created_at: new Date().toISOString()
      });

    if (dbError) {
      console.error('❌ Database insert error:', dbError);
      // Continue anyway - the order was created in Razorpay
    }

    // Store commission tracking
    await supabase
      .from('platform_commissions')
      .insert({
        transaction_id: order.id,
        form_admin_id: formConfig.admin_id,
        commission_amount: splits.platformCommission,
        commission_rate: 3.0,
        platform_fee: splits.platformCommission,
        gateway_fee: splits.razorpayFee,
        net_amount_to_admin: splits.formAdminAmount,
        status: 'pending',
        created_at: new Date().toISOString()
      });

    console.log('💾 Transaction stored in database');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        order_id: order.id,
        amount: product_price,
        currency: 'INR',
        checkout_url: `https://checkout.razorpay.com/v1/checkout.js?key_id=${process.env.RAZORPAY_KEY_ID}&order_id=${order.id}`,
        splits: {
          total_amount: splits.totalAmount,
          razorpay_fee: splits.razorpayFee,
          platform_commission: splits.platformCommission,
          form_admin_amount: splits.formAdminAmount
        },
        notes: {
          form_id,
          email,
          product_name,
          admin_email: formConfig.form_admins.email
        }
      })
    };

  } catch (error) {
    console.error('❌ Error creating Razorpay Route order:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to create payment order',
        details: error.message 
      })
    };
  }
};
