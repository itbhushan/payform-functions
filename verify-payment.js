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
    console.log('Payment verification started');
    console.log('Query parameters:', event.queryStringParameters);

    // Get parameters from URL
    const { session_id, form_id, email, status } = event.queryStringParameters || {};

    // Validate required parameters
    if (!session_id || !form_id || !email) {
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

    // Environment variables (set these in Netlify)
    const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!STRIPE_SECRET_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.log('Missing environment variables');
      return {
        statusCode: 500,
        headers,
        body: generateErrorPage('Server configuration error. Please contact support.')
      };
    }

    console.log('Verifying payment with Stripe...');

    // Verify payment with Stripe
    const stripeResponse = await fetch(`https://api.stripe.com/v1/checkout/sessions/${session_id}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    if (!stripeResponse.ok) {
      const errorText = await stripeResponse.text();
      console.error('Stripe API error:', stripeResponse.status, errorText);
      return {
        statusCode: 500,
        headers,
        body: generateErrorPage('Unable to verify payment with Stripe. Please contact support.')
      };
    }

    const session = await stripeResponse.json();
    console.log('Stripe session status:', session.payment_status);
    console.log('Stripe session metadata:', session.metadata);

    if (session.payment_status === 'paid') {
      console.log('Payment confirmed, logging transaction...');

      // Extract product details from line items or metadata
      const productName = session.metadata?.product_name || 
                          (session.line_items?.data?.[0]?.description) || 
                          'Unknown Product';
      
      const productPrice = session.metadata?.product_price || 
                          (session.amount_total / 100);

      // Prepare transaction data with product details
      const transactionData = {
        form_id: form_id,
        email: email,
        payment_provider: 'stripe',
        payment_status: session.payment_status,
        payment_amount: session.amount_total / 100,
        payment_currency: session.currency,
        transaction_id: session.payment_intent,
        product_name: productName, // Add product name
        product_price: parseFloat(productPrice), // Add product price
        created_at: new Date().toISOString()
      };

      console.log('Transaction data to log:', transactionData);

      // Log transaction to Supabase
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { error } = await supabase.from('transactions').insert([transactionData]);

      if (error) {
        console.error('Database insert error:', error);
        // Still show success but mention logging issue
        return {
          statusCode: 200,
          headers,
          body: generateSuccessPage(session, email, productName, true) // true = logging issue
        };
      }

      console.log('Transaction logged successfully');
      return {
        statusCode: 200,
        headers,
        body: generateSuccessPage(session, email, productName, false) // false = no logging issue
      };

    } else {
      console.log('Payment not completed:', session.payment_status);
      return {
        statusCode: 400,
        headers,
        body: generateIncompletePaymentPage(session.payment_status)
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
function generateSuccessPage(session, email, productName, hasLoggingIssue) {
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
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success-icon">🎉</div>
          <h1 style="color: #4caf50; margin-bottom: 10px;">Payment Successful!</h1>
          <p>Thank you for your payment. Your transaction has been processed successfully.</p>
          
          <div class="amount">
            <p style="margin: 5px 0;"><strong>Product:</strong> ${productName}</p>
            <p style="margin: 5px 0;"><strong>Payment ID:</strong> ${session.payment_intent}</p>
            <p style="margin: 5px 0;"><strong>Amount:</strong> ${session.currency.toUpperCase()} ${session.amount_total / 100}</p>
            <p style="margin: 5px 0;"><strong>Email:</strong> ${email}</p>
            <p style="margin: 5px 0;"><strong>Status:</strong> ✅ Paid${hasLoggingIssue ? ' (logging issue)' : ' & Logged'}</p>
          </div>

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
