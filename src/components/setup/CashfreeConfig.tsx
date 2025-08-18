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
  
  // Existing state
  const [isEnabled, setIsEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [vendorStatus, setVendorStatus] = useState<'none' | 'creating' | 'active' | 'error'>('none');
  const [payoutEnabled, setPayoutEnabled] = useState(false);
  
  // 🆕 NEW: Dual Gateway State
  const [selectedGateway, setSelectedGateway] = useState<'cashfree' | 'razorpay'>('cashfree');
  const [razorpayAccountStatus, setRazorpayAccountStatus] = useState<'none' | 'created' | 'activated' | 'error'>('none');
  const [autoSplitsEnabled, setAutoSplitsEnabled] = useState(false);
  
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  useEffect(() => {
    if (user) {
      loadPaymentConfig();
    }
  }, [user]);

  const loadPaymentConfig = async () => {
    try {
      setLoading(true);
      
      // Load form admin data
      const { data: adminData } = await supabase
        .from('form_admins')
        .select('*')
        .eq('id', user.id)
        .single();

      if (adminData) {
        setPayoutEnabled(adminData.payout_enabled || false);
        setAutoSplitsEnabled(adminData.auto_splits_enabled || false);
        setSelectedGateway(adminData.preferred_gateway || 'cashfree');
        
        if (adminData.cashfree_vendor_id) {
          setVendorStatus('active');
        }
      }

      // Load Cashfree provider config
      const { data: cashfreeConfig } = await supabase
        .from('provider_configs')
        .select('*')
        .eq('admin_id', user.id)
        .eq('provider_name', 'cashfree')
        .single();

      if (cashfreeConfig) {
        const configData = cashfreeConfig.config_data || {};
        setConfig({
          bank_account_number: configData.bank_account_number || '',
          ifsc_code: configData.ifsc_code || '',
          account_holder_name: configData.account_holder_name || '',
          business_type: configData.business_type || 'individual',
          pan_number: configData.pan_number || '',
          gst_number: configData.gst_number || '',
          business_name: configData.business_name || ''
        });
        setIsEnabled(cashfreeConfig.is_enabled);
      }

      // 🆕 Load Razorpay linked account status
      const { data: razorpayAccount } = await supabase
        .from('razorpay_linked_accounts')
        .select('*')
        .eq('form_admin_id', user.id)
        .single();

      if (razorpayAccount) {
        setRazorpayAccountStatus(razorpayAccount.account_status === 'activated' ? 'activated' : 'created');
      }

    } catch (error) {
      console.error('Error loading payment config:', error);
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

  // 🆕 NEW: Create Razorpay Linked Account
  const createRazorpayAccount = async () => {
    try {
      setRazorpayAccountStatus('created');
      setSaving(true);
      setMessage({ type: 'info', text: 'Creating Razorpay auto-split account...' });

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

      setMessage({ type: 'info', text: 'Adding bank details for verification...' });

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
          setRazorpayAccountStatus('activated');
          setAutoSplitsEnabled(true);
          setSelectedGateway('razorpay');
          setMessage({ 
            type: 'success', 
            text: '🎉 Auto-split account activated! You will now receive 94.2% of payments directly.' 
          });
        } else {
          setRazorpayAccountStatus('created');
          setMessage({ 
            type: 'info', 
            text: '⏳ Bank verification in progress. You will be notified once activated.' 
          });
        }
      } else {
        throw new Error(bankResult.error || 'Failed to add bank details');
      }

    } catch (error) {
      console.error('Razorpay account creation failed:', error);
      setRazorpayAccountStatus('error');
      setMessage({ 
        type: 'error', 
        text: `Failed to create auto-split account: ${error.message}` 
      });
    } finally {
      setSaving(false);
    }
  };

  // Existing Cashfree functions remain the same...
  const createVendorAccount = async () => {
    // Your existing createVendorAccount code...
  };

  const saveCashfreeConfig = async () => {
    try {
      setSaving(true);
      setMessage(null);

      if (!validateForm()) {
        return;
      }

      // Save Cashfree configuration
      const { error: configError } = await supabase
        .from('provider_configs')
        .upsert({
          admin_id: user.id,
          provider_name: 'cashfree',
          is_enabled: isEnabled,
          config_data: config,
          verification_status: 'verified',
          updated_at: new Date().toISOString()
        });

      if (configError) throw configError;

      // Update preferred gateway
      await supabase
        .from('form_admins')
        .update({
          preferred_gateway: selectedGateway,
          auto_splits_enabled: selectedGateway === 'razorpay' && autoSplitsEnabled,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      setMessage({ 
        type: 'success', 
        text: 'Configuration saved successfully!' 
      });

    } catch (error) {
      console.error('Error saving config:', error);
      setMessage({ type: 'error', text: 'Failed to save configuration. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  const getGatewayStatusBadge = () => {
    if (selectedGateway === 'razorpay') {
      const statusConfig = {
        none: { color: 'bg-gray-100 text-gray-800', text: '⏳ Setup Required' },
        created: { color: 'bg-blue-100 text-blue-800', text: '🔄 Verification Pending' },
        activated: { color: 'bg-green-100 text-green-800', text: '✅ Auto-Splits Active' },
        error: { color: 'bg-red-100 text-red-800', text: '❌ Setup Error' }
      };
      const config = statusConfig[razorpayAccountStatus];
      return (
        <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${config.color}`}>
          {config.text}
        </span>
      );
    } else {
      const statusConfig = {
        none: { color: 'bg-gray-100 text-gray-800', text: '⏳ Setup Required' },
        creating: { color: 'bg-blue-100 text-blue-800', text: '🔄 Creating Account...' },
        active: { color: 'bg-green-100 text-green-800', text: '✅ Manual Payouts Active' },
        error: { color: 'bg-red-100 text-red-800', text: '❌ Setup Error' }
      };
      const config = statusConfig[vendorStatus];
      return (
        <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${config.color}`}>
          {config.text}
        </span>
      );
    }
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
            <h3 className="text-lg font-semibold text-gray-900">Payment Gateway Configuration</h3>
            <p className="text-sm text-gray-600">
              Choose your payment method and setup bank details
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          {getGatewayStatusBadge()}
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

      {/* 🆕 NEW: Gateway Selection */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h4 className="font-medium text-gray-900 mb-4">Choose Payment Method</h4>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className={`cursor-pointer p-4 border-2 rounded-lg transition-colors ${
            selectedGateway === 'cashfree' 
              ? 'border-blue-500 bg-blue-50' 
              : 'border-gray-200 hover:border-gray-300'
          }`}>
            <input
              type="radio"
              name="gateway"
              value="cashfree"
              checked={selectedGateway === 'cashfree'}
              onChange={(e) => setSelectedGateway(e.target.value as 'cashfree')}
              className="sr-only"
            />
            <div className="flex items-start space-x-3">
              <div className="text-2xl">🏦</div>
              <div>
                <h5 className="font-semibold text-gray-900">Cashfree (Manual Payouts)</h5>
                <p className="text-sm text-gray-600 mt-1">
                  Traditional payment processing with manual transfers
                </p>
                <div className="text-xs text-gray-500 mt-2">
                  ✅ UPI, Cards, Net Banking<br/>
                  ⏳ Manual payouts (you handle transfers)
                </div>
              </div>
            </div>
          </label>

          <label className={`cursor-pointer p-4 border-2 rounded-lg transition-colors ${
            selectedGateway === 'razorpay' 
              ? 'border-green-500 bg-green-50' 
              : 'border-gray-200 hover:border-gray-300'
          }`}>
            <input
              type="radio"
              name="gateway"
              value="razorpay"
              checked={selectedGateway === 'razorpay'}
              onChange={(e) => setSelectedGateway(e.target.value as 'razorpay')}
              className="sr-only"
            />
            <div className="flex items-start space-x-3">
              <div className="text-2xl">⚡</div>
              <div>
                <h5 className="font-semibold text-gray-900">
                  Razorpay Route (Auto-Splits) ⭐
                </h5>
                <p className="text-sm text-gray-600 mt-1">
                  Automatic payment splitting with instant payouts
                </p>
                <div className="text-xs text-gray-500 mt-2">
                  ✅ Get 94.2% automatically in 24 hours<br/>
                  ✅ Lower UPI fees (2% vs 2.5%)<br/>
                  🚀 No waiting for manual transfers
                </div>
              </div>
            </div>
          </label>
        </div>
      </div>

      {/* Bank Details Form (same for both gateways) */}
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
              disabled={saving}
            />
          </div>

          <div>
            <label className="form-label">Business Type *</label>
            <select
              value={config.business_type}
              onChange={(e) => setConfig({ ...config, business_type: e.target.value as any })}
              className="form-input"
              disabled={saving}
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
              disabled={saving}
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
              disabled={saving}
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
              disabled={saving}
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
              disabled={saving}
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
              disabled={saving}
            />
          </div>
        </div>
      </div>

      {/* Gateway-Specific Benefits */}
      {selectedGateway === 'razorpay' ? (
        <div className="bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-lg p-4">
          <h4 className="font-medium text-green-900 mb-2">🚀 Auto-Split Benefits</h4>
          <div className="text-sm text-green-800 space-y-1">
            <p><strong>✅ Instant Settlements:</strong> Get 94.2% directly in your account (24 hours)</p>
            <p><strong>💰 Example for ₹1000 payment:</strong></p>
            <p>• Customer pays: ₹1000 | UPI fee: ₹20 | Platform: ₹30 | <strong>You get: ₹950</strong></p>
            <p className="text-xs mt-2">All splits happen automatically - no waiting for manual transfers!</p>
          </div>
        </div>
      ) : (
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-medium text-blue-900 mb-2">🏦 Manual Payout System</h4>
          <div className="text-sm text-blue-800 space-y-1">
            <p><strong>✅ Traditional Processing:</strong> Proven payment system</p>
            <p><strong>💰 Example for ₹1000 payment:</strong></p>
            <p>• Customer pays: ₹1000 | Gateway fee: ₹28 | Platform: ₹30 | <strong>You get: ₹942</strong></p>
            <p className="text-xs mt-2">Manual transfers processed weekly by PayForm admin</p>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex space-x-3">
        {selectedGateway === 'razorpay' ? (
          razorpayAccountStatus === 'activated' ? (
            <div className="flex items-center space-x-2 text-green-600">
              <span>✅</span>
              <span className="font-medium">Auto-split account active! Start earning instantly.</span>
            </div>
          ) : (
            <button
              onClick={createRazorpayAccount}
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
                  <span>Setup Auto-Split Payments</span>
                </>
              )}
            </button>
          )
        ) : (
          <button
            onClick={saveCashfreeConfig}
            disabled={saving}
            className="btn-primary flex items-center space-x-2"
          >
            {saving ? (
              <>
                <div className="loading-spinner w-4 h-4"></div>
                <span>Saving...</span>
              </>
            ) : (
              <>
                <span>💾</span>
                <span>Save Cashfree Configuration</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Help Section */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h4 className="font-medium text-gray-900 mb-2">📋 Required Information</h4>
        <div className="text-sm text-gray-700 space-y-1">
          <p>• <strong>Bank Account:</strong> Active savings/current account</p>
          <p>• <strong>PAN Card:</strong> For tax compliance and verification</p>
          <p>• <strong>IFSC Code:</strong> For direct bank transfers</p>
          <p>• <strong>Business Details:</strong> Accurate business information for verification</p>
        </div>
        
        <div className="mt-4 pt-3 border-t border-gray-300">
          <h5 className="font-medium text-gray-900 mb-1">
            {selectedGateway === 'razorpay' ? '⚡ Auto-Split Setup' : '⏱️ Manual Setup Process'}
          </h5>
          <p className="text-sm text-gray-600">
            {selectedGateway === 'razorpay' 
              ? 'Bank verification happens automatically. Your auto-split account will be activated within minutes.'
              : 'Configuration is saved immediately. Manual payouts are processed weekly by PayForm admin.'}
          </p>
        </div>
      </div>
    </div>
  );
};
