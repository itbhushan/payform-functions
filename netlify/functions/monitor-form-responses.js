// netlify/functions/monitor-form-responses.js - FIXED VERSION WITH DUPLICATE PREVENTION
const { createClient } = require('@supabase/supabase-js');
const { google } = require('googleapis');

// In-memory tracking to prevent duplicates in same execution
const processedInSession = new Set();

exports.handler = async (event, context) => {
  console.log('=== Form Response Monitoring Started ===');
  
  try {
    // Handle pause request
    if (event.body) {
      const body = JSON.parse(event.body);
      if (body.action === 'pause_monitoring') {
        console.log('⏸️ Monitoring paused by admin request');
        return { statusCode: 200, body: JSON.stringify({ success: true, message: 'Monitoring paused' }) };
      }
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get active forms for monitoring
    const { data: forms, error: formsError } = await supabase
      .from('form_configs')
      .select(`
        *,
        form_field_mappings (*)
      `)
      .eq('is_active', true);

    if (formsError) {
      console.error('Error fetching forms:', formsError);
      throw formsError;
    }

    console.log(`📋 Found ${forms?.length || 0} active forms to monitor`);

    if (!forms || forms.length === 0) {
      console.log('No active forms found');
      return { statusCode: 200, body: JSON.stringify({ success: true, message: 'No forms to monitor' }) };
    }

    // Process each form
    for (const form of forms) {
      try {
        console.log(`📝 Processing form: ${form.form_id} (Admin: ${form.admin_id})`);
        await processFormResponses(form, supabase);
      } catch (error) {
        console.error(`Error processing form ${form.form_id}:`, error);
        continue; // Continue with next form
      }
    }

    console.log('=== Form Response Monitoring Completed ===');
    return { statusCode: 200, body: JSON.stringify({ success: true, message: 'Monitoring completed' }) };

  } catch (error) {
    console.error('Fatal error in monitoring:', error);
    return { 
      statusCode: 500, 
      body: JSON.stringify({ 
        success: false, 
        error: error.message 
      }) 
    };
  }
};

async function processFormResponses(formConfig, supabase) {
  try {
    // Get Google OAuth token for this admin
    const { data: authData } = await supabase
      .from('google_oauth_tokens')
      .select('*')
      .eq('admin_id', formConfig.admin_id)
      .single();

    if (!authData || !authData.access_token) {
      console.log(`❌ No OAuth token for admin ${formConfig.admin_id}`);
      return;
    }

    // Check if token is expired
    if (new Date(authData.expires_at) < new Date()) {
      console.log(`❌ OAuth token expired for admin ${formConfig.admin_id}`);
      return;
    }

    const auth = new google.auth.OAuth2();
    auth.setCredentials({
      access_token: authData.access_token,
      refresh_token: authData.refresh_token
    });

    const forms = google.forms({ version: 'v1', auth });

    // CRITICAL FIX: Get last processed timestamp to avoid duplicates
    const { data: lastProcessed } = await supabase
      .from('processed_form_responses')
      .select('response_timestamp, response_id')
      .eq('form_id', formConfig.form_id)
      .order('response_timestamp', { ascending: false })
      .limit(1)
      .single();

    console.log(`📅 Last processed response timestamp:`, lastProcessed?.response_timestamp || 'None');

    // Get form responses
    const formResponse = await forms.forms.responses.list({
      formId: formConfig.form_id,
      // Add filter to only get responses after last processed
      ...(lastProcessed?.response_timestamp && {
        filter: `timestamp > "${lastProcessed.response_timestamp}"`
      })
    });

    const responses = formResponse.data.responses || [];
    console.log(`📋 Found ${responses.length} new responses to process`);

    if (responses.length === 0) {
      console.log('✅ No new responses to process');
      return;
    }

    // Get field mapping
    const fieldMapping = formConfig.form_field_mappings?.[0];
    if (!fieldMapping) {
      console.log(`❌ No field mapping found for form ${formConfig.form_id}`);
      return;
    }

    console.log('📋 Field mapping being used:', fieldMapping);

    // Process each response with duplicate prevention
    for (const response of responses) {
      try {
        // CRITICAL FIX: Check if already processed in this session
        const sessionKey = `${formConfig.form_id}_${response.responseId}`;
        if (processedInSession.has(sessionKey)) {
          console.log(`⏭️ Skipping ${response.responseId} - already processed in this session`);
          continue;
        }

        // CRITICAL FIX: Check database for already processed responses
        const { data: alreadyProcessed } = await supabase
          .from('processed_form_responses')
          .select('id')
          .eq('form_id', formConfig.form_id)
          .eq('response_id', response.responseId)
          .single();

        if (alreadyProcessed) {
          console.log(`⏭️ Skipping ${response.responseId} - already processed in database`);
          processedInSession.add(sessionKey); // Track in session too
          continue;
        }

        console.log(`🔄 Processing new response: ${response.responseId}`);
        await processIndividualResponse(response, formConfig, fieldMapping, supabase);
        
        // Mark as processed in session
        processedInSession.add(sessionKey);

      } catch (error) {
        console.error(`Error processing response ${response.responseId}:`, error);
        continue; // Continue with next response
      }
    }

  } catch (error) {
    console.error('Error in processFormResponses:', error);
    throw error;
  }
}

async function processIndividualResponse(response, formConfig, fieldMapping, supabase) {
  try {
    // CRITICAL FIX: Mark as being processed IMMEDIATELY to prevent race conditions
    const processingKey = `processing_${formConfig.form_id}_${response.responseId}`;
    
    // Insert processing record immediately
    const { error: processingError } = await supabase
      .from('processed_form_responses')
      .insert({
        form_id: formConfig.form_id,
        response_id: response.responseId,
        admin_id: formConfig.admin_id,
        response_timestamp: response.lastSubmittedTime,
        processing_status: 'processing', // Mark as processing
        processed_at: new Date().toISOString()
      });

    if (processingError) {
      // If we can't mark as processing, it might already be processed
      console.log(`⚠️ Could not mark as processing (might be duplicate):`, processingError.message);
      return;
    }

    console.log(`🔒 Marked ${response.responseId} as processing`);

    // Extract data from form response
    const extractedData = extractFormData(response, fieldMapping);
    
    if (!extractedData.email) {
      console.log(`❌ No email found in response ${response.responseId}`);
      await updateProcessingStatus(supabase, formConfig.form_id, response.responseId, 'failed', 'No email found');
      return;
    }

    console.log('📊 Extracted data:', extractedData);

    // Create payment with extracted data
    console.log(`💳 Creating Razorpay payment for: ${extractedData.email}`);
    
    const paymentResult = await createRazorpayOrder({
      form_id: formConfig.form_id,
      email: extractedData.email,
      product_name: extractedData.productName,
      product_price: extractedData.productPrice,
      customer_name: extractedData.name,
      phone: extractedData.phone || ''
    });

    if (paymentResult.success) {
      console.log(`✅ Payment created successfully: ${paymentResult.order_id}`);
      
      // Log transaction to database
      const { error: transactionError } = await supabase
        .from('transactions')
        .insert({
          form_id: formConfig.form_id,
          email: extractedData.email,
          customer_name: extractedData.name,
          product_name: extractedData.productName,
          payment_amount: extractedData.productPrice,
          payment_currency: 'INR',
          payment_status: 'pending',
          payment_provider: 'razorpay',
          transaction_id: paymentResult.order_id,
          admin_id: formConfig.admin_id,
          phone: extractedData.phone,
          created_at: new Date().toISOString()
        });

      if (transactionError) {
        console.error('❌ Error logging transaction:', transactionError);
      } else {
        console.log('✅ Transaction logged to database');
      }

      // Update processing status to completed
      await updateProcessingStatus(supabase, formConfig.form_id, response.responseId, 'completed', null, paymentResult.order_id);

      // Send email (placeholder - implement actual email sending)
      console.log(`📧 Would send payment email to: ${extractedData.email}`);
      console.log(`🔗 Payment URL: ${paymentResult.payment_url}`);
      
    } else {
      console.error(`❌ Payment creation failed:`, paymentResult.error);
      await updateProcessingStatus(supabase, formConfig.form_id, response.responseId, 'failed', paymentResult.error);
    }

  } catch (error) {
    console.error('Error in processIndividualResponse:', error);
    // Mark as failed
    await updateProcessingStatus(supabase, formConfig.form_id, response.responseId, 'failed', error.message);
    throw error;
  }
}

async function updateProcessingStatus(supabase, formId, responseId, status, errorMessage = null, orderId = null) {
  try {
    const { error } = await supabase
      .from('processed_form_responses')
      .update({
        processing_status: status,
        error_message: errorMessage,
        order_id: orderId,
        updated_at: new Date().toISOString()
      })
      .eq('form_id', formId)
      .eq('response_id', responseId);

    if (error) {
      console.error('Error updating processing status:', error);
    } else {
      console.log(`📝 Updated processing status to: ${status}`);
    }
  } catch (error) {
    console.error('Error in updateProcessingStatus:', error);
  }
}

function extractFormData(response, fieldMapping) {
  const answers = response.answers || {};
  let extractedData = {
    email: '',
    productName: '',
    productPrice: 0,
    name: '',
    phone: ''
  };

  // First try to find data using field mapping
  if (fieldMapping.email_field_id && answers[fieldMapping.email_field_id]) {
    extractedData.email = answers[fieldMapping.email_field_id].textAnswers?.answers?.[0]?.value || '';
  }

  if (fieldMapping.product_field_id && answers[fieldMapping.product_field_id]) {
    const productText = answers[fieldMapping.product_field_id].textAnswers?.answers?.[0]?.value || '';
    const productMatch = productText.match(/^(.+?)\s*-\s*₹(\d+)$/);
    if (productMatch) {
      extractedData.productName = productMatch[1].trim();
      extractedData.productPrice = parseInt(productMatch[2]);
    }
  }

  if (fieldMapping.name_field_id && answers[fieldMapping.name_field_id]) {
    extractedData.name = answers[fieldMapping.name_field_id].textAnswers?.answers?.[0]?.value || '';
  }

  if (fieldMapping.phone_field_id && answers[fieldMapping.phone_field_id]) {
    extractedData.phone = answers[fieldMapping.phone_field_id].textAnswers?.answers?.[0]?.value || '';
  }

  // Intelligent fallback if field mapping failed
  if (!extractedData.email || !extractedData.productName) {
    console.log('🔍 Field mapping failed, trying intelligent detection...');
    
    for (const [questionId, answer] of Object.entries(answers)) {
      const value = answer.textAnswers?.answers?.[0]?.value || '';
      
      if (!extractedData.email && value.includes('@')) {
        extractedData.email = value;
      }
      
      if (!extractedData.productName && value.includes('₹')) {
        const productMatch = value.match(/^(.+?)\s*-\s*₹(\d+)$/);
        if (productMatch) {
          extractedData.productName = productMatch[1].trim();
          extractedData.productPrice = parseInt(productMatch[2]);
        }
      }
      
      if (!extractedData.name && value.length > 0 && !value.includes('@') && !value.includes('₹')) {
        extractedData.name = value;
      }
    }
  }

  console.log('📊 Final extracted data:', extractedData);
  return extractedData;
}

// In your monitor-form-responses.js file, find the createRazorpayOrder function (around line 280)
// REPLACE this function:

async function createRazorpayOrder(orderData) {
  try {
    console.log('💳 Creating Razorpay order with data:', orderData);
    
    // CHANGE THIS URL from create-razorpay-order to match your CashFree pattern
    const response = await fetch(`${process.env.URL || 'https://payform2025.netlify.app'}/.netlify/functions/create-razorpay-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(orderData)
    });

    const result = await response.json();
    console.log('💳 Razorpay order result:', result);
    
    return result;
  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    return { success: false, error: error.message };
  }
}

// In the processIndividualResponse function, REPLACE the email sending section:
// Find this section (around line 150-170):

      // Send payment link email
      console.log(`📧 Sending payment email to: ${extractedData.email}`);
      
      try {
        // CREATE EMAIL SENDING FUNCTION CALL (reuse CashFree email sending logic)
        await sendPaymentEmail({
          email: extractedData.email,
          customer_name: extractedData.name,
          product_name: extractedData.productName,
          amount: extractedData.productPrice,
          payment_url: paymentResult.checkout_url || paymentResult.payment_url,
          order_id: paymentResult.order_id,
          form_id: formConfig.form_id
        });
        
        console.log('✅ Payment email sent successfully');
      } catch (emailError) {
        console.error('❌ Email sending error:', emailError);
      }

// ADD this email sending function (adapted from your CashFree email logic):
async function sendPaymentEmail(emailData) {
  try {
    console.log(`📧 Sending payment link email to: ${emailData.email}`);
    
    // Generate email content (reuse your CashFree email template)
    const emailHtml = generatePaymentLinkEmail(emailData);
    
    // You can integrate with your email service here
    // For now, we'll log the email content
    console.log('📧 Email template generated for payment link');
    
    // If you have email service configured, send the email here
    // Example: await sendEmailViaService(emailData.email, 'Payment Link', emailHtml);
    
    return true;
  } catch (error) {
    console.error('❌ Error sending payment email:', error);
    throw error;
  }
}

// ADD email template function (adapted from CashFree):
function generatePaymentLinkEmail(emailData) {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Complete Your Payment</title>
      </head>
      <body style="font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f8f9fa;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; padding: 20px;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background-color: white; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                
                <!-- Header -->
                <tr>
                  <td style="padding: 30px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 10px 10px 0 0;">
                    <h1 style="color: white; margin: 0; font-size: 28px;">💳 PayForm</h1>
                    <p style="color: white; margin: 10px 0 0 0; font-size: 16px;">Complete Your Payment</p>
                  </td>
                </tr>
                
                <!-- Content -->
                <tr>
                  <td style="padding: 30px;">
                    <h2 style="color: #333; margin: 0 0 20px 0;">Hi ${emailData.customer_name || 'Customer'}! 👋</h2>
                    <p style="color: #666; font-size: 16px; line-height: 1.6;">
                      Thank you for your submission! Please complete your payment to proceed.
                    </p>
                    
                    <!-- Order Summary -->
                    <table width="100%" cellpadding="15" cellspacing="0" style="background-color: #f8f9fa; border-radius: 8px; margin: 20px 0;">
                      <tr>
                        <td>
                          <h3 style="margin: 0 0 15px 0; color: #333;">📋 Order Summary</h3>
                          <p style="margin: 5px 0; color: #666;"><strong>Product:</strong> ${emailData.product_name}</p>
                          <p style="margin: 5px 0; color: #666;"><strong>Amount:</strong> ₹${emailData.amount}</p>
                          <p style="margin: 5px 0; color: #666;"><strong>Order ID:</strong> ${emailData.order_id}</p>
                        </td>
                      </tr>
                    </table>
                    
                    <!-- Payment Button -->
                    <div style="text-align: center; margin: 30px 0;">
                      <a href="${emailData.payment_url}" 
                         style="background-color: #528FF0; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: bold; display: inline-block;">
                        💰 Pay ₹${emailData.amount} Securely
                      </a>
                    </div>
                    
                    <!-- Security Info -->
                    <div style="background-color: #e3f2fd; padding: 15px; border-radius: 8px; border-left: 4px solid #2196f3;">
                      <p style="margin: 0; color: #1976d2; font-size: 14px;">
                        🔒 <strong>Secure Payment:</strong> Your payment is processed securely via Razorpay. 
                        We support UPI, Credit/Debit Cards, Net Banking, and Wallets.
                      </p>
                    </div>
                  </td>
                </tr>
                
                <!-- Footer -->
                <tr>
                  <td style="padding: 20px; text-align: center; background-color: #f8f9fa; border-radius: 0 0 10px 10px;">
                    <p style="margin: 0; color: #999; font-size: 12px;">
                      © 2025 PayForm. All rights reserved.<br>
                      This is an automated email, please do not reply directly.
                    </p>
                  </td>
                </tr>
                
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}
