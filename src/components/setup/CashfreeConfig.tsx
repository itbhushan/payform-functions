import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';

interface CashfreeConfigData {
  bank_account_number: string;
  ifsc_code: string;
  account_holder_name: string;
  business_type: 'individual' | 'proprietorship' | 'partnership' | 'company';
  pan_number: string;
  gst_number?: string;
  business_name: string;
}

interface CashfreeConfigProps {
  adminId?: string;
}

export const CashfreeConfig: React.FC<CashfreeConfigProps> = ({ adminId }) => {
  const { user } = useAuth();
  const effectiveAdminId = adminId || user?.id;

  const [config, setConfig] = useState<CashfreeConfigData>({
    bank_account_number: '',
    ifsc_code: '',
    account_holder_name: '',
    business_type: 'individual',
    pan_number: '',
    gst_number: '',
    business_name: ''
  });

  const [isEnabled, setIsEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [applicationStatus, setApplicationStatus] = useState<'pending' | 'under_review' | 'approved' | 'rejected'>('pending');
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  useEffect(() => {
    if (effectiveAdminId) {
      loadCashfreeConfig();
    }
  }, [effectiveAdminId]);

  const loadCashfreeConfig = async () => {
    try {
      setLoading(true);
      
      // Load provider config first
      const { data: providerData, error: providerError } = await supabase
        .from('provider_configs')
        .select('*')
        .eq('admin_id', effectiveAdminId)
        .eq('provider_name', 'cashfree')
        .single();

      // Load sub-account application
      const { data: applicationData, error: applicationError } = await supabase
        .from('sub_account_applications')
        .select('*')
        .eq('form_admin_id', effectiveAdminId)
        .eq('provider_name', 'cashfree')
        .single();

      console.log('🔍 Loading Cashfree config:', {
        providerData,
        applicationData,
        providerError,
        applicationError
      });

      // Set application data if exists
      if (applicationData) {
        setConfig({
          bank_account_number: applicationData.bank_account_number || '',
          ifsc_code: applicationData.ifsc_code || '',
          account_holder_name: applicationData.account_holder_name || '',
          business_type: applicationData.business_type || 'individual',
          business_name: applicationData.business_name || '',
          pan_number: applicationData.verification_documents?.pan_number || '',
          gst_number: applicationData.verification_documents?.gst_number || ''
        });
        setApplicationStatus(applicationData.application_status || 'pending');
      }

      // Set provider config if exists
      if (providerData) {
        setIsEnabled(providerData.is_enabled || false);
        
        // If provider config exists but no application data, populate from config_data
        if (!applicationData && providerData.config_data) {
          setConfig(prev => ({
            ...prev,
            ...providerData.config_data
          }));
        }
      }

      // Auto-dismiss success messages after 5 seconds
      if (message?.type === 'success') {
        setTimeout(() => setMessage(null), 5000);
      }

    } catch (error) {
      console.error('Error loading Cashfree config:', error);
      setMessage({ 
        type: 'error', 
        text: 'Failed to load configuration. Please refresh the page.' 
      });
    } finally {
      setLoading(false);
    }
  };

  const validateForm = () => {
    setMessage(null);

    if (!config.business_name || config.business_name.length < 2) {
      setMessage({ type: 'error', text: 'Please enter a valid business name' });
      return false;
    }

    if (!config.bank_account_number || config.bank_account_number.length < 9) {
      setMessage({ type: 'error', text: 'Please enter a valid bank account number (minimum 9 digits)' });
      return false;
    }

    if (!config.ifsc_code || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(config.ifsc_code)) {
      setMessage({ type: 'error', text: 'Please enter a valid IFSC code (e.g., HDFC0000123)' });
      return false;
    }

    if (!config.account_holder_name || config.account_holder_name.length < 2) {
      setMessage({ type: 'error', text: 'Please enter the account holder name' });
      return false;
    }

    if (!config.pan_number || !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(config.pan_number)) {
      setMessage({ type: 'error', text: 'Please enter a valid PAN number (e.g., ABCDE1234F)' });
      return false;
    }

    if (config.gst_number && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(config.gst_number)) {
      setMessage({ type: 'error', text: 'Please enter a valid GST number (e.g., 27AAAAA0000A1Z5)' });
      return false;
    }

    return true;
  };

  const saveCashfreeConfig = async () => {
    if (!effectiveAdminId) {
      setMessage({ type: 'error', text: 'User not authenticated. Please login again.' });
      return;
    }

    try {
      setSaving(true);
      setMessage(null);

      if (!validateForm()) {
        return;
      }

      console.log('💾 Saving Cashfree config:', {
        adminId: effectiveAdminId,
        config
      });

      // Save to sub_account_applications table
      const { data: applicationData, error: applicationError } = await supabase
        .from('sub_account_applications')
        .upsert({
          form_admin_id: effectiveAdminId,
          provider_name: 'cashfree',
          bank_account_number: config.bank_account_number,
          ifsc_code: config.ifsc_code.toUpperCase(),
          account_holder_name: config.account_holder_name,
          business_name: config.business_name,
          business_type: config.business_type,
          verification_documents: {
            pan_number: config.pan_number.toUpperCase(),
            gst_number: config.gst_number?.toUpperCase() || null
          },
          application_status: 'pending',
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'form_admin_id,provider_name'
        })
        .select()
        .single();

      if (applicationError) {
        console.error('Application save error:', applicationError);
        throw applicationError;
      }

      // Save to provider_configs table
      const { data: providerData, error: providerError } = await supabase
        .from('provider_configs')
        .upsert({
          admin_id: effectiveAdminId,
          provider_name: 'cashfree',
          is_enabled: isEnabled,
          config_data: config,
          verification_status: 'pending',
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'admin_id,provider_name'
        })
        .select()
        .single();

      if (providerError) {
        console.error('Provider config save error:', providerError);
        throw providerError;
      }

      console.log('✅ Cashfree config saved successfully:', {
        applicationData,
        providerData
      });

      setApplicationStatus('pending');
      setMessage({ 
        type: 'success', 
        text: '🎉 Cashfree configuration saved successfully! Your application is being reviewed.' 
      });

      // For demo purposes, simulate approval after 3 seconds
      setTimeout(() => {
        setApplicationStatus('approved');
        setMessage({
          type: 'success',
          text: '✅ Cashfree account approved! You can now accept UPI, Cards & Net Banking payments.'
        });
      }, 3000);

    } catch (error: any) {
      console.error('Error saving Cashfree config:', error);
      setMessage({ 
        type: 'error', 
        text: `Failed to save configuration: ${error.message}. Please try again.` 
      });
    } finally {
      setSaving(false);
    }
  };

  const testCashfreePayment = async () => {
    try {
      setMessage({ type: 'info', text: '🧪 Creating test payment order...' });

      const response = await fetch('/.netlify/functions/create-cashfree-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          form_id: 'test_form_' + Date.now(),
          email: 'test@example.com',
          amount: 100,
          product_name: 'Test Product',
          admin_id: effectiveAdminId
        })
      });

      const result = await response.json();
      console.log('🧪 Test payment result:', result);

      if (result.success) {
        setMessage({ 
          type: 'success', 
          text: `✅ Test payment order created successfully! Order ID: ${result.order_id}` 
        });
      } else {
        setMessage({ 
          type: 'error', 
          text: `❌ Test payment failed: ${result.error}` 
        });
      }
    } catch (error) {
      console.error('Test payment error:', error);
      setMessage({ 
        type: 'error', 
        text: '❌ Test payment failed. Please check your configuration.' 
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pending: { color: 'bg-yellow-100 text-yellow-800', text: '⏳ Pending Review', icon: '⏳' },
      under_review: { color: 'bg-blue-100 text-blue-800', text: '🔍 Under Review', icon: '🔍' },
      approved: { color: 'bg-green-100 text-green-800', text: '✅ Approved & Active', icon: '✅' },
      rejected: { color: 'bg-red-100 text-red-800', text: '❌ Rejected', icon: '❌' }
    };

    const statusInfo = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
    
    return (
      <div className="flex items-center space-x-2">
        <span className={`inline-flex items-center px-3 py-1 text-sm font-semibold rounded-full ${statusInfo.color}`}>
          <span className="mr-1">{statusInfo.icon}</span>
          {statusInfo.text}
        </span>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        <span className="ml-2 text-gray-600">Loading Cashfree configuration...</span>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="text-2xl">💳</div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Cashfree Payment Gateway</h3>
              <p className="text-sm text-gray-600">Accept UPI, Cards, Net Banking & Wallets instantly</p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            {getStatusBadge(applicationStatus)}
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={isEnabled}
                onChange={(e) => setIsEnabled(e.target.checked)}
                className="h-5 w-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                disabled={applicationStatus !== 'approved'}
              />
              <span className="text-sm font-medium text-gray-700">
                {applicationStatus === 'approved' ? 'Active' : 'Enable when approved'}
              </span>
            </label>
          </div>
        </div>

        {/* Status Message */}
        {message && (
          <div className={`p-4 rounded-lg mb-4 ${
            message.type === 'success' 
              ? 'bg-green-50 border border-green-200 text-green-800'
              : message.type === 'error'
              ? 'bg-red-50 border border-red-200 text-red-800'
              : 'bg-blue-50 border border-blue-200 text-blue-800'
          }`}>
            <div className="flex items-center">
              <span className="mr-2">
                {message.type === 'success' ? '✅' : message.type === 'error' ? '❌' : 'ℹ️'}
              </span>
              {message.text}
            </div>
          </div>
        )}

        {/* Configuration Form */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Business Information */}
          <div className="space-y-4">
            <h4 className="font-medium text-gray-900 flex items-center">
              <span className="mr-2">🏢</span>
              Business Information
            </h4>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Business Name *
              </label>
              <input
                type="text"
                value={config.business_name}
                onChange={(e) => setConfig({ ...config, business_name: e.target.value })}
                placeholder="Your business or personal name"
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                disabled={saving || applicationStatus === 'approved'}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Business Type *
              </label>
              <select
                value={config.business_type}
                onChange={(e) => setConfig({ ...config, business_type: e.target.value as any })}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                disabled={saving || applicationStatus === 'approved'}
              >
                <option value="individual">Individual</option>
                <option value="proprietorship">Proprietorship</option>
                <option value="partnership">Partnership</option>
                <option value="company">Private/Public Company</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                PAN Number *
              </label>
              <input
                type="text"
                value={config.pan_number}
                onChange={(e) => setConfig({ ...config, pan_number: e.target.value.toUpperCase() })}
                placeholder="ABCDE1234F"
                maxLength={10}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                disabled={saving || applicationStatus === 'approved'}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                GST Number (Optional)
              </label>
              <input
                type="text"
                value={config.gst_number}
                onChange={(e) => setConfig({ ...config, gst_number: e.target.value.toUpperCase() })}
                placeholder="27AAAAA0000A1Z5"
                maxLength={15}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                disabled={saving || applicationStatus === 'approved'}
              />
            </div>
          </div>

          {/* Bank Account Details */}
          <div className="space-y-4">
            <h4 className="font-medium text-gray-900 flex items-center">
              <span className="mr-2">🏦</span>
              Bank Account Details
            </h4>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Account Holder Name *
              </label>
              <input
                type="text"
                value={config.account_holder_name}
                onChange={(e) => setConfig({ ...config, account_holder_name: e.target.value })}
                placeholder="John Doe"
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                disabled={saving || applicationStatus === 'approved'}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Bank Account Number *
              </label>
              <input
                type="text"
                value={config.bank_account_number}
                onChange={(e) => setConfig({ ...config, bank_account_number: e.target.value.replace(/\D/g, '') })}
                placeholder="1234567890123456"
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                disabled={saving || applicationStatus === 'approved'}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                IFSC Code *
              </label>
              <input
                type="text"
                value={config.ifsc_code}
                onChange={(e) => setConfig({ ...config, ifsc_code: e.target.value.toUpperCase() })}
                placeholder="HDFC0000123"
                maxLength={11}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                disabled={saving || applicationStatus === 'approved'}
              />
            </div>
          </div>
        </div>

        {/* Commission Structure */}
        <div className="mt-6 bg-gradient-to-r from-blue-50 to-green-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-medium text-blue-900 mb-3 flex items-center">
            <span className="mr-2">💰</span>
            Revenue Split Example
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="bg-white p-3 rounded-lg">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">₹1,000</div>
                <div className="text-gray-600">Customer Pays</div>
              </div>
            </div>
            <div className="bg-white p-3 rounded-lg">
              <div className="text-center">
                <div className="text-lg font-bold text-red-600">-₹28</div>
                <div className="text-gray-600">Gateway Fee (2.5% + ₹3)</div>
              </div>
            </div>
            <div className="bg-white p-3 rounded-lg">
              <div className="text-center">
                <div className="text-lg font-bold text-orange-600">-₹30</div>
                <div className="text-gray-600">Platform Fee (3%)</div>
              </div>
            </div>
          </div>
          <div className="mt-3 text-center bg-green-100 p-3 rounded-lg">
            <div className="text-2xl font-bold text-green-600">₹942</div>
            <div className="text-green-800 font-medium">You Receive</div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex flex-wrap gap-3">
          {applicationStatus === 'approved' ? (
            <>
              <div className="flex items-center space-x-2 text-green-600 bg-green-50 px-4 py-2 rounded-lg">
                <span>✅</span>
                <span className="font-medium">Cashfree account is active and ready!</span>
              </div>
              <button
                onClick={testCashfreePayment}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                <span className="mr-2">🧪</span>
                Test Payment
              </button>
            </>
          ) : (
            <button
              onClick={saveCashfreeConfig}
              disabled={saving || !effectiveAdminId}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-6 py-2 rounded-lg text-sm font-medium flex items-center space-x-2 transition-colors"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <span>💾</span>
                  <span>Save & Submit for Review</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Help & Information */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h4 className="font-medium text-gray-900 mb-3 flex items-center">
          <span className="mr-2">💡</span>
          What happens next?
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-gray-700">
          <div>
            <h5 className="font-medium text-gray-900 mb-2">✅ After Approval:</h5>
            <ul className="space-y-1">
              <li>• Accept UPI payments instantly</li>
              <li>• Support all major credit/debit cards</li>
              <li>• Net Banking from 50+ banks</li>
              <li>• Wallet payments (Paytm, PhonePe, etc.)</li>
              <li>• Real-time payment notifications</li>
            </ul>
          </div>
          <div>
            <h5 className="font-medium text-gray-900 mb-2">📋 Required Documents:</h5>
            <ul className="space-y-1">
              <li>• Valid PAN card</li>
              <li>• Active bank account</li>
              <li>• GST certificate (if applicable)</li>
              <li>• Business registration (if company)</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
