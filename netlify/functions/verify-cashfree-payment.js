// netlify/functions/verify-cashfree-payment.js
// This function verifies Cashfree payments and shows success/failure pages

const { createClient } = require('@supabase/supabase-js');

// Cashfree configuration
const CASHFREE_CONFIG = {
  base_url: process.env.CASHFREE_ENVIRONMENT === 'production' 
    ? 'https://api.cashfree.com' 
    : 'https://sandbox.cashfree.com',
  app_id: process.env.CASHFREE_APP_ID,
  secret_key: process.env.CASHFREE_SECRET_KEY,
};

// Supabase configuration
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event, context) => {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'text/html; charset=utf-8'
  };

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    console.log('Payment verification started');
    console.log('Query parameters:', event.queryStringParameters);

    // Get parameters from URL (Cashfree redirect)
    const { order_id, order_token, cf_order_id } = event.queryStringParameters || {};

    if (!order_id) {
      console.log('Missing order_id parameter');
      return {
        statusCode: 400,
        headers,
        body: generateErrorPage('Missing payment information. Please contact support.')
      };
    }

    console.log('Verifying payment for order:', order_id);

    // Get payment details from Cashfree
    const paymentData = await getPaymentStatus(order_id);
    
    if (!paymentData) {
      return {
        statusCode: 500,
        headers,
        body: generateErrorPage('Unable to verify payment status. Please contact support.')
      };
    }

    console.log('Payment status:', paymentData.order_status);

    // Update transaction in database
    const { data: transaction, error: updateError } = await supabase
      .from('transactions')
      .update({
        payment_status: paymentData.order_status === 'PAID' ? 'paid' : 'failed',
        cashfree_payment_id: paymentData.cf_payment_id || null,
        updated_at: new Date().toISOString()
      })
      .eq('transaction_id', order_id)
      .select()
      .single();

    if (updateError) {
      console.error('Database update error:', updateError);
    }

    // Generate appropriate response page
    if (paymentData.order_status === 'PAID') {
      console.log('Payment successful');
      
      // Create commission record
      if (transaction) {
        await createCommissionRecord(transaction);
      }
      
      return {
        statusCode: 200,
        headers,
        body: generateSuccessPage(paymentData, transaction)
      };
    } else {
      console.log('Payment failed or incomplete');
      return {
        statusCode: 200,
        headers,
        body: generateFailurePage(paymentData)
      };
    }

  } catch (error) {
    console.error('Verification error:', error);
    return {
      statusCode: 500,
      headers,
      body: generateErrorPage(`Internal error: ${error.message}`)
    };
  }
};

// Helper function to get payment status from Cashfree
async function getPaymentStatus(orderId) {
  try {
    console.log('Fetching payment status from Cashfree for order:', orderId);

    const response = await fetch(`${CASHFREE_CONFIG.base_url}/pg/orders/${orderId}`, {
      method: 'GET',
      headers: {
        'x-api-version': '2023-08-01',
        'x-client-id': CASHFREE_CONFIG.app_id,
        'x-client-secret': CASHFREE_CONFIG.secret_key
      }
    });

    if (!response.ok) {
      console.error('Cashfree API error:', response.status, await response.text());
      return null;
    }

    const data = await response.json();
    console.log('Cashfree payment data:', data);
    return data;

  } catch (error) {
    console.error('Error fetching payment status:', error);
    return null;
  }
}

// Helper function to create commission record
async function createCommissionRecord(transaction) {
  try {
    const { error } = await supabase
      .from('platform_commissions')
      .insert([{
        transaction_id: transaction.id,
        form_admin_id: transaction.admin_id,
        commission_amount: transaction.platform_commission,
        commission_rate: 3.0,
        gateway_fee: transaction.gateway_fee,
        net_amount_to_admin: transaction.net_amount_to_admin,
        status: 'completed',
        processed_at: new Date().toISOString()
      }]);

    if (error) {
      console.error('Error creating commission record:', error);
    } else {
      console.log('Commission record created successfully');
    }
  } catch (error) {
    console.error('Error in createCommissionRecord:', error);
  }
}

// Success page generator
function generateSuccessPage(paymentData, transaction) {
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
          .detail-row { 
            display: flex; 
            justify-content: space-between; 
            margin: 8px 0; 
            padding: 5px 0;
            border-bottom: 1px solid #eee;
          }
          .commission-info {
            background: #f0f8ff;
            padding: 15px;
            border-radius: 8px;
            margin: 15px 0;
            font-size: 14px;
            color: #333;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success-icon">🎉</div>
          <h1 style="color: #4caf50; margin-bottom: 10px;">Payment Successful!</h1>
          <p>Thank you for your payment. Your transaction has been processed successfully.</p>
          
          <div class="amount">
            <div class="detail-row">
              <span><strong>Product:</strong></span>
              <span>${transaction?.product_name || 'N/A'}</span>
            </div>
            <div class="detail-row">
              <span><strong>Amount Paid:</strong></span>
              <span>₹${paymentData.order_amount}</span>
            </div>
            <div class="detail-row">
              <span><strong>Payment ID:</strong></span>
              <span>${paymentData.cf_order_id}</span>
            </div>
            <div class="detail-row">
              <span><strong>Email:</strong></span>
              <span>${transaction?.email || 'N/A'}</span>
            </div>
            <div class="detail-row">
              <span><strong>Status:</strong></span>
              <span style="color: #4caf50;">✅ Paid & Confirmed</span>
            </div>
          </div>

          ${transaction ? `
          <div class="commission-info">
            <h4 style="margin-top: 0; color: #2563eb;">💰 Transaction Breakdown</h4>
            <div class="detail-row">
              <span>Total Amount:</span>
              <span>₹${transaction.payment_amount}</span>
            </div>
            <div class="detail-row">
              <span>Gateway Fee:</span>
              <span>₹${transaction.gateway_fee}</span>
            </div>
            <div class="detail-row">
              <span>Platform Commission:</span>
              <span>₹${transaction.platform_commission}</span>
            </div>
            <div class="detail-row" style="border-top: 2px solid #2563eb; padding-top: 8px; font-weight: bold;">
              <span>Amount to Form Admin:</span>
              <span style="color: #059669;">₹${transaction.net_amount_to_admin}</span>
            </div>
          </div>
          ` : ''}

          <p>You will receive a confirmation email shortly with your payment receipt.</p>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
            <p style="color: #666; font-size: 14px;">
              <strong>Powered by PayForm</strong><br>
              Secure payments processed by Cashfree
            </p>
          </div>
          
          <p style="color: #666; margin-top: 20px; font-size: 14px;">
            You can now close this window.
          </p>
        </div>
      </body>
    </html>
  `;
}

// Failure page generator
function generateFailurePage(paymentData) {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Payment Failed - PayForm</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
            margin: 0; padding: 20px; 
            background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); 
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
          .error-icon { font-size: 64px; margin-bottom: 20px; }
          .retry-btn {
            background: #3b82f6;
            color: white;
            padding: 12px 24px;
            border: none;
            border-radius: 6px;
            font-size: 16px;
            cursor: pointer;
            text-decoration: none;
            display: inline-block;
            margin: 20px 10px;
          }
          .retry-btn:hover {
            background: #2563eb;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="error-icon">❌</div>
          <h1 style="color: #dc2626; margin-bottom: 10px;">Payment Failed</h1>
          <p>Unfortunately, your payment could not be processed.</p>
          
          <div style="background: #fef2f2; padding: 20px; border-radius: 10px; margin: 20px 0; border-left: 4px solid #dc2626;">
            <p><strong>Order ID:</strong> ${paymentData.order_id}</p>
            <p><strong>Status:</strong> ${paymentData.order_status || 'Failed'}</p>
            <p><strong>Amount:</strong> ₹${paymentData.order_amount}</p>
          </div>

          <p>Possible reasons:</p>
          <ul style="text-align: left; max-width: 300px; margin: 0 auto;">
            <li>Insufficient funds</li>
            <li>Network connectivity issues</li>
            <li>Payment method declined</li>
            <li>Transaction timeout</li>
          </ul>

          <div style="margin-top: 30px;">
            <a href="javascript:history.back()" class="retry-btn">← Try Again</a>
            <a href="mailto:support@yourcompany.com" class="retry-btn">Contact Support</a>
          </div>
          
          <p style="color: #666; margin-top: 30px; font-size: 14px;">
            No charges were made to your account.
          </p>
        </div>
      </body>
    </html>
  `;
}

// Error page generator
function generateErrorPage(message) {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Payment Error - PayForm</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
            padding: 40px; 
            text-align: center; 
            background: #f8f9fa; 
          }
          .container { 
            background: white; 
            padding: 30px; 
            border-radius: 10px; 
            max-width: 500px; 
            margin: 0 auto; 
            box-shadow: 0 2px 10px rgba(0,0,0,0.1); 
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h2 style="color: #dc3545;">⚠️ Payment Error</h2>
          <p>${message}</p>
          <p>Please contact support if this issue persists.</p>
          <p><strong>Support Email:</strong> support@yourcompany.com</p>
        </div>
      </body>
    </html>
  `;
}
