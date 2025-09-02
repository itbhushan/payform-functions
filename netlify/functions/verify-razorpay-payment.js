// netlify/functions/verify-razorpay-payment.js - UPGRADED FOR ROUTE
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
  // CORS headers
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
    console.log('🔍 Razorpay Route payment verification started');
    console.log('Query parameters:', event.queryStringParameters);

    // Handle webhook verification (for automatic updates)
    if (event.httpMethod === 'POST') {
      return await handleWebhook(event, headers);
    }

    // Handle redirect verification (for user-facing success page)
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature, form_id, email } = event.queryStringParameters || {};

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      console.log('❌ Missing required payment parameters');
      return {
        statusCode: 400,
        headers,
        body: generateErrorPage('Missing payment verification parameters.')
      };
    }

    console.log(`🔍 Verifying payment: ${razorpay_payment_id}`);

    // Verify signature
    const isValidSignature = verifyRazorpaySignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    );

    if (!isValidSignature) {
      console.log('❌ Invalid payment signature');
      return {
        statusCode: 400,
        headers,
        body: generateErrorPage('Payment verification failed. Invalid signature.')
      };
    }

    // Fetch payment details from Razorpay
    const payment = await razorpay.payments.fetch(razorpay_payment_id);
    console.log('💳 Payment status:', payment.status);

    if (payment.status !== 'captured') {
      console.log('❌ Payment not captured:', payment.status);
      return {
        statusCode: 400,
        headers,
        body: generateIncompletePaymentPage(payment.status)
      };
    }

    // Update transaction in database
    const { data: transaction, error: updateError } = await supabase
      .from('transactions')
      .update({
        payment_status: 'paid',
        razorpay_payment_id: razorpay_payment_id,
        customer_name: payment.notes?.name || 'Customer',
        updated_at: new Date().toISOString()
      })
      .eq('razorpay_order_id', razorpay_order_id)
      .select('*')
      .single();

    if (updateError) {
      console.error('❌ Database update error:', updateError);
      return {
        statusCode: 500,
        headers,
        body: generateErrorPage('Payment successful but database update failed.')
      };
    }

    // Update commission status to completed
    await supabase
      .from('platform_commissions')
      .update({
        status: 'completed',
        processed_at: new Date().toISOString()
      })
      .eq('transaction_id', razorpay_order_id);

    console.log('✅ Payment verification completed successfully');

    return {
      statusCode: 200,
      headers,
      body: generateSuccessPage(payment, transaction)
    };

  } catch (error) {
    console.error('❌ Payment verification error:', error);
    return {
      statusCode: 500,
      headers,
      body: generateErrorPage(`Verification error: ${error.message}`)
    };
  }
};

// Webhook handler for automatic payment updates
async function handleWebhook(event, headers) {
  try {
    console.log('📢 Processing Razorpay webhook...');
    
    const webhookSignature = event.headers['x-razorpay-signature'];
    const webhookBody = event.body;

    // Verify webhook signature
    if (!verifyWebhookSignature(webhookBody, webhookSignature)) {
      console.log('❌ Invalid webhook signature');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid signature' })
      };
    }

    const webhookData = JSON.parse(webhookBody);
    const eventType = webhookData.event;
    const payload = webhookData.payload;

    console.log(`📨 Webhook event: ${eventType}`);

    switch (eventType) {
      case 'payment.captured':
        await handlePaymentCaptured(payload.payment.entity);
        break;
      
      case 'transfer.processed':
        await handleTransferProcessed(payload.transfer.entity);
        break;
      
      case 'transfer.failed':
        await handleTransferFailed(payload.transfer.entity);
        break;

      default:
        console.log(`ℹ️ Unhandled webhook event: ${eventType}`);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true })
    };

  } catch (error) {
    console.error('❌ Webhook processing error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
}

// Handle payment captured webhook
async function handlePaymentCaptured(payment) {
  console.log(`💳 Payment captured: ${payment.id}`);
  
  await supabase
    .from('transactions')
    .update({
      payment_status: 'paid',
      razorpay_payment_id: payment.id,
      updated_at: new Date().toISOString()
    })
    .eq('razorpay_order_id', payment.order_id);

  console.log('✅ Transaction updated for captured payment');
}

// Handle transfer processed webhook
async function handleTransferProcessed(transfer) {
  console.log(`💸 Transfer processed: ${transfer.id}`);
  
  // Update commission status to completed
  await supabase
    .from('platform_commissions')
    .update({
      status: 'completed',
      processed_at: new Date().toISOString()
    })
    .eq('transaction_id', transfer.source);

  console.log('✅ Commission updated for processed transfer');
}

// Handle transfer failed webhook
async function handleTransferFailed(transfer) {
  console.log(`❌ Transfer failed: ${transfer.id}`);
  
  // Update commission status to failed
  await supabase
    .from('platform_commissions')
    .update({
      status: 'failed',
      processed_at: new Date().toISOString()
    })
    .eq('transaction_id', transfer.source);

  console.log('⚠️ Commission marked as failed for transfer failure');
}

// Verify Razorpay payment signature
function verifyRazorpaySignature(orderId, paymentId, signature) {
  const text = orderId + '|' + paymentId;
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(text)
    .digest('hex');
  
  return expectedSignature === signature;
}

// Verify webhook signature
function verifyWebhookSignature(body, signature) {
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(body)
    .digest('hex');
  
  return expectedSignature === signature;
}

// Generate success page
function generateSuccessPage(payment, transaction) {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Payment Successful - PayForm</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
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
          .amount { 
            background: #e8f5e8; 
            padding: 20px; 
            border-radius: 10px; 
            margin: 20px 0; 
            border-left: 4px solid #4caf50; 
          }
          .splits {
            background: #f0f8ff;
            padding: 15px;
            border-radius: 8px;
            margin: 15px 0;
            border-left: 4px solid #2196f3;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success-icon">🎉</div>
          <h1 style="color: #4caf50; margin-bottom: 10px;">Payment Successful!</h1>
          <p>Your payment has been processed and automatically split using Razorpay Route.</p>
          
          <div class="amount">
            <p style="margin: 5px 0;"><strong>Product:</strong> ${transaction.product_name}</p>
            <p style="margin: 5px 0;"><strong>Payment ID:</strong> ${payment.id}</p>
            <p style="margin: 5px 0;"><strong>Amount:</strong> ₹${transaction.payment_amount}</p>
            <p style="margin: 5px 0;"><strong>Email:</strong> ${transaction.email}</p>
            <p style="margin: 5px 0;"><strong>Status:</strong> ✅ Paid & Split</p>
          </div>

          <div class="splits">
            <p style="margin: 5px 0; font-size: 14px;"><strong>Payment Breakdown:</strong></p>
            <p style="margin: 5px 0; font-size: 12px;">💳 Razorpay Fee: ₹${transaction.gateway_fee}</p>
            <p style="margin: 5px 0; font-size: 12px;">🏢 Platform Fee: ₹${transaction.platform_commission}</p>
            <p style="margin: 5px 0; font-size: 12px;">👤 Form Admin: ₹${transaction.net_amount_to_admin}</p>
          </div>

          <p>Form admin will receive their share automatically via Razorpay Route.</p>
          <p style="color: #666; margin-top: 30px; font-size: 14px;">You can now close this window.</p>
        </div>
      </body>
    </html>
  `;
}

// Generate error page
function generateErrorPage(message) {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Payment Error - PayForm</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
      </head>
      <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center; background: #f8f9fa;">
        <div style="background: white; padding: 30px; border-radius: 10px; max-width: 500px; margin: 0 auto; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <h2 style="color: #dc3545;">❌ Payment Error</h2>
          <p>${message}</p>
          <p>Please contact support if this issue persists.</p>
        </div>
      </body>
    </html>
  `;
}

// Generate incomplete payment page
function generateIncompletePaymentPage(status) {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Payment Incomplete - PayForm</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
      </head>
      <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center; background: #f8f9fa;">
        <div style="background: white; padding: 30px; border-radius: 10px; max-width: 500px; margin: 0 auto; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <h2 style="color: #ffc107;">⏳ Payment Incomplete</h2>
          <p>Your payment status: <strong>${status}</strong></p>
          <p>Please try again or contact support if you believe this is an error.</p>
        </div>
      </body>
    </html>
  `;
}
