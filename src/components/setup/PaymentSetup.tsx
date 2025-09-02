import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface RazorpayRouteConfigData {
  bank_account_number: string;
  ifsc_code: string;
  account_holder_name: string;
  business_type: 'individual' | 'proprietorship' | 'partnership' | 'company';
  pan_number: string;
  gst_number?: string;
  upi_id?: string;
  linked_account_id?: string;
}

interface PaymentSetupProps {
  adminId?: string;
}

export const PaymentSetup: React.FC<PaymentSetupProps> = ({ adminId = 'default' }) => {
  const [config, setConfig] = useState<RazorpayRouteConfigData>({
    bank_account_number: '',
    ifsc_code: '',
    account_holder_name: '',
    business_type: 'individual',
    pan_number: '',
    gst_number: '',
    upi_id: '',
    linked_account_id: ''
  });
  const [isEnabled, setIsEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [applicationStatus, setApplicationStatus] = useState<'pending' | 'under_review' | 'approved' | 'rejected'>('pending');
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'bank' | 'upi'>('bank');

  useEffect(() => {
    loadPaymentConfig();
  }, [adminId]);

  const loadPaymentConfig = async () => {
    try {
      setLoading(true);
      
      // Load provider config
      const { data: providerData } = await supabase
        .from('provider_configs')
        .select('*')
        .eq('admin_id', adminId)
        .eq('provider_name', 'razorpay_route')
        .single();

      // Load sub-account application
      const { data: applicationData } = await supabase
        .from('sub_account_applications')
        .select('*')
        .eq('form_admin_id', adminId)
        .eq('provider_name', 'razorpay_route')
        .single();

      if (applicationData) {
        setConfig({
          bank_account_number: applicationData.bank_account_number || '',
          ifsc_code: applicationData.ifsc_code || '',
          account_holder_name: applicationData.account_holder_name || '',
          business_type: applicationData.business_type || 'individual',
          pan_number: applicationData.verification_documents?.pan_number || '',
          gst_number: applicationData.verification_documents?.gst_number || '',
          upi_id: applicationData.verification_documents?.upi_id || '',
          linked_account_id: applicationData.verification_documents?.linked_account_id || ''
        });
        setApplicationStatus(applicationData.application_status);
      }

      if (providerData) {
        setIsEnabled(providerData.is_enabled);
      }
    } catch (error) {
      console.error('Error loading Razorpay Route config:', error);
    } finally {
      setLoading(false);
    }
  };

  const validateForm = () => {
    if (paymentMethod === 'bank') {
      if (!config.bank_account_number || config.bank_account_number.length < 9) {
        setMessage({ type: 'error', text: 'Please enter a valid bank account number' });
        return false;
      }

      if (!config.ifsc_code || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(config.ifsc_code)) {
        setMessage({ type: 'error', text: 'Please enter a valid IFSC code (e.g., HDFC0000123)' });
        return false;
      }

      if (!config.account_holder_name || config.account_holder_name.length < 2) {
        setMessage({ type: 'error', text: 'Please enter account holder name' });
        return false;
      }
    } else {
      if (!config.upi_id || !config.upi_id.includes('@')) {
        setMessage({ type: 'error', text: 'Please enter a valid UPI ID (e.g., user@paytm)' });
        return false;
      }
    }

    if (!config.pan_number || !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(config.pan_number)) {
      setMessage({ type: 'error', text: 'Please enter a valid PAN number (e.g., ABCDE1234F)' });
      return false;
    }

    return true;
  };

  const savePaymentConfig = async () => {
    try {
      setSaving(true);
      setMessage(null);

      if (!validateForm()) {
        return;
      }

      // Create Razorpay linked account first
      const linkedAccountResponse = await fetch('/.netlify/functions/create-razorpay-linked-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          admin_id: adminId,
          account_details: {
            name: config.account_holder_name,
            email: 'admin@example.com', // Replace with actual admin email
            tnc_accepted: true,
            account_details: paymentMethod === 'bank' ? {
              business_name: config.account_holder_name,
              business_type: config.business_type
            } : undefined,
            bank_account: paymentMethod === 'bank' ? {
              name: config.account_holder_name,
              ifsc: config.ifsc_code,
              account_number: config.bank_account_number
            } : undefined,
            legal_business_name: config.account_holder_name,
            customer_facing_business_name: config.account_holder_name,
            profile: {
              category: 'healthcare',
              subcategory: 'clinic'
            },
            legal_info: {
              pan: config.pan_number,
              gst: config.gst_number || undefined
            }
          }
        })
      });

      if (!linkedAccountResponse.ok) {
        throw new Error('Failed to create Razorpay linked account');
      }

      const linkedAccountData = await linkedAccountResponse.json();
      const linkedAccountId = linkedAccountData.id;

      // Save sub-account application
      const { error: applicationError } = await supabase
        .from('sub_account_applications')
        .upsert({
          form_admin_id: adminId,
          provider_name: 'razorpay_route',
          bank_account_number: paymentMethod === 'bank' ? config.bank_account_number : null,
          ifsc_code: paymentMethod === 'bank' ? config.ifsc_code.toUpperCase() : null,
          account_holder_name: config.account_holder_name,
          business_type: config.business_type,
          verification_documents: {
            pan_number: config.pan_number.toUpperCase(),
            gst_number: config.gst_number?.toUpperCase() || null,
            upi_id: paymentMethod === 'upi' ? config.upi_id : null,
            linked_account_id: linkedAccountId,
            payment_method: paymentMethod
          },
          application_status: 'approved', // Auto-approve for Razorpay Route
          updated_at: new Date().toISOString()
        });

      if (applicationError) throw applicationError;

      // Update provider config
      const { error: providerError } = await supabase
        .from('provider_configs')
        .upsert({
          admin_id: adminId,
          provider_name: 'razorpay_route',
          is_enabled: true,
          config_data: { ...config, linked_account_id: linkedAccountId },
          verification_status: 'verified',
          updated_at: new Date().toISOString()
        });

      if (providerError) throw providerError;

      setApplicationStatus('approved');
      setIsEnabled(true);
      setMessage({ 
        type: 'success', 
        text: 'Payment setup completed successfully! You can now start receiving payments with automatic splitting.' 
      });

    } catch (error) {
      console.error('Error saving Razorpay Route config:', error);
      setMessage({ type: 'error', text: 'Failed to setup payment configuration. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pending: { color: 'bg-yellow-100 text-yellow-800', text: '⏳ Setup Required' },
      under_review: { color: 'bg-blue-100 text-blue-800', text: '🔍 Under Review' },
      approved: { color: 'bg-green-100 text-green-800', text: '✅ Active & Ready' },
      rejected: { color: 'bg-red-100 text-red-800', text: '❌ Setup Failed' }
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
    
    return (
      <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${config.color}`}>
        {config.text}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="loading-spinner"></div>
        <span className="ml-2 text-gray-600">Loading payment configuration...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="text-2xl">💳</div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Payment Setup</h3>
            <p className="text-sm text-gray-600">Configure your payment details for automatic fund transfers</p>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          {getStatusBadge(applicationStatus)}
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={isEnabled}
              onChange={(e) => setIsEnabled(e.target.checked)}
              className="form-checkbox h-5 w-5 text-blue-600"
              disabled={applicationStatus !== 'approved'}
            />
            <span className="text-sm font-medium text-gray-700">Enable Payments</span>
          </label>
        </div>
      </div>

      {/* Status Message */}
      {message && (
        <div className={`p-4 rounded-lg ${
          message.type === 'success' 
            ? 'bg-green-50 border border-green-200 text-green-800'
            : message.type === 'error'
            ? 'bg-red-50 border border-red-200 text-red-800'
            : 'bg-blue-50 border border-blue-200 text-blue-800'
        }`}>
          {message.text}
        </div>
      )}

      {/* Payment Method Selection */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h4 className="font-medium text-gray-900 mb-3">Choose Payment Method</h4>
        <div className="flex space-x-4">
          <label className="flex items-center space-x-2">
            <input
              type="radio"
              name="paymentMethod"
              value="bank"
              checked={paymentMethod === 'bank'}
              onChange={(e) => setPaymentMethod(e.target.value as 'bank' | 'upi')}
              className="form-radio h-4 w-4 text-blue-600"
              disabled={saving || applicationStatus === 'approved'}
            />
            <span className="text-sm font-medium text-gray-700">🏦 Bank Account</span>
          </label>
          <label className="flex items-center space-x-2">
            <input
              type="radio"
              name="paymentMethod"
              value="upi"
              checked={paymentMethod === 'upi'}
              onChange={(e) => setPaymentMethod(e.target.value as 'bank' | 'upi')}
              className="form-radio h-4 w-4 text-blue-600"
              disabled={saving || applicationStatus === 'approved'}
            />
            <span className="text-sm font-medium text-gray-700">📱 UPI ID</span>
          </label>
        </div>
      </div>

      {/* Configuration Form */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Payment Details */}
        <div className="space-y-4">
          <h4 className="font-medium text-gray-900">
            {paymentMethod === 'bank' ? '🏦 Bank Account Details' : '📱 UPI Details'}
          </h4>
          
          {paymentMethod === 'bank' ? (
            <>
              <div>
                <label className="form-label">Bank Account Number *</label>
                <input
                  type="text"
                  value={config.bank_account_number}
                  onChange={(e) => setConfig({ ...config, bank_account_number: e.target.value })}
                  placeholder="1234567890"
                  className="form-input"
                  disabled={saving || applicationStatus === 'approved'}
                />
              </div>

              <div>
                <label className="form-label">IFSC Code *</label>
                <input
                  type="text"
                  value={config.ifsc_code}
                  onChange={(e) => setConfig({ ...config, ifsc_code: e.target.value.toUpperCase() })}
                  placeholder="HDFC0000123"
                  className="form-input"
                  disabled={saving || applicationStatus === 'approved'}
                />
              </div>

              <div>
                <label className="form-label">Account Holder Name *</label>
                <input
                  type="text"
                  value={config.account_holder_name}
                  onChange={(e) => setConfig({ ...config, account_holder_name: e.target.value })}
                  placeholder="John Doe"
                  className="form-input"
                  disabled={saving || applicationStatus === 'approved'}
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="form-label">UPI ID *</label>
                <input
                  type="text"
                  value={config.upi_id}
                  onChange={(e) => setConfig({ ...config, upi_id: e.target.value })}
                  placeholder="yourname@paytm"
                  className="form-input"
                  disabled={saving || applicationStatus === 'approved'}
                />
              </div>

              <div>
                <label className="form-label">Account Holder Name *</label>
                <input
                  type="text"
                  value={config.account_holder_name}
                  onChange={(e) => setConfig({ ...config, account_holder_name: e.target.value })}
                  placeholder="John Doe"
                  className="form-input"
                  disabled={saving || applicationStatus === 'approved'}
                />
              </div>
            </>
          )}
        </div>

        {/* Business Details */}
        <div className="space-y-4">
          <h4 className="font-medium text-gray-900">📄 Business Information</h4>
          
          <div>
            <label className="form-label">Business Type *</label>
            <select
              value={config.business_type}
              onChange={(e) => setConfig({ ...config, business_type: e.target.value as any })}
              className="form-input"
              disabled={saving || applicationStatus === 'approved'}
            >
              <option value="individual">Individual</option>
              <option value="proprietorship">Proprietorship</option>
              <option value="partnership">Partnership</option>
              <option value="company">Private/Public Company</option>
            </select>
          </div>

          <div>
            <label className="form-label">PAN Number *</label>
            <input
              type="text"
              value={config.pan_number}
              onChange={(e) => setConfig({ ...config, pan_number: e.target.value.toUpperCase() })}
              placeholder="ABCDE1234F"
              className="form-input"
              disabled={saving || applicationStatus === 'approved'}
            />
          </div>

          <div>
            <label className="form-label">GST Number (Optional)</label>
            <input
              type="text"
              value={config.gst_number}
              onChange={(e) => setConfig({ ...config, gst_number: e.target.value.toUpperCase() })}
              placeholder="27AAAAA0000A1Z5"
              className="form-input"
              disabled={saving || applicationStatus === 'approved'}
            />
            <p className="text-xs text-gray-500 mt-1">
              Required for companies, optional for individuals
            </p>
          </div>
        </div>
      </div>

      {/* Commission Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-medium text-blue-900 mb-2">💰 Payment Flow Structure</h4>
        <div className="text-sm text-blue-800 space-y-1">
          <p><strong>Example for ₹1000 transaction:</strong></p>
          <p>• Razorpay Fee: ₹23.60 (2% + ₹3 + 18% GST)</p>
          <p>• Platform Commission: ₹30 (3%)</p>
          <p>• You Receive: ₹946.40 (automatically transferred to your account)</p>
          <p className="text-xs mt-2">All amounts are automatically calculated and split using Razorpay Route</p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex space-x-3">
        {applicationStatus === 'approved' ? (
          <div className="flex items-center space-x-2 text-green-600">
            <span>✅</span>
            <span className="font-medium">Payment setup is active and ready!</span>
          </div>
        ) : (
          <button
            onClick={savePaymentConfig}
            disabled={saving}
            className="btn-primary flex items-center space-x-2"
          >
            {saving ? (
              <>
                <div className="loading-spinner w-4 h-4"></div>
                <span>Setting up...</span>
              </>
            ) : (
              <>
                <span>💾</span>
                <span>Complete Payment Setup</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Help Section */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h4 className="font-medium text-gray-900 mb-2">📋 Required Information</h4>
        <div className="text-sm text-gray-700 space-y-1">
          <p>• <strong>Bank Account/UPI:</strong> Where you want to receive payments</p>
          <p>• <strong>PAN Card:</strong> For tax compliance and KYC</p>
          <p>• <strong>Business Type:</strong> Legal structure of your business</p>
          <p>• <strong>GST Certificate:</strong> Required for registered businesses</p>
        </div>
        
        <div className="mt-4 pt-3 border-t border-gray-300">
          <h5 className="font-medium text-gray-900 mb-1">⚡ Instant Setup</h5>
          <p className="text-sm text-gray-600">
            Setup completes instantly with Razorpay Route. Start receiving split payments immediately after setup.
          </p>
        </div>
      </div>
    </div>
  );
};
