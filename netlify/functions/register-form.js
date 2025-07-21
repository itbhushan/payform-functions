// ✅ NEW NETLIFY FUNCTION: netlify/functions/register-form.js
// This ensures forms are always properly registered with correct admin_id

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
    const { form_id, form_name, form_url, admin_id } = JSON.parse(event.body || '{}');

    if (!form_id || !form_name || !admin_id) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Missing required fields: form_id, form_name, admin_id'
        })
      };
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase credentials not configured');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Check if form already exists
    const { data: existingForm, error: checkError } = await supabase
      .from('form_configs')
      .select('id, admin_id, form_name')
      .eq('form_id', form_id)
      .single();

    if (existingForm) {
      if (existingForm.admin_id === admin_id) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            message: 'Form already registered to this admin',
            form_config: existingForm
          })
        };
      } else {
        return {
          statusCode: 409,
          headers,
          body: JSON.stringify({
            success: false,
            error: 'Form is already registered to a different admin',
            existing_admin: existingForm.admin_id
          })
        };
      }
    }

    // Register new form
    const { data: newForm, error: insertError } = await supabase
      .from('form_configs')
      .insert([{
        form_id,
        form_name,
        form_url,
        admin_id,
        is_active: true,
        payment_settings: {
          currency: 'INR',
          commission_rate: 3,
          gateway_fee_rate: 2.5,
          fixed_gateway_fee: 3
        },
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    // Also create payment_configs entry for backward compatibility
    const { error: paymentConfigError } = await supabase
      .from('payment_configs')
      .insert([{
        form_id,
        admin_id,
        form_name,
        currency: 'INR',
        is_active: true,
        created_at: new Date().toISOString()
      }]);

    if (paymentConfigError) {
      console.warn('Payment config creation failed:', paymentConfigError);
      // Don't fail the request for this
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Form registered successfully',
        form_config: newForm
      })
    };

  } catch (error) {
    console.error('Form registration error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message
      })
    };
  }
};
