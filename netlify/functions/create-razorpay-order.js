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
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    console.log('🚀 Creating Razorpay payment order');
    
    const requestBody = JSON.parse(event.body || '{}');
    console.log('📥 Request body:', requestBody);

    // Extract and validate data
    let {
      form_id,
      customer_email,
      customer_name,
      product_name,
      product_price,
      admin_id,
      form_admin_id
    } = requestBody;

    // Handle various input formats
    if (!customer_email && requestBody.email) {
      customer_email = requestBody.email;
    }
    
    if (!admin_id && form_admin_id) {
      admin_id = form_admin_id;
    }

    // Extract price from product name if needed
    if (!product_price || product_price <= 1) {
      const priceMatch = product_name?.match(/₹(\d+)/);
      if (priceMatch) {
        product_price = parseInt(priceMatch[1]);
        console.log(`🔍 Extracted price: ₹${product_price} from product: ${product_name}`);
      }
    }

    // Resolve admin_id if missing
    if (!admin_id && form_id) {
      console.log('🔍 Resolving admin ID...');
      const { data: formConfig } = await supabase
        .from('form_configs')
        .select('admin_id')
        .eq('form_id', form_id)
        .single();
      
      if (formConfig) {
        admin_id = formConfig.admin_id;
        console.log(`✅ Admin ID resolved: ${admin_id}`);
      }
    }

    // Validate required fields
    if (!customer_email) {
      throw new Error('Customer email is required');
    }
    if (!product_price || product_price <= 0) {
      throw new Error('Valid product price is required');
    }
    if (!admin_id) {
      throw new Error('Admin ID is required');
    }

    // Set defaults
    customer_name = customer_name || 'Customer';
    product_name = product_name || 'Product';

    console.log('✅ Validated data:', {
      customer_email,
      customer_name,
      product_name,
      product_price,
      admin_id
    });

    // Calculate commission split
    const totalAmount = parseFloat(product_price);
    const gatewayFee = Math.round(((totalAmount * 0.025) + 3) * 100) / 100; // 2.5% + ₹3
    const platformCommission = Math.round((totalAmount * 0.03) * 100) / 100; // 3%
    const adminEarnings = Math.round((totalAmount - gatewayFee - platformCommission) * 100) / 100;

    console.log('💰 Commission breakdown:', {
      totalAmount,
      gatewayFee,
      platformCommission,
      adminEarnings
    });

    // Create Razorpay order
    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(totalAmount * 100), // Amount in paise
      currency: 'INR',
      receipt: `receipt_${Date.now()}`,
      notes: {
        form_id: form_id || 'manual',
        admin_id,
        customer_email,
        product_name
      }
    });

    console.log('✅ Razorpay order created:', razorpayOrder.id);

    // Save transaction to database
    const { data: transaction, error: dbError } = await supabase
      .from('transactions')
      .insert({
        form_id: form_id || 'manual',
        email: customer_email,
        customer_name,
        product_name,
        payment_amount: totalAmount,
        payment_currency: 'INR',
        payment_status: 'pending',
        payment_provider: 'razorpay',
        razorpay_order_id: razorpayOrder.id,
        gateway_fee: gatewayFee,
        platform_commission: platformCommission,
        net_amount_to_admin: adminEarnings,
        admin_id,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (dbError) {
      console.error('❌ Database error:', dbError);
      throw dbError;
    }

    console.log('✅ Transaction saved to database:', transaction.id);

    // Generate payment page URL (this fixes the 404 error)
    const paymentPageUrl = `${process.env.URL}/.netlify/functions/payment-page?` +
      `order_id=${razorpayOrder.id}&` +
      `email=${encodeURIComponent(customer_email)}&` +
      `amount=${totalAmount}&` +
      `product_name=${encodeURIComponent(product_name)}&` +
      `form_id=${form_id || 'manual'}`;

    console.log('🔗 Payment page URL generated:', paymentPageUrl);

    // Return success response
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        order_id: razorpayOrder.id,
        amount: totalAmount,
        currency: 'INR',
        checkout_url: paymentPageUrl, // This fixes the 404 error!
        transaction_id: transaction.id,
        customer_email,
        product_name,
        commission_breakdown: {
          total_amount: totalAmount,
          gateway_fee: gatewayFee,
          platform_commission: platformCommission,
          admin_earnings: adminEarnings
        }
      })
    };

  } catch (error) {
    console.error('❌ Razorpay order creation failed:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message,
        details: error.toString()
      })
    };
  }
};
