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

// Auto-refresh expired tokens
const ensureValidToken = async (supabase, adminId) => {
  try {
    const { data: tokenData } = await supabase
      .from('google_auth_tokens')
      .select('*')
      .eq('admin_id', adminId)
      .single();

    if (!tokenData) return false;

    const expiresAt = new Date(tokenData.token_expires_at);
    const now = new Date();
    const isExpired = expiresAt <= now;

    if (isExpired) {
      console.log(`🔄 Auto-refreshing expired token for admin ${adminId}`);
      
      // Call your refresh token function
      const response = await fetch(`${process.env.URL}/.netlify/functions/google-oauth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'refreshToken',
          adminId: adminId
        })
      });

      const result = await response.json();
      
      if (result.success) {
        console.log(`✅ Token auto-refreshed for admin ${adminId}`);
        return true;
      } else {
        console.log(`❌ Token refresh failed for admin ${adminId}`);
        return false;
      }
    }

    return true; // Token is still valid
  } catch (error) {
    console.error(`❌ Error checking token for admin ${adminId}:`, error);
    return false;
  }
};

// Get all active forms with field mappings and Google authentication
const getActiveFormsWithAuth = async () => {
  try {
    console.log('🔍 Looking for active forms with authentication...');
    
    // Get active forms first
    const { data: forms, error: formsError } = await supabase
      .from('form_configs')
      .select('*')
      .eq('is_active', true);

    if (formsError) {
      console.error('❌ Error fetching forms:', formsError);
      throw formsError;
    }

    console.log(`📋 Found ${forms?.length || 0} active forms`);

    if (!forms || forms.length === 0) {
      console.log('⚠️ No active forms found in database');
      return [];
    }

    // Log each form for debugging
    forms.forEach((form, index) => {
      console.log(`📝 Form ${index + 1}: ${form.form_name} (ID: ${form.form_id})`);
      console.log(`   Admin ID: ${form.admin_id}`);
      console.log(`   Active: ${form.is_active}`);
    });

    // Get authentication status for each form admin
    const formsWithAuth = [];
    
    for (const form of forms) {
      console.log(`🔐 Checking auth for admin: ${form.admin_id}`);
      
      // Check if this admin has Google auth tokens
      const { data: authData, error: authError } = await supabase
        .from('google_auth_tokens')
        .select('*')
        .eq('admin_id', form.admin_id)
        .single();

      if (authError) {
        console.log(`⚠️ No auth tokens for admin ${form.admin_id}:`, authError.message);
        continue;
      }

      if (!authData) {
        console.log(`⚠️ No auth tokens found for admin ${form.admin_id}`);
        continue;
      }

      console.log(`✅ Found auth tokens for admin ${form.admin_id}`);
      
      // Check if token is valid (not expired)
      const expiresAt = new Date(authTokens.token_expires_at);
      const now = new Date();
      const isExpired = expiresAt <= now;
      
      console.log(`🕐 Token expires at: ${expiresAt.toISOString()}`);
      console.log(`🕐 Current time: ${now.toISOString()}`);
      console.log(`🔍 Token expired: ${isExpired}`);

if (isExpired) {
  console.log(`⚠️ Token expired for admin ${form.admin_id}, attempting auto-refresh...`);
  
  // Auto-refresh the token
  const refreshSuccess = await ensureValidToken(supabase, form.admin_id);
  
  if (!refreshSuccess) {
    console.log(`❌ Auto-refresh failed for admin ${form.admin_id}, skipping`);
    continue;
  }
  
  console.log(`✅ Token auto-refreshed for admin ${form.admin_id}`);
  
  // Re-fetch the updated token after refresh
  const { data: refreshedTokens, error: refreshError } = await supabase
    .from('google_auth_tokens')
    .select('*')
    .eq('admin_id', form.admin_id)
    .single();
    
  if (refreshError || !refreshedTokens) {
    console.log(`❌ Failed to get refreshed token for admin ${form.admin_id}:`, refreshError?.message);
    continue;
  }
  
  console.log(`✅ Using refreshed token for admin ${form.admin_id}`);
  authTokens = refreshedTokens; // Use the refreshed token
  
  // Update expiry check with new token
  const newExpiresAt = new Date(refreshedTokens.token_expires_at);
  const newIsExpired = newExpiresAt <= new Date();
  
  if (newIsExpired) {
    console.log(`❌ Refreshed token still expired for admin ${form.admin_id}, skipping`);
    continue;
  }
}
      
      // Get field mappings for this form
      const { data: fieldMapping, error: mappingError } = await supabase
        .from('form_field_mappings')
        .select('*')
        .eq('form_id', form.form_id)
        .single();

      if (mappingError || !fieldMapping) {
        console.log(`⚠️ No field mapping for form ${form.form_id}:`, mappingError?.message);
        continue;
      }

      console.log(`✅ Found field mapping for form ${form.form_id}`);

      // Get admin info
      const { data: adminInfo, error: adminError } = await supabase
        .from('form_admins')
        .select('email, name')
        .eq('id', form.admin_id)
        .single();

      if (adminError || !adminInfo) {
        console.log(`⚠️ No admin info for ${form.admin_id}:`, adminError?.message);
        continue;
      }

      console.log(`✅ Found admin info for ${form.admin_id}: ${adminInfo.email}`);

      // Add form with all required data
      formsWithAuth.push({
        ...form,
        form_field_mappings: [fieldMapping],
        form_admins: [adminInfo],
        google_auth_tokens: [authTokens]
      });

      console.log(`✅ Form ${form.form_name} added to monitoring list`);
    }

    console.log(`🎯 Final result: ${formsWithAuth.length} forms with complete setup`);
    return formsWithAuth;

  } catch (error) {
    console.error('❌ Error getting forms with auth:', error);
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

// Extract payment data from Google Form response with smart field detection
const extractPaymentDataFromResponse = (response, fieldMapping, form) => {
  try {
    console.log(`🔍 Smart payment detection for response: ${response.responseId}`);
    const answers = response.answers || {};
    
    // Step 1: Try to find payment field using smart detection
    let productName = null;
    let productPrice = 0;
    let paymentFieldFound = false;
    
    // Method 1: Try mapped field first if exists
    if (fieldMapping?.product_field_id) {
      const mappedFieldId = fieldMapping.product_field_id.replace('entry.', '');
      const mappedValue = answers[mappedFieldId]?.textAnswers?.answers?.[0]?.value;
      
      if (mappedValue) {
        console.log(`📋 Trying mapped field ${mappedFieldId}: ${mappedValue}`);
        const mappedMatch = mappedValue.match(/^(.+?)\s*-\s*₹(\d+)$/);
        if (mappedMatch) {
          productName = mappedMatch[1].trim();
          productPrice = parseInt(mappedMatch[2]);
          paymentFieldFound = true;
          console.log(`✅ Found payment data in mapped field: ${productName} - ₹${productPrice}`);
        }
      }
    }
    
    // Method 2: Smart detection - scan ALL fields for ₹ pattern if mapping failed
    if (!paymentFieldFound) {
      console.log('🔍 Scanning all fields for ₹ pattern...');
      
      for (const [fieldId, answerData] of Object.entries(answers)) {
        const value = answerData.textAnswers?.answers?.[0]?.value;
        
        if (value && typeof value === 'string') {
          console.log(`🔍 Checking field ${fieldId}: ${value}`);
          
          // Look for pattern: "Something - ₹Number"
          const patterns = [
            /^(.+?)\s*-\s*₹(\d+)$/, // "Product - ₹999"
            /^(.+?)\s*₹(\d+)$/, // "Product ₹999"
            /^(.+?)\s*-\s*Rs\.?\s*(\d+)$/, // "Product - Rs.999"
          ];
          
          for (const pattern of patterns) {
            const match = value.match(pattern);
            if (match) {
              productName = match[1].trim();
              productPrice = parseInt(match[2]);
              paymentFieldFound = true;
              console.log(`✅ FOUND payment field! Field ${fieldId}: ${productName} - ₹${productPrice}`);
              break;
            }
          }
          
          if (paymentFieldFound) break;
        }
      }
    }
    
    // Step 2: Extract other fields with smart detection fallback
    let email = null;
    let customerName = null;
    let phone = null;
    
    // Try mapped email field first
    if (fieldMapping?.email_field_id) {
      const emailFieldId = fieldMapping.email_field_id.replace('entry.', '');
      email = answers[emailFieldId]?.textAnswers?.answers?.[0]?.value;
    }
    
    // Auto-detect email if mapping failed
    if (!email) {
      for (const [fieldId, answerData] of Object.entries(answers)) {
        const value = answerData.textAnswers?.answers?.[0]?.value;
        if (value && value.includes('@') && value.includes('.')) {
          email = value;
          console.log(`📧 Auto-detected email in field ${fieldId}: ${email}`);
          break;
        }
      }
    }
    
    // Try mapped name field first
    if (fieldMapping?.name_field_id) {
      const nameFieldId = fieldMapping.name_field_id.replace('entry.', '');
      customerName = answers[nameFieldId]?.textAnswers?.answers?.[0]?.value;
    }
    
    // Auto-detect name if mapping failed
    if (!customerName) {
      for (const [fieldId, answerData] of Object.entries(answers)) {
        const value = answerData.textAnswers?.answers?.[0]?.value;
        if (value && 
            !value.includes('@') && 
            !value.includes('₹') && 
            !/^\d+$/.test(value) && 
            !value.includes('Cashfree') &&
            value.length > 1 && 
            value.length < 50) {
          customerName = value;
          console.log(`👤 Auto-detected name in field ${fieldId}: ${customerName}`);
          break;
        }
      }
    }
    
    // Try mapped phone field
    if (fieldMapping?.phone_field_id) {
      const phoneFieldId = fieldMapping.phone_field_id.replace('entry.', '');
      phone = answers[phoneFieldId]?.textAnswers?.answers?.[0]?.value;
    }
    
    // Auto-detect phone if mapping failed
    if (!phone) {
      for (const [fieldId, answerData] of Object.entries(answers)) {
        const value = answerData.textAnswers?.answers?.[0]?.value;
        if (value && /^\d{10,}$/.test(value.replace(/\s|-/g, ''))) {
          phone = value;
          console.log(`📞 Auto-detected phone in field ${fieldId}: ${phone}`);
          break;
        }
      }
    }

    const result = {
      email: email?.trim() || '',
      productName: productName?.trim() || '',
      productPrice: productPrice || 0,
      customerName: customerName?.trim() || 'Customer',
      phone: phone?.trim() || '',
      responseId: response.responseId,
      submittedAt: response.createTime,
      formId: form.form_id,
      formName: form.form_name
    };
    
    console.log(`📊 Extracted data:`, result);
    return result;

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
        paymentLink: result.checkout_url
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
