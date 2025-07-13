const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-cf-signature',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    console.log('Cashfree webhook received');
    console.log('Headers:', event.headers);
    console.log('Body:', event.body);

    // Environment variables
    const CASHFREE_SECRET_KEY = process.env.CASHFREE_SECRET_KEY;
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!CASHFREE_SECRET_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error('Missing environment variables');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Server configuration error' })
      };
    }

    // Parse webhook payload
    let webhookData;
    try {
      webhookData = JSON.parse(event.body);
    } catch (error) {
      console.error('Invalid JSON payload:', error);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid JSON payload' })
      };
    }

    // Verify webhook signature (recommended for production)
    const signature = event.headers['x-cf-signature'] || event.headers['X-CF-Signature'];
    if (signature) {
      const crypto = require('crypto');
      const expectedSignature = crypto
        .createHmac('sha256', CASHFREE_SECRET_KEY)
        .update(event.body)
        .digest('hex');
      
      if (signature !== expectedSignature) {
        console.error('Invalid webhook signature');
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: 'Invalid signature' })
        };
      }
    }

    console.log('Webhook data:', JSON.stringify(webhookData, null, 2));

    // Extract payment information
    const { 
      type, 
      data: paymentData 
    } = webhookData;

    // Handle different webhook types
    if (type === 'PAYMENT_SUCCESS_WEBHOOK') {
      await handlePaymentSuccess(paymentData, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    } else if (type === 'PAYMENT_FAILED_WEBHOOK') {
      await handlePaymentFailure(paymentData, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    } else {
      console.log('Unhandled webhook type:', type);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'Webhook processed successfully' })
    };

  } catch (error) {
    console.error('Webhook processing error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};

async function handlePaymentSuccess(paymentData, supabaseUrl, supabaseKey) {
  try {
    console.log('Processing successful payment:', paymentData);

    const {
      cf_payment_id,
      order_id,
      payment_amount,
      payment_currency,
      payment_method,
      payment_time,
      payment_status
    } = paymentData.payment || paymentData;

    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Find the transaction by order_id (cashfree_order_id)
    const { data: transactions, error: findError } = await supabase
      .from('transactions')
      .select('*')
      .eq('cashfree_order_id', order_id)
      .eq('payment_status', 'pending');

    if (findError) {
      console.error('Error finding transaction:', findError);
      return;
    }

    if (!transactions || transactions.length === 0) {
      console.log('No pending transaction found for order_id:', order_id);
      return;
    }

    const transaction = transactions[0];
    console.log('Found transaction:', transaction.id);

    // Calculate commission split
    const totalAmount = parseFloat(payment_amount);
    const gatewayFee = (totalAmount * 2.5 / 100) + 3; // 2.5% + ₹3
    const platformCommission = totalAmount * 3 / 100; // 3%
    const netAmountToAdmin = totalAmount - gatewayFee - platformCommission;

    // Update transaction with payment success
    const { error: updateError } = await supabase
      .from('transactions')
      .update({
        payment_status: 'paid',
        cashfree_payment_id: cf_payment_id,
        payment_method: payment_method,
        gateway_fee: gatewayFee,
        platform_commission: platformCommission,
        net_amount_to_admin: netAmountToAdmin,
        updated_at: new Date().toISOString(),
        payment_completed_at: payment_time || new Date().toISOString()
      })
      .eq('id', transaction.id);

    if (updateError) {
      console.error('Error updating transaction:', updateError);
      return;
    }

    console.log('Transaction updated successfully');

    // Create commission record
    const { error: commissionError } = await supabase
      .from('platform_commissions')
      .insert({
        transaction_id: transaction.id,
        form_admin_id: transaction.admin_id,
        commission_amount: platformCommission,
        commission_rate: 3.0,
        platform_fee: platformCommission,
        gateway_fee: gatewayFee,
        net_amount_to_admin: netAmountToAdmin,
        status: 'completed',
        cashfree_payment_id: cf_payment_id,
        processed_at: new Date().toISOString()
      });

    if (commissionError) {
      console.error('Error creating commission record:', commissionError);
    } else {
      console.log('Commission record created successfully');
    }

    // Send confirmation email to customer
    await sendPaymentConfirmationEmail(transaction, paymentData);

    // Send notification to form admin
    await sendAdminNotificationEmail(transaction, paymentData, netAmountToAdmin);

  } catch (error) {
    console.error('Error in handlePaymentSuccess:', error);
  }
}

async function handlePaymentFailure(paymentData, supabaseUrl, supabaseKey) {
  try {
    console.log('Processing failed payment:', paymentData);

    const {
      order_id,
      payment_status,
      failure_reason
    } = paymentData.payment || paymentData;

    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Update transaction status to failed
    const { error: updateError } = await supabase
      .from('transactions')
      .update({
        payment_status: 'failed',
        failure_reason: failure_reason,
        updated_at: new Date().toISOString()
      })
      .eq('cashfree_order_id', order_id);

    if (updateError) {
      console.error('Error updating failed transaction:', updateError);
      return;
    }

    console.log('Failed transaction updated successfully');

  } catch (error) {
    console.error('Error in handlePaymentFailure:', error);
  }
}

async function sendPaymentConfirmationEmail(transaction, paymentData) {
  try {
    // TODO: Implement email service (SendGrid, AWS SES, or similar)
    console.log('Payment confirmation email would be sent to:', transaction.email);
    console.log('Transaction details:', {
      product: transaction.product_name,
      amount: transaction.payment_amount,
      status: 'paid'
    });
  } catch (error) {
    console.error('Error sending confirmation email:', error);
  }
}

async function sendAdminNotificationEmail(transaction, paymentData, netAmount) {
  try {
    // TODO: Implement admin notification email
    console.log('Admin notification would be sent for transaction:', transaction.id);
    console.log('Net amount to admin:', netAmount);
  } catch (error) {
    console.error('Error sending admin notification:', error);
  }
}
