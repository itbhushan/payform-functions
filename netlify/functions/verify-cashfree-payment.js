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
    console.log('📊 Full order data:', JSON.stringify(orderData, null, 2));

    // Handle both PAID and ACTIVE status as successful
    if (orderData.order_status === 'PAID' || orderData.order_status === 'ACTIVE') {
      console.log('✅ Payment confirmed, updating database...');

      // Update transaction in database - SINGLE CLEAN IMPLEMENTATION
      if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        
        console.log('🔍 Looking for transaction with order_id:', order_id);
        
// Strategy 1: Try matching by cashfree_order_id first
let { data: updatedData, error: updateError } = await supabase
  .from('transactions')
  .update({
    payment_status: 'paid',
    cashfree_payment_id: orderData.cf_order_id,
    customer_name: orderData.customer_details.customer_name,
    updated_at: new Date().toISOString()
  })
  .eq('cashfree_order_id', order_id)
  .select();
        
        console.log('📊 Update result by cashfree_order_id:', updatedData?.length || 0, 'rows affected');

        // Strategy 2: If no rows updated, try by matching transaction_id field
        if (!updatedData || updatedData.length === 0) {
          console.log('🔄 Trying to match by transaction_id field...');
          
          const { data: byTransactionId, error: transactionError } = await supabase
            .from('transactions')
            .update({
              payment_status: 'paid',
              cashfree_order_id: orderData.cf_order_id,
              updated_at: new Date().toISOString()
            })
            .eq('transaction_id', order_id)
            .select();

          if (transactionError) {
            console.error('❌ Database update error:', transactionError);
          } else {
            console.log('✅ Transaction updated by transaction_id:', byTransactionId?.length || 0, 'rows');
            updatedData = byTransactionId;
          }
        } else {
          console.log('✅ Transaction updated by cashfree_order_id successfully');
        }

        // Strategy 3: If still no match, try by email and form_id
        if (!updatedData || updatedData.length === 0) {
          console.log('🔄 Trying to match by email and form_id...');
          
          const { data: byEmailForm, error: emailFormError } = await supabase
            .from('transactions')
            .update({
              payment_status: 'paid',
              cashfree_order_id: orderData.cf_order_id,
              transaction_id: order_id,
              updated_at: new Date().toISOString()
            })
            .eq('email', email)
            .eq('form_id', form_id)
            .eq('payment_status', 'pending')
            .select();

          if (emailFormError) {
            console.error('❌ Database update error:', emailFormError);
          } else {
            console.log('✅ Transaction updated by email+form_id:', byEmailForm?.length || 0, 'rows');
            updatedData = byEmailForm;
          }
        }

        if (updateError && !updatedData) {
          console.error('❌ All database update attempts failed:', updateError);
        }
      }

// Send confirmation email to customer
try {
  await sendCustomerConfirmationEmail(orderData, email, form_id);
  console.log('✅ Confirmation email process completed');
} catch (emailError) {
  console.error('❌ Confirmation email failed:', emailError);
  console.log('⚠️ Payment verification continues normally despite email failure');
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

// Send customer confirmation email
const sendCustomerConfirmationEmail = async (orderData, email, formId) => {
  try {
    console.log(`📧 Sending confirmation email to ${email}`);

    // Get form and admin info for personalized email
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    const { data: formData, error: formError } = await supabase
      .from('form_configs')
      .select(`
        form_name,
        admin_id,
        form_admins (
          name,
          email
        )
      `)
      .eq('form_id', formId)
      .single();

    if (formError || !formData) {
      console.log('⚠️ Could not get form info, sending basic confirmation');
    }

    const adminInfo = formData?.form_admins?.[0] || { name: 'PayForm Team' };
    const formName = formData?.form_name || 'Your Form';
    const adminId = formData?.admin_id;

    // Generate confirmation email template
    const emailHtml = generateConfirmationEmailTemplate(orderData, email, formName, adminInfo);

    // Send email using same system as payment links
    const emailResponse = await fetch(`${process.env.SUPABASE_URL}/functions/v1/send-payment-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
      },
      body: JSON.stringify({
        to: email,
        subject: `Payment Confirmation - ${orderData.cf_order_id}`,
        html: emailHtml,
        productName: 'Payment Confirmation',
        amount: orderData.order_amount,
        customerName: orderData.customer_details?.customer_name || 'Customer',
        formName: formName,
        adminId: adminId || 'default'
      })
    });

    const emailResult = await emailResponse.json();
    
    if (emailResult.success) {
      console.log(`✅ Confirmation email sent to ${email}`);
      return true;
    } else {
      console.error(`❌ Failed to send confirmation email:`, emailResult.error);
      return false;
    }

  } catch (error) {
    console.error('❌ Error sending confirmation email:', error);
    return false;
  }
};

// Generate customer confirmation email template
const generateConfirmationEmailTemplate = (orderData, email, formName, adminInfo) => {
  const amount = orderData.order_amount;
  const orderId = orderData.cf_order_id;
  const customerName = orderData.customer_details?.customer_name || 'Customer';
  const paymentTime = new Date().toLocaleString('en-IN', { 
    timeZone: 'Asia/Kolkata',
    dateStyle: 'full',
    timeStyle: 'short'
  });
  
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; background: #f9fafb; padding: 20px;">
      
      <!-- Success Header -->
      <div style="text-align: center; background: white; padding: 40px 20px; border-radius: 12px; margin-bottom: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.05);">
        <div style="font-size: 64px; margin-bottom: 20px;">🎉</div>
        <h1 style="color: #10b981; margin: 0 0 10px 0; font-size: 28px;">Payment Successful!</h1>
        <p style="color: #666; font-size: 18px; margin: 0;">Thank you for your payment, ${customerName}</p>
      </div>
      
      <!-- Payment Details Card -->
      <div style="background: white; border-radius: 12px; padding: 30px; margin-bottom: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.05);">
        <h2 style="color: #065f46; margin: 0 0 20px 0; font-size: 20px; border-bottom: 2px solid #10b981; padding-bottom: 10px;">📋 Payment Receipt</h2>
        
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb;"><strong>Transaction ID:</strong></td>
            <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; text-align: right; font-family: monospace; color: #4b5563;">${orderId}</td>
          </tr>
          <tr>
            <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb;"><strong>Amount Paid:</strong></td>
            <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; text-align: right; color: #10b981; font-weight: bold; font-size: 18px;">₹${amount}</td>
          </tr>
          <tr>
            <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb;"><strong>Customer:</strong></td>
            <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; text-align: right;">${customerName}</td>
          </tr>
          <tr>
            <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb;"><strong>Email:</strong></td>
            <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; text-align: right;">${email}</td>
          </tr>
          <tr>
            <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb;"><strong>Form:</strong></td>
            <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; text-align: right;">${formName}</td>
          </tr>
          <tr>
            <td style="padding: 12px 0;"><strong>Payment Date:</strong></td>
            <td style="padding: 12px 0; text-align: right;">${paymentTime}</td>
          </tr>
        </table>
      </div>
      
      <!-- Status Confirmation -->
      <div style="background: #ecfdf5; border: 2px solid #10b981; border-radius: 12px; padding: 20px; margin-bottom: 20px; text-align: center;">
        <h3 style="color: #065f46; margin: 0 0 10px 0; font-size: 18px;">✅ Payment Status: CONFIRMED</h3>
        <p style="margin: 0; color: #047857; font-size: 16px;">
          Your transaction has been processed successfully and payment is complete.
        </p>
      </div>
      
      <!-- Important Notes -->
      <div style="background: white; border-radius: 12px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.05);">
        <h3 style="color: #1f2937; margin: 0 0 15px 0;">📝 Important Information:</h3>
        <ul style="margin: 0; padding-left: 20px; color: #4b5563; line-height: 1.6;">
          <li>Keep this email as your payment receipt</li>
          <li>Your transaction ID is: <strong>${orderId}</strong></li>
          <li>Payment processed securely by Cashfree</li>
          <li>If you have questions, reply to this email</li>
        </ul>
      </div>
      
      <!-- Contact Information -->
      <div style="text-align: center; background: white; padding: 20px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.05);">
        <p style="color: #6b7280; margin: 0 0 10px 0;">Need help or have questions?</p>
        <p style="color: #374151; margin: 0; font-weight: 500;">
          📧 Reply to this email<br>
          💬 Contact: ${adminInfo?.name || 'PayForm Team'}
        </p>
      </div>
      
      <!-- Footer -->
      <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
        <p style="font-size: 12px; color: #9ca3af; margin: 0;">
          This payment confirmation was sent by ${adminInfo?.name || 'PayForm Team'}<br>
          Powered by PayForm • Secured by Cashfree Payments
        </p>
      </div>
      
    </div>
  `;
};
// Add these helper functions to the END of your verify-cashfree-payment.js file

// Helper function to generate success page
function generateSuccessPage(orderData, email) {
  const amount = orderData.order_amount;
  const orderId = orderData.cf_order_id;
  const customerName = orderData.customer_details?.customer_name || 'Customer';
  
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
            <p style="margin: 5px 0;"><strong>Transaction ID:</strong> ${orderId}</p>
            <p style="margin: 5px 0;"><strong>Amount:</strong> ₹${amount}</p>
            <p style="margin: 5px 0;"><strong>Customer:</strong> ${customerName}</p>
            <p style="margin: 5px 0;"><strong>Email:</strong> ${email}</p>
            <p style="margin: 5px 0;"><strong>Status:</strong> ✅ Paid & Confirmed</p>
          </div>

          <p>A confirmation email has been sent to your email address.</p>
          <p style="color: #666; margin-top: 30px; font-size: 14px;">You can now close this window.</p>
        </div>
      </body>
    </html>
  `;
}

// Helper function to generate error page
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

// Helper function to generate cancelled page
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

// Helper function to generate pending page
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
          <p>Please wait while we process your payment or try again.</p>
        </div>
      </body>
    </html>
  `;
}
