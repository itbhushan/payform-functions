// netlify/functions/create-razorpay-linked-account.js
const Razorpay = require('razorpay');

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

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
    console.log('🔗 Creating Razorpay linked account...');
    const { admin_id, account_details } = JSON.parse(event.body);

    if (!admin_id || !account_details) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing admin_id or account_details' })
      };
    }

    console.log(`📝 Creating linked account for admin: ${admin_id}`);
    
    // Create linked account using Razorpay Route API
    const linkedAccount = await razorpay.accounts.create({
      email: account_details.email,
      phone: account_details.phone || '9999999999', // Default phone if not provided
      type: 'route',
      reference_id: admin_id,
      legal_business_name: account_details.legal_business_name,
      business_type: account_details.account_details?.business_type || 'individual',
      contact_name: account_details.name,
      profile: {
        category: account_details.profile?.category || 'education',
        subcategory: account_details.profile?.subcategory || 'online_education',
        addresses: {
          registered: {
            street1: '123 Main Street',
            street2: '',
            city: 'Mumbai',
            state: 'Maharashtra',
            postal_code: '400001',
            country: 'IN'
          }
        }
      },
      legal_info: {
        pan: account_details.legal_info.pan,
        gst: account_details.legal_info.gst || null
      },
      brand: {
        color: '0000FF'
      },
      notes: {
        admin_id: admin_id,
        created_via: 'payform_platform'
      },
      tnc_accepted: true
    });

    console.log('✅ Linked account created:', linkedAccount.id);

    // If bank account details provided, add them
    if (account_details.bank_account) {
      console.log('🏦 Adding bank account to linked account...');
      
      const bankAccount = await razorpay.accounts.addBankAccount(linkedAccount.id, {
        ifsc_code: account_details.bank_account.ifsc,
        account_number: account_details.bank_account.account_number,
        beneficiary_name: account_details.bank_account.name
      });
      
      console.log('✅ Bank account added:', bankAccount.id);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        id: linkedAccount.id,
        status: linkedAccount.status,
        reference_id: linkedAccount.reference_id,
        created_at: linkedAccount.created_at
      })
    };

  } catch (error) {
    console.error('❌ Error creating linked account:', error);
    
    // Handle specific Razorpay errors
    if (error.error && error.error.description) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'Razorpay error',
          description: error.error.description,
          field: error.error.field || null
        })
      };
    }

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to create linked account',
        details: error.message 
      })
    };
  }
};
