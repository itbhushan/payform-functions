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
  business_name: string; // NEW FIELD
}

export const CashfreeConfig: React.FC = () => {
  const { user } = useAuth();
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
  const [vendorStatus, setVendorStatus] = useState<'none' | 'creating' | 'active' | 'error'>('none');
  const [payoutEnabled, setPayoutEnabled] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  useEffect(() => {
    if (user) {
      loadCashfreeConfig();
    }
  }, [user]);

  const loadCashfreeConfig = async () => {
    try {
      setLoading(true);
      
      // Load form admin data including vendor info
      const { data: adminData } = await supabase
        .from('form_admins')
        .select('*')
        .eq('id', user.id)
        .single();

      if (adminData) {
        setPayoutEnabled(adminData.payout_enabled || false);
        
        if (adminData.cashfree_vendor_id) {
          setVendorStatus('active');
        }
      }

      // Load provider config
      const { data: providerData } = await supabase
        .from('provider_configs')
        .select('*')
        .eq('admin_id', user.id)
        .eq('provider_name', 'cashfree')
        .single();

      if (providerData) {
        const configData = providerData.config_data || {};
        setConfig({
          bank_account_number: configData.bank_account_number || '',
          ifsc_code: configData.ifsc_code || '',
          account_holder_name: configData.account_holder_name || '',
          business_type: configData.business_type || 'individual',
          pan_number: configData.pan_number || '',
          gst_number: configData.gst_number || '',
          business_name: configData.business_name || ''
        });
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

    if (!config.business_name || config.business_name.length < 2) {
      setMessage({ type: 'error', text: 'Please enter business name' });
      return false;
    }

    if (!config.pan_number || !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(config.pan_number)) {
      setMessage({ type: 'error', text: 'Please enter a valid PAN number (e.g., ABCDE1234F)' });
      return false;
    }

    return true;
  };

  const createVendorAccount = async () => {
    try {
      setVendorStatus('creating');
      setMessage({ type: 'info', text: 'Creating your instant payout account...' });

      // Create vendor via our backend function
      const vendorResponse = await fetch('/.netlify/functions/create-cashfree-vendor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin_id: user.id,
          bank_details: config
        })
      });

      const vendorResult = await vendorResponse.json();
      
      if (vendorResult.success) {
        setVendorStatus('active');
        setPayoutEnabled(true);
        setMessage({ 
          type: 'success', 
          text: '🎉 Instant payout account created! You can now receive payments directly.' 
        });
      } else {
        throw new Error(vendorResult.error || 'Failed to create vendor account');
      }
    } catch (error) {
      console.error('Vendor creation failed:', error);
      setVendorStatus('error');
      setMessage({ 
        type: 'error', 
        text: `Failed to create payout account: ${error.message}` 
      });
    }
  };

  const saveCashfreeConfig = async () => {
    try {
      setSaving(true);
      setMessage(null);

      if (!validateForm()) {
        return;
      }

      // Save configuration to database
      const { error: configError } = await supabase
        .from('provider_configs')
        .upsert({
          admin_id: user.id,
          provider_name: 'cashfree',
          is_enabled: isEnabled,
          config_data: config,
          verification_status: 'verified', // Instant verification
          updated_at: new Date().toISOString()
        });

      if (configError) throw configError;

      // If vendor account doesn't exist, create it
      if (vendorStatus === 'none') {
        await createVendorAccount();
      } else {
        setMessage({ 
          type: 'success', 
          text: 'Configuration updated successfully!' 
        });
      }

    } catch (error) {
      console.error('Error saving Cashfree config:', error);
      setMessage({ type: 'error', text: 'Failed to save configuration. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  const getStatusBadge = () => {
    const statusConfig = {
      none: { color: 'bg-gray-100 text-gray-800', text: '⏳ Setup Required' },
      creating: { color: 'bg-blue-100 text-blue-800', text: '🔄 Creating Account...' },
      active: { color: 'bg-green-100 text-green-800', text: '✅ Instant Payouts Active' },
      error: { color: 'bg-red-100 text-red-800', text: '❌ Setup Error' }
    };

    const config = statusConfig[vendorStatus];
    
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
            <p className="text-sm text-gray-600">Set up instant payouts - receive money directly in your account</p>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          {getStatusBadge()}
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={isEnabled && payoutEnabled}
              onChange={(e) => setIsEnabled(e.target.checked)}
              className="form-checkbox h-5 w-5 text-blue-600"
              disabled={vendorStatus !== 'active'}
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
        {/* Business Details */}
        <div className="space-y-4">
          <h4 className="font-medium text-gray-900">Business Information</h4>
          
          <div>
            <label className="form-label">Business Name *</label>
            <input
              type="text"
              value={config.business_name}
              onChange={(e) => setConfig({ ...config, business_name: e.target.value })}
              placeholder="PayForm Business"
              className="form-input"
              disabled={saving || vendorStatus === 'active'}
            />
          </div>

          <div>
            <label className="form-label">Business Type *</label>
            <select
              value={config.business_type}
              onChange={(e) => setConfig({ ...config, business_type: e.target.value as any })}
              className="form-input"
              disabled={saving || vendorStatus === 'active'}
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
              disabled={saving || vendorStatus === 'active'}
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
              disabled={saving || vendorStatus === 'active'}
            />
          </div>
        </div>

        {/* Bank Details */}
        <div className="space-y-4">
          <h4 className="font-medium text-gray-900">Bank Account Details</h4>
          
          <div>
            <label className="form-label">Bank Account Number *</label>
            <input
              type="text"
              value={config.bank_account_number}
              onChange={(e) => setConfig({ ...config, bank_account_number: e.target.value })}
              placeholder="1234567890"
              className="form-input"
              disabled={saving || vendorStatus === 'active'}
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
              disabled={saving || vendorStatus === 'active'}
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
              disabled={saving || vendorStatus === 'active'}
            />
          </div>
        </div>
      </div>

      {/* 🆕 NEW: Instant Payout Benefits */}
      <div className="bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-lg p-4">
        <h4 className="font-medium text-green-900 mb-2">🚀 Instant Payout Benefits</h4>
        <div className="text-sm text-green-800 space-y-1">
          <p><strong>✅ Same-Day Payouts:</strong> Receive money directly in your account (no waiting!)</p>
          <p><strong>💰 Example for ₹1000 transaction:</strong></p>
          <p>• Gateway Fee: ₹28 (paid by customer)</p>
          <p>• Platform Fee: ₹30 (3% - PayForm commission)</p>
          <p>• <strong>You Receive: ₹942 (instantly in your bank account)</strong></p>
          <p className="text-xs mt-2">All calculations are automatic - no manual transfers needed!</p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex space-x-3">
        {vendorStatus === 'active' ? (
          <div className="flex items-center space-x-2 text-green-600">
            <span>✅</span>
            <span className="font-medium">Instant payout account is active! Start earning now.</span>
          </div>
        ) : (
          <button
            onClick={saveCashfreeConfig}
            disabled={saving || vendorStatus === 'creating'}
            className="btn-primary flex items-center space-x-2"
          >
            {saving || vendorStatus === 'creating' ? (
              <>
                <div className="loading-spinner w-4 h-4"></div>
                <span>Setting up instant payouts...</span>
              </>
            ) : (
              <>
                <span>🚀</span>
                <span>Setup Instant Payouts</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Help Section */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h4 className="font-medium text-gray-900 mb-2">📋 What You Need</h4>
        <div className="text-sm text-gray-700 space-y-1">
          <p>• <strong>Bank Account:</strong> Active savings/current account</p>
          <p>• <strong>PAN Card:</strong> For tax compliance</p>
          <p>• <strong>Business Details:</strong> Your business/individual information</p>
          <p>• <strong>IFSC Code:</strong> For instant bank transfers</p>
        </div>
        
        <div className="mt-4 pt-3 border-t border-gray-300">
          <h5 className="font-medium text-gray-900 mb-1">⚡ Setup Time: Instant!</h5>
          <p className="text-sm text-gray-600">
            No 24-48 hour waiting period. Your payout account is activated immediately after setup.
          </p>
        </div>
      </div>
    </div>
  );
};
