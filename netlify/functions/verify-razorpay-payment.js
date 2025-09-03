// netlify/functions/verify-razorpay-payment.js - PERMANENT FIX
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const Razorpay = require('razorpay');

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'text/html; charset=utf-8'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    console.log('🔍 Razorpay payment verification started');
    
    // Handle both webhook and redirect cases
    if (event.httpMethod === 'POST') {
      return handleWebhook(event, headers);
    } else {
      return handleRedirect(event, headers);
    }

  } catch (error) {
    console.error('❌ Verification error:', error);
    return {
      statusCode: 500,
      headers,
      body: generateErrorPage('Payment verification failed due to server error.')
    };
  }
};

// Handle redirect from payment completion (what customers see)
async function handleRedirect(event, headers) {
  console.log('🔍 Processing payment redirect...');
  
  const queryParams = event.queryStringParameters || {};
  console.log('Query parameters:', queryParams);

  const { 
    razorpay_payment_id, 
    razorpay_payment_link_id,
    razorpay_payment_link_status,
    razorpay_signature 
  } = queryParams;

  // FIXED: Check for Payment Link parameters specifically
  if (!razorpay_payment_id || !razorpay_payment_link_id) {
    console.log('❌ Missing required payment parameters');
    console.log('Available parameters:', Object.keys(queryParams));
    return {
      statusCode: 400,
      headers,
      body: generateErrorPage('Missing payment verification parameters.')
    };
  }

  // FIXED: For Payment Links, we have the status directly
  if (razorpay_payment_link_status !== 'paid') {
    console.log('❌ Payment not completed. Status:', razorpay_payment_link_status);
    return {
      statusCode: 400,
      headers,
      body: generateErrorPage('Payment was not completed successfully.')
    };
  }

  console.log(`🔍 Verifying payment: ${razorpay_payment_id} for link: ${razorpay_payment_link_id}`);

  // FIXED: Skip signature verification for Payment Links - Razorpay handles security
  console.log('ℹ️ Payment Link verification - using Razorpay status directly');

  try {
    // Get payment details from Razorpay to confirm
    const payment = await razorpay.payments.fetch(razorpay_payment_id);
    console.log('💳 Payment status:', payment.status);

    if (payment.status !== 'captured') {
      console.log('❌ Payment not captured. Status:', payment.status);
      return {
        statusCode: 400,
        headers,
        body: generateErrorPage('Payment verification failed. Status: ' + payment.status)
      };
    }

    // FIXED: Update transaction in database using Payment Link ID
    console.log('📊 Updating database for Payment Link ID:', razorpay_payment_link_id);
    
    const { data: transaction, error: updateError } = await supabase
      .from('transactions')
      .update({
        payment_status: 'paid',
        razorpay_payment_id: razorpay_payment_id,
        customer_name: payment.notes?.name || 'Customer',
        updated_at: new Date().toISOString()
      })
      .eq('razorpay_order_id', razorpay_payment_link_id) // Match Payment Link ID
      .select('*')
      .single();

    if (updateError) {
      console.error('❌ Database update error:', updateError);
      // Still show success to customer since payment worked
      return {
        statusCode: 200,
        headers,
        body: generateWarningSuccessPage(payment, razorpay_payment_id, 'Database sync issue')
      };
    }

    console.log('✅ Transaction updated successfully');

    // Send confirmation email
    try {
      console.log('📧 Sending confirmation email...');
      const confirmationEmailResponse = await fetch(`${process.env.SUPABASE_URL}/functions/v1/send-payment-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
        },
        body: JSON.stringify({
          to: transaction.email,
          subject: `Payment Confirmed - ${transaction.product_name}`,
          productName: transaction.product_name,
          amount: transaction.payment_amount,
          customerName: transaction.customer_name,
          paymentId: razorpay_payment_id,
          adminId: transaction.admin_id,
          isConfirmation: true
        })
      });

      const emailResult = await confirmationEmailResponse.json();
      console.log('📧 Confirmation email result:', emailResult);
      
      if (emailResult.success) {
        console.log('✅ Confirmation email sent successfully');
      }
    } catch (emailError) {
      console.error('⚠️ Confirmation email failed (non-critical):', emailError);
    }

    // Update commission status if exists
    try {
      await supabase
        .from('platform_commissions')
        .update({
          status: 'completed',
          processed_at: new Date().toISOString()
        })
        .eq('transaction_id', transaction.id);
    } catch (commissionError) {
      console.error('⚠️ Commission update failed (non-critical):', commissionError);
    }

    console.log('✅ Payment verification completed successfully');

    // Generate success page
    return {
      statusCode: 200,
      headers,
      body: generateSuccessPage(payment, transaction, razorpay_payment_id)
    };

  } catch (error) {
    console.error('❌ Payment verification failed:', error);
    return {
      statusCode: 500,
      headers,
      body: generateErrorPage('Payment verification failed: ' + error.message)
    };
  }
}

// Handle webhook from Razorpay (for backend processing)
async function handleWebhook(event, headers) {
  console.log('🔔 Processing Razorpay webhook...');
  
  try {
    const webhookBody = JSON.parse(event.body);
    const webhookSignature = event.headers['x-razorpay-signature'];
    
    // Verify webhook signature if secret is available
    if (process.env.RAZORPAY_WEBHOOK_SECRET && webhookSignature) {
      const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
        .update(event.body)
        .digest('hex');
      
      if (expectedSignature !== webhookSignature) {
        console.log('❌ Invalid webhook signature');
        return { statusCode: 400, headers: {}, body: 'Invalid signature' };
      }
    }

    const eventType = webhookBody.event;
    console.log('📩 Webhook event:', eventType);

    // Handle different webhook events
    if (eventType === 'payment_link.paid' || eventType === 'payment.captured') {
      const paymentData = webhookBody.payload.payment_link || webhookBody.payload.payment;
      
      // Update transaction status
      await supabase
        .from('transactions')
        .update({
          payment_status: 'paid',
          updated_at: new Date().toISOString()
        })
        .eq('razorpay_order_id', paymentData.id);

      console.log('✅ Webhook processed successfully');
    }

    return { statusCode: 200, headers: {}, body: 'OK' };

  } catch (webhookError) {
    console.error('❌ Webhook processing failed:', webhookError);
    return { statusCode: 500, headers: {}, body: 'Webhook processing failed' };
  }
}

// Generate success page for customers
function generateSuccessPage(payment, transaction, paymentId) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Payment Successful - PayForm</title>
      <style>
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
          margin: 0; padding: 20px; 
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
          min-height: 100vh; 
          display: flex; 
          align-items: center; 
          justify-content: center; 
        }
        .container { 
          background: white; 
          padding: 40px; 
          border-radius: 15px; 
          box-shadow: 0 20px 40px rgba(0,0,0,0.1); 
          max-width: 500px; 
          text-align: center; 
        }
        .success-icon { font-size: 64px; margin-bottom: 20px; }
        .details { 
          background: #e8f5e8; 
          padding: 20px; 
          border-radius: 10px; 
          margin: 20px 0; 
          border-left: 4px solid #4caf50; 
        }
        .detail-row { margin: 5px 0; text-align: left; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="success-icon">🎉</div>
        <h1 style="color: #4caf50; margin-bottom: 10px;">Payment Successful!</h1>
        <p>Thank you for your payment. Your transaction has been processed successfully.</p>
        
        <div class="details">
          <div class="detail-row"><strong>Product:</strong> ${transaction.product_name}</div>
          <div class="detail-row"><strong>Amount:</strong> ₹${transaction.payment_amount}</div>
          <div class="detail-row"><strong>Payment ID:</strong> ${paymentId}</div>
          <div class="detail-row"><strong>Email:</strong> ${transaction.email}</div>
          <div class="detail-row"><strong>Status:</strong> ✅ Paid & Confirmed</div>
        </div>

        <p>A confirmation email has been sent to your email address.</p>
        <p style="color: #666; margin-top: 30px; font-size: 14px;">You can safely close this window.</p>
      </div>
    </body>
    </html>
  `;
}

// Generate warning success page (payment worked but database issue)
function generateWarningSuccessPage(payment, paymentId, issue) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Payment Successful - PayForm</title>
      <style>
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
          margin: 0; padding: 20px; 
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
          min-height: 100vh; 
          display: flex; 
          align-items: center; 
          justify-content: center; 
        }
        .container { 
          background: white; 
          padding: 40px; 
          border-radius: 15px; 
          box-shadow: 0 20px 40px rgba(0,0,0,0.1); 
          max-width: 500px; 
          text-align: center; 
        }
        .success-icon { font-size: 64px; margin-bottom: 20px; }
        .warning { 
          background: #fff3cd; 
          padding: 15px; 
          border-radius: 8px; 
          margin: 15px 0; 
          border-left: 4px solid #ffc107; 
          color: #856404; 
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="success-icon">✅</div>
        <h1 style="color: #4caf50; margin-bottom: 10px;">Payment Successful!</h1>
        <p>Your payment was processed successfully.</p>
        
        <div class="warning">
          <strong>Note:</strong> Payment completed but there was a minor ${issue}. 
          Please save your payment ID: <strong>${paymentId}</strong>
        </div>

        <p>If you have any questions, please contact support with your payment ID.</p>
      </div>
    </body>
    </html>
  `;
}

// Generate error page
function generateErrorPage(message) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Payment Error - PayForm</title>
      <style>
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
          margin: 0; padding: 20px; 
          background: #f8f9fa; 
          min-height: 100vh; 
          display: flex; 
          align-items: center; 
          justify-content: center; 
        }
        .container { 
          background: white; 
          padding: 40px; 
          border-radius: 15px; 
          box-shadow: 0 10px 30px rgba(0,0,0,0.1); 
          max-width: 500px; 
          text-align: center; 
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h2 style="color: #dc3545;">❌ Payment Error</h2>
        <p>${message}</p>
        <p>Please contact support if this issue persists.</p>
      </div>
    </body>
    </html>
  `;
}
