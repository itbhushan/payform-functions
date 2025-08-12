import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface OrderSummaryProps {
  orderId: string;
}

interface OrderData {
  id: number;
  cashfree_order_id: string;
  customer_name: string;
  email: string;
  product_name: string;
  payment_amount: number;
  payment_currency: string;
  payment_status: string;
  created_at: string;
  cashfree_payment_session_id: string;
  admin_id: string;
  form_configs?: {
    form_name: string;
    form_admins: {
      name: string;
      company_name: string;
    };
  };
}

export const OrderSummary: React.FC<OrderSummaryProps> = ({ orderId }) => {
  const [orderData, setOrderData] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchOrderData();
  }, [orderId]);

  const fetchOrderData = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('transactions')
        .select(`
          *,
          form_configs!inner(
            form_name,
            form_admins!inner(
              name,
              company_name
            )
          )
        `)
        .eq('cashfree_order_id', orderId)
        .single();

      if (error) {
        console.error('Error fetching order:', error);
        setError('Order not found');
        return;
      }

      setOrderData(data);
    } catch (err) {
      console.error('Error:', err);
      setError('Failed to load order details');
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentClick = () => {
    if (orderData?.cashfree_payment_session_id) {
      const paymentUrl = `https://payments.cashfree.com/forms/${orderData.cashfree_payment_session_id}`;
      window.location.href = paymentUrl;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading order details...</p>
        </div>
      </div>
    );
  }

  if (error || !orderData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">❌</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Order Not Found</h2>
          <p className="text-gray-600">{error || 'Unable to load order details'}</p>
        </div>
      </div>
    );
  }

  const isPaymentCompleted = orderData.payment_status === 'paid' || orderData.payment_status === 'SUCCESS';

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6">
            <div className="flex items-center space-x-3">
              <div className="text-3xl">🎯</div>
              <div>
                <h1 className="text-2xl font-bold">PayForm</h1>
                <p className="text-blue-100">Order Confirmation</p>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-8">
            {/* Greeting */}
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Hello {orderData.customer_name}! 👋
              </h2>
              <p className="text-gray-600">
                {isPaymentCompleted 
                  ? "Thank you for your payment! Your order has been confirmed."
                  : "Thank you for your interest. Please complete your payment to proceed."
                }
              </p>
            </div>

            {/* Order Summary */}
            <div className="bg-gray-50 rounded-xl p-6 mb-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <span className="text-xl mr-2">📋</span>
                Order Summary
              </h3>
              
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Product:</span>
                  <span className="font-medium text-gray-900">{orderData.product_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Customer:</span>
                  <span className="font-medium text-gray-900">{orderData.customer_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Email:</span>
                  <span className="font-medium text-gray-900">{orderData.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Order ID:</span>
                  <span className="font-mono text-sm text-gray-900">{orderData.cashfree_order_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Provider:</span>
                  <span className="font-medium text-gray-900">
                    {orderData.form_configs?.form_admins?.company_name || orderData.form_configs?.form_admins?.name || 'PayForm'}
                  </span>
                </div>
                
                <div className="border-t border-gray-200 pt-3 mt-4">
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-semibold text-gray-900">Total Amount:</span>
                    <span className="text-2xl font-bold text-blue-600">
                      ₹{orderData.payment_amount.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Payment Section */}
            {!isPaymentCompleted ? (
              <div className="text-center">
                <button
                  onClick={handlePaymentClick}
                  className="bg-green-600 hover:bg-green-700 text-white text-lg font-semibold px-8 py-4 rounded-xl transition-colors shadow-lg hover:shadow-xl transform hover:scale-105"
                >
                  💰 Pay ₹{orderData.payment_amount.toFixed(2)} Securely
                </button>
                
                <div className="mt-6 bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center justify-center space-x-2 text-green-800 mb-2">
                    <span>🔒</span>
                    <span className="font-medium">Secure payment powered by Cashfree</span>
                  </div>
                  <p className="text-sm text-green-700">
                    💳 UPI, Cards, Net Banking & Wallets accepted
                  </p>
                  <p className="text-xs text-green-600 mt-1">
                    ⏰ This payment link expires in 24 hours
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-center">
                <div className="bg-green-50 border border-green-200 rounded-xl p-6">
                  <div className="text-4xl mb-4">✅</div>
                  <h3 className="text-lg font-bold text-green-900 mb-2">Payment Completed!</h3>
                  <p className="text-green-800">
                    Your payment of ₹{orderData.payment_amount.toFixed(2)} has been successfully processed.
                  </p>
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="mt-8 pt-6 border-t border-gray-200 text-center">
              <p className="text-sm text-gray-600">
                Questions? Contact: <a href="mailto:support@payform.com" className="text-blue-600 hover:underline">support@payform.com</a>
              </p>
              <p className="text-xs text-gray-500 mt-2">
                Powered by PayForm - Making payments simple and secure
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
