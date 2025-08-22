// netlify/functions/create-razorpay-order.js - FIXED VERSION
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
    console.log('🚀 Creating Razorpay payment order');
    console.log('📥 Request body:', event.body);
    
    const requestData = JSON.parse(event.body);
    let { 
      form_id, 
      email,           // Could be undefined
      customer_email,  // Alternative field name
      customer_name,
      product_name, 
      product_price, 
      form_admin_id,
      admin_id
    } = requestData;

    console.log('📥 Request received:', {
      form_id,
      email: email || customer_email,
      product_name,
      product_price,
      form_admin_id: form_admin_id || 'NOT PROVIDED'
    });

    // 🔧 FIX 1: Normalize email field
    const customerEmail = email || customer_email;
    
    // 🔧 FIX 2: Extract proper price from product name if price is wrong
    let actualPrice = product_price;
    if (product_name && (product_price === 1 || product_price < 10)) {
      console.log('⚠️ Detected wrong price, extracting from product name...');
      const priceMatch = product_name.match(/₹(\d+)/);
      if (priceMatch) {
        actualPrice = parseInt(priceMatch[1]);
        console.log(`🔧 Corrected price: ${product_price} → ${actualPrice}`);
      }
    }

    // 🔧 FIX 3: Generate default email if missing (for testing)
    let finalEmail = customerEmail;
    if (!finalEmail) {
      finalEmail = `test-${Date.now()}@payform.test`;
      console.log(`⚠️ No email provided, using test email: ${finalEmail}`);
    }

    // 🔧 FIX 4: Generate default customer name if missing
    const finalCustomerName = customer_name || finalEmail.split('@')[0] || 'Customer';

    console.log('🔧 Final processed data:', {
      email: finalEmail,
      customerName: finalCustomerName,
      productName: product_name,
      actualPrice: actualPrice
    });

    // Environment variables validation
    const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
    const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          success: false,
          error: 'Server configuration error - missing environment variables' 
        })
      };
    }

    // Create Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 🔍 Resolve admin ID
    let resolvedAdminId = admin_id || form_admin_id;
    
    console.log('🔍 Resolving admin ID...', {
      received_admin_id: resolvedAdminId || 'NONE',
      form_id: form_id
    });

    if (!resolvedAdminId && form_id) {
      // Try to find admin ID from form_configs
      const { data: formConfig, error: configError } = await supabase
        .from('form_configs')
        .select('admin_id, form_name')
        .eq('form_id', form_id)
        .single();

      if (formConfig) {
        resolvedAdminId = formConfig.admin_id;
        console.log('✅ Found admin ID in form_configs:', {
          admin_id: resolvedAdminId,
          form_name: formConfig.form_name
        });
      } else {
        console.log('❌ No form config found for form_id:', form_id);
      }
    }

    if (!resolvedAdminId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          success: false,
          error: 'Admin ID not found. Please ensure form is registered.',
          form_id: form_id
        })
      };
    }

    // Generate unique order ID
    const orderId = `payform_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Calculate commission breakdown
    const totalAmount = parseFloat(actualPrice);
    const gatewayFee = (totalAmount * 2.0 / 100) + 2; // Razorpay: 2% + ₹2
    const platformCommission = totalAmount * 3 / 100;
    const netAmountToAdmin = totalAmount - gatewayFee - platformCommission;

    console.log('💳 Creating Razorpay order...');

    // Create Razorpay order
    const razorpayPayload = {
      amount: totalAmount * 100, // Convert to paise
      currency: 'INR',
      receipt: orderId,
      notes: {
        form_id: form_id,
        admin_id: resolvedAdminId,
        product_name: product_name,
        customer_email: finalEmail
      }
    };

    console.log('💳 Razorpay payload:', razorpayPayload);

    // Call Razorpay API
    const razorpayResponse = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64')}`
      },
      body: JSON.stringify(razorpayPayload)
    });

    const razorpayResult = await razorpayResponse.json();
    console.log('💳 Razorpay response:', { 
      status: razorpayResponse.status, 
      ok: razorpayResponse.ok,
      order_id: razorpayResult.id
    });

    if (!razorpayResponse.ok) {
      console.error('❌ Razorpay API error:', razorpayResult);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          success: false,
          error: 'Failed to create Razorpay order',
          details: razorpayResult 
        })
      };
    }

    console.log('✅ Order created:', razorpayResult.id);

    // 🔧 FIX 5: Generate proper payment URL
    // Razorpay doesn't provide direct payment links like Cashfree
    // We need to create a checkout URL that redirects to Razorpay
    const checkoutUrl = `${process.env.URL}/.netlify/functions/payment-page?order_id=${razorpayResult.id}&amount=${totalAmount}&email=${encodeURIComponent(finalEmail)}&product=${encodeURIComponent(product_name)}`;

    console.log('🔗 Generated checkout URL:', checkoutUrl);

    // Save transaction to database
    console.log('💾 Logging transaction with admin ID:', resolvedAdminId);

    const transactionData = {
      form_id: form_id,
      email: finalEmail,
      customer_name: finalCustomerName,
      product_name: product_name,
      payment_amount: totalAmount,
      payment_currency: 'INR',
      payment_status: 'pending',
      payment_provider: 'razorpay',
      transaction_id: orderId,
      razorpay_order_id: razorpayResult.id,
      gateway_fee: Number(gatewayFee.toFixed(2)),
      platform_commission: Number(platformCommission.toFixed(2)),
      net_amount_to_admin: Number(netAmountToAdmin.toFixed(2)),
      admin_id: resolvedAdminId,
      gateway_used: 'razorpay',
      auto_split_enabled: true,
      created_at: new Date().toISOString()
    };

    console.log('💾 Transaction data summary:', {
      transaction_id: orderId,
      admin_id: resolvedAdminId,
      amount: totalAmount,
      form_id: form_id,
      net_amount_to_admin: netAmountToAdmin
    });

    const { data: transactionResult, error: dbError } = await supabase
      .from('transactions')
      .insert([transactionData])
      .select()
      .single();

    if (dbError) {
      console.error('❌ Database insert error:', dbError);
      // Continue anyway, order is created
    } else {
      console.log('✅ Transaction logged successfully:', { 
        id: transactionResult.id, 
        admin_id: transactionResult.admin_id 
      });
    }

    // Log platform commission
    const { error: commissionError } = await supabase
      .from('platform_commissions')
      .insert({
        transaction_id: transactionResult?.id,
        form_admin_id: resolvedAdminId,
        commission_amount: platformCommission,
        commission_rate: 3.0,
        platform_fee: platformCommission,
        gateway_fee: gatewayFee,
        status: 'pending',
        created_at: new Date().toISOString()
      });

    if (commissionError) {
      console.error('❌ Commission logging error:', commissionError);
    } else {
      console.log('✅ Commission logged successfully');
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        gateway: 'razorpay',
        checkout_url: checkoutUrl,
        order_id: razorpayResult.id,
        amount: totalAmount,
        customer_email: finalEmail,
        commission_breakdown: {
          total_amount: totalAmount,
          gateway_fee: gatewayFee,
          platform_commission: platformCommission,
          form_admin_receives: netAmountToAdmin
        }
      })
    };

  } catch (error) {
    console.error('❌ Payment creation error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        success: false,
        error: 'Internal server error',
        message: error.message 
      })
    };
  }
};
