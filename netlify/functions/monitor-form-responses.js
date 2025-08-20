// netlify/functions/monitor-form-responses.js - FIXED VERSION
const { createClient } = require('@supabase/supabase-js');
const { google } = require('googleapis');

exports.handler = async (event, context) => {
  console.log('=== Form Response Monitoring Started ===');
  
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get form configs with admin details (separate queries)
    const { data: formConfigs, error: configError } = await supabase
      .from('form_configs')
      .select(`
        *,
        form_admins (
          id,
          email,
          name
        )
      `)
      .eq('is_active', true);

    if (configError) {
      throw new Error(`Error fetching form configs: ${configError.message}`);
    }

    if (!formConfigs || formConfigs.length === 0) {
      console.log('No active forms to monitor');
      return { statusCode: 200, body: 'No active forms' };
    }

    console.log(`Monitoring ${formConfigs.length} active forms`);

    // Process each form
    for (const formConfig of formConfigs) {
      try {
        await processFormResponses(formConfig, supabase);
      } catch (error) {
        console.error(`Error processing form ${formConfig.form_id}:`, error);
        
        // Log the error but continue with other forms
        await supabase.from('monitoring_logs').insert({
          activity_type: 'form_monitoring_error',
          activity_data: {
            form_id: formConfig.form_id,
            error: error.message,
            admin_id: formConfig.admin_id
          }
        });
      }
    }

    console.log('=== Form Response Monitoring Completed ===');
    return { statusCode: 200, body: 'Monitoring completed successfully' };

  } catch (error) {
    console.error('Fatal error in monitoring:', error);
    return { statusCode: 500, body: `Error: ${error.message}` };
  }
};

async function processFormResponses(formConfig, supabase) {
  const { form_id, form_admins: formAdmin } = formConfig;
  
  console.log(`Processing form: ${form_id} (Admin: ${formAdmin.email})`);

  // Get field mapping separately to avoid relationship issues
  const { data: fieldMappings } = await supabase
    .from('form_field_mappings')
    .select('*')
    .eq('form_id', form_id);

  if (!fieldMappings || fieldMappings.length === 0) {
    console.log(`No field mapping found for form ${form_id}`);
    return;
  }

  const mapping = fieldMappings[0];

  // Get Google access token for this admin
  const { data: authToken } = await supabase
    .from('google_auth_tokens')
    .select('access_token, refresh_token')
    .eq('admin_id', formAdmin.id)
    .single();

  if (!authToken) {
    console.log(`No Google auth token for admin ${formAdmin.email}`);
    return;
  }

  // Initialize Google Forms API
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    access_token: authToken.access_token,
    refresh_token: authToken.refresh_token
  });

  const forms = google.forms({ version: 'v1', auth: oauth2Client });

  try {
    // Get form responses
    const response = await forms.forms.responses.list({
      formId: form_id
    });

    const responses = response.data.responses || [];
    console.log(`Found ${responses.length} total responses for form ${form_id}`);

    // Process each response
    for (const formResponse of responses) {
      await processIndividualResponse(formResponse, formConfig, mapping, supabase);
    }

  } catch (error) {
    if (error.code === 403) {
      console.log(`Access denied for form ${form_id}. Admin may need to re-authorize.`);
    } else {
      throw error;
    }
  }
}

async function processIndividualResponse(formResponse, formConfig, mapping, supabase) {
  const responseId = formResponse.responseId;
  const { form_id, form_admins: formAdmin } = formConfig;

  // Check if already processed
  const { data: existingResponse } = await supabase
    .from('processed_form_responses')
    .select('id')
    .eq('response_id', responseId)
    .eq('form_id', form_id)
    .single();

  if (existingResponse) {
    return; // Already processed
  }

  console.log(`Processing new response: ${responseId}`);

  // Extract response data
  const answers = formResponse.answers || {};
  const responseData = extractResponseData(answers, mapping);

  if (!responseData.email || !responseData.product) {
    console.log(`Incomplete response data for ${responseId}:`, responseData);
    return;
  }

  // Parse product details
  const productMatch = responseData.product.match(/^(.+?)\s*-\s*₹(\d+)$/);
  if (!productMatch) {
    console.log(`Invalid product format: ${responseData.product}`);
    return;
  }

  const productName = productMatch[1].trim();
  const productPrice = parseInt(productMatch[2]);

  console.log(`Creating payment for: ${responseData.email}, Product: ${productName}, Price: ₹${productPrice}`);

  // 🆕 FIXED: Always use Razorpay for all payments
  console.log('Using Razorpay for payment processing');
  
  let paymentResult;
  
  try {
    // Create Razorpay order
    paymentResult = await createRazorpayOrder({
      form_id,
      email: responseData.email,
      product_name: productName,
      product_price: productPrice,
      customer_name: responseData.name,
      phone: responseData.phone
    });

    if (paymentResult.success) {
      // Mark response as processed
      await supabase.from('processed_form_responses').insert({
        response_id: responseId,
        form_id: form_id,
        order_id: paymentResult.order_id,
        payment_provider: 'razorpay',
        processed_at: new Date().toISOString()
      });

      // Send email notification
      await sendPaymentEmail({
        email: responseData.email,
        name: responseData.name,
        product_name: productName,
        product_price: productPrice,
        payment_url: paymentResult.payment_url,
        order_id: paymentResult.order_id
      });

      console.log(`✅ Razorpay payment created successfully: ${paymentResult.order_id}`);

      // Log successful processing
      await supabase.from('monitoring_logs').insert({
        activity_type: 'payment_created',
        activity_data: {
          response_id: responseId,
          form_id: form_id,
          email: responseData.email,
          product_name: productName,
          amount: productPrice,
          gateway: 'razorpay',
          order_id: paymentResult.order_id
        }
      });

    } else {
      throw new Error(paymentResult.error || 'Payment creation failed');
    }

  } catch (error) {
    console.error(`Error creating payment for response ${responseId}:`, error);
    
    // Log the error
    await supabase.from('monitoring_logs').insert({
      activity_type: 'payment_creation_error',
      activity_data: {
        response_id: responseId,
        form_id: form_id,
        email: responseData.email,
        error: error.message,
        gateway: 'razorpay'
      }
    });
    
    throw error; // Re-throw to trigger error handling in parent function
  }
}

function extractResponseData(answers, mapping) {
  // DEBUG: Log the actual response structure
  console.log('=== DEBUG: Response Structure ===');
  console.log('Available answer keys:', Object.keys(answers));
  console.log('Field mapping being used:', JSON.stringify(mapping, null, 2));
  console.log('First answer sample:', JSON.stringify(Object.values(answers)[0], null, 2));
  
  const data = {
    email: '',
    product: '',
    name: '',
    phone: ''
  };

  // Enhanced extraction that handles multiple ID formats
  const answerKeys = Object.keys(answers);
  
  // Try to extract email
  data.email = extractFieldValue(answers, mapping.email_field_id, answerKeys) || '';
  
  // Try to extract product
  data.product = extractFieldValue(answers, mapping.product_field_id, answerKeys) || '';
  
  // Try to extract name
  data.name = extractFieldValue(answers, mapping.name_field_id, answerKeys) || '';
  
  // Try to extract phone
  data.phone = extractFieldValue(answers, mapping.phone_field_id, answerKeys) || '';

  // If still empty, try intelligent field detection
  if (!data.email || !data.product) {
    console.log('Trying intelligent field detection...');
    const intelligentData = intelligentFieldDetection(answers, answerKeys);
    if (intelligentData.email) data.email = intelligentData.email;
    if (intelligentData.product) data.product = intelligentData.product;
    if (intelligentData.name) data.name = intelligentData.name;
  }

  console.log('Extracted data:', data);
  return data;
}

// Helper function to extract field value with multiple ID format support
function extractFieldValue(answers, fieldId, answerKeys) {
  if (!fieldId) return '';
  
  // Method 1: Direct match (for questionId format)
  if (answers[fieldId]) {
    return answers[fieldId].textAnswers?.answers?.[0]?.value || '';
  }
  
  // Method 2: Try numeric index (for 0,1,2 format)
  if (!isNaN(fieldId) && answerKeys[parseInt(fieldId)]) {
    const key = answerKeys[parseInt(fieldId)];
    return answers[key].textAnswers?.answers?.[0]?.value || '';
  }
  
  // Method 3: Entry-based lookup - just log for debugging
  console.log(`Could not find field for ID: ${fieldId}`);
  return '';
}

// Intelligent field detection based on content patterns
function intelligentFieldDetection(answers, answerKeys) {
  const result = { email: '', product: '', name: '' };
  
  answerKeys.forEach(key => {
    const value = answers[key].textAnswers?.answers?.[0]?.value || '';
    
    // Email detection
    if (value.includes('@') && !result.email) {
      result.email = value;
    }
    
    // Product detection (contains currency symbol)
    if (value.includes('₹') && !result.product) {
      result.product = value;
    }
    
    // Name detection (basic heuristic)
    if (!result.name && value.length > 2 && value.length < 50 && 
        !value.includes('@') && !value.includes('₹') && !value.includes('+')) {
      result.name = value;
    }
  });
  
  return result;
}

// Create Razorpay order using your working function
async function createRazorpayOrder(orderData) {
  try {
    console.log('🔄 Calling create-razorpay-order function...');
    
    const response = await fetch(`${process.env.URL}/.netlify/functions/create-razorpay-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderData)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    console.log('🔄 Razorpay order result:', result);
    
    if (result.success) {
      return {
        success: true,
        order_id: result.order_id,
        payment_url: result.payment_url,
        amount: result.amount,
        currency: result.currency
      };
    } else {
      throw new Error(result.error || 'Unknown error from Razorpay function');
    }
  } catch (error) {
    console.error('❌ Razorpay order creation failed:', error);
    return { success: false, error: error.message };
  }
}

// Send payment email with Razorpay branding
async function sendPaymentEmail({ email, name, product_name, product_price, payment_url, order_id }) {
  try {
    console.log(`📧 Sending Razorpay payment email to: ${email}`);
    
    const emailContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h2 style="color: #528FF0;">Complete Your Payment</h2>
        </div>
        
        <p>Hello ${name || 'Customer'},</p>
        <p>Thank you for your submission! Please complete your payment by clicking the button below:</p>
        
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #528FF0;">
          <h3 style="margin: 0 0 15px 0; color: #495057;">Order Summary</h3>
          <p style="margin: 5px 0;"><strong>Product:</strong> ${product_name}</p>
          <p style="margin: 5px 0;"><strong>Amount:</strong> ₹${product_price}</p>
          <p style="margin: 5px 0;"><strong>Order ID:</strong> ${order_id}</p>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${payment_url}" 
             style="background: #528FF0; color: white; padding: 15px 30px; 
                    text-decoration: none; border-radius: 5px; font-size: 16px; 
                    display: inline-block;">
            💳 Pay ₹${product_price} Securely
          </a>
        </div>

        <div style="background: #e7f3ff; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p style="margin: 0; font-size: 14px; color: #0066cc;">
            🔒 <strong>Secure Payment via Razorpay</strong><br>
            Your payment is processed securely with bank-level encryption.
          </p>
        </div>

        <p style="font-size: 14px; color: #666;">
          If you have any questions or need assistance, please reply to this email.
        </p>
        
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        
        <p style="font-size: 12px; color: #999; text-align: center;">
          This email was sent by PayForm. Powered by Razorpay payments.
        </p>
      </div>
    `;

    // Note: You'll need to implement actual email sending here
    // This could be via Gmail API, SendGrid, or your preferred email service
    console.log('📧 Email content prepared for:', email);
    console.log('📧 Email HTML preview prepared');
    
    // TODO: Implement actual email sending
    // Example: await gmailAPI.sendEmail(email, subject, emailContent);
    
    return true;
  } catch (error) {
    console.error('❌ Email sending failed:', error);
    return false;
  }
}
