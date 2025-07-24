// netlify/functions/monitor-form-responses.js
const { createClient } = require('@supabase/supabase-js');

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

exports.handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    console.log('🔍 Starting form response monitoring...');
    
    // Get all active forms with field mappings
    const activeForms = await getActiveFormsWithMappings();
    console.log(`📊 Found ${activeForms.length} active forms to monitor`);

    let processedCount = 0;
    let errorCount = 0;

    // Process each active form
    for (const form of activeForms) {
      try {
        const newResponsesCount = await processFormResponses(form);
        processedCount += newResponsesCount;
        console.log(`✅ Processed ${newResponsesCount} responses for form ${form.form_id}`);
      } catch (error) {
        console.error(`❌ Error processing form ${form.form_id}:`, error);
        errorCount++;
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Monitoring completed',
        stats: {
          formsMonitored: activeForms.length,
          responsesProcessed: processedCount,
          errors: errorCount
        }
      })
    };

  } catch (error) {
    console.error('❌ Monitor service error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Monitoring service failed',
        message: error.message
      })
    };
  }
};

// Get all active forms with their field mappings
const getActiveFormsWithMappings = async () => {
  try {
    const { data: forms, error } = await supabase
      .from('form_configs')
      .select(`
        id,
        form_id,
        form_name,
        admin_id,
        form_field_mappings (
          email_field_id,
          product_field_id,
          name_field_id,
          phone_field_id
        )
      `)
      .eq('is_active', true);

    if (error) throw error;

    // Filter forms that have field mappings
    return forms?.filter(form => 
      form.form_field_mappings && 
      form.form_field_mappings.length > 0
    ) || [];

  } catch (error) {
    console.error('Error getting active forms:', error);
    return [];
  }
};

// Process responses for a specific form
const processFormResponses = async (form) => {
  try {
    // Get new responses from Google Forms API
    const responses = await fetchFormResponses(form.form_id);
    
    if (!responses || responses.length === 0) {
      return 0; // No new responses
    }

    let processedCount = 0;

    // Process each new response
    for (const response of responses) {
      try {
        // Check if already processed
        const isProcessed = await isResponseProcessed(response.responseId, form.form_id);
        if (isProcessed) {
          continue;
        }

        // Extract payment data using field mappings
        const paymentData = extractPaymentData(response, form.form_field_mappings[0]);
        
        if (paymentData.email && paymentData.productName && paymentData.productPrice) {
          // Create Cashfree order
          const orderResult = await createPaymentOrder(paymentData, form.admin_id);
          
          if (orderResult.success) {
            // Send payment email
            await sendPaymentEmail(paymentData, orderResult.paymentLink);
            
            // Mark response as processed
            await markResponseProcessed(response.responseId, form.form_id, orderResult.orderId);
            
            processedCount++;
            console.log(`✅ Processed payment for ${paymentData.email}`);
          }
        } else {
          console.warn(`⚠️ Incomplete payment data for response ${response.responseId}`);
        }

      } catch (responseError) {
        console.error(`❌ Error processing response ${response.responseId}:`, responseError);
      }
    }

    return processedCount;

  } catch (error) {
    console.error(`Error processing form ${form.form_id}:`, error);
    return 0;
  }
};

// Fetch form responses from Google Forms API
const fetchFormResponses = async (formId) => {
  try {
    // In production, this would call Google Forms API:
    // const response = await fetch(`https://forms.googleapis.com/v1/forms/${formId}/responses`, {
    //   headers: { 'Authorization': `Bearer ${accessToken}` }
    // });
    
    // For now, return empty array (no new responses)
    return [];

  } catch (error) {
    console.error('Error fetching form responses:', error);
    return [];
  }
};

// Extract payment data from form response using field mappings
const extractPaymentData = (response, fieldMappings) => {
  try {
    const answers = response.answers || {};
    
    // Extract data based on field mappings
    const email = answers[fieldMappings.email_field_id]?.textAnswers?.answers?.[0]?.value || '';
    const productResponse = answers[fieldMappings.product_field_id]?.textAnswers?.answers?.[0]?.value || '';
    const customerName = answers[fieldMappings.name_field_id]?.textAnswers?.answers?.[0]?.value || '';
    const phone = answers[fieldMappings.phone_field_id]?.textAnswers?.answers?.[0]?.value || '';

    // Parse product and price from response like "Course - ₹2999"
    const productMatch = productResponse.match(/^(.+?)\s*-\s*₹(\d+)$/);
    const productName = productMatch ? productMatch[1].trim() : productResponse;
    const productPrice = productMatch ? parseInt(productMatch[2]) : 0;

    return {
      email,
      productName,
      productPrice,
      customerName,
      phone,
      responseId: response.responseId,
      submittedAt: response.createTime
    };

  } catch (error) {
    console.error('Error extracting payment data:', error);
    return {};
  }
};

// Check if response has already been processed
const isResponseProcessed = async (responseId, formId) => {
  try {
    const { data, error } = await supabase
      .from('processed_form_responses')
      .select('id')
      .eq('response_id', responseId)
      .eq('form_id', formId)
      .single();

    return !!data;
  } catch (error) {
    return false; // Assume not processed if error
  }
};

// Mark response as processed
const markResponseProcessed = async (responseId, formId, orderId) => {
  try {
    await supabase
      .from('processed_form_responses')
      .insert({
        response_id: responseId,
        form_id: formId,
        cashfree_order_id: orderId,
        processed_at: new Date().toISOString()
      });
  } catch (error) {
    console.error('Error marking response as processed:', error);
  }
};

// Create Cashfree payment order
const createPaymentOrder = async (paymentData, adminId) => {
  try {
    // Call existing create-cashfree-order function
    const response = await fetch(`${process.env.URL}/.netlify/functions/create-cashfree-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        form_id: paymentData.formId || 'monitor-service',
        email: paymentData.email,
        product_name: paymentData.productName,
        product_price: paymentData.productPrice,
        customer_name: paymentData.customerName,
        admin_id: adminId
      })
    });

    const result = await response.json();
    
    if (result.success) {
      return {
        success: true,
        orderId: result.order_id,
        paymentLink: result.payment_url
      };
    } else {
      throw new Error(result.error || 'Failed to create payment order');
    }

  } catch (error) {
    console.error('Error creating payment order:', error);
    return { success: false, error: error.message };
  }
};

// Send payment email to customer
const sendPaymentEmail = async (paymentData, paymentLink) => {
  try {
    // This would integrate with your email service
    // For now, just log the email details
    console.log(`📧 Would send payment email to ${paymentData.email}:`);
    console.log(`Product: ${paymentData.productName}`);
    console.log(`Amount: ₹${paymentData.productPrice}`);
    console.log(`Payment Link: ${paymentLink}`);
    
    // In production, you could use:
    // - Gmail API (like your current Apps Script)
    // - SendGrid, Mailgun, or other email service
    // - AWS SES, etc.

    return { success: true };

  } catch (error) {
    console.error('Error sending payment email:', error);
    return { success: false, error: error.message };
  }
};
