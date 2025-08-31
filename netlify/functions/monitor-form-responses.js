// netlify/functions/monitor-form-responses.js - FIXED DUPLICATE PROCESSING
const { createClient } = require('@supabase/supabase-js');
const { google } = require('googleapis');

// In-memory tracking to prevent duplicates in same execution
const processedInSession = new Set();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// CORS headers
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json'
};

// Send payment email using Supabase Edge Function (SAME AS CASHFREE)
const sendPaymentEmail = async (customerEmail, customerName, productName, productPrice, paymentUrl, adminId, orderId) => {
  try {
    console.log(`📧 Sending payment email to ${customerEmail} using Supabase Edge Function`);

    const emailResponse = await fetch(`${process.env.SUPABASE_URL}/functions/v1/send-payment-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
      },
      body: JSON.stringify({
        to: customerEmail,
        subject: `Complete Your Payment - ${productName}`,
        paymentLink: paymentUrl,
        productName: productName,
        amount: productPrice,
        customerName: customerName,
        adminId: adminId,
        isConfirmation: false
      })
    });

    const emailResult = await emailResponse.json();
    console.log('📧 Supabase Email API response:', emailResult);
    
    if (emailResult.success) {
      console.log(`✅ Payment email sent to ${customerEmail}`);
      return { success: true, messageId: emailResult.messageId };
    } else {
      console.error(`❌ Failed to send payment email:`, emailResult.error);
      return { success: false, error: emailResult.error };
    }

  } catch (error) {
    console.error('❌ Email sending failed:', error);
    return { success: false, error: error.message };
  }
};

// Extract form data from Google Forms response
const extractFormData = (response) => {
  const answers = response.answers || {};
  let email = '', name = '', product = '', productPrice = 0;

  // Extract data from form answers
  Object.values(answers).forEach(answer => {
    const value = answer.textAnswers?.answers?.[0]?.value || '';
    
    // Email detection
    if (value.includes('@') && value.includes('.')) {
      email = value.trim();
    }
    
    // Product and price detection (format: "Product Name - ₹Price")
    if (value.includes('₹') || value.includes('Rs') || value.includes('INR')) {
      product = value;
      
      // Extract price from product string
// Enhanced price extraction from product string
const pricePatterns = [
  /₹(\d+)/,           // Match ₹1999
  /-\s*₹(\d+)/,       // Match - ₹1999  
  /Rs\.?\s*(\d+)/i,   // Match Rs 1999
  /(\d{3,})/          // Match any 3+ digit number as fallback
];

for (const pattern of pricePatterns) {
  const match = value.match(pattern);
  if (match && match[1]) {
    const extracted = parseInt(match[1]);
    if (extracted > 10) { // Only accept prices > ₹10
      productPrice = extracted;
      console.log(`✅ Extracted price: ₹${productPrice} from: ${value}`);
      break;
    }
  }
}
    }
    
    // Name detection (if no @ symbol and not a product)
    if (!value.includes('@') && !value.includes('₹') && !value.includes('Rs') && value.length > 2) {
      if (!name) name = value.trim();
    }
  });

  return { email, name: name || 'Customer', product, productPrice };
};

// Initialize Google Forms API with admin's OAuth token
const initGoogleAuthForAdmin = async (adminId) => {
  try {
    console.log(`🔐 Initializing Google auth for admin: ${adminId}`);

    // Get admin's stored OAuth tokens
    const { data: tokenData, error: tokenError } = await supabase
      .from('google_auth_tokens')
      .select('access_token, refresh_token, token_expires_at')
      .eq('admin_id', adminId)
      .single();

    if (tokenError || !tokenData) {
      throw new Error(`No Google OAuth tokens found for admin ${adminId}`);
    }

    console.log('✅ Found OAuth tokens for admin');

    // Check if token is expired
    const now = new Date();
    const expiresAt = new Date(tokenData.token_expires_at);

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.URL}/.netlify/functions/google-oauth-callback`
    );

    if (expiresAt <= now) {
      console.log('⚠️ Access token expired, refreshing...');
      
      if (!tokenData.refresh_token) {
        throw new Error('Token expired and no refresh token available');
      }

      oauth2Client.setCredentials({
        refresh_token: tokenData.refresh_token
      });

      const { credentials } = await oauth2Client.refreshAccessToken();
      console.log('✅ Token refreshed successfully');

      // Update database with new token
      await supabase
        .from('google_auth_tokens')
        .update({
          access_token: credentials.access_token,
          token_expires_at: new Date(credentials.expiry_date).toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('admin_id', adminId);

      console.log('✅ Updated token in database');
    } else {
      console.log('✅ Using valid OAuth token');
      oauth2Client.setCredentials({ 
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token
      });
    }

    return oauth2Client;

  } catch (error) {
    console.error(`❌ Error initializing Google auth for admin ${adminId}:`, error);
    throw error;
  }
};

// Main monitoring function
exports.handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    console.log('🔍 Starting form monitoring...');

    // 🚨 CRITICAL FIX: Clear processed session at start to prevent memory leak
    processedInSession.clear();

    // Check for pause/resume commands
    if (event.body) {
      try {
        const body = JSON.parse(event.body);
        if (body.action === 'pause_monitoring') {
          console.log('⏸️ Monitoring paused by admin request');
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, message: 'Monitoring paused' })
          };
        }
        if (body.action === 'resume_monitoring') {
          console.log('▶️ Monitoring resumed by admin request');
          // Continue with normal monitoring
        }
      } catch (parseError) {
        console.log('📝 No valid action in request body, proceeding with monitoring');
      }
    }

    // Get all active forms from database
    const { data: activeForms, error: formsError } = await supabase
      .from('form_configs')
      .select(`
        form_id,
        form_name,
        admin_id,
        form_admins!inner(email, name)
      `)
      .eq('is_active', true);

    if (formsError) {
      throw new Error(`Database error: ${formsError.message}`);
    }

    if (!activeForms || activeForms.length === 0) {
      console.log('📝 No active forms found');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, message: 'No active forms to monitor' })
      };
    }

    console.log(`📋 Found ${activeForms.length} active forms to monitor`);

    let totalProcessed = 0;
    let emailsSent = 0;
    let errors = 0;
    let skippedAlreadyProcessed = 0;

    // Process each form
    for (const form of activeForms) {
      try {
        console.log(`🔍 Checking form: ${form.form_name} (${form.form_id})`);

        // Initialize Google Forms API with admin's OAuth token
        const authClient = await initGoogleAuthForAdmin(form.admin_id);
        const forms = google.forms({ version: 'v1', auth: authClient });

        // Get form responses from Google Forms API
        const formResponses = await forms.forms.responses.list({
          formId: form.form_id
        });

        const responses = formResponses.data.responses || [];
        console.log(`📝 Found ${responses.length} total responses for form ${form.form_name}`);

        // 🚨 CRITICAL FIX: Get all already processed responses for this form at once
        const { data: processedResponses, error: processedError } = await supabase
          .from('processed_form_responses')
          .select('response_id')
          .eq('form_id', form.form_id);

        if (processedError) {
          console.error('❌ Error fetching processed responses:', processedError);
        }

        // Create a Set for faster lookups
        const processedResponseIds = new Set(
          (processedResponses || []).map(r => r.response_id)
        );

        console.log(`📊 Already processed ${processedResponseIds.size} responses for this form`);

     // NEW CODE - REPLACE with this enhanced duplicate prevention:
for (const response of responses) {
  try {
    // Extract key response data
    const responseData = response.values || [];
    let customerEmail = '';
    let customerName = '';
    let productName = '';
    let productPrice = 0;

    // Extract email and other fields (adjust based on your form structure)
    responseData.forEach((value, index) => {
      if (typeof value === 'string') {
        // Email detection
        if (value.includes('@') && !customerEmail) {
          customerEmail = value.trim().toLowerCase();
        }
        // Product detection
        if (value.includes('₹') || value.includes('-')) {
          productName = value;
          // Extract price
          const priceMatch = value.match(/₹(\d+)/);
          if (priceMatch) {
            productPrice = parseInt(priceMatch[1]);
          }
        }
        // Name detection (assuming it's not an email or product)
        if (!value.includes('@') && !value.includes('₹') && !customerName && value.length > 2) {
          customerName = value;
        }
      }
    });

    if (!customerEmail || !productName || productPrice <= 0) {
      console.log(`⚠️ Incomplete response data, skipping: ${customerEmail}`);
      continue;
    }

    // CRITICAL: Check if this response was already processed
    // Create a consistent response ID based on email and form
    const responseId = `${formId}_${customerEmail}_${productName.replace(/[^a-zA-Z0-9]/g, '_')}`;
    
    const { data: existingProcessed, error: processedError } = await supabase
      .from('processed_form_responses')
      .select('id')
      .eq('form_id', formId)
      .ilike('response_id', `%${customerEmail}%`);

    if (existingProcessed && existingProcessed.length > 0) {
      console.log(`⏸️ Response already processed for: ${customerEmail}`);
      continue;
    }

    // Check if transaction already exists for this email+form in last 24 hours
    const { data: existingTransaction, error: txError } = await supabase
      .from('transactions')
      .select('id')
      .eq('form_id', formId)
      .eq('email', customerEmail)
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    if (existingTransaction && existingTransaction.length > 0) {
      console.log(`⏸️ Transaction already exists for: ${customerEmail}`);
      
      // Mark as processed to prevent future checking
      await supabase
        .from('processed_form_responses')
        .insert([{
          response_id: `${responseId}_duplicate_skip`,
          form_id: formId,
          status: 'duplicate_skipped',
          processed_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          email_sent: false
        }]);
      
      continue;
    }

    console.log(`🆕 Processing new response: ${customerEmail} - ${productName}`);

    // YOUR EXISTING PROCESSING LOGIC GOES HERE:
    // - Create Razorpay/Cashfree order
    // - Send payment email
    // - Log transaction to database
    
    // Example (replace with your actual processing code):
    const processingResult = await createOrderAndSendEmail({
      customerEmail,
      customerName,
      productName,
      productPrice,
      formId,
      adminId
    });

    // Mark as processed regardless of success/failure
    await supabase
      .from('processed_form_responses')
      .insert([{
        response_id: responseId,
        form_id: formId,
        status: processingResult.success ? 'completed' : 'failed',
        processed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        email_sent: processingResult.success,
        razorpay_order_id: processingResult.orderId || null
      }]);

    if (processingResult.success) {
      processedCount++;
      console.log(`✅ Successfully processed: ${customerEmail}`);
    } else {
      errorCount++;
      console.log(`❌ Failed to process: ${customerEmail}`);
    }

  } catch (error) {
    errorCount++;
    console.error(`❌ Error processing response:`, error);
  }
}

      } catch (formError) {
        console.error(`❌ Error processing form ${form.form_name}:`, formError);
        
        // Log specific error types
        if (formError.message.includes('No Google OAuth tokens')) {
          console.error(`❌ Admin ${form.admin_id} needs to reconnect Google account`);
        } else if (formError.message.includes('Token expired')) {
          console.error(`❌ Admin ${form.admin_id} OAuth token expired and refresh failed`);
        }
        
        errors++;
      }
    } // End form processing loop

    console.log('✅ Monitoring cycle completed');
    console.log(`📊 Summary: ${totalProcessed} processed, ${emailsSent} emails sent, ${skippedAlreadyProcessed} already processed, ${errors} errors`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        summary: {
          forms_checked: activeForms.length,
          responses_processed: totalProcessed,
          emails_sent: emailsSent,
          already_processed: skippedAlreadyProcessed,
          errors: errors
        }
      })
    };

  } catch (error) {
    console.error('💥 Critical error in monitoring function:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message,
        details: 'Check function logs for full error details'
      })
    };
  }
};
