// netlify/functions/monitor-form-responses.js - PRODUCTION VERSION
const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');

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
  console.log('🔍 Starting production form response monitoring...');
  console.log('Time:', new Date().toISOString());

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // Get all active forms with field mappings and valid Google auth
    const activeForms = await getActiveFormsWithAuth();
    console.log(`📊 Found ${activeForms.length} active forms with Google auth`);

    if (activeForms.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'No active forms with Google authentication found',
          stats: { formsMonitored: 0, responsesProcessed: 0, errors: 0 }
        })
      };
    }

    let totalProcessed = 0;
    let totalErrors = 0;
    const processingResults = [];

    // Process each active form
    for (const form of activeForms) {
      try {
        console.log(`🔄 Processing form: ${form.form_name} (${form.form_id})`);
        
        const result = await processFormResponses(form);
        totalProcessed += result.processedCount;
        
        processingResults.push({
          formId: form.form_id,
          formName: form.form_name,
          processedCount: result.processedCount,
          status: 'success'
        });

        console.log(`✅ Processed ${result.processedCount} responses for ${form.form_name}`);

      } catch (error) {
        console.error(`❌ Error processing form ${form.form_id}:`, error);
        totalErrors++;
        
        processingResults.push({
          formId: form.form_id,
          formName: form.form_name,
          processedCount: 0,
          status: 'error',
          error: error.message
        });
      }
    }

    // Log monitoring summary
    await logMonitoringActivity({
      formsMonitored: activeForms.length,
      responsesProcessed: totalProcessed,
      errors: totalErrors,
      timestamp: new Date().toISOString(),
      results: processingResults
    });

    console.log(`🎯 Monitoring completed: ${totalProcessed} responses processed, ${totalErrors} errors`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Production monitoring completed successfully',
        stats: {
          formsMonitored: activeForms.length,
          responsesProcessed: totalProcessed,
          errors: totalErrors
        },
        results: processingResults
      })
    };

  } catch (error) {
    console.error('❌ Production monitor service error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Production monitoring service failed',
        message: error.message
      })
    };
  }
};

// Get all active forms with field mappings and Google authentication
const getActiveFormsWithAuth = async () => {
  try {
    // First get active forms
    const { data: forms, error: formsError } = await supabase
      .from('form_configs')
      .select('*')
      .eq('is_active', true);

    if (formsError) throw formsError;

    console.log(`📋 Found ${forms?.length || 0} active forms`);

    if (!forms || forms.length === 0) {
      return [];
    }

    // Get field mappings for each form
    const formsWithMappings = [];
    
    for (const form of forms) {
      // Get field mapping
      const { data: fieldMapping } = await supabase
        .from('form_field_mappings')
        .select('*')
        .eq('form_id', form.form_id)
        .single();

      // Get admin info
      const { data: adminInfo } = await supabase
        .from('form_admins')
        .select('email, name')
        .eq('id', form.admin_id)
        .single();

      // Get Google auth token
      const { data: authToken } = await supabase
        .from('google_auth_tokens')
        .select('access_token, refresh_token')
        .eq('admin_id', form.admin_id)
        .single();

      // Only include forms with complete setup
      if (fieldMapping && adminInfo && authToken) {
        formsWithMappings.push({
          ...form,
          form_field_mappings: [fieldMapping],
          form_admins: [adminInfo],
          google_auth_tokens: [authToken]
        });
      } else {
        console.warn(`⚠️ Form ${form.form_name} missing required data:`, {
          hasFieldMapping: !!fieldMapping,
          hasAdminInfo: !!adminInfo,
          hasAuthToken: !!authToken
        });
      }
    }

    console.log(`✅ ${formsWithMappings.length} forms have complete setup`);
    return formsWithMappings;

  } catch (error) {
    console.error('❌ Error getting active forms with auth:', error);
    return [];
  }
};

// Process responses for a specific form using real Google Forms API
const processFormResponses = async (form) => {
  try {
    console.log(`📥 Fetching responses for ${form.form_name}...`);

    // Get new responses from Google Forms API
    const responses = await fetchFormResponsesFromAPI(form.form_id, form.admin_id);
    
    if (!responses || responses.length === 0) {
      console.log(`ℹ️ No new responses found for ${form.form_name}`);
      return { processedCount: 0 };
    }

    console.log(`🆕 Found ${responses.length} new responses for ${form.form_name}`);

    let processedCount = 0;
    const fieldMapping = form.form_field_mappings[0];

    // Process each new response
    for (const response of responses) {
      try {
        // Extract payment data using field mappings
        const paymentData = extractPaymentDataFromResponse(response, fieldMapping, form);
        
        if (isValidPaymentData(paymentData)) {
          // Create Cashfree order
          const orderResult = await createPaymentOrder(paymentData, form.admin_id);
          
          if (orderResult.success) {
            // Send payment email
            await sendPaymentEmail(paymentData, orderResult.paymentLink, form.form_admins[0]);
            
            // Mark response as processed
            await markResponseProcessed(response.responseId, form.form_id, orderResult.orderId);
            
            processedCount++;
            console.log(`✅ Payment processed for ${paymentData.email} - Order: ${orderResult.orderId}`);
          } else {
            console.error(`❌ Failed to create payment order for ${paymentData.email}:`, orderResult.error);
          }
        } else {
          console.warn(`⚠️ Invalid payment data for response ${response.responseId} - skipping`);
        }

      } catch (responseError) {
        console.error(`❌ Error processing response ${response.responseId}:`, responseError);
      }
    }

    return { processedCount };

  } catch (error) {
    console.error(`❌ Error processing form ${form.form_id}:`, error);
    throw error;
  }
};

// Fetch form responses from Google Forms API
const fetchFormResponsesFromAPI = async (formId, adminId) => {
  try {
    console.log(`🔍 Fetching responses for form ${formId} with admin ${adminId}`);
    
    const response = await fetch(`${process.env.URL}/.netlify/functions/google-forms-api`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'getFormResponses',
        formId: formId,
        adminId: adminId
      })
    });

    console.log(`📡 API Response status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ API Error: ${response.status} ${errorText}`);
      throw new Error(`API Error: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    console.log(`📝 API Result:`, result);

    if (!result.success) {
      if (result.requiresAuth) {
        console.warn(`🔐 Google authentication required for form ${formId}`);
        return [];
      }
      throw new Error(result.error || 'Failed to fetch responses');
    }

    return result.data?.responses || [];

  } catch (error) {
    console.error('❌ Error fetching form responses from API:', error);
    return [];
  }
};

// Extract payment data from Google Form response
const extractPaymentDataFromResponse = (response, fieldMapping, form) => {
  try {
    const answers = response.answers || {};
    
    // Extract data based on field mappings
    const email = answers[fieldMapping.email_field_id]?.textAnswers?.answers?.[0]?.value || '';
    const productResponse = answers[fieldMapping.product_field_id]?.textAnswers?.answers?.[0]?.value || '';
    const customerName = answers[fieldMapping.name_field_id]?.textAnswers?.answers?.[0]?.value || '';
    const phone = answers[fieldMapping.phone_field_id]?.textAnswers?.answers?.[0]?.value || '';

    // Parse product and price from response like "Course - ₹2999"
    const productMatch = productResponse.match(/^(.+?)\s*-\s*₹(\d+)$/);
    const productName = productMatch ? productMatch[1].trim() : productResponse;
    const productPrice = productMatch ? parseInt(productMatch[2]) : 0;

    return {
      email: email.trim(),
      productName: productName.trim(),
      productPrice: productPrice,
      customerName: customerName.trim(),
      phone: phone.trim(),
      responseId: response.responseId,
      submittedAt: response.createTime,
      formId: form.form_id,
      formName: form.form_name
    };

  } catch (error) {
    console.error('Error extracting payment data:', error);
    return {};
  }
};

// Validate payment data completeness
const isValidPaymentData = (paymentData) => {
  return !!(
    paymentData.email && 
    paymentData.productName && 
    paymentData.productPrice > 0 &&
    paymentData.email.includes('@')
  );
};

// Create Cashfree payment order
const createPaymentOrder = async (paymentData, adminId) => {
  try {
    const response = await fetch(`${process.env.URL}/.netlify/functions/create-cashfree-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        form_id: paymentData.formId,
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
const sendPaymentEmail = async (paymentData, paymentLink, adminInfo) => {
  try {
    console.log(`📧 Sending payment email to ${paymentData.email}`);

    // Email template
    const emailHtml = generatePaymentEmailTemplate(paymentData, paymentLink, adminInfo);

    // For production, you would integrate with your email service here
    // Options: Gmail API, SendGrid, Mailgun, AWS SES, etc.
    
    // For now, log the email content (replace with actual email sending)
    console.log(`📧 Payment email details:`);
    console.log(`To: ${paymentData.email}`);
    console.log(`Subject: Complete your payment - ${paymentData.productName}`);
    console.log(`Payment Link: ${paymentLink}`);
    
    // TODO: Replace with actual email sending service
    // await sendEmailViaService(paymentData.email, 'Payment Required', emailHtml);

    return { success: true };

  } catch (error) {
    console.error('Error sending payment email:', error);
    return { success: false, error: error.message };
  }
};

// Generate payment email HTML template
const generatePaymentEmailTemplate = (paymentData, paymentLink, adminInfo) => {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      <h2 style="color: #2563eb;">Payment Required - ${paymentData.productName}</h2>
      
      <p>Hello ${paymentData.customerName || 'Customer'}! 👋</p>
      
      <p>Thank you for your form submission. Please complete your payment to proceed:</p>
      
      <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin: 0; color: #495057;">Order Summary:</h3>
        <p style="margin: 10px 0;"><strong>Product:</strong> ${paymentData.productName}</p>
        <p style="margin: 10px 0;"><strong>Amount:</strong> ₹${paymentData.productPrice}</p>
        <p style="margin: 10px 0;"><strong>Form:</strong> ${paymentData.formName}</p>
      </div>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${paymentLink}" 
           style="background-color: #10b981; color: white; padding: 15px 30px; 
                  text-decoration: none; border-radius: 5px; font-size: 16px; font-weight: bold;">
          💰 Pay ₹${paymentData.productPrice} Securely
        </a>
      </div>
      
      <p style="font-size: 14px; color: #666;">
        🔒 Secure payment powered by Cashfree<br>
        💳 UPI, Cards, Net Banking & Wallets accepted
      </p>
      
      <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
      
      <p style="font-size: 12px; color: #999;">
        This email was sent from PayForm for ${adminInfo?.name || 'Form Admin'}<br>
        If you have questions, please reply to this email.
      </p>
    </div>
  `;
};

// Mark response as processed to prevent duplicates
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
    // Ignore duplicate key errors (response already processed)
    if (!error.message.includes('duplicate key')) {
      console.error('Error marking response as processed:', error);
    }
  }
};

// Log monitoring activity for debugging and analytics
const logMonitoringActivity = async (activity) => {
  try {
    await supabase
      .from('monitoring_logs')
      .insert({
        activity_type: 'form_monitoring',
        activity_data: activity,
        created_at: new Date().toISOString()
      });
  } catch (error) {
    console.error('Error logging monitoring activity:', error);
    // Don't throw - logging is not critical
  }
};
