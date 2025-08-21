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

async function createRazorpayOrder(orderData) {
  try {
    console.log('💳 Creating Razorpay order with data:', orderData);
    
    // Call your existing create-razorpay-order function
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
