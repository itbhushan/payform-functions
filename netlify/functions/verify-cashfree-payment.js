const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'text/html; charset=utf-8'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    console.log('🔍 Payment verification started');
    console.log('Query parameters:', event.queryStringParameters);

    const { order_id, form_id, email, status } = event.queryStringParameters || {};

    if (!order_id || !form_id || !email) {
      return {
        statusCode: 400,
        headers,
        body: generateErrorPage('Missing required parameters for payment verification.')
      };
    }

    if (status === 'cancelled') {
      return {
        statusCode: 200,
        headers,
        body: generateCancelledPage()
      };
    }

    // Environment variables
    const CASHFREE_APP_ID = process.env.CASHFREE_APP_ID;
    const CASHFREE_SECRET_KEY = process.env.CASHFREE_SECRET_KEY;
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    console.log('🔍 Verifying payment with Cashfree...');

    // Get order details from Cashfree
    const orderResponse = await fetch(`https://sandbox.cashfree.com/pg/orders/${order_id}`, {
      method: 'GET',
      headers: {
        'x-client-id': CASHFREE_APP_ID,
        'x-client-secret': CASHFREE_SECRET_KEY,
        'x-api-version': '2023-08-01'
      }
    });

    if (!orderResponse.ok) {
      return {
        statusCode: 500,
        headers,
        body: generateErrorPage('Unable to verify payment with Cashfree.')
      };
    }

    const orderData = await orderResponse.json();
    console.log('✅ Order status:', orderData.order_status);

    if (orderData.order_status === 'PAID') {
      console.log('✅ Payment confirmed, updating database...');

      // Update transaction in database
      if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        
// Update transaction in database with multiple matching strategies
if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  console.log('🔍 Looking for transaction with order_id:', order_id);
  
  // Strategy 1: Try matching by transaction_id
  let { data: updatedData, error: updateError } = await supabase
    .from('transactions')
    .update({
      payment_status: 'paid',
      updated_at: new Date().toISOString()
    })
    .eq('transaction_id', order_id)
    .select();

  console.log('📊 Update result by transaction_id:', updatedData?.length || 0, 'rows affected');

  // Strategy 2: If no rows updated, try by cashfree_order_id
  if (!updatedData || updatedData.length === 0) {
    console.log('🔄 Trying to match by cashfree_order_id...');
    
    const { data: byCashfreeId, error: cashfreeError } = await supabase
      .from('transactions')
      .update({
        payment_status: 'paid',
        updated_at: new Date().toISOString()
      })
      .eq('cashfree_order_id', orderData.cf_order_id)
      .select();

    if (cashfreeError) {
      console.error('❌ Database update error:', cashfreeError);
    } else {
      console.log('✅ Transaction updated by cashfree_order_id:', byCashfreeId?.length || 0, 'rows');
    }
  } else {
    console.log('✅ Transaction updated by transaction_id successfully');
  }
}
        
        if (error) {
          console.error('❌ Database update error:', error);
        } else {
          console.log('✅ Transaction updated successfully');
        }
      }

      return {
        statusCode: 200,
        headers,
        body: generateSuccessPage(orderData, email)
      };

    } else {
      console.log('⏳ Payment not completed:', orderData.order_status);
      return {
        statusCode: 200,
        headers,
        body: generatePendingPage(orderData.order_status)
      };
    }

  } catch (error) {
    console.error('❌ Verification error:', error);
    return {
      statusCode: 500,
      headers,
      body: generateErrorPage('Payment verification failed: ' + error.message)
    };
  }
};

function generateSuccessPage(orderData, email) {
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
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success-icon">🎉</div>
          <h1 style="color: #4caf50; margin-bottom: 10px;">Payment Successful!</h1>
          <p>Thank you for your payment. Your transaction has been processed successfully.</p>
          
          <div class="amount">
            <p style="margin: 5px 0;"><strong>Order ID:</strong> ${orderData.cf_order_id}</p>
            <p style="margin: 5px 0;"><strong>Amount:</strong> ₹${orderData.order_amount}</p>
            <p style="margin: 5px 0;"><strong>Email:</strong> ${email}</p>
            <p style="margin: 5px 0;"><strong>Status:</strong> ✅ Payment Confirmed</p>
          </div>

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

function generatePendingPage(status) {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Payment Pending - PayForm</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
      </head>
      <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center; background: #f8f9fa;">
        <div style="background: white; padding: 30px; border-radius: 10px; max-width: 500px; margin: 0 auto; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <h2 style="color: #ffc107;">⏳ Payment Pending</h2>
          <p>Your payment status: <strong>${status}</strong></p>
          <p>Please wait while we process your payment.</p>
        </div>
      </body>
    </html>
  `;
}
