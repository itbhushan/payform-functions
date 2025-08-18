// netlify/functions/monitor-form-responses.js - FIXED VERSION
const { createClient } = require('@supabase/supabase-js');
const { google } = require('googleapis');

exports.handler = async (event, context) => {
  console.log('=== Form Response Monitoring Started ===');
  
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 🔧 FIXED: Get form configs with admin details (separate queries)
    const { data: formConfigs, error: configError } = await supabase
      .from('form_configs')
      .select(`
        *,
        form_admins (
          id,
          email,
          name,
          preferred_gateway,
          auto_splits_enabled,
          razorpay_account_id
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

  // 🔧 FIXED: Get field mapping separately to avoid relationship issues
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

  // 🆕 NEW: Determine which gateway to use based on admin preference
  const preferredGateway = formAdmin.preferred_gateway || 'cashfree';
  
  let paymentResult;
  
  try {
    if (preferredGateway === 'razorpay' && formAdmin.auto_splits_enabled && formAdmin.razorpay_account_id) {
      // Use Razorpay Route with auto-splits
      console.log(`Using Razorpay Route for automatic splits`);
      
      paymentResult = await createRazorpayOrder({
        form_id,
        email: responseData.email,
        product_name: productName,
        product_price: productPrice,
        customer_name: responseData.name
      });
      
    } else {
      // Use Cashfree (manual payouts)
      console.log(`Using Cashfree for manual payouts`);
      
      paymentResult = await createCashfreeOrder({
        form_id,
        email: responseData.email,
        product_name: productName,
        product_price: productPrice,
        customer_name: responseData.name,
        form_admin_id: formAdmin.id
      });
    }

    if (paymentResult.success) {
      // Mark response as processed
      await supabase.from('processed_form_responses').insert({
        response_id: responseId,
        form_id: form_id,
        cashfree_order_id: paymentResult.order_id,
        processed_at: new Date().toISOString()
      });

      // Send email notification
      await sendPaymentEmail({
        email: responseData.email,
        name: responseData.name,
        product_name: productName,
        product_price: productPrice,
        payment_url: paymentResult.payment_url,
        gateway: paymentResult.gateway || preferredGateway
      });

      console.log(`Payment created successfully: ${paymentResult.order_id}`);

      // Log successful processing
      await supabase.from('monitoring_logs').insert({
        activity_type: 'payment_created',
        activity_data: {
          response_id: responseId,
          form_id: form_id,
          email: responseData.email,
          product_name: productName,
          amount: productPrice,
          gateway: paymentResult.gateway || preferredGateway,
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
        gateway: preferredGateway
      }
    });
  }
}

function extractResponseData(answers, mapping) {
  const data = {
    email: '',
    product: '',
    name: '',
    phone: ''
  };

  // Extract data based on field mappings
  if (mapping.email_field_id && answers[mapping.email_field_id]) {
    data.email = answers[mapping.email_field_id].textAnswers?.answers?.[0]?.value || '';
  }

  if (mapping.product_field_id && answers[mapping.product_field_id]) {
    data.product = answers[mapping.product_field_id].textAnswers?.answers?.[0]?.value || '';
  }

  if (mapping.name_field_id && answers[mapping.name_field_id]) {
    data.name = answers[mapping.name_field_id].textAnswers?.answers?.[0]?.value || '';
  }

  if (mapping.phone_field_id && answers[mapping.phone_field_id]) {
    data.phone = answers[mapping.phone_field_id].textAnswers?.answers?.[0]?.value || '';
  }

  return data;
}

// 🆕 NEW: Create Razorpay order with splits
async function createRazorpayOrder(orderData) {
  try {
    const response = await fetch(`${process.env.URL}/.netlify/functions/create-razorpay-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderData)
    });

    const result = await response.json();
    
    if (result.success) {
      return {
        success: true,
        order_id: result.order_id,
        payment_url: `https://checkout.razorpay.com/v1/checkout.js?order_id=${result.order_id}&key_id=${result.key_id}`,
        gateway: 'razorpay'
      };
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    console.error('Razorpay order creation failed:', error);
    return { success: false, error: error.message };
  }
}

// Enhanced Cashfree function
async function createCashfreeOrder(orderData) {
  try {
    const response = await fetch(`${process.env.URL}/.netlify/functions/create-cashfree-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderData)
    });

    const result = await response.json();
    
    if (result.success) {
      // Handle redirect to Razorpay if admin prefers it
      if (result.redirect_to_razorpay) {
        console.log('Redirecting to Razorpay Route...');
        return await createRazorpayOrder(orderData);
      }
      
      return {
        success: true,
        order_id: result.order_id,
        payment_url: result.checkout_url,
        gateway: 'cashfree'
      };
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    console.error('Cashfree order creation failed:', error);
    return { success: false, error: error.message };
  }
}

// Enhanced email function with gateway-specific templates
async function sendPaymentEmail({ email, name, product_name, product_price, payment_url, gateway }) {
  try {
    const emailContent = generateEmailContent({
      name,
      product_name,
      product_price,
      payment_url,
      gateway
    });

    // Use your existing email sending mechanism
    console.log(`Sending ${gateway} payment email to: ${email}`);
    
    // Placeholder for actual email sending
    // You can integrate with your existing email system here
    
    return true;
  } catch (error) {
    console.error('Email sending failed:', error);
    return false;
  }
}

function generateEmailContent({ name, product_name, product_price, payment_url, gateway }) {
  const gatewayName = gateway === 'razorpay' ? 'Razorpay (Auto-Split)' : 'Cashfree';
  const payoutMessage = gateway === 'razorpay' 
    ? 'Your payment will be automatically processed with instant settlement.'
    : 'Your payment will be processed manually by our team.';

  return {
    subject: `Complete your payment for ${product_name}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Hi ${name}!</h2>
        <p>Thank you for your interest in <strong>${product_name}</strong>.</p>
        
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3>Order Summary:</h3>
          <p><strong>Product:</strong> ${product_name}</p>
          <p><strong>Amount:</strong> ₹${product_price}</p>
          <p><strong>Payment Gateway:</strong> ${gatewayName}</p>
        </div>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${payment_url}" 
             style="background: #007bff; color: white; padding: 15px 30px; 
                    text-decoration: none; border-radius: 5px; font-size: 16px;">
            Pay ₹${product_price} Securely
          </a>
        </div>

        <p style="font-size: 14px; color: #666;">
          ${payoutMessage}
        </p>

        <p>If you have any questions, feel free to reply to this email.</p>
        
        <p>Best regards,<br>PayForm Team</p>
      </div>
    `
  };
}
