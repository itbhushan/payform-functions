// netlify/functions/add-bank-to-razorpay-account.js
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
    console.log('Adding bank account to Razorpay linked account...');
    
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

    // Get linked account details
    const { data: linkedAccount } = await supabase
      .from('razorpay_linked_accounts')
      .select('*')
      .eq('form_admin_id', admin_id)
      .single();

    if (!linkedAccount) {
      throw new Error('Linked account not found. Please create linked account first.');
    }

    const accountId = linkedAccount.razorpay_account_id;

    // Bank account payload for Razorpay
    const bankAccountPayload = {
      bank_account: {
        ifsc_code: bank_details.ifsc_code,
        account_number: bank_details.bank_account_number,
        beneficiary_name: bank_details.account_holder_name
      }
    };

    console.log('Adding bank account to Razorpay account:', accountId);

    // Add bank account to linked account
    const razorpayResponse = await fetch(`https://api.razorpay.com/v1/accounts/${accountId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(bankAccountPayload)
    });

    const razorpayResult = await razorpayResponse.json();
    console.log('Razorpay bank addition response:', razorpayResult);

    if (!razorpayResponse.ok) {
      throw new Error(`Razorpay API error: ${JSON.stringify(razorpayResult)}`);
    }

    // Update database with bank details
    const { error: updateError } = await supabase
      .from('razorpay_linked_accounts')
      .update({
        bank_account_number: bank_details.bank_account_number,
        ifsc_code: bank_details.ifsc_code,
        beneficiary_name: bank_details.account_holder_name,
        account_status: razorpayResult.status || 'created',
        activation_status: razorpayResult.activation_status || 'created',
        bank_verified: razorpayResult.activation_status === 'activated',
        updated_at: new Date().toISOString()
      })
      .eq('form_admin_id', admin_id);

    if (updateError) {
      console.error('Database update error:', updateError);
      throw new Error(`Database error: ${updateError.message}`);
    }

    // Update form admin gateway status
    await supabase
      .from('form_admins')
      .update({
        gateway_setup_status: {
          cashfree: 'active',
          razorpay: razorpayResult.activation_status === 'activated' ? 'active' : 'pending_verification'
        },
        auto_splits_enabled: razorpayResult.activation_status === 'activated',
        preferred_gateway: razorpayResult.activation_status === 'activated' ? 'razorpay' : 'cashfree',
        updated_at: new Date().toISOString()
      })
      .eq('id', admin_id);

    console.log('Bank account added successfully. Status:', razorpayResult.activation_status);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        account_id: accountId,
        status: razorpayResult.status,
        activation_status: razorpayResult.activation_status,
        bank_verified: razorpayResult.activation_status === 'activated',
        message: razorpayResult.activation_status === 'activated' 
          ? 'Bank account verified! Auto-splits are now enabled.'
          : 'Bank account added. Verification in progress.'
      })
    };

  } catch (error) {
    console.error('Error adding bank account:', error);
    
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
