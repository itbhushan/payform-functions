// netlify/functions/verify-payment.js - FIXED VERSION
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
    console.log('🔍 Cashfree payment verification started');
    console.log('📥 Query parameters:', event.queryStringParameters);

    // Get parameters from URL (Cashfree return URL)
    const { order_id, form_id, email, status } = event.queryStringParameters || {};

    // Validate required parameters
    if (!order_id || !form_id || !email) {
      console.error('❌ Missing required parameters:', { order_id, form_id, email });
      return {
        statusCode: 400,
        headers,
        body: generateErrorPage('Missing required parameters for payment verification.')
      };
    }

    // Check if payment was cancelled
    if (status === 'cancelled') {
      console.log('⚠️ Payment was cancelled');
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

    console.log('🔧 Environment check:', {
      CASHFREE_APP_ID: !!CASHFREE_APP_ID,
      CASHFREE_SECRET_KEY: !!CASHFREE_SECRET_KEY,
      SUPABASE_URL: !!SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: !!SUPABASE_SERVICE_ROLE_KEY
    });

    if (!CASHFREE_APP_ID || !CASHFREE_SECRET_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error('❌ Missing environment variables');
      return {
        statusCode: 500,
        headers,
        body: generateErrorPage('Server configuration error. Please contact support.')
      };
    }

    console.log('🔍 Verifying payment with Cashfree API...');

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

    console.log('📡 Cashfree API response:', {
      status: cashfreeResponse.status,
      ok: cashfreeResponse.ok
    });

    if (!cashfreeResponse.ok) {
      const errorText = await cashfreeResponse.text();
      console.error('❌ Cashfree API error:', cashfreeResponse.status, errorText);
      
      // If order not found, it might be a payment link, try the links endpoint
      if (cashfreeResponse.status === 404) {
        console.log('🔄 Trying payment links endpoint...');
        
        const linkResponse = await fetch(`https://sandbox.cashfree.com/pg/links/${order_id}`, {
          method: 'GET',
          headers: {
            'x-client-id': CASHFREE_APP_ID,
            'x-client-secret': CASHFREE_SECRET_KEY,
            'x-api-version': '2023-08-01',
            'Accept': 'application/json'
          }
        });

        if (linkResponse.ok) {
          const linkData = await linkResponse.json();
          console.log('💳 Payment link data:', linkData);
          
          // Check if payment link has been paid
          if (linkData.link_amount_paid >= linkData.link_amount) {
            return await handlePaymentSuccess(linkData, email, order_id, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
          } else {
            return {
              statusCode: 200,
              headers,
              body: generatePendingPage(`Payment not completed. Amount paid: ₹${linkData.link_amount_paid} of ₹${linkData.link_amount}`)
            };
          }
        }
      }
      
      return {
        statusCode: 500,
        headers,
        body: generateErrorPage('Unable to verify payment with Cashfree. Please contact support.')
      };
    }

    const orderData = await cashfreeResponse.json();
    console.log('💳 Cashfree order data:', {
      order_id: orderData.order_id,
      order_status: orderData.order_status,
      order_amount: orderData.order_amount
    });

    if (orderData.order_status === 'PAID') {
      return await handlePaymentSuccess(orderData, email, order_id, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    } else {
      console.log('⏳ Payment not completed:', orderData.order_status);
      return {
        statusCode: 200,
        headers,
        body: generatePendingPage(orderData.order_status)
      };
    }

  } catch (error) {
    console.error('❌ Function error:', error);
    return {
      statusCode: 500,
      headers,
      body: generateErrorPage(`Internal error: ${error.message}`)
    };
  }
};

// Handle successful payment
async function handlePaymentSuccess(paymentData, email, orderId, supabaseUrl, supabaseKey) {
  try {
    console.log('✅ Processing successful payment...');

    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Find the transaction by order_id
    const { data: transaction, error: findError } = await supabase
      .from('transactions')
      .select('*')
      .eq('cashfree_order_id', orderId)
      .single();

    console.log('🔍 Transaction lookup:', {
      found: !!transaction,
      error: findError?.message,
      orderId
    });

    if (findError || !transaction) {
      console.error('❌ Transaction not found:', findError);
      // Still show success but mention logging issue
      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'text/html; charset=utf-8'
        },
        body: generateSuccessPage(paymentData, email, 'Purchase', true) // true = logging issue
      };
    }

    // Calculate commission breakdown
    const totalAmount = parseFloat(paymentData.order_amount || paymentData.link_amount);
    const gatewayFee = (totalAmount * 2.5 / 100) + 3;
    const platformCommission = totalAmount * 3 / 100;
    const netAmountToAdmin = totalAmount - gatewayFee - platformCommission;

    // Update transaction status
    const { error: updateError } = await supabase
      .from('transactions')
      .update({
        payment_status: 'paid',
        cashfree_payment_id: paymentData.cf_order_id || paymentData.cf_link_id,
        gateway_fee: gatewayFee,
        platform_commission: platformCommission,
        net_amount_to_admin: netAmountToAdmin,
        payment_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', transaction.id);

    if (updateError) {
      console.error('❌ Database update error:', updateError);
      // Still show success but mention logging issue
      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'text/html; charset=utf-8'
        },
        body: generateSuccessPage(paymentData, email, transaction.product_name, true)
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
        cashfree_payment_id: paymentData.cf_order_id || paymentData.cf_link_id,
        processed_at: new Date().toISOString()
      });

    if (commissionError) {
      console.error('⚠️ Commission record error:', commissionError);
      // Continue anyway
    } else {
      console.log('✅ Commission record created');
    }

    console.log('✅ Transaction updated successfully');
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'text/html; charset=utf-8'
      },
      body: generateSuccessPage(paymentData, email, transaction.product_name, false)
    };

  } catch (error) {
    console.error('❌ Error in handlePaymentSuccess:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'text/html; charset=utf-8'
      },
      body: generateErrorPage(`Error processing payment: ${error.message}`)
    };
  }
}

// Helper functions to generate HTML pages
function generateSuccessPage(paymentData, email, productName, hasLoggingIssue) {
  const amount = paymentData.order_amount || paymentData.link_amount;
  const paymentId = paymentData.order_id || paymentData.link_id;
  
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
          .success-icon { font-size: 64px; margin-bottom: 20px; animation: bounce 1s infinite; }
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
          @keyframes bounce {
            0%, 20%, 50%, 80%, 100% { transform: translateY(0); }
            40% { transform: translateY(-10px); }
            60% { transform: translateY(-5px); }
          }
          .btn {
            background: #007bff;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            margin: 5px;
            text-decoration: none;
            display: inline-block;
          }
          .btn:hover { background: #0056b3; }
          .btn-secondary { background: #6c757d; }
          .btn-secondary:hover { background: #545b62; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success-icon">🎉</div>
          <h1 style="color: #4caf50; margin-bottom: 10px;">Payment Successful!</h1>
          <p>Thank you for your payment via Cashfree. Your transaction has been processed successfully.</p>
          
          <div class="amount">
            <p style="margin: 5px 0;"><strong>Product:</strong> ${productName}</p>
            <p style="margin: 5px 0;"><strong>Payment ID:</strong> ${paymentId}</p>
            <p style="margin: 5px 0;"><strong>Amount:</strong> ₹${amount}</p>
            <p style="margin: 5px 0;"><strong>Email:</strong> ${email}</p>
            <p style="margin: 5px 0;"><strong>Status:</strong> ✅ PAID${hasLoggingIssue ? ' (logging issue)' : ' & Logged'}</p>
          </div>

          <div class="commission-breakdown">
            <h4 style="margin: 0 0 10px 0; color: #495057;">💰 Transaction Breakdown</h4>
            <div style="display: flex; justify-content: space-between; margin: 5px 0;">
              <span>Total Amount:</span>
              <span>₹${amount}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin: 5px 0; color: #6c757d;">
              <span>Gateway Fee (2.5% + ₹3):</span>
              <span>₹${((parseFloat(amount) * 2.5 / 100) + 3).toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin: 5px 0; color: #6c757d;">
              <span>Platform Fee (3%):</span>
              <span>₹${(parseFloat(amount) * 3 / 100).toFixed(2)}</span>
            </div>
            <div style="border-top: 1px solid #dee2e6; margin: 10px 0; padding-top: 5px;">
              <div style="display: flex; justify-content: space-between; font-weight: bold;">
                <span>Form Owner Receives:</span>
                <span style="color: #28a745;">₹${(parseFloat(amount) - ((parseFloat(amount) * 2.5 / 100) + 3) - (parseFloat(amount) * 3 / 100)).toFixed(2)}</span>
              </div>
            </div>
          </div>

          ${hasLoggingIssue ? '<div class="warning"><strong>Note:</strong> Payment was successful but there was a minor issue logging the transaction. Please save the payment ID above.</div>' : ''}

          <p>You will receive a confirmation email shortly.</p>
          
          <div style="margin-top: 20px;">
            <button onclick="downloadReceipt()" class="btn">
              📄 Download Receipt
            </button>
            <button onclick="window.close()" class="btn btn-secondary">
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
PAYFORM PAYMENT RECEIPT
======================

Product: ${productName}
Payment ID: ${paymentId}
Amount: ₹${amount}
Email: ${email}
Date: \${new Date().toLocaleDateString('en-IN')}
Time: \${new Date().toLocaleTimeString('en-IN')}
Status: PAID

Gateway: Cashfree
Platform: PayForm

Thank you for your payment!

---
PayForm - Secure payments for Google Forms
            \`.trim();
            
            const blob = new Blob([receiptContent], { type: 'text/plain' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = \`PayForm-Receipt-\${Date.now()}.txt\`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
          }
          
          // Auto-close after 5 minutes
          setTimeout(() => {
            if (confirm('This window will close automatically. Click Cancel to keep it open.')) {
              window.close();
            }
          }, 300000);
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
          <p>Payment status: <strong>${status}</strong></p>
          <p>Please complete your payment or try again.</p>
          <p style="color: #666; margin-top: 20px; font-size: 14px;">Powered by PayForm & Cashfree</p>
        </div>
      </body>
    </html>
  `;
}
