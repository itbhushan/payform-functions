// netlify/functions/monitor-form-responses.js - FIXED TO USE ADMIN OAUTH TOKENS
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

// Extract form data from Google Forms response - FIXED VERSION
const extractFormData = (response) => {
  const answers = response.answers || {};
  let email = '', name = '', product = '', productPrice = 0;

  console.log(`🔍 DEBUG - Response ID: ${response.responseId}`);
  console.log(`🔍 DEBUG - Total answers: ${Object.keys(answers).length}`);

  // Extract data from form answers
  Object.values(answers).forEach(answer => {
    const value = answer.textAnswers?.answers?.[0]?.value || '';
    
    // DEBUG: Log each value being processed
    if (value) {
      console.log(`🔍 Processing form value: "${value}"`);
    }
    
    // Email detection
    if (value.includes('@') && value.includes('.')) {
      email = value.trim();
      console.log(`✅ Found email: ${email}`);
    }
    
    // Product and price detection (format: "Product Name - ₹Price")
    if (value.includes('₹') || value.includes('Rs') || value.includes('INR')) {
      product = value;
      console.log(`✅ Found product string: ${product}`);
      
      // FIXED: Enhanced price extraction from product string
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
      if (!name) {
        name = value.trim();
        console.log(`✅ Found name: ${name}`);
      }
    }
  });

  const result = { email, name: name || 'Customer', product, productPrice };
  console.log(`🔍 Final extracted data:`, result);
  return result;
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

        // Process each response
        for (const response of responses) {
          const responseId = response.responseId;
          const sessionKey = `${form.form_id}-${responseId}`;

          // Skip if already processed in this session
          if (processedInSession.has(sessionKey)) {
            continue;
          }

          // Check if already processed in database
// Check if already processed in database
const { data: existingRecord } = await supabase
  .from('processed_form_responses')
  .select('id')
  .eq('response_id', responseId)
  .eq('form_id', form.form_id)
  .single();

if (existingRecord) {
  processedInSession.add(sessionKey);
  continue;
}

// ADDITIONAL CHECK: Skip responses older than 1 hour to avoid processing historical data
const responseTimestamp = new Date(response.createTime);
const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

if (responseTimestamp < oneHourAgo) {
  console.log(`⏸️ Skipping historical response from ${responseTimestamp}: ${responseId}`);
  
  // Mark as historical to prevent future processing
  await supabase
    .from('processed_form_responses')
    .insert({
      response_id: responseId,
      form_id: form.form_id,
      status: 'historical_skip',
      processed_at: new Date().toISOString()
    });
  
  processedInSession.add(sessionKey);
  continue;
}
          
          console.log(`🆕 Processing new response: ${responseId}`);

          // Mark as processing immediately to prevent race conditions
          await supabase
            .from('processed_form_responses')
            .insert({
              response_id: responseId,
              form_id: form.form_id,
              status: 'processing',
              processed_at: new Date().toISOString()
            });

          // Extract form data using FIXED function
          const formData = extractFormData(response);
          
          if (!formData.email || !formData.product || formData.productPrice === 0) {
            console.log('⚠️ Incomplete form data, skipping:', formData);
            
            // Update status to failed
            await supabase
              .from('processed_form_responses')
              .update({ status: 'failed', error_message: 'Incomplete form data' })
              .eq('response_id', responseId)
              .eq('form_id', form.form_id);
            
            processedInSession.add(sessionKey);
            errors++;
            continue;
          }

          console.log('📋 Extracted data:', formData);

          // Create Razorpay order (using the same pattern as CashFree)
          const orderResponse = await fetch(`${process.env.URL}/.netlify/functions/create-razorpay-order`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              form_id: form.form_id,
              customer_email: formData.email,
              customer_name: formData.name,
              product_name: formData.product,
              product_price: formData.productPrice,
              admin_id: form.admin_id
            })
          });

          const orderData = await orderResponse.json();

          if (!orderData.success || !orderData.checkout_url) {
            console.error('❌ Failed to create Razorpay order:', orderData.error);
            
            await supabase
              .from('processed_form_responses')
              .update({ 
                status: 'failed', 
                error_message: `Payment order creation failed: ${orderData.error}` 
              })
              .eq('response_id', responseId)
              .eq('form_id', form.form_id);
            
            processedInSession.add(sessionKey);
            errors++;
            continue;
          }

          console.log('💳 Razorpay order created:', orderData.order_id);

          // Send payment email using Supabase Edge Function (SAME AS CASHFREE)
          const emailResult = await sendPaymentEmail(
            formData.email,
            formData.name,
            formData.product,
            formData.productPrice,
            orderData.checkout_url,
            form.admin_id,
            orderData.order_id
          );

          if (emailResult.success) {
            console.log(`📧 Payment email sent to ${formData.email}`);
            emailsSent++;

            // Update processing record with success
            await supabase
              .from('processed_form_responses')
              .update({
                status: 'completed',
                razorpay_order_id: orderData.order_id,
                email_sent: true,
                email_message_id: emailResult.messageId
              })
              .eq('response_id', responseId)
              .eq('form_id', form.form_id);

          } else {
            console.error(`❌ Failed to send email to ${formData.email}:`, emailResult.error);
            
            await supabase
              .from('processed_form_responses')
              .update({
                status: 'failed',
                error_message: `Email sending failed: ${emailResult.error}`,
                razorpay_order_id: orderData.order_id
              })
              .eq('response_id', responseId)
              .eq('form_id', form.form_id);
            
            errors++;
          }

          processedInSession.add(sessionKey);
          totalProcessed++;

        } // End response processing loop

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
    console.log(`📊 Summary: ${totalProcessed} processed, ${emailsSent} emails sent, ${errors} errors`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        summary: {
          forms_checked: activeForms.length,
          responses_processed: totalProcessed,
          emails_sent: emailsSent,
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
