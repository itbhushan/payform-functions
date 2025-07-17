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
    console.log('🚀 Creating Cashfree order...');
    console.log('Request body:', event.body);

    const { 
      form_id, 
      email, 
      product_name, 
      product_price, 
      customer_name = "Customer",
      customer_phone = "9999999999"
    } = JSON.parse(event.body);

    // Validate required fields
    if (!form_id || !email || !product_name || !product_price) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          success: false,
          error: 'Missing required fields: form_id, email, product_name, product_price' 
        })
      };
    }

    // Environment variables
    const CASHFREE_APP_ID = process.env.CASHFREE_APP_ID;
    const CASHFREE_SECRET_KEY = process.env.CASHFREE_SECRET_KEY;
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!CASHFREE_APP_ID || !CASHFREE_SECRET_KEY) {
      console.error('❌ Cashfree credentials not configured');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          success: false,
          error: 'Cashfree credentials not configured' 
        })
      };
    }

    // Generate unique order ID
    const orderId = `payform_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const totalAmount = parseFloat(product_price);

    // Calculate commission split
    const gatewayFee = (totalAmount * 2.5 / 100) + 3; // Cashfree: 2.5% + ₹3
    const platformCommission = totalAmount * 3 / 100; // Your 3%
    const formAdminAmount = totalAmount - gatewayFee - platformCommission;

    console.log('💰 Commission breakdown:', {
      totalAmount,
      gatewayFee: gatewayFee.toFixed(2),
      platformCommission: platformCommission.toFixed(2),
      formAdminAmount: formAdminAmount.toFixed(2)
    });

    // Prepare return URL with proper parameters
    const returnUrl = `${process.env.URL || 'https://payform2025.netlify.app'}/.netlify/functions/verify-cashfree-payment?order_id=${orderId}&form_id=${form_id}&email=${encodeURIComponent(email)}`;

    // Create Cashfree order
    const cashfreeOrderData = {
      order_id: orderId,
      order_amount: totalAmount,
      order_currency: "INR",
      customer_details: {
        customer_id: email.replace('@', '_').replace('.', '_'),
        customer_name: customer_name || "Customer",
        customer_email: email,
        customer_phone: customer_phone
      },
      order_meta: {
        return_url: returnUrl,
        notify_url: `${process.env.URL || 'https://payform2025.netlify.app'}/.netlify/functions/cashfree-webhook`
      },
      order_note: `Payment for ${product_name} via PayForm`
    };

    console.log('📝 Cashfree order data:', cashfreeOrderData);

    // Call Cashfree API
    const cashfreeResponse = await fetch('https://sandbox.cashfree.com/pg/orders', {
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
      console.error('❌ Cashfree API error:', cashfreeResponse.status, errorText);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          success: false,
          error: 'Failed to create Cashfree order',
          details: errorText
        })
      };
    }

    const cashfreeOrder = await cashfreeResponse.json();
    console.log('✅ Cashfree order created:', cashfreeOrder);

    // Save transaction to database
    if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
      try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
        
        const transactionData = {
          form_id: form_id,
          email: email,
          customer_name: customer_name,
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
          //admin_id: 'f807a8c3-316b-4df0-90e7-5f7796c86f71', // ✅ HARDCODED FOR NOW
          // Look up form admin from form_configs table
        let adminId = 'f807a8c3-316b-4df0-90e7-5f7796c86f71'; // fallback
        try {
          const { data: formConfig } = await supabase
            .from('form_configs')
            .select('admin_id')
            .eq('form_id', form_id)
            .single();
  
          if (formConfig?.admin_id) {
            adminId = formConfig.admin_id;
            console.log('✅ Found form admin:', adminId);
          }
        } catch (formLookupError) {
          console.warn('⚠️ Using fallback admin ID:', formLookupError.message);
        }
        admin_id: adminId, // ✅ Now dynamic
          created_at: new Date().toISOString()
        };

        const { error: dbError } = await supabase
          .from('transactions')
          .insert([transactionData]);

        if (dbError) {
          console.error('❌ Database error:', dbError);
          // Continue anyway - payment creation is more important
        } else {
          console.log('✅ Transaction saved to database');
        }
      } catch (dbError) {
        console.error('❌ Database connection error:', dbError);
        // Continue anyway
      }
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
        checkout_url: `https://sandbox.cashfree.com/pg/view/order/${cashfreeOrder.payment_session_id}`,
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
    console.error('❌ Function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        success: false,
        error: 'Internal server error',
        details: error.message
      })
    };
  }
};
