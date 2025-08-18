// netlify/functions/get-payment-config.js - ENHANCED VERSION
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const requestBody = JSON.parse(event.body);
    const { form_id } = requestBody;

    if (!form_id) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'form_id is required' })
      };
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Getting payment config for form:', form_id);

    // Get form configuration with admin details
    const { data: formConfig, error: formError } = await supabase
      .from('form_configs')
      .select(`
        *,
        form_admins (
          id,
          email,
          name,
          preferred_gateway,
          auto_splits_enabled,
          gateway_setup_status,
          razorpay_account_id
        )
      `)
      .eq('form_id', form_id)
      .eq('is_active', true)
      .single();

    if (formError || !formConfig) {
      console.log('Form not found or not active:', formError);
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ 
          error: 'Form not found or not active',
          success: false
        })
      };
    }

    const formAdmin = formConfig.form_admins;
    
    // Determine which gateway to use
    const preferredGateway = formAdmin.preferred_gateway || 'cashfree';
    
    // Check gateway readiness
    let gatewayConfig = {};
    let gatewayReady = false;

    if (preferredGateway === 'razorpay') {
      // Check if Razorpay Route is ready
      const { data: razorpayAccount } = await supabase
        .from('razorpay_linked_accounts')
        .select('*')
        .eq('form_admin_id', formAdmin.id)
        .eq('account_status', 'activated')
        .single();

      if (razorpayAccount && formAdmin.auto_splits_enabled) {
        gatewayConfig = {
          gateway: 'razorpay',
          auto_splits: true,
          account_id: razorpayAccount.razorpay_account_id,
          commission_rate: 3.0
        };
        gatewayReady = true;
      } else {
        // Fallback to Cashfree if Razorpay not ready
        console.log('Razorpay not ready, falling back to Cashfree');
        gatewayConfig = {
          gateway: 'cashfree',
          auto_splits: false,
          fallback_reason: 'razorpay_not_activated'
        };
        gatewayReady = true;
      }
    } else {
      // Use Cashfree
      gatewayConfig = {
        gateway: 'cashfree',
        auto_splits: false
      };
      gatewayReady = true;
    }

    // Get provider configuration
    const { data: providerConfig } = await supabase
      .from('provider_configs')
      .select('*')
      .eq('admin_id', formAdmin.id)
      .eq('provider_name', gatewayConfig.gateway)
      .eq('is_enabled', true)
      .single();

    if (!providerConfig && gatewayConfig.gateway === 'cashfree') {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ 
          error: 'Payment configuration not found',
          success: false
        })
      };
    }

    const response = {
      success: true,
      data: {
        form_id: form_id,
        form_name: formConfig.form_name,
        admin_id: formAdmin.id,
        admin_email: formAdmin.email,
        gateway: gatewayConfig.gateway,
        auto_splits_enabled: gatewayConfig.auto_splits || false,
        gateway_config: gatewayConfig,
        
        // Legacy fields for backward compatibility
        stripe_checkout_url: null,
        paypal_checkout_url: null,
        gpay_upi_link: null,
        
        // Gateway-specific configuration
        ...(gatewayConfig.gateway === 'cashfree' && {
          cashfree_enabled: true,
          cashfree_config: providerConfig?.config_data
        }),
        
        ...(gatewayConfig.gateway === 'razorpay' && {
          razorpay_enabled: true,
          razorpay_account_id: gatewayConfig.account_id,
          commission_rate: gatewayConfig.commission_rate
        })
      }
    };

    console.log('Payment config response:', {
      form_id,
      gateway: gatewayConfig.gateway,
      auto_splits: gatewayConfig.auto_splits,
      admin: formAdmin.email
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response)
    };

  } catch (error) {
    console.error('Error in get-payment-config:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Internal server error',
        success: false
      })
    };
  }
};
