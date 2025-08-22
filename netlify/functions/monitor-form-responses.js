// netlify/functions/monitor-form-responses.js - FIXED VERSION WITH PROPER ASYNC/AWAIT
const { createClient } = require('@supabase/supabase-js');
const { google } = require('googleapis');
const nodemailer = require('nodemailer');

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

// Email transporter configuration
const createEmailTransporter = () => {
  return nodemailer.createTransporter({
    service: 'gmail',
    auth: {
      user: process.env.SMTP_EMAIL,
      pass: process.env.SMTP_PASSWORD
    }
  });
};

// Send payment email function
const sendPaymentEmail = async (customerEmail, customerName, productName, productPrice, paymentUrl) => {
  try {
    const transporter = createEmailTransporter();
    
    const mailOptions = {
      from: process.env.SMTP_EMAIL,
      to: customerEmail,
      subject: `Complete Your Payment - ${productName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2563eb;">Thank you for your submission, ${customerName}!</h2>
          
          <p>Please complete your payment securely using <strong>Razorpay</strong> by clicking the button below:</p>
          
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin: 0; color: #495057;">Order Summary:</h3>
            <p style="margin: 5px 0;"><strong>Product:</strong> ${productName}</p>
            <p style="margin: 5px 0;"><strong>Amount:</strong> ₹${productPrice}</p>
            <p style="margin: 5px 0;"><strong>Email:</strong> ${customerEmail}</p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${paymentUrl}" 
               style="background-color: #2563eb; color: white; padding: 15px 30px; 
                      text-decoration: none; border-radius: 5px; font-size: 16px; font-weight: bold;">
              Pay ₹${productPrice} Securely
            </a>
          </div>
          
          <div style="background: #e3f2fd; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; font-size: 14px; color: #1565c0;">
              🔒 Secure payment powered by Razorpay<br>
              💳 UPI, Cards, Net Banking, and Wallets accepted
            </p>
          </div>
          
          <p>If you face any issues, feel free to reply to this email.</p>
          
          <p>Best regards,<br>PayForm Team</p>
        </div>
      `
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('📧 Payment email sent successfully:', result.messageId);
    return { success: true, messageId: result.messageId };
    
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
      const priceMatch = value.match(/₹?(\d+)/);
      if (priceMatch) {
        productPrice = parseInt(priceMatch[1]);
      }
    }
    
    // Name detection (if no @ symbol and not a product)
    if (!value.includes('@') && !value.includes('₹') && !value.includes('Rs') && value.length > 2) {
      if (!name) name = value.trim();
    }
  });

  return { email, name: name || 'Customer', product, productPrice };
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

    // Initialize Google Forms API
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
      scopes: ['https://www.googleapis.com/auth/forms.responses.readonly']
    });

    const forms = google.forms({ version: 'v1', auth });

    let totalProcessed = 0;
    let emailsSent = 0;
    let errors = 0;

    // Process each form
    for (const form of activeForms) {
      try {
        console.log(`🔍 Checking form: ${form.form_name} (${form.form_id})`);

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

          // Extract form data
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

          // Create Razorpay order
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

          if (!orderData.success || !orderData.payment_url) {
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

          // Send payment email
          const emailResult = await sendPaymentEmail(
            formData.email,
            formData.name,
            formData.product,
            formData.productPrice,
            orderData.payment_url
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
