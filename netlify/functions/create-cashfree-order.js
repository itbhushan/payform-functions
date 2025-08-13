// netlify/functions/create-cashfree-order.js - ENHANCED VERSION (Fixed Payment Session ID)
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
    console.log('=== ENHANCED CASHFREE ORDER CREATION STARTED ===');
    
    const { form_id, email, product_name, product_price, customer_name } = JSON.parse(event.body);
    
    // Input validation
    if (!form_id || !email || !product_price) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing required parameters' })
      };
    }

    // Initialize Supabase
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    console.log(`📝 Processing order for form: ${form_id}, amount: ₹${product_price}`);

    // Get form admin details and check if split payments are enabled
    const { data: formData, error: formError } = await supabase
      .from('form_configs')
      .select(`
        *,
        form_admins!inner(
          id,
          email,
          name,
          cashfree_vendor_id,
          payout_enabled
        )
      `)
      .eq('form_id', form_id)
      .single();

    if (formError || !formData) {
      console.error('Form not found:', formError);
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Form configuration not found' })
      };
    }

    const formAdmin = formData.form_admins;
    const splitEnabled = formAdmin.payout_enabled && formAdmin.cashfree_vendor_id;
    
    console.log(`👤 Form Admin: ${formAdmin.email}, Split Enabled: ${splitEnabled}`);

    // Calculate commission splits
    const totalAmount = parseFloat(product_price);
    const gatewayFeeRate = 0.025; // 2.5%
    const fixedGatewayFee = 3;
    const platformCommissionRate = 0.03; // 3%

    const gatewayFee = (totalAmount * gatewayFeeRate) + fixedGatewayFee;
    const platformCommission = totalAmount * platformCommissionRate;
    const formAdminAmount = totalAmount - gatewayFee - platformCommission;

    console.log(`💰 Split calculation:
      Total: ₹${totalAmount}
      Gateway Fee: ₹${gatewayFee.toFixed(2)}
      Platform Commission: ₹${platformCommission.toFixed(2)}
      Form Admin: ₹${formAdminAmount.toFixed(2)}`);

    // Generate unique order ID
    const orderId = `PAYFORM_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Prepare Cashfree order payload
    let orderPayload = {
      order_id: orderId,
      order_amount: totalAmount,
      order_currency: 'INR',
      customer_details: {
        customer_id: email.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50),
        customer_email: email,
        customer_name: customer_name || 'Customer',
        customer_phone: '+919999999999' // Temporary - will be enhanced later
      },
      order_meta: {
        return_url: `${process.env.NETLIFY_URL || 'https://payform2025.netlify.app'}/.netlify/functions/verify-cashfree-payment?order_id=${orderId}`,
        notify_url: `${process.env.NETLIFY_URL || 'https://payform2025.netlify.app'}/.netlify/functions/cashfree-webhook`
      }
    };

    // 🆕 ADD SPLIT PAYMENTS IF ENABLED
    if (splitEnabled) {
      console.log('✅ Adding split payments to order');
      orderPayload.order_splits = [
        {
          vendor_id: process.env.CASHFREE_SUPER_ADMIN_VENDOR_ID || 'SUPER_ADMIN',
          amount: Math.round(platformCommission * 100) / 100, // Platform commission
          percentage: null
        },
        {
          vendor_id: formAdmin.cashfree_vendor_id,
          amount: Math.round(formAdminAmount * 100) / 100, // Form admin earnings
          percentage: null
        }
      ];
      console.log('🔄 Split configuration:', JSON.stringify(orderPayload.order_splits));
    } else {
      console.log('⚠️ Split payments disabled - using traditional flow');
    }

    // Create Cashfree order
    console.log('📡 Creating Cashfree order...');
    const response = await fetch('https://sandbox.cashfree.com/pg/orders', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'x-api-version': '2022-09-01',
        'x-client-id': process.env.CASHFREE_APP_ID,
        'x-client-secret': process.env.CASHFREE_SECRET_KEY
      },
      body: JSON.stringify(orderPayload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Cashfree API Error:', response.status, errorText);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Failed to create payment order', details: errorText })
      };
    }

    const cashfreeOrder = await response.json();
    console.log('✅ Cashfree order created:', cashfreeOrder.order_id);

    // 🔍 DEBUG: Log the raw Cashfree response to identify corruption source
    console.log('🔍 RAW payment_session_id from Cashfree:', cashfreeOrder.payment_session_id);
    console.log('🔍 RAW payment_session_id length:', cashfreeOrder.payment_session_id?.length);
    console.log('🔍 RAW payment_session_id ends with:', cashfreeOrder.payment_session_id?.slice(-20));

    // Save transaction to database with enhanced fields
    const transactionData = {
      form_id,
      email,
      customer_name: customer_name || 'Customer',
      product_name: product_name || 'Product',
      product_price: totalAmount,
      payment_amount: totalAmount,
      payment_currency: 'INR',
      payment_provider: 'cashfree',
      payment_status: 'pending',
      cashfree_order_id: cashfreeOrder.order_id,
      cashfree_payment_session_id: cashfreeOrder.payment_session_id,
      admin_id: formAdmin.id,
      gateway_fee: gatewayFee,
      platform_commission: platformCommission,
      net_amount_to_admin: formAdminAmount,
      // 🆕 NEW SPLIT PAYMENT FIELDS
      split_enabled: splitEnabled,
      cashfree_vendor_id: splitEnabled ? formAdmin.cashfree_vendor_id : null,
      split_status: splitEnabled ? 'pending' : 'disabled',
      created_at: new Date().toISOString()
    };

    const { data: transaction, error: dbError } = await supabase
      .from('transactions')
      .insert([transactionData])
      .select()
      .single();

    if (dbError) {
      console.error('❌ Database error:', dbError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Database error', details: dbError.message })
      };
    }

    console.log('✅ Transaction saved with ID:', transaction.id);

    // 🆕 CREATE SPLIT TRANSACTION RECORD IF ENABLED
    if (splitEnabled) {
      const splitData = {
        transaction_id: transaction.id,
        form_admin_id: formAdmin.id,
        total_amount: totalAmount,
        platform_fee: platformCommission,
        gateway_fee: gatewayFee,
        form_admin_amount: formAdminAmount,
        cashfree_split_id: cashfreeOrder.order_id,
        split_status: 'pending'
      };

      await supabase.from('split_transactions').insert([splitData]);
      console.log('✅ Split transaction record created');
    }

    // 🔧 ENHANCED PAYMENT SESSION ID PROCESSING
    let paymentSessionId = cashfreeOrder.payment_session_id || 
                          cashfreeOrder.session_id || 
                          cashfreeOrder.cf_order_id ||
                          cashfreeOrder.order_token;

    console.log('🔍 Original Payment Session ID:', paymentSessionId);

    // 🆕 ROBUST SESSION ID CLEANING
    if (paymentSessionId) {
      // Remove any trailing "payment" text variations (case insensitive)
      paymentSessionId = paymentSessionId.replace(/payment+$/gi, '');
      
      // Remove specific corrupted patterns
      paymentSessionId = paymentSessionId.replace(/(paymentpayment|payment)$/gi, '');
      
      // Remove any trailing underscores or special characters that might be left
      paymentSessionId = paymentSessionId.replace(/[_\-\s]+$/g, '');
      
      // Trim any whitespace
      paymentSessionId = paymentSessionId.trim();
      
      console.log('🔧 Cleaned Payment Session ID:', paymentSessionId);
      console.log('🔧 Cleaned Session ID length:', paymentSessionId.length);
    }

    // Generate the payment URL
    const paymentUrl = paymentSessionId ? 
      `https://payments-test.cashfree.com/links/${paymentSessionId}` : 
      null;
    
    console.log('🔍 Generated Payment URL:', paymentUrl);
    
    // Verify the URL doesn't contain corruption
    if (paymentUrl && paymentUrl.includes('payment')) {
      console.error('⚠️ WARNING: Payment URL still contains "payment" - manual cleaning required');
      // Log for debugging
      console.error('🔍 Problematic URL:', paymentUrl);
    }
    
    console.log('=== ORDER CREATION COMPLETED ===');
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        payment_url: paymentUrl,
        checkout_url: paymentUrl,  // For Google Apps Script compatibility
        order_id: cashfreeOrder.order_id,
        amount: totalAmount,
        split_enabled: splitEnabled,
        commission_breakdown: {
          total: totalAmount,
          gateway_fee: gatewayFee,
          platform_commission: platformCommission,
          form_admin_earnings: formAdminAmount
        }
      })
    };
    
  } catch (error) {
    console.error('❌ Unexpected error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error', details: error.message })
    };
  }
};
