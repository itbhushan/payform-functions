// src/components/setup/RazorpayConfig.tsx - FOLLOWING CASHFREE PATTERN
import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';

interface RazorpayConfigData {
  bank_account_number: string;
  ifsc_code: string;
  account_holder_name: string;
  business_type: 'individual' | 'proprietorship' | 'partnership' | 'company';
  pan_number: string;
  gst_number?: string;
  business_name: string;
}

export const RazorpayConfig: React.FC = () => {
  const { user } = useAuth();
  const [config, setConfig] = useState<RazorpayConfigData>({
    bank_account_number: '',
    ifsc_code: '',
    account_holder_name: '',
    business_type: 'individual',
    pan_number: '',
    gst_number: '',
    business_name: ''
  });
  
  // State management (same as CashFree)
  const [isEnabled, setIsEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [accountStatus, setAccountStatus] = useState<'none' | 'creating' | 'active' | 'error'>('none');
  const [autoSplitsEnabled, setAutoSplitsEnabled] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  useEffect(() => {
    if (user) {
      loadRazorpayConfig();
    }
  }, [user]);

  const loadRazorpayConfig = async () => {
    try {
      setLoading(true);
      
      // Load Razorpay provider config (same pattern as CashFree)
      const { data: razorpayConfig } = await supabase
        .from('provider_configs')
        .select('*')
        .eq('admin_id', user.id)
        .eq('provider_name', 'razorpay')
        .single();

      if (razorpayConfig) {
        const configData = razorpayConfig.config_data || {};
        setConfig({
          bank_account_number: configData.bank_account_number || '',
          ifsc_code: configData.ifsc_code || '',
          account_holder_name: configData.account_holder_name || '',
          business_type: configData.business_type || 'individual',
          pan_number: configData.pan_number || '',
          gst_number: configData.gst_number || '',
          business_name: configData.business_name || ''
        });
        setIsEnabled(razorpayConfig.is_enabled);
      }

      // Check Razorpay linked account status
      const { data: linkedAccount } = await supabase
        .from('razorpay_linked_accounts')
        .select('*')
        .eq('form_admin_id', user.id)
        .single();

      if (linkedAccount) {
        setAccountStatus(linkedAccount.account_status === 'activated' ? 'active' : 'creating');
        setAutoSplitsEnabled(linkedAccount.account_status === 'activated');
      }

    } catch (error) {
      console.error('Error loading Razorpay config:', error);
    } finally {
      setLoading(false);
    }
  };

  // Validation function (same as CashFree)
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

  // Create Razorpay linked account (similar to CashFree vendor creation)
  const createLinkedAccount = async () => {
    try {
      setAccountStatus('creating');
      setSaving(true);
      setMessage({ type: 'info', text: 'Creating Razorpay linked account for auto-splits...' });

      if (!validateForm()) {
        setAccountStatus('none');
        return;
      }

      // Step 1: Create linked account
      const linkedAccountResponse = await fetch('/.netlify/functions/create-razorpay-linked-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin_id: user.id,
          bank_details: config
        })
      });

      const linkedResult = await linkedAccountResponse.json();
      
      if (!linkedResult.success) {
        throw new Error(linkedResult.error || 'Failed to create linked account');
      }

      setMessage({ type: 'info', text: 'Adding bank details for instant payouts...' });

      // Step 2: Add bank account
      const bankResponse = await fetch('/.netlify/functions/add-bank-to-razorpay-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin_id: user.id,
          bank_details: config
        })
      });

      const bankResult = await bankResponse.json();
      
      if (bankResult.success) {
        if (bankResult.bank_verified) {
          setAccountStatus('active');
          setAutoSplitsEnabled(true);
          setMessage({ 
            type: 'success', 
            text: '🎉 Auto-split account activated! You will now receive 97% of payments directly in 24 hours.' 
          });
        } else {
          setAccountStatus('creating');
          setMessage({ 
            type: 'info', 
            text: '⏳ Bank verification in progress. Auto-splits will activate once verified (usually within minutes).' 
          });
        }

        // Save configuration
        await saveRazorpayConfig();
      } else {
        throw new Error(bankResult.error || 'Failed to add bank details');
      }

    } catch (error) {
      console.error('Razorpay account creation failed:', error);
      setAccountStatus('error');
      setMessage({ 
        type: 'error', 
        text: `Failed to create linked account: ${error.message}` 
      });
    } finally {
      setSaving(false);
    }
  };

  // Save configuration (same pattern as CashFree)
  const saveRazorpayConfig = async () => {
    try {
      setSaving(true);
      setMessage(null);

      if (!validateForm()) {
        return;
      }

      // Save Razorpay configuration
      const { error: configError } = await supabase
        .from('provider_configs')
        .upsert({
          admin_id: user.id,
          provider_name: 'razorpay',
          is_enabled: isEnabled,
          config_data: config,
          verification_status: 'verified',
          updated_at: new Date().toISOString()
        });

      if (configError) throw configError;

      // Update form admin preferences for auto-splits
      await supabase
        .from('form_admins')
        .update({
          preferred_gateway: 'razorpay',
          auto_splits_enabled: autoSplitsEnabled,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      setMessage({ 
        type: 'success', 
        text: 'Razorpay configuration saved successfully!' 
      });

    } catch (error) {
      console.error('Error saving Razorpay config:', error);
      setMessage({ type: 'error', text: 'Failed to save configuration. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  // Status badge (adapted from CashFree)
  const getStatusBadge = () => {
    const statusConfig = {
      none: { color: 'bg-gray-100 text-gray-800', text: '⏳ Setup Required' },
      creating: { color: 'bg-blue-100 text-blue-800', text: '🔄 Creating Account...' },
      active: { color: 'bg-green-100 text-green-800', text: '✅ Auto-Splits Active' },
      error: { color: 'bg-red-100 text-red-800', text: '❌ Setup Error' }
    };
    
    const config = statusConfig[accountStatus];
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
        <span className="ml-2 text-gray-600">Loading Razorpay configuration...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="text-2xl">⚡</div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Razorpay Auto-Split Configuration</h3>
            <p className="text-sm text-gray-600">Setup automatic payment splitting with instant payouts</p>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          {getStatusBadge()}
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={isEnabled}
              onChange={(e) => setIsEnabled(e.target.checked)}
              className="form-checkbox h-5 w-5 text-blue-600"
              disabled={accountStatus !== 'active'}
            />
            <span className="text-sm font-medium text-gray-700">Enable Razorpay</span>
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

      {/* Configuration Form (same layout as CashFree) */}
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
              placeholder="Your Business Name"
              className="form-input"
              disabled={saving || accountStatus === 'active'}
            />
          </div>

          <div>
            <label className="form-label">Business Type *</label>
            <select
              value={config.business_type}
              onChange={(e) => setConfig({ ...config, business_type: e.target.value as any })}
              className="form-input"
              disabled={saving || accountStatus === 'active'}
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
              disabled={saving || accountStatus === 'active'}
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
              disabled={saving || accountStatus === 'active'}
            />
            <p className="text-xs text-gray-500 mt-1">
              Required for companies, optional for individuals
            </p>
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
              disabled={saving || accountStatus === 'active'}
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
              disabled={saving || accountStatus === 'active'}
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
              disabled={saving || accountStatus === 'active'}
            />
          </div>
        </div>
      </div>

      {/* Auto-Split Benefits */}
      <div className="bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-lg p-4">
        <h4 className="font-medium text-green-900 mb-2">🚀 Auto-Split Benefits</h4>
        <div className="text-sm text-green-800 space-y-1">
          <p><strong>✅ Instant Settlements:</strong> Get 97% directly in your account (24 hours)</p>
          <p><strong>💰 Example for ₹1000 payment:</strong></p>
          <p>• Customer pays: ₹1000 | Razorpay fee: ₹20 | Platform: ₹30 | <strong>You get: ₹950</strong></p>
          <p><strong>🔥 Lower UPI fees:</strong> 2% (vs 2.5% with other gateways)</p>
          <p className="text-xs mt-2">All splits happen automatically - no waiting for manual transfers!</p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex space-x-3">
        {accountStatus === 'active' ? (
          <div className="flex items-center space-x-2 text-green-600">
            <span>✅</span>
            <span className="font-medium">Auto-split account is active! Start earning instantly.</span>
          </div>
        ) : (
          <button
            onClick={createLinkedAccount}
            disabled={saving}
            className="btn-primary flex items-center space-x-2"
          >
            {saving ? (
              <>
                <div className="loading-spinner w-4 h-4"></div>
                <span>Setting up auto-splits...</span>
              </>
            ) : (
              <>
                <span>⚡</span>
                <span>Setup Auto-Split Account</span>
              </>
            )}
          </button>
        )}

        {accountStatus === 'error' && (
          <button
            onClick={createLinkedAccount}
            className="btn-secondary flex items-center space-x-2"
          >
            <span>🔄</span>
            <span>Retry Setup</span>
          </button>
        )}
      </div>

      {/* Help Section */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h4 className="font-medium text-gray-900 mb-2">📋 Auto-Split Setup Requirements</h4>
        <div className="text-sm text-gray-700 space-y-1">
          <p>• <strong>Bank Account:</strong> Active savings/current account for instant payouts</p>
          <p>• <strong>PAN Card:</strong> For KYC verification and tax compliance</p>
          <p>• <strong>Business Details:</strong> Accurate information for Razorpay verification</p>
          <p>• <strong>IFSC Code:</strong> For direct bank transfers within 24 hours</p>
        </div>
        
        <div className="mt-4 pt-3 border-t border-gray-300">
          <h5 className="font-medium text-gray-900 mb-1">⚡ Instant Activation</h5>
          <p className="text-sm text-gray-600">
            Bank verification happens automatically. Your auto-split account will be activated within minutes.
            No manual intervention required!
          </p>
        </div>
      </div>
    </div>
  );
};
