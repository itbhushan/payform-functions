// netlify/functions/verify-razorpay-payment.js - ES MODULE VERSION
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export const handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'text/html; charset=utf-8'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    console.log('🔍 Payment verification started');
    console.log('Query parameters:', event.queryStringParameters);

    // Extract parameters (adapted for Razorpay)
    const { 
      razorpay_order_id, 
      razorpay_payment_id, 
      razorpay_signature,
      order_id, 
      form_id, 
      email, 
      status 
    } = event.queryStringParameters || {};

    // Use order_id as fallback for razorpay_order_id (for URL compatibility)
    const orderIdToUse = razorpay_order_id || order_id;

    if (!orderIdToUse || !form_id || !email) {
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
    const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
    const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    console.log('🔍 Verifying payment with Razorpay...');

    // If we have payment_id and signature, verify the signature first
    if (razorpay_payment_id && razorpay_signature) {
      console.log('🔐 Verifying payment signature...');
      
      const generatedSignature = crypto
        .createHmac('sha256', RAZORPAY_KEY_SECRET)
        .update(`${orderIdToUse}|${razorpay_payment_id}`)
        .digest('hex');

      if (generatedSignature !== razorpay_signature) {
        console.log('❌ Invalid signature');
        return {
          statusCode: 400,
          headers,
          body: generateErrorPage('Invalid payment signature. Payment verification failed.')
        };
      }
      console.log('✅ Signature verified successfully');
    }

    // Get order details from Razorpay (similar to CashFree order check)
    const orderResponse = await fetch(`https://api.razorpay.com/v1/orders/${orderIdToUse}`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64')}`,
        'Content-Type': 'application/json'
      }
    });

    if (!orderResponse.ok) {
      return {
        statusCode: 500,
        headers,
        body: generateErrorPage('Unable to verify payment with Razorpay.')
      };
    }

    const orderData = await orderResponse.json();
    console.log('✅ Order status:', orderData.status);

    // Get payment details if payment_id is available
    let paymentData = null;
    if (razorpay_payment_id) {
      const paymentResponse = await fetch(`https://api.razorpay.com/v1/payments/${razorpay_payment_id}`, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64')}`,
          'Content-Type': 'application/json'
        }
      });

      if (paymentResponse.ok) {
        paymentData = await paymentResponse.json();
        console.log('✅ Payment status:', paymentData.status);
      }
    }

    // Check if payment is successful (similar to CashFree PAID/ACTIVE check)
    const isPaymentSuccessful = paymentData?.status === 'captured' || 
                               paymentData?.status === 'authorized' ||
                               orderData.status === 'paid';

    if (isPaymentSuccessful) {
      console.log('✅ Payment confirmed, updating database...');

      // Update transaction in database - SAME LOGIC AS CASHFREE
      if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        
        console.log('🔍 Looking for transaction with order_id:', orderIdToUse);
        
        // Strategy 1: Try matching by razorpay_order_id first
        let { data: updatedData, error: updateError } = await supabase
          .from('transactions')
          .update({
            payment_status: 'paid',
            razorpay_payment_id: razorpay_payment_id,
            customer_name: orderData.notes?.customer_name || email.split('@')[0],
            updated_at: new Date().toISOString()
          })
          .eq('razorpay_order_id', orderIdToUse)
          .select();
        
        console.log('📊 Update result by razorpay_order_id:', updatedData?.length || 0, 'rows affected');

        // Strategy 2: If no rows updated, try by matching transaction_id field
        if (!updatedData || updatedData.length === 0) {
          console.log('🔄 Trying to match by transaction_id field...');
          
          const { data: byTransactionId, error: transactionError } = await supabase
            .from('transactions')
            .update({
              payment_status: 'paid',
              razorpay_order_id: orderIdToUse,
              razorpay_payment_id: razorpay_payment_id,
              updated_at: new Date().toISOString()
            })
            .eq('transaction_id', orderIdToUse)
            .select();

          if (transactionError) {
            console.error('❌ Database update error:', transactionError);
          } else {
            console.log('✅ Transaction updated by transaction_id:', byTransactionId?.length || 0, 'rows');
            updatedData = byTransactionId;
          }
        } else {
          console.log('✅ Transaction updated by razorpay_order_id successfully');
        }

        // Strategy 3: If still no match, try by email and form_id (same as CashFree)
        if (!updatedData || updatedData.length === 0) {
          console.log('🔄 Trying to match by email and form_id...');
          
          const { data: byEmailForm, error: emailFormError } = await supabase
            .from('transactions')
            .update({
              payment_status: 'paid',
              razorpay_order_id: orderIdToUse,
              razorpay_payment_id: razorpay_payment_id,
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

      // Send confirmation email (SAME AS CASHFREE)
      try {
        await sendCustomerConfirmationEmail(orderData, paymentData, email, form_id);
        console.log('✅ Confirmation email process completed');
      } catch (emailError) {
        console.error('❌ Confirmation email failed:', emailError);
        console.log('⚠️ Payment verification continues normally despite email failure');
      }

      return {
        statusCode: 200,
        headers,
        body: generateSuccessPage(orderData, paymentData, email)
      };
      
    } else {
      console.log('⏳ Payment not completed:', orderData.status);
      return {
        statusCode: 200,
        headers,
        body: generatePendingPage(orderData.status)
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

// ✅ REUSE SAME EMAIL LOGIC AS CASHFREE (adapted for Razorpay)
// Replace the sendCustomerConfirmationEmail function in your verify-razorpay-payment.js
// PERMANENT SIMPLE FIX: Replace sendCustomerConfirmationEmail function
// This sends a proper success email using the same system as payment request emails

const sendCustomerConfirmationEmail = async (orderData, paymentData, email, formId) => {
  try {
    console.log(`📧 Sending PAYMENT SUCCESS email to ${email}`);

    const amount = orderData.amount / 100; // Convert from paise
    const orderId = orderData.id;
    const customerName = orderData.notes?.customer_name || email.split('@')[0];
    const paymentTime = new Date().toLocaleString('en-IN', { 
      timeZone: 'Asia/Kolkata',
      dateStyle: 'full',
      timeStyle: 'short'
    });

    // Create success email using the SAME method as payment emails
    const emailResponse = await fetch(`${process.env.SUPABASE_URL}/functions/v1/send-payment-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
      },
      body: JSON.stringify({
        to: email,
        subject: `🎉 Payment Successful - ₹${amount} Confirmed`,
        // Custom success template data
        paymentLink: null,
        productName: 'Your Purchase',
        amount: amount,
        customerName: customerName,
        adminId: 'success',
        isConfirmation: true,
        // Success-specific data
        transactionId: orderId,
        paymentDate: paymentTime,
        paymentMethod: 'Razorpay',
        successTemplate: {
          orderId: orderId,
          amount: amount,
          customerName: customerName,
          email: email,
          paymentTime: paymentTime,
          status: 'CONFIRMED'
        }
      })
    });

    const emailResult = await emailResponse.json();
    console.log('📧 Success email API response:', emailResult);
    
    if (emailResult.success) {
      console.log(`✅ Payment success email sent to ${email}`);
      return true;
    } else {
      console.error(`❌ Failed to send success email:`, emailResult);
      return false;
    }

  } catch (error) {
    console.error('❌ Error sending payment success email:', error);
    return false;
  }
};

// ✅ REUSE ALL HELPER FUNCTIONS FROM CASHFREE (just adapt success page)
function generateSuccessPage(orderData, paymentData, email) {
  const amount = orderData.amount / 100; // Convert from paise
  const orderId = orderData.id;
  const customerName = orderData.notes?.customer_name || email.split('@')[0];
  
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

// ✅ REUSE OTHER HELPER FUNCTIONS FROM CASHFREE (copy exact same functions)
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
          <p>Please wait while we process your payment or try again.</p>
        </div>
      </body>
    </html>
  `;
}

// ✅ COPY EXACT EMAIL TEMPLATE FUNCTION FROM CASHFREE (no changes needed)
function generateConfirmationEmailTemplate(orderData, email, formName, adminInfo) {
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
          Your transaction has been processed successfully via Razorpay.
        </p>
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
          Powered by PayForm • Secured by Razorpay Payments
        </p>
      </div>
      
    </div>
  `;
}
