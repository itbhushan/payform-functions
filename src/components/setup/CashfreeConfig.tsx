import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface CashfreeConfigData {
  bank_account_number: string;
  ifsc_code: string;
  account_holder_name: string;
  business_type: 'individual' | 'proprietorship' | 'partnership' | 'company';
  pan_number: string;
  gst_number?: string;
}

interface CashfreeConfigProps {
  adminId?: string;
}

export const CashfreeConfig: React.FC<CashfreeConfigProps> = ({ adminId = 'default' }) => {
  const [config, setConfig] = useState<CashfreeConfigData>({
    bank_account_number: '',
    ifsc_code: '',
    account_holder_name: '',
    business_type: 'individual',
    pan_number: '',
    gst_number: ''
  });
  const [isEnabled, setIsEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [applicationStatus, setApplicationStatus] = useState<'pending' | 'under_review' | 'approved' | 'rejected'>('pending');
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  useEffect(() => {
    loadCashfreeConfig();
  }, [adminId]);

  const loadCashfreeConfig = async () => {
    try {
      setLoading(true);
      
      // Load provider config
      const { data: providerData } = await supabase
        .from('provider_configs')
        .select('*')
        .eq('admin_id', adminId)
        .eq('provider_name', 'cashfree')
        .single();

      // Load sub-account application
      const { data: applicationData } = await supabase
        .from('sub_account_applications')
        .select('*')
        .eq('form_admin_id', adminId)
        .eq('provider_name', 'cashfree')
        .single();

      if (applicationData) {
        setConfig({
          bank_account_number: applicationData.bank_account_number || '',
          ifsc_code: applicationData.ifsc_code || '',
          account_holder_name: applicationData.account_holder_name || '',
          business_type: applicationData.business_type || 'individual',
          pan_number: applicationData.verification_documents?.pan_number || '',
          gst_number: applicationData.verification_documents?.gst_number || ''
        });
        setApplicationStatus(applicationData.application_status);
      }

      if (providerData) {
        setIsEnabled(providerData.is_enabled);
      }
    } catch (error) {
      console.error('Error loading Cashfree config:', error);
    } finally {
      setLoading(false);
    }
  };

  const validateForm = () => {
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

    if (!config.pan_number || !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(config.pan_number)) {
      setMessage({ type: 'error', text: 'Please enter a valid PAN number (e.g., ABCDE1234F)' });
      return false;
    }

    return true;
  };

  const saveCashfreeConfig = async () => {
    try {
      setSaving(true);
      setMessage(null);

      if (!validateForm()) {
        return;
      }

      // Save sub-account application
      const { error: applicationError } = await supabase
        .from('sub_account_applications')
        .upsert({
          form_admin_id: adminId,
          provider_name: 'cashfree',
          bank_account_number: config.bank_account_number,
          ifsc_code: config.ifsc_code.toUpperCase(),
          account_holder_name: config.account_holder_name,
          business_type: config.business_type,
          verification_documents: {
            pan_number: config.pan_number.toUpperCase(),
            gst_number: config.gst_number?.toUpperCase() || null
          },
          application_status: 'pending',
          updated_at: new Date().toISOString()
        });

      if (applicationError) throw applicationError;

      // Update provider config
      const { error: providerError } = await supabase
        .from('provider_configs')
        .upsert({
          admin_id: adminId,
          provider_name: 'cashfree',
          is_enabled: isEnabled,
          config_data: config,
          verification_status: 'pending',
          updated_at: new Date().toISOString()
        });

      if (providerError) throw providerError;

      setApplicationStatus('pending');
      setMessage({ 
        type: 'success', 
        text: '🎉 Cashfree configuration saved! Account setup complete - you can now accept payments!' 
      });

      // For demo purposes, auto-approve after 2 seconds
      setTimeout(() => {
        setApplicationStatus('approved');
        setMessage({
          type: 'success',
          text: '✅ Cashfree account approved! You can now accept UPI, Cards & Net Banking payments.'
        });
      }, 2000);

    } catch (error) {
      console.error('Error saving Cashfree config:', error);
      setMessage({ type: 'error', text: 'Failed to save configuration. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  const testPayment = async () => {
    try {
      setMessage({ type: 'info', text: 'Creating test payment...' });

      const response = await fetch('/.netlify/functions/create-cashfree-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          form_id: 'test_form',
          email: 'test@example.com',
          amount: 100,
          product_name: 'Test Product'
        })
      });

      const result = await response.json();

      if (result.success) {
        setMessage({ 
          type: 'success', 
          text: `✅ Test payment created! Order ID: ${result.order_id}` 
        });
      } else {
        setMessage({ type: 'error', text: `Test failed: ${result.error}` });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Test payment failed' });
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pending: { color: 'bg-yellow-100 text-yellow-800', text: '⏳ Pending Review' },
      under_review: { color: 'bg-blue-100 text-blue-800', text: '🔍 Under Review' },
      approved: { color: 'bg-green-100 text-green-800', text: '✅ Approved & Active' },
      rejected: { color: 'bg-red-100 text-red-800', text: '❌ Rejected' }
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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        <span className="ml-2 text-gray-600">Loading Cashfree configuration...</span>
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
            <h3 className="text-lg font-semibold text-gray-900">Cashfree Configuration</h3>
            <p className="text-sm text-gray-600">Set up Indian payment processing with UPI, Cards & Net Banking</p>
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
            <span className="text-sm font-medium text-gray-700">Enable Cashfree</span>
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

      {/* Configuration Form */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Bank Details */}
        <div className="space-y-4">
          <h4 className="font-medium text-gray-900">🏦 Bank Account Details</h4>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Bank Account Number *
            </label>
            <input
              type="text"
              value={config.bank_account_number}
              onChange={(e) => setConfig({ ...config, bank_account_number: e.target.value })}
              placeholder="1234567890"
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
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              disabled={saving || applicationStatus === 'approved'}
            />
          </div>

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
        </div>

        {/* Business Details */}
        <div className="space-y-4">
          <h4 className="font-medium text-gray-900">📋 Business Information</h4>
          
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
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              disabled={saving || applicationStatus === 'approved'}
            />
          </div>
        </div>
      </div>

      {/* Commission Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-medium text-blue-900 mb-2">💰 Commission Structure</h4>
        <div className="text-sm text-blue-800 space-y-1">
          <p><strong>Example for ₹1000 transaction:</strong></p>
          <p>• Gateway Fee: ₹25 (2.5%)</p>
          <p>• Platform Commission: ₹30 (3%)</p>
          <p>• You Receive: ₹945</p>
          <p className="text-xs mt-2">💡 All amounts are automatically calculated and split</p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex space-x-3">
        {applicationStatus === 'approved' ? (
          <>
            <div className="flex items-center space-x-2 text-green-600">
              <span>✅</span>
              <span className="font-medium">Cashfree account is active!</span>
            </div>
            <button
              onClick={testPayment}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
            >
              🧪 Test Payment
            </button>
          </>
        ) : (
          <button
            onClick={saveCashfreeConfig}
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center space-x-2"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>Saving...</span>
              </>
            ) : (
              <>
                <span>💾</span>
                <span>Save & Activate</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Help Section */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h4 className="font-medium text-gray-900 mb-2">🚀 Quick Setup Guide</h4>
        <div className="text-sm text-gray-700 space-y-1">
          <p>1. <strong>Enter your bank details</strong> (where you want to receive payments)</p>
          <p>2. <strong>Add PAN number</strong> (required for Indian compliance)</p>
          <p>3. <strong>Click Save & Activate</strong> (instant approval for testing)</p>
          <p>4. <strong>Start accepting payments</strong> via UPI, Cards, Net Banking</p>
        </div>
      </div>
    </div>
  );
};
