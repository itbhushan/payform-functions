// netlify/functions/razorpay-webhook.js - FOLLOWING CASHFREE WEBHOOK PATTERN
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Razorpay-Signature',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    console.log('🔔 Razorpay webhook received');
    console.log('Headers:', event.headers);

    // Verify webhook signature (similar to CashFree verification)
    const razorpaySignature = event.headers['x-razorpay-signature'];
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!razorpaySignature || !webhookSecret) {
      console.log('❌ Missing signature or webhook secret');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing signature or webhook secret' })
      };
    }

    // Verify signature
    const generatedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(event.body)
      .digest('hex');

    if (generatedSignature !== razorpaySignature) {
      console.log('❌ Invalid webhook signature');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid signature' })
      };
    }

    console.log('✅ Webhook signature verified');

    const webhookData = JSON.parse(event.body);
    const eventType = webhookData.event;
    const paymentData = webhookData.payload?.payment?.entity;
    const orderData = webhookData.payload?.order?.entity;

    console.log('🔔 Webhook event:', eventType);
    console.log('💳 Payment data:', paymentData?.id);

    // Process different webhook events (similar to CashFree event handling)
    switch (eventType) {
      case 'payment.captured':
        await handlePaymentCaptured(paymentData, orderData);
        break;
      case 'payment.failed':
        await handlePaymentFailed(paymentData, orderData);
        break;
      case 'order.paid':
        await handleOrderPaid(orderData);
        break;
      default:
        console.log('ℹ️ Unhandled webhook event:', eventType);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, message: 'Webhook processed' })
    };

  } catch (error) {
    console.error('❌ Webhook processing error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Webhook processing failed', details: error.message })
    };
  }
};

// Handle successful payment capture (same logic as CashFree success)
async function handlePaymentCaptured(paymentData, orderData) {
  try {
    console.log('✅ Processing payment captured event');

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    // Find transaction by Razorpay order ID (same pattern as CashFree)
    const { data: transactions, error: findError } = await supabase
      .from('transactions')
      .select('*')
      .eq('razorpay_order_id', paymentData.order_id);

    if (findError || !transactions || transactions.length === 0) {
      console.log('⚠️ Transaction not found for order:', paymentData.order_id);
      return;
    }

    const transaction = transactions[0];
    console.log('📦 Found transaction:', transaction.id);

    // Update transaction status (same as CashFree)
    const { error: updateError } = await supabase
      .from('transactions')
      .update({
        payment_status: 'paid',
        razorpay_payment_id: paymentData.id,
        gateway_response: paymentData,
        updated_at: new Date().toISOString()
      })
      .eq('id', transaction.id);

    if (updateError) {
      console.error('❌ Failed to update transaction:', updateError);
      return;
    }

    console.log('✅ Transaction updated to paid status');

    // Update platform commission status (same as CashFree)
    await supabase
      .from('platform_commissions')
      .update({
        status: 'completed',
        processed_at: new Date().toISOString()
      })
      .eq('transaction_id', transaction.id);

    // Send confirmation email (reuse CashFree email logic)
    try {
      await sendWebhookConfirmationEmail(transaction, paymentData);
    } catch (emailError) {
      console.error('❌ Email sending failed:', emailError);
    }

  } catch (error) {
    console.error('❌ Error handling payment captured:', error);
  }
}

// Handle failed payment (same logic as CashFree)
async function handlePaymentFailed(paymentData, orderData) {
  try {
    console.log('❌ Processing payment failed event');

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    // Update transaction status to failed
    const { error: updateError } = await supabase
      .from('transactions')
      .update({
        payment_status: 'failed',
        razorpay_payment_id: paymentData.id,
        failure_reason: paymentData.error_description || 'Payment failed',
        gateway_response: paymentData,
        updated_at: new Date().toISOString()
      })
      .eq('razorpay_order_id', paymentData.order_id);

    if (updateError) {
      console.error('❌ Failed to update transaction:', updateError);
      return;
    }

    console.log('✅ Transaction marked as failed');

  } catch (error) {
    console.error('❌ Error handling payment failed:', error);
  }
}

// Handle order paid event
async function handleOrderPaid(orderData) {
  try {
    console.log('💰 Processing order paid event');
    // Additional order-level processing can be added here
  } catch (error) {
    console.error('❌ Error handling order paid:', error);
  }
}

// Send confirmation email via webhook (reuse CashFree email logic)
async function sendWebhookConfirmationEmail(transaction, paymentData) {
  try {
    console.log(`📧 Sending webhook confirmation email to: ${transaction.email}`);

    // Reuse your CashFree email template but adapt for Razorpay
    const emailData = {
      cf_order_id: paymentData.order_id, // Using for template compatibility
      order_amount: paymentData.amount / 100, // Convert from paise
      customer_details: {
        customer_name: transaction.customer_name,
        customer_email: transaction.email
      }
    };

    // Here you can integrate with your email service
    console.log('📧 Webhook email prepared for:', transaction.email);
    return true;

  } catch (error) {
    console.error('❌ Error sending webhook email:', error);
    return false;
  }
}
