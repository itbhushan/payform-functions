// netlify/functions/verify-payment.js - UPDATED FOR CASHFREE
const { createClient } = require('@supabase/supabase-js');

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
    console.log('Cashfree payment verification started');
    console.log('Query parameters:', event.queryStringParameters);

    // Get parameters from URL (Cashfree return URL)
    const { order_id, form_id, email, status } = event.queryStringParameters || {};

    // Validate required parameters
    if (!order_id || !form_id || !email) {
      console.log('Missing required parameters');
      return {
        statusCode: 400,
        headers,
        body: generateErrorPage('Missing required parameters for payment verification.')
      };
    }

    // Check if payment was cancelled
    if (status === 'cancelled') {
      console.log('Payment was cancelled');
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

    if (!CASHFREE_APP_ID || !CASHFREE_SECRET_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.log('Missing environment variables');
      return {
        statusCode: 500,
        headers,
        body: generateErrorPage('Server configuration error. Please contact support.')
      };
    }

    console.log('Verifying payment with Cashfree...');

    // Verify payment with Cashfree API
    const cashfreeResponse = await fetch(`https://sandbox.cashfree.com/pg/orders/${order_id}`, {
      method: 'GET',
      headers: {
        'x-client-id': CASHFREE_APP_ID,
        'x-client-secret': CASHFREE_SECRET_KEY,
        'x-api-version': '2023-08-01',
        'Accept': 'application/json'
      }
    });

    if (!cashfreeResponse.ok) {
      const errorText = await cashfreeResponse.text();
      console.error('Cashfree API error:', cashfreeResponse.status, errorText);
      return {
        statusCode: 500,
        headers,
        body: generateErrorPage('Unable to verify payment with Cashfree. Please contact support.')
      };
    }

    const orderData = await cashfreeResponse.json();
    console.log('Cashfree order status:', orderData.order_status);
    console.log('Cashfree order data:', orderData);

    if (orderData.order_status === 'PAID') {
      console.log('Payment confirmed, updating transaction...');

      // Extract product details from order or database
      const productName = orderData.order_note || orderData.order_tags?.product_name || 'Purchase';
      const productPrice = orderData.order_amount;

      // Calculate commission breakdown
      const totalAmount = parseFloat(productPrice);
      const gatewayFee = (totalAmount * 2.5 / 100) + 3; // 2.5% + ₹3
      const platformCommission = totalAmount * 3 / 100; // 3%
      const netAmountToAdmin = totalAmount - gatewayFee - platformCommission;

      // Update transaction in Supabase
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

      // Find and update the transaction
      const { data: transaction, error: findError } = await supabase
        .from('transactions')
        .select('*')
        .eq('cashfree_order_id', order_id)
        .single();

      if (findError || !transaction) {
        console.error('Transaction not found:', findError);
        // Still show success but mention logging issue
        return {
          statusCode: 200,
          headers,
          body: generateSuccessPage(orderData, email, productName, true) // true = logging issue
        };
      }

      // Update transaction status
      const { error: updateError } = await supabase
        .from('transactions')
        .update({
          payment_status: 'paid',
          cashfree_payment_id: orderData.cf_order_id,
          gateway_fee: gatewayFee,
          platform_commission: platformCommission,
          net_amount_to_admin: netAmountToAdmin,
          payment_completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', transaction.id);

      if (updateError) {
        console.error('Database update error:', updateError);
        // Still show success but mention logging issue
        return {
          statusCode: 200,
          headers,
          body: generateSuccessPage(orderData, email, productName, true) // true = logging issue
        };
      }

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
          cashfree_payment_id: orderData.cf_order_id,
          processed_at: new Date().toISOString()
        });

      if (commissionError) {
        console.error('Commission record error:', commissionError);
      }

      console.log('Transaction updated successfully');
      return {
        statusCode: 200,
        headers,
        body: generateSuccessPage(orderData, email, productName, false) // false = no logging issue
      };

    } else {
      console.log('Payment not completed:', orderData.order_status);
      return {
        statusCode: 400,
        headers,
        body: generateIncompletePaymentPage(orderData.order_status)
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
function generateSuccessPage(orderData, email, productName, hasLoggingIssue) {
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
          .warning { 
            background: #fff3cd; 
            padding: 15px; 
            border-radius: 8px; 
            margin: 15px 0; 
            border-left: 4px solid #ffc107; 
            color: #856404; 
          }
          .commission-breakdown {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 8px;
            margin: 15px 0;
            text-align: left;
            font-size: 14px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success-icon">🎉</div>
          <h1 style="color: #4caf50; margin-bottom: 10px;">Payment Successful!</h1>
          <p>Thank you for your payment via Cashfree. Your transaction has been processed successfully.</p>
          
          <div class="amount">
            <p style="margin: 5px 0;"><strong>Product:</strong> ${productName}</p>
            <p style="margin: 5px 0;"><strong>Order ID:</strong> ${orderData.order_id}</p>
            <p style="margin: 5px 0;"><strong>Amount:</strong> ₹${orderData.order_amount}</p>
            <p style="margin: 5px 0;"><strong>Email:</strong> ${email}</p>
            <p style="margin: 5px 0;"><strong>Status:</strong> ✅ PAID${hasLoggingIssue ? ' (logging issue)' : ' & Logged'}</p>
          </div>

          <div class="commission-breakdown">
            <h4 style="margin: 0 0 10px 0; color: #495057;">💰 Transaction Breakdown</h4>
            <div style="display: flex; justify-content: space-between; margin: 5px 0;">
              <span>Subtotal:</span>
              <span>₹${orderData.order_amount}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin: 5px 0; color: #6c757d;">
              <span>Gateway Fee (2.5% + ₹3):</span>
              <span>₹${((parseFloat(orderData.order_amount) * 2.5 / 100) + 3).toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin: 5px 0; color: #6c757d;">
              <span>Platform Fee (3%):</span>
              <span>₹${(parseFloat(orderData.order_amount) * 3 / 100).toFixed(2)}</span>
            </div>
            <div style="border-top: 1px solid #dee2e6; margin: 10px 0; padding-top: 5px;">
              <div style="display: flex; justify-content: space-between; font-weight: bold;">
                <span>Form Owner Receives:</span>
                <span style="color: #28a745;">₹${(parseFloat(orderData.order_amount) - ((parseFloat(orderData.order_amount) * 2.5 / 100) + 3) - (parseFloat(orderData.order_amount) * 3 / 100)).toFixed(2)}</span>
              </div>
            </div>
          </div>

          ${hasLoggingIssue ? '<div class="warning"><strong>Note:</strong> Payment was successful but there was a minor issue logging the transaction. Please save the order ID above.</div>' : ''}

          <p>You will receive a confirmation email shortly.</p>
          
          <div style="margin-top: 20px;">
            <button onclick="downloadReceipt()" style="background: #007bff; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; margin-right: 10px;">
              📄 Download Receipt
            </button>
            <button onclick="window.close()" style="background: #6c757d; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer;">
              Close Window
            </button>
          </div>
          
          <p style="color: #666; margin-top: 30px; font-size: 14px;">
            Powered by <strong>PayForm</strong> & <strong>Cashfree</strong>
          </p>
        </div>

        <script>
          function downloadReceipt() {
            const receiptContent = \`
PAYMENT RECEIPT
===============

Product: ${productName}
Order ID: ${orderData.order_id}
Amount: ₹${orderData.order_amount}
Email: ${email}
Date: \${new Date().toLocaleDateString('en-IN')}
Status: PAID

Payment Gateway: Cashfree
Platform: PayForm

Thank you for your payment!
            \`.trim();
            
            const blob = new Blob([receiptContent], { type: 'text/plain' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = \`PayForm-Receipt-\${${orderData.order_id}}.txt\`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
          }
        </script>
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
          <p style="color: #666; margin-top: 20px; font-size: 14px;">Powered by PayForm & Cashfree</p>
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
          <p style="color: #666; margin-top: 20px; font-size: 14px;">Powered by PayForm & Cashfree</p>
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
          <p style="color: #666; margin-top: 20px; font-size: 14px;">Powered by PayForm & Cashfree</p>
        </div>
      </body>
    </html>
  `;
}
