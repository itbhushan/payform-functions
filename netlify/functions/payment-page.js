// netlify/functions/payment-page.js - Updated for Razorpay Payment Processing
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event, context) => {
  const headers = {
    'Content-Type': 'text/html; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-cache'
  };

  try {
    // Extract parameters from URL
    const { order_id, email, amount, product_name, form_id } = event.queryStringParameters || {};

    console.log('📄 Payment page requested:', { order_id, email, amount, product_name });

    // Validate required parameters
    if (!order_id) {
      return {
        statusCode: 400,
        headers,
        body: generateErrorPage('Missing order ID')
      };
    }

    // Fetch order details from database
    const { data: transaction, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('razorpay_order_id', order_id)
      .single();

    if (error || !transaction) {
      console.error('❌ Transaction not found:', error);
      return {
        statusCode: 404,
        headers,
        body: generateErrorPage('Transaction not found')
      };
    }

    console.log('✅ Transaction found:', transaction.id);

    // Generate payment page with Razorpay integration
    const paymentPage = generateRazorpayPaymentPage({
      orderId: order_id,
      amount: transaction.payment_amount,
      currency: transaction.payment_currency || 'INR',
      email: transaction.email,
      customerName: transaction.customer_name || 'Customer',
      productName: transaction.product_name || 'Product',
      formId: transaction.form_id,
      transactionId: transaction.id
    });

    return {
      statusCode: 200,
      headers,
      body: paymentPage
    };

  } catch (error) {
    console.error('❌ Payment page error:', error);
    return {
      statusCode: 500,
      headers,
      body: generateErrorPage('Internal server error')
    };
  }
};

function generateRazorpayPaymentPage(orderData) {
  const { orderId, amount, currency, email, customerName, productName, formId, transactionId } = orderData;
  
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Complete Payment - PayForm</title>
        <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                margin: 0;
                padding: 20px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .payment-container {
                background: white;
                padding: 40px;
                border-radius: 15px;
                box-shadow: 0 20px 40px rgba(0,0,0,0.1);
                max-width: 500px;
                text-align: center;
                width: 100%;
            }
            .logo {
                font-size: 48px;
                margin-bottom: 20px;
            }
            .amount {
                background: #f8f9ff;
                padding: 20px;
                border-radius: 10px;
                margin: 20px 0;
                border-left: 4px solid #3b82f6;
            }
            .btn-pay {
                background: #3b82f6;
                color: white;
                border: none;
                padding: 15px 30px;
                border-radius: 8px;
                font-size: 16px;
                font-weight: 600;
                cursor: pointer;
                width: 100%;
                margin: 20px 0;
                transition: background 0.3s;
            }
            .btn-pay:hover {
                background: #2563eb;
            }
            .btn-pay:disabled {
                background: #9ca3af;
                cursor: not-allowed;
            }
            .security-info {
                background: #f0f9ff;
                padding: 15px;
                border-radius: 8px;
                margin: 20px 0;
                font-size: 14px;
                color: #0369a1;
            }
            .loading {
                display: none;
                font-size: 14px;
                color: #6b7280;
                margin-top: 10px;
            }
            .error {
                display: none;
                background: #fef2f2;
                color: #dc2626;
                padding: 15px;
                border-radius: 8px;
                margin: 15px 0;
                border-left: 4px solid #dc2626;
            }
        </style>
    </head>
    <body>
        <div class="payment-container">
            <div class="logo">💳</div>
            <h1 style="color: #1f2937; margin-bottom: 10px;">Complete Your Payment</h1>
            <p style="color: #6b7280; margin-bottom: 30px;">Secure payment powered by Razorpay</p>
            
            <div class="amount">
                <h3 style="margin: 0; color: #1f2937;">Order Summary</h3>
                <p style="margin: 10px 0 5px 0;"><strong>Product:</strong> ${productName}</p>
                <p style="margin: 5px 0;"><strong>Customer:</strong> ${customerName}</p>
                <p style="margin: 5px 0;"><strong>Email:</strong> ${email}</p>
                <p style="margin: 10px 0 0 0; font-size: 24px; font-weight: bold; color: #3b82f6;">
                    ₹${amount}
                </p>
            </div>

            <button id="payButton" class="btn-pay" onclick="startPayment()">
                🔒 Pay ₹${amount} Securely
            </button>

            <div id="loading" class="loading">
                Processing payment... Please wait
            </div>

            <div id="error" class="error">
                Payment failed. Please try again or contact support.
            </div>

            <div class="security-info">
                🔒 Your payment is secured with 256-bit SSL encryption.<br>
                All transactions are processed securely by Razorpay.
            </div>

            <p style="color: #9ca3af; font-size: 12px; margin-top: 30px;">
                Order ID: ${orderId}<br>
                PayForm - Secure Payment Processing
            </p>
        </div>

        <script>
            const RAZORPAY_KEY = '${process.env.RAZORPAY_KEY_ID}'; // Your Razorpay Key ID
            
            let paymentInProgress = false;

            function startPayment() {
                if (paymentInProgress) return;
                
                paymentInProgress = true;
                document.getElementById('payButton').disabled = true;
                document.getElementById('loading').style.display = 'block';
                document.getElementById('error').style.display = 'none';

                const options = {
                    key: RAZORPAY_KEY,
                    amount: ${amount * 100}, // Convert to paise
                    currency: '${currency}',
                    name: 'PayForm',
                    description: '${productName}',
                    order_id: '${orderId}',
                    prefill: {
                        name: '${customerName}',
                        email: '${email}',
                        contact: ''
                    },
                    theme: {
                        color: '#3b82f6'
                    },
                    handler: function(response) {
                        console.log('✅ Payment successful:', response);
                        handlePaymentSuccess(response);
                    },
                    modal: {
                        ondismiss: function() {
                            console.log('⚠️ Payment cancelled by user');
                            resetPaymentButton();
                        }
                    }
                };

                try {
                    const razorpay = new Razorpay(options);
                    
                    razorpay.on('payment.failed', function(response) {
                        console.error('❌ Payment failed:', response.error);
                        handlePaymentFailure(response.error);
                    });

                    razorpay.open();
                } catch (error) {
                    console.error('❌ Razorpay initialization error:', error);
                    handlePaymentFailure({ description: 'Payment initialization failed' });
                }
            }

function handlePaymentSuccess(response) {
    document.getElementById('loading').innerHTML = 'Payment successful! Verifying...';
    
    // Build query parameters for verification (matching your verify function)
    const verifyUrl = `/.netlify/functions/verify-razorpay-payment?` +
        `razorpay_payment_id=${encodeURIComponent(response.razorpay_payment_id)}&` +
        `razorpay_order_id=${encodeURIComponent(response.razorpay_order_id)}&` +
        `razorpay_signature=${encodeURIComponent(response.razorpay_signature)}&` +
        `order_id=${encodeURIComponent(response.razorpay_order_id)}&` +
        `form_id=${encodeURIComponent('${formId}')}&` +
        `email=${encodeURIComponent('${email}')}`;
    
    console.log('🔗 Verification URL:', verifyUrl);
    
    // Redirect to verification function (GET request with query parameters)
    window.location.href = verifyUrl;
}

            function handlePaymentFailure(error) {
                console.error('❌ Payment failed:', error);
                document.getElementById('error').innerHTML = 
                    \`Payment failed: \${error.description || 'Unknown error'}. Please try again.\`;
                document.getElementById('error').style.display = 'block';
                resetPaymentButton();
            }

            function resetPaymentButton() {
                paymentInProgress = false;
                document.getElementById('payButton').disabled = false;
                document.getElementById('loading').style.display = 'none';
            }

            // Auto-start payment when page loads (optional)
            // window.onload = function() {
            //     setTimeout(startPayment, 1000);
            // };
        </script>
    </body>
    </html>
  `;
}

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
                margin: 0;
                padding: 40px;
                background: #f8fafc;
                display: flex;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
            }
            .error-container {
                background: white;
                padding: 40px;
                border-radius: 10px;
                max-width: 500px;
                text-align: center;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            }
            .error-icon {
                font-size: 64px;
                margin-bottom: 20px;
            }
        </style>
    </head>
    <body>
        <div class="error-container">
            <div class="error-icon">❌</div>
            <h2 style="color: #dc2626; margin-bottom: 10px;">Payment Error</h2>
            <p style="color: #6b7280; margin-bottom: 30px;">${message}</p>
            <p style="color: #9ca3af; font-size: 14px;">
                Please contact support if this issue persists.
            </p>
        </div>
    </body>
    </html>
  `;
}
