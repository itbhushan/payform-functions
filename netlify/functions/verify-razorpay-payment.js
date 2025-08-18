// netlify/functions/verify-razorpay-payment.js
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'text/html; charset=utf-8'
  };

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    console.log('Razorpay payment verification started');
    console.log('Query parameters:', event.queryStringParameters);

    // Get parameters from URL
    const { 
      razorpay_order_id, 
      razorpay_payment_id, 
      razorpay_signature,
      status 
    } = event.queryStringParameters || {};

    // Check if payment was cancelled
    if (status === 'cancelled') {
      console.log('Payment was cancelled');
      return {
        statusCode: 200,
        headers,
        body: generateCancelledPage()
      };
    }

    // Validate required parameters
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      console.log('Missing required parameters');
      return {
        statusCode: 400,
        headers,
        body: generateErrorPage('Missing required parameters for payment verification.')
      };
    }

    // Environment variables
    const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!RAZORPAY_KEY_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.log('Missing environment variables');
      return {
        statusCode: 500,
        headers,
        body: generateErrorPage('Server configuration error. Please contact support.')
      };
    }

    console.log('Verifying payment signature...');

    // Verify Razorpay signature
    const generatedSignature = crypto
      .createHmac('sha256', RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (generatedSignature !== razorpay_signature) {
      console.log('Invalid signature');
      return {
        statusCode: 400,
        headers,
        body: generateErrorPage('Invalid payment signature. Payment verification failed.')
      };
    }

    console.log('Signature verified successfully');

    // Initialize Supabase
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get payment details from Razorpay
    const razorpayResponse = await fetch(`https://api.razorpay.com/v1/payments/${razorpay_payment_id}`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64')}`,
        'Content-Type': 'application/json'
      }
    });

    if (!razorpayResponse.ok) {
      throw new Error('Failed to fetch payment details from Razorpay');
    }

    const paymentDetails = await razorpayResponse.json();
    console.log('Payment details fetched:', paymentDetails.status);

    if (paymentDetails.status === 'captured') {
      console.log('Payment confirmed, updating transaction...');

      // Find the transaction record
      const { data: transaction, error: transactionError } = await supabase
        .from('transactions')
        .select('*')
        .eq('razorpay_order_id', razorpay_order_id)
        .single();

      if (transactionError || !transaction) {
        console.error('Transaction not found:', transactionError);
        return {
          statusCode: 200,
          headers,
          body: generateSuccessPage({
            order_id: razorpay_order_id,
            payment_id: razorpay_payment_id,
            amount: paymentDetails.amount / 100,
            currency: paymentDetails.currency,
            email: paymentDetails.email || 'customer@example.com'
          }, true) // true = logging issue
        };
      }

      // Update transaction status
      const { error: updateError } = await supabase
        .from('transactions')
        .update({
          payment_status: 'paid',
          razorpay_payment_id: razorpay_payment_id,
          updated_at: new Date().toISOString()
        })
        .eq('id', transaction.id);

      if (updateError) {
        console.error('Failed to update transaction:', updateError);
      }

      // Update split payment logs
      const { error: splitLogError } = await supabase
        .from('split_payment_logs')
        .update({
          split_status: 'completed',
          updated_at: new Date().toISOString()
        })
        .eq('razorpay_order_id', razorpay_order_id);

      if (splitLogError) {
        console.error('Failed to update split logs:', splitLogError);
      }

      // Update platform commission record
      const splitDetails = transaction.split_details || {};
      if (splitDetails.platform_commission) {
        await supabase
          .from('platform_commissions')
          .insert({
            transaction_id: transaction.id,
            form_admin_id: transaction.admin_id,
            commission_amount: splitDetails.platform_commission,
            commission_rate: 3.0,
            platform_fee: splitDetails.platform_commission,
            status: 'completed',
            processed_at: new Date().toISOString()
          });
      }

      console.log('Transaction updated successfully');

      return {
        statusCode: 200,
        headers,
        body: generateSuccessPage({
          order_id: razorpay_order_id,
          payment_id: razorpay_payment_id,
          amount: paymentDetails.amount / 100,
          currency: paymentDetails.currency.toUpperCase(),
          email: transaction.email,
          product_name: transaction.product_name,
          split_enabled: transaction.auto_split_enabled
        }, false) // false = no logging issue
      };

    } else {
      console.log('Payment not captured:', paymentDetails.status);
      return {
        statusCode: 400,
        headers,
        body: generateIncompletePaymentPage(paymentDetails.status)
      };
    }

  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500,
      headers,
      body: generateErrorPage(`Internal error: ${error.message}`)
    };
  }
};

// Helper functions to generate HTML pages
function generateSuccessPage(paymentData, hasLoggingIssue) {
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
          .split-info {
            background: #e3f2fd;
            padding: 15px;
            border-radius: 8px;
            margin: 15px 0;
            border-left: 4px solid #2196f3;
            font-size: 14px;
          }
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
          <div class="success-icon">🎉</div>
          <h1 style="color: #4caf50; margin-bottom: 10px;">Payment Successful!</h1>
          <p>Thank you for your payment. Your transaction has been processed successfully.</p>
          
          <div class="amount">
            <p style="margin: 5px 0;"><strong>Product:</strong> ${paymentData.product_name || 'Product'}</p>
            <p style="margin: 5px 0;"><strong>Order ID:</strong> ${paymentData.order_id}</p>
            <p style="margin: 5px 0;"><strong>Payment ID:</strong> ${paymentData.payment_id}</p>
            <p style="margin: 5px 0;"><strong>Amount:</strong> ${paymentData.currency} ${paymentData.amount}</p>
            <p style="margin: 5px 0;"><strong>Email:</strong> ${paymentData.email}</p>
            <p style="margin: 5px 0;"><strong>Status:</strong> ✅ Paid${hasLoggingIssue ? ' (logging issue)' : ' & Logged'}</p>
          </div>

          ${paymentData.split_enabled ? `
            <div class="split-info">
              <strong>💰 Auto-Split Payment:</strong><br>
              Your payment has been automatically split between the platform and vendor. 
              The vendor will receive their share within 24 hours.
            </div>
          ` : ''}

          ${hasLoggingIssue ? '<div class="warning"><strong>Note:</strong> Payment was successful but there was a minor issue logging the transaction. Please save the payment ID above.</div>' : ''}

          <p>You will receive a confirmation email shortly.</p>
          <p style="color: #666; margin-top: 30px; font-size: 14px;">You can now close this window.</p>
        </div>
      </body>
    </html>
  `;
}

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

function generateCancelledPage() {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Payment Cancelled - PayForm</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
      </head>
      <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center; background: #f8f9fa;">
        <div style="background: white; padding: 30px; border-radius: 10px; max-width: 500px; margin: 0 auto; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <h2 style="color: #ffc107;">⚠️ Payment Cancelled</h2>
          <p>Your payment was cancelled. No charges were made.</p>
          <p>You can try again or contact support if you need assistance.</p>
        </div>
      </body>
    </html>
  `;
}

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
