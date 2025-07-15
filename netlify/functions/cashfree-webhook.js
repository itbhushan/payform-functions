// netlify/functions/cashfree-webhook.js
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-webhook-signature',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    console.log('Cashfree webhook received');
    console.log('Headers:', event.headers);
    console.log('Body:', event.body);

    // Verify webhook signature (for production)
    const webhookSignature = event.headers['x-webhook-signature'];
    const webhookSecret = process.env.CASHFREE_WEBHOOK_SECRET;
    
    if (webhookSecret && webhookSignature) {
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(event.body)
        .digest('hex');
      
      if (webhookSignature !== expectedSignature) {
        console.error('Invalid webhook signature');
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: 'Invalid signature' })
        };
      }
    }

    const webhookData = JSON.parse(event.body);
    console.log('Webhook data:', webhookData);

    const { type, data } = webhookData;

    // Handle payment events
    if (type === 'PAYMENT_SUCCESS_WEBHOOK' || type === 'PAYMENT_FAILED_WEBHOOK') {
      const paymentData = data.payment || data;
      
      const {
        cf_payment_id,
        order_id,
        payment_status,
        payment_amount,
        payment_currency,
        payment_method,
        payment_time
      } = paymentData;

      // Update transaction in database
      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );

      const updateData = {
        cashfree_payment_id: cf_payment_id,
        payment_status: payment_status.toLowerCase(),
        payment_method: payment_method,
        updated_at: new Date().toISOString()
      };

      if (payment_time) {
        updateData.payment_completed_at = payment_time;
      }

      const { data: transaction, error: updateError } = await supabase
        .from('transactions')
        .update(updateData)
        .eq('transaction_id', order_id)
        .select('*')
        .single();

      if (updateError) {
        console.error('Error updating transaction:', updateError);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: 'Database update failed' })
        };
      }

      console.log('Transaction updated:', transaction);

      // If payment successful, record commission
      if (payment_status.toLowerCase() === 'paid' && transaction) {
        const commissionData = {
          transaction_id: transaction.id,
          form_admin_id: transaction.admin_id || 'default',
          commission_amount: transaction.platform_commission,
          commission_rate: 3.0,
          platform_fee: transaction.platform_commission,
          gateway_fee: transaction.gateway_fee,
          net_amount_to_admin: transaction.net_amount_to_admin,
          status: 'completed',
          processed_at: new Date().toISOString(),
          created_at: new Date().toISOString()
        };

        const { error: commissionError } = await supabase
          .from('platform_commissions')
          .insert([commissionData]);

        if (commissionError) {
          console.error('Error recording commission:', commissionError);
        } else {
          console.log('Commission recorded successfully');
        }

        // Send confirmation email (optional)
        try {
          await sendPaymentConfirmationEmail(transaction);
        } catch (emailError) {
          console.error('Error sending confirmation email:', emailError);
        }
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          message: 'Webhook processed successfully',
          order_id: order_id,
          status: payment_status
        })
      };
    }

    // Handle other webhook types
    console.log('Unhandled webhook type:', type);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'Webhook received but not processed' })
    };

  } catch (error) {
    console.error('Webhook processing error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Webhook processing failed',
        details: error.message
      })
    };
  }
};

// Helper function to send confirmation email
async function sendPaymentConfirmationEmail(transaction) {
  // You can use SendGrid, Mailgun, or any email service
  // For now, just log the confirmation
  console.log('Payment confirmation for:', {
    email: transaction.email,
    product: transaction.product_name,
    amount: transaction.payment_amount,
    transaction_id: transaction.transaction_id
  });
  
  // TODO: Implement actual email sending
  // Example with SendGrid:
  /*
  const sgMail = require('@sendgrid/mail');
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  
  const msg = {
    to: transaction.email,
    from: 'noreply@payform.com',
    subject: 'Payment Confirmation',
    html: `
      <h2>Payment Successful!</h2>
      <p>Thank you for your payment of ₹${transaction.payment_amount} for ${transaction.product_name}.</p>
      <p>Transaction ID: ${transaction.transaction_id}</p>
    `
  };
  
  await sgMail.send(msg);
  */
}
