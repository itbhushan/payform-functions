// netlify/functions/create-razorpay-linked-account.js
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    console.log('Creating Razorpay linked account...');
    
    const requestBody = JSON.parse(event.body);
    const { admin_id, bank_details } = requestBody;

    // Validate required fields
    if (!admin_id || !bank_details) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Missing admin_id or bank_details'
        })
      };
    }

    // Environment variables
    const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
    const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      throw new Error('Razorpay credentials not configured');
    }

    // Initialize Supabase
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Check if linked account already exists
    const { data: existingAccount } = await supabase
      .from('razorpay_linked_accounts')
      .select('*')
      .eq('form_admin_id', admin_id)
      .single();

    if (existingAccount) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          account_id: existingAccount.razorpay_account_id,
          status: existingAccount.account_status,
          message: 'Linked account already exists'
        })
      };
    }

    // Get Form Admin details
    const { data: formAdmin } = await supabase
      .from('form_admins')
      .select('*')
      .eq('id', admin_id)
      .single();

    if (!formAdmin) {
      throw new Error('Form Admin not found');
    }

    // Create Razorpay linked account payload
    const linkedAccountPayload = {
      email: formAdmin.email,
      phone: bank_details.phone || '9999999999', // Default if not provided
      legal_business_name: bank_details.business_name || formAdmin.name,
      business_type: bank_details.business_type || 'individual',
      contact_name: formAdmin.name,
      profile: {
        category: 'education',
        subcategory: 'coaching',
        addresses: {
          registered: {
            street1: bank_details.address || 'Default Address',
            street2: '',
            city: bank_details.city || 'Bangalore',
            state: bank_details.state || 'Karnataka',
            postal_code: bank_details.postal_code || '560001',
            country: 'IN'
          }
        }
      },
      legal_info: {
        pan: bank_details.pan_number
      }
    };

    console.log('Creating Razorpay linked account with payload:', JSON.stringify(linkedAccountPayload));

    // Create linked account with Razorpay
    const razorpayResponse = await fetch('https://api.razorpay.com/v1/accounts', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(linkedAccountPayload)
    });

    const razorpayResult = await razorpayResponse.json();
    console.log('Razorpay API response:', razorpayResult);

    if (!razorpayResponse.ok) {
      throw new Error(`Razorpay API error: ${JSON.stringify(razorpayResult)}`);
    }

    // Store linked account in database
    const { data: linkedAccount, error: dbError } = await supabase
      .from('razorpay_linked_accounts')
      .insert({
        form_admin_id: admin_id,
        razorpay_account_id: razorpayResult.id,
        account_status: razorpayResult.status || 'created',
        activation_status: razorpayResult.activation_status || 'created',
        business_type: bank_details.business_type,
        contact_name: formAdmin.name,
        legal_business_name: bank_details.business_name || formAdmin.name
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database error:', dbError);
      throw new Error(`Database error: ${dbError.message}`);
    }

    // Update form admin with Razorpay account ID
    await supabase
      .from('form_admins')
      .update({
        razorpay_account_id: razorpayResult.id,
        gateway_setup_status: {
          cashfree: 'active',
          razorpay: 'created'
        },
        updated_at: new Date().toISOString()
      })
      .eq('id', admin_id);

    console.log('Linked account created successfully:', razorpayResult.id);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        account_id: razorpayResult.id,
        status: razorpayResult.status,
        activation_status: razorpayResult.activation_status,
        message: 'Linked account created successfully'
      })
    };

  } catch (error) {
    console.error('Error creating linked account:', error);
    
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
