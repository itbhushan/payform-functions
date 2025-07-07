import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface StripeConfigData {
  publishable_key: string;
  secret_key: string;
  webhook_secret: string;
}

interface StripeConfigProps {
  adminId?: string;
}

export const StripeConfig: React.FC<StripeConfigProps> = ({ adminId = 'default' }) => {
  const [config, setConfig] = useState<StripeConfigData>({
    publishable_key: '',
    secret_key: '',
    webhook_secret: ''
  });
  const [isEnabled, setIsEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadStripeConfig();
  }, [adminId]);

  const loadStripeConfig = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('provider_configs')
        .select('*')
        .eq('admin_id', adminId)
        .eq('provider_name', 'stripe')
        .single();

      if (data) {
        setConfig(data.config_data || {
          publishable_key: '',
          secret_key: '',
          webhook_secret: ''
        });
        setIsEnabled(data.is_enabled);
      }
    } catch (error) {
      console.error('Error loading Stripe config:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveStripeConfig = async () => {
    try {
      setSaving(true);
      setMessage(null);

      // Validate required fields
      if (!config.publishable_key || !config.secret_key) {
        setMessage({ type: 'error', text: 'Publishable key and Secret key are required' });
        return;
      }

      // Validate key formats
      if (!config.publishable_key.startsWith('pk_')) {
        setMessage({ type: 'error', text: 'Publishable key must start with pk_' });
        return;
      }

      if (!config.secret_key.startsWith('sk_')) {
        setMessage({ type: 'error', text: 'Secret key must start with sk_' });
        return;
      }

      // Save to database
      const { error } = await supabase
        .from('provider_configs')
        .upsert({
          admin_id: adminId,
          provider_name: 'stripe',
          is_enabled: isEnabled,
          config_data: config,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;

      setMessage({ type: 'success', text: 'Stripe configuration saved successfully!' });
    } catch (error) {
      console.error('Error saving Stripe config:', error);
      setMessage({ type: 'error', text: 'Failed to save configuration. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    if (!config.secret_key) {
      setMessage({ type: 'error', text: 'Please enter your secret key first' });
      return;
    }

    try {
      setSaving(true);
      setMessage({ type: 'success', text: 'Testing connection...' });

      // Test the Stripe key by making a simple API call
      const response = await fetch('https://api.stripe.com/v1/account', {
        headers: {
          'Authorization': `Bearer ${config.secret_key}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      if (response.ok) {
        const account = await response.json();
        setMessage({ 
          type: 'success', 
          text: `✅ Connection successful! Account: ${account.display_name || account.id}` 
        });
      } else {
        setMessage({ type: 'error', text: 'Invalid Stripe secret key' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to test connection' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="loading-spinner"></div>
        <span className="ml-2 text-gray-600">Loading Stripe configuration...</span>
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
            <h3 className="text-lg font-semibold text-gray-900">Stripe Configuration</h3>
            <p className="text-sm text-gray-600">Configure your Stripe payment settings</p>
          </div>
        </div>
        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={(e) => setIsEnabled(e.target.checked)}
            className="form-checkbox h-5 w-5 text-blue-600"
          />
          <span className="text-sm font-medium text-gray-700">Enable Stripe</span>
        </label>
      </div>

      {/* Message */}
      {message && (
        <div className={`p-4 rounded-lg ${
          message.type === 'success' 
            ? 'bg-green-50 border border-green-200 text-green-800'
            : 'bg-red-50 border border-red-200 text-red-800'
        }`}>
          {message.text}
        </div>
      )}

      {/* Configuration Form */}
      <div className="space-y-4">
        <div>
          <label className="form-label">
            Stripe Publishable Key *
            <span className="text-xs text-gray-500 ml-1">(starts with pk_)</span>
          </label>
          <input
            type="text"
            value={config.publishable_key}
            onChange={(e) => setConfig({ ...config, publishable_key: e.target.value })}
            placeholder="pk_test_..."
            className="form-input"
            disabled={saving}
          />
          <p className="text-xs text-gray-500 mt-1">
            Your publishable key from the Stripe Dashboard → Developers → API Keys
          </p>
        </div>

        <div>
          <label className="form-label">
            Stripe Secret Key *
            <span className="text-xs text-gray-500 ml-1">(starts with sk_)</span>
          </label>
          <input
            type="password"
            value={config.secret_key}
            onChange={(e) => setConfig({ ...config, secret_key: e.target.value })}
            placeholder="sk_test_..."
            className="form-input"
            disabled={saving}
          />
          <p className="text-xs text-gray-500 mt-1">
            Your secret key from the Stripe Dashboard. Keep this secure!
          </p>
        </div>

        <div>
          <label className="form-label">
            Webhook Secret
            <span className="text-xs text-gray-500 ml-1">(optional, starts with whsec_)</span>
          </label>
          <input
            type="password"
            value={config.webhook_secret}
            onChange={(e) => setConfig({ ...config, webhook_secret: e.target.value })}
            placeholder="whsec_..."
            className="form-input"
            disabled={saving}
          />
          <p className="text-xs text-gray-500 mt-1">
            Webhook endpoint secret for secure webhook verification
          </p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex space-x-3">
        <button
          onClick={saveStripeConfig}
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
              <span>Save Configuration</span>
            </>
          )}
        </button>

        <button
          onClick={testConnection}
          disabled={saving || !config.secret_key}
          className="btn-secondary flex items-center space-x-2"
        >
          <span>🔌</span>
          <span>Test Connection</span>
        </button>
      </div>

      {/* Help Section */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-medium text-blue-900 mb-2">🔗 How to get your Stripe keys:</h4>
        <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
          <li>Go to <a href="https://dashboard.stripe.com" target="_blank" rel="noopener noreferrer" className="underline">Stripe Dashboard</a></li>
          <li>Navigate to Developers → API Keys</li>
          <li>Copy your Publishable key (pk_test_...) and Secret key (sk_test_...)</li>
          <li>For webhooks, create an endpoint and copy the signing secret</li>
        </ol>
      </div>
    </div>
  );
};
