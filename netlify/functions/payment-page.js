// netlify/functions/payment-page.js - Serves Cashfree payment HTML page

exports.handler = async (event, context) => {
  const headers = {
    'Content-Type': 'text/html; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-cache'
  };

  try {
    // Extract parameters from URL
    const { session, amount, product, order } = event.queryStringParameters || {};

    if (!session || !amount || !order) {
      return {
        statusCode: 400,
        headers,
        body: '<h1>Invalid payment link</h1><p>Missing required parameters.</p>'
      };
    }

    // Generate the payment HTML page
    const paymentHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Complete Your Payment - PayForm</title>
    <script src="https://sdk.cashfree.com/js/v3/cashfree.js"></script>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            margin: 0;
            padding: 20px;
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
        }
        .logo { font-size: 48px; margin-bottom: 20px; }
        .amount { 
            background: #e8f5e8; 
            padding: 20px; 
            border-radius: 10px; 
            margin: 20px 0; 
            border-left: 4px solid #4caf50; 
        }
        .pay-button {
            background: #4caf50;
            color: white;
            padding: 15px 30px;
            border: none;
            border-radius: 8px;
            font-size: 18px;
            font-weight: bold;
            cursor: pointer;
            transition: background 0.3s;
            width: 100%;
            margin-top: 20px;
        }
        .pay-button:hover {
            background: #45a049;
        }
        .loading {
            display: none;
            color: #666;
            margin-top: 15px;
        }
        .error {
            background: #ffebee;
            color: #c62828;
            padding: 15px;
            border-radius: 8px;
            margin: 15px 0;
            display: none;
        }
    </style>
</head>
<body>
    <div class="payment-container">
        <div class="logo">💳</div>
        <h1 style="color: #333; margin-bottom: 10px;">Complete Your Payment</h1>
        <p style="color: #666;">You will be redirected to Cashfree's secure payment gateway</p>
        
        <div class="amount">
            <p style="margin: 5px 0;"><strong>Product:</strong> ${decodeURIComponent(product || 'Product')}</p>
            <p style="margin: 5px 0;"><strong>Amount:</strong> ₹${amount}</p>
            <p style="margin: 5px 0;"><strong>Order ID:</strong> ${order}</p>
        </div>

        <div id="error" class="error">
            <p><strong>Payment Error:</strong> <span id="errorMessage"></span></p>
            <button onclick="location.reload()" style="margin-top: 10px; padding: 8px 16px; background: #c62828; color: white; border: none; border-radius: 4px; cursor: pointer;">
                Try Again
            </button>
        </div>

        <button id="payNowBtn" class="pay-button" onclick="initiatePayment()">
            Pay ₹${amount} Securely
        </button>
        
        <div id="loading" class="loading">
            <p>Redirecting to payment gateway...</p>
            <div style="margin-top: 10px;">
                <div style="width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #4caf50; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto;"></div>
            </div>
        </div>
        
        <p style="color: #999; font-size: 12px; margin-top: 20px;">
            🔒 Secured by Cashfree Payments
        </p>
    </div>

    <script>
        // Initialize Cashfree SDK
        let cashfree;
        
        async function initializeCashfree() {
            try {
                cashfree = Cashfree({
                    mode: "sandbox", // Change to "production" for live environment
                });
                console.log('Cashfree SDK initialized successfully');
                return true;
            } catch (error) {
                console.error('Failed to initialize Cashfree SDK:', error);
                return false;
            }
        }

        async function initiatePayment() {
            const payBtn = document.getElementById('payNowBtn');
            const loading = document.getElementById('loading');
            const errorDiv = document.getElementById('error');
            const errorMsg = document.getElementById('errorMessage');
            
            // Hide previous states
            payBtn.style.display = 'none';
            loading.style.display = 'block';
            errorDiv.style.display = 'none';
            
            try {
                // Initialize SDK if not already done
                if (!cashfree) {
                    const initialized = await initializeCashfree();
                    if (!initialized) {
                        throw new Error('Failed to initialize payment system');
                    }
                }
                
                let checkoutOptions = {
                    paymentSessionId: "${session}",
                    redirectTarget: "_self",
                };
                
                console.log('Initiating checkout with session:', "${session}");
                
                const result = await cashfree.checkout(checkoutOptions);
                
                if (result.error) {
                    throw new Error(result.error.message || 'Payment initialization failed');
                }
                
                // If we reach here without redirect, something went wrong
                console.log('Checkout result:', result);
                
            } catch (error) {
                console.error('Payment error:', error);
                
                // Show error to user
                errorMsg.textContent = error.message || 'Unable to connect to payment gateway';
                errorDiv.style.display = 'block';
                loading.style.display = 'none';
                payBtn.style.display = 'block';
            }
        }
        
        // Auto-initiate payment after page loads
        window.addEventListener('load', function() {
            // Initialize SDK first
            initializeCashfree().then(function(success) {
                if (success) {
                    // Auto-start payment after 2 seconds
                    setTimeout(initiatePayment, 2000);
                } else {
                    document.getElementById('errorMessage').textContent = 'Failed to load payment system';
                    document.getElementById('error').style.display = 'block';
                    document.getElementById('loading').style.display = 'none';
                }
            });
        });
    </script>
    
    <style>
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    </style>
</body>
</html>
    `;

    return {
      statusCode: 200,
      headers,
      body: paymentHtml
    };

  } catch (error) {
    console.error('Payment page error:', error);
    return {
      statusCode: 500,
      headers,
      body: '<h1>Error</h1><p>Unable to load payment page. Please try again.</p>'
    };
  }
};
