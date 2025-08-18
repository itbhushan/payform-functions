// netlify/functions/create-cashfree-payment.js - ENHANCED FOR DUAL GATEWAY
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
    console.log('🚀 Creating Cashfree payment session');
    console.log('📥 Request body:', event.body);
    
    const requestData = JSON.parse(event.body);
    const { 
      form_id, 
      email, 
      product_name, 
      product_price, 
      form_admin_id,
      customer_name 
    } = requestData;

    // Validation
    if (!form_id || !email || !product_name || !product_price) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          success: false,
          error: 'Missing required parameters',
          received: { form_id, email, product_name, product_price }
        })
      };
    }

    // Environment variables
    const CASHFREE_APP_ID = process.env.CASHFREE_APP_ID;
    const CASHFREE_SECRET_KEY = process.env.CASHFREE_SECRET_KEY;
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    console.log('🔧 Environment check:', {
      CASHFREE_APP_ID: !!CASHFREE_APP_ID,
      CASHFREE_SECRET_KEY: !!CASHFREE_SECRET_KEY,
      SUPABASE_URL: !!SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: !!SUPABASE_SERVICE_ROLE_KEY
    });

    if (!CASHFREE_APP_ID || !CASHFREE_SECRET_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
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

    // 🔍 Get form configuration with admin preferences
    console.log('🔍 Checking form_configs table...');
    
    try {
      // Get form config with admin preferences
      const { data: formConfig, error: configError } = await supabase
        .from('form_configs')
        .select(`
          *,
          form_admins (
            id,
            email,
            name,
            preferred_gateway,
            auto_splits_enabled
          )
        `)
        .eq('form_id', form_id)
        .single();

      console.log('🔍 Form config lookup:', {
        form_id,
        found: !!formConfig,
        admin_gateway: formConfig?.form_admins?.preferred_gateway,
        error: configError?.message
      });

      if (configError || !formConfig) {
        // 🔧 AUTO-CREATE form config if admin_id is provided
        if (form_admin_id) {
          console.log('🔧 Auto-creating form config...');
          
          const { data: newConfig, error: createError } = await supabase
            .from('form_configs')
            .insert({
              form_id: form_id,
              admin_id: form_admin_id,
              form_name: 'Google Form Payment',
              is_active: true,
              payment_settings: {
                payment_methods: ['cashfree'],
                currency: 'INR',
                commission_rate: 3.0
              }
            })
            .select(`
              *,
              form_admins (
                id,
                email,
                name,
                preferred_gateway,
                auto_splits_enabled
              )
            `)
            .single();

          if (createError) {
            console.error('❌ Failed to create form config:', createError);
            return {
              statusCode: 404,
              headers,
              body: JSON.stringify({ 
                success: false,
                error: 'Form configuration not found and could not be created',
                details: createError.message,
                form_id: form_id
              })
            };
          }

          console.log('✅ Form config auto-created:', newConfig);
          formConfig = newConfig;
        } else {
          return {
            statusCode: 404,
            headers,
            body: JSON.stringify({ 
              success: false,
              error: 'Form configuration not found',
              form_id: form_id,
              hint: 'Please add this form to your PayForm dashboard first'
            })
          };
        }
      }

      const formAdmin = formConfig.form_admins;
      const adminId = form_admin_id || formAdmin?.id;
      
      if (!adminId) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ 
            success: false,
            error: 'Admin ID not found for this form' 
          })
        };
      }

      // 🆕 NEW: Check if admin prefers Razorpay and it's available
      const preferredGateway = formAdmin?.preferred_gateway || 'cashfree';
      
      if (preferredGateway === 'razorpay' && formAdmin?.auto_splits_enabled) {
        console.log('🔄 Admin prefers Razorpay Route, redirecting...');
        
        // Check if Razorpay account is activated
        const { data: razorpayAccount } = await supabase
          .from('razorpay_linked_accounts')
          .select('*')
          .eq('form_admin_id', adminId)
          .eq('account_status', 'activated')
          .single();

        if (razorpayAccount) {
          // Redirect to Razorpay Route
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              success: true,
              redirect_to_razorpay: true,
              message: 'Using Razorpay Route for automatic splits'
            })
          };
        } else {
          console.log('⚠️ Razorpay not activated, falling back to Cashfree');
        }
      }

      console.log('✅ Using Cashfree payment gateway');

    } catch (dbError) {
      console.error('❌ Database connection error:', dbError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          success: false,
          error: 'Database connection failed',
          details: dbError.message
        })
      };
    }

    // Continue with Cashfree payment creation...
    const orderId = `payform_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const customerId = email.replace('@', '_').replace('.', '_');
    
    // Calculate commission breakdown
    const totalAmount = parseFloat(product_price);
    const gatewayFee = (totalAmount * 2.5 / 100) + 3;
    const platformCommission = totalAmount * 3 / 100;
    const netAmountToAdmin = totalAmount - gatewayFee - platformCommission;

    // Return URLs for end users (not admin dashboard!)
    const baseUrl = 'https://payform2025.netlify.app';
    const returnUrl = `${baseUrl}/.netlify/functions/verify-cashfree-payment?order_id=${orderId}&form_id=${form_id}&email=${encodeURIComponent(email)}`;

    console.log('🔗 Payment URLs:', { returnUrl });

    // Create Cashfree payment link
    const cashfreePayload = {
      link_id: orderId,
      link_amount: totalAmount,
      link_currency: 'INR',
      link_purpose: product_name,
      customer_details: {
        customer_name: customer_name || email.split('@')[0],
        customer_email: email,
        customer_phone: '9999999999'
      },
      link_partial_payments: false,
      link_expiry_time: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      link_notes: {
        form_id: form_id,
        admin_id: adminId,
        product_name: product_name,
        customer_email: email
      },
      link_auto_reminders: true,
      link_notify: {
        send_sms: false,
        send_email: false  // We handle our own emails
      },
      link_meta: {
        return_url: returnUrl,
        upi_intent: true
      }
    };

    console.log('💳 Creating Cashfree payment link...');

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
    console.log('💳 Cashfree response:', { 
      status: cashfreeResponse.status, 
      ok: cashfreeResponse.ok,
      result: cashfreeResult 
    });

    if (!cashfreeResponse.ok) {
      console.error('❌ Cashfree API error:', cashfreeResult);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          success: false,
          error: 'Failed to create payment link',
          details: cashfreeResult 
        })
      };
    }

    // Save transaction to database
    const adminId = form_admin_id || formConfig.form_admins?.id;

    const transactionData = {
      form_id: form_id,
      email: email,
      customer_name: customer_name || email.split('@')[0],
      product_name: product_name,
      payment_amount: totalAmount,
      payment_currency: 'INR',
      payment_status: 'pending',
      payment_provider: 'cashfree',
      transaction_id: orderId,
      cashfree_order_id: orderId,
      cashfree_link_id: cashfreeResult.link_id,
      gateway_fee: Number(gatewayFee.toFixed(2)),
      platform_commission: Number(platformCommission.toFixed(2)),
      net_amount_to_admin: Number(netAmountToAdmin.toFixed(2)),
      admin_id: adminId,
      gateway_used: 'cashfree', // 🆕 NEW: Track which gateway was used
      auto_split_enabled: false, // 🆕 NEW: Cashfree uses manual splits
      created_at: new Date().toISOString()
    };

    console.log('💾 Transaction data to save:', transactionData);
    console.log('💾 Saving transaction to database...');

    const { error: dbError } = await supabase
      .from('transactions')
      .insert([transactionData]);

    if (dbError) {
      console.error('❌ Database insert error:', dbError);
      // Continue anyway, payment link is created
    } else {
      console.log('✅ Transaction saved to database');
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        gateway: 'cashfree',
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
