// src/components/dashboard/MyForms.tsx - FIXED VERSION
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';

interface FormConfig {
  id: string;
  form_id: string;
  form_name: string;
  form_url: string;
  is_active: boolean;
  created_at: string;
  stats?: {
    total_transactions: number;
    successful_transactions: number;
    total_revenue: number;
    conversion_rate: number;
  };
}

// ✅ FIX 1: Memoized component to prevent unnecessary re-renders
export const MyForms: React.FC = React.memo(() => {
  const { user } = useAuth();
  const [forms, setForms] = useState<FormConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showSetupGuide, setShowSetupGuide] = useState(false);
  const [editingForm, setEditingForm] = useState<FormConfig | null>(null);

  // ✅ FIX 1: Memoized callback to prevent re-creation on every render
  const loadUserForms = useCallback(async () => {
    if (!user?.id) return;
    
    try {
      setLoading(true);
      
      // Get form configs for current user
      const { data: formConfigs, error } = await supabase
        .from('form_configs')
        .select(`
          id,
          form_id,
          form_name,
          form_url,
          is_active,
          created_at
        `)
        .eq('admin_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (formConfigs) {
        // Get transaction stats for each form
        const formsWithStats = await Promise.all(
          formConfigs.map(async (form) => {
            const { data: transactions } = await supabase
              .from('transactions')
              .select('payment_status, payment_amount')
              .eq('form_id', form.form_id)
              .eq('admin_id', user.id);

            const totalTransactions = transactions?.length || 0;
            const successfulTransactions = transactions?.filter(t => t.payment_status === 'paid').length || 0;
            const totalRevenue = transactions?.filter(t => t.payment_status === 'paid')
              .reduce((sum, t) => sum + (t.payment_amount || 0), 0) || 0;
            const conversionRate = totalTransactions > 0 ? (successfulTransactions / totalTransactions) * 100 : 0;

            return {
              ...form,
              stats: {
                total_transactions: totalTransactions,
                successful_transactions: successfulTransactions,
                total_revenue: totalRevenue,
                conversion_rate: conversionRate
              }
            };
          })
        );

        setForms(formsWithStats);
      }
    } catch (error) {
      console.error('Error loading forms:', error);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  // ✅ FIX 1: Only load once when component mounts or user changes
  useEffect(() => {
    loadUserForms();
  }, [loadUserForms]);

  // ✅ FIX 1: Memoize forms count to prevent unnecessary re-renders in parent
  const formsCount = useMemo(() => forms.length, [forms.length]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading your forms...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-medium text-gray-900">Connected Forms</h2>
              <p className="mt-1 text-sm text-gray-600">
                Manage your Google Forms with payment integration
              </p>
            </div>
            <div className="flex space-x-3">
              <button
                onClick={() => setShowSetupGuide(true)}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium"
              >
                📖 Setup Guide
              </button>
              <button
                onClick={() => setShowAddForm(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
              >
                + Connect New Form
              </button>
            </div>
          </div>
        </div>

        {/* Forms List or Empty State */}
        <div className="p-6">
          {forms.length === 0 ? (
            <EmptyState onConnectForm={() => setShowAddForm(true)} onShowGuide={() => setShowSetupGuide(true)} />
          ) : (
            <FormsGrid 
              forms={forms} 
              onRefresh={loadUserForms}
              onEdit={setEditingForm}
            />
          )}
        </div>
      </div>

      {/* Add Form Modal */}
      {showAddForm && (
        <AddFormModal 
          onClose={() => setShowAddForm(false)} 
          onSuccess={() => {
            setShowAddForm(false);
            loadUserForms();
          }}
        />
      )}

      {/* ✅ FIX 2: Edit Form Modal */}
      {editingForm && (
        <EditFormModal
          form={editingForm}
          onClose={() => setEditingForm(null)}
          onSuccess={() => {
            setEditingForm(null);
            loadUserForms();
          }}
        />
      )}

      {/* Setup Guide Modal */}
      {showSetupGuide && (
        <SetupGuideModal onClose={() => setShowSetupGuide(false)} />
      )}
    </div>
  );
});

// Empty State Component
const EmptyState: React.FC<{ onConnectForm: () => void; onShowGuide: () => void }> = ({ onConnectForm, onShowGuide }) => (
  <div className="text-center py-12">
    <div className="text-6xl mb-6">📋</div>
    <h3 className="text-lg font-medium text-gray-900 mb-2">No Forms Connected Yet</h3>
    <p className="text-gray-600 mb-8">Connect your first Google Form to start accepting payments</p>
    
    <div className="flex justify-center space-x-4">
      <button
        onClick={onConnectForm}
        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium"
      >
        + Connect Your First Form
      </button>
      <button
        onClick={onShowGuide}
        className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-3 rounded-lg font-medium"
      >
        📖 View Setup Guide
      </button>
    </div>

    {/* Updated Quick Setup Guide */}
    <div className="mt-12 bg-blue-50 border border-blue-200 rounded-lg p-6 text-left max-w-2xl mx-auto">
      <h4 className="font-medium text-blue-900 mb-4">📋 Google Form Setup Guide</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-blue-800">
        <div>
          <h5 className="font-medium mb-2">1. Required Form Fields</h5>
          <ul className="space-y-1 text-xs">
            <li>• <strong>Email</strong> (required for payment links)</li>
            <li>• <strong>Product</strong> format: "Course - ₹2999"</li>
            <li>• <strong>Customer Name</strong> (recommended)</li>
            <li>• <strong>Phone Number</strong> (optional)</li>
          </ul>
        </div>
        <div>
          <h5 className="font-medium mb-2">2. Integration Steps</h5>
          <ul className="space-y-1 text-xs">
            <li>• Copy form ID from URL</li>
            <li>• Install PayForm Apps Script</li>
            <li>• Configure submit trigger</li>
            <li>• Test with submission</li>
          </ul>
        </div>
      </div>
      <div className="mt-4 p-3 bg-blue-100 rounded-lg text-xs text-blue-700">
        <p><strong>💡 Note:</strong> Product pricing is extracted from your form responses automatically. No need to configure products separately in PayForm!</p>
      </div>
    </div>
  </div>
);

// ✅ FIX 2: Enhanced Forms Grid with Edit functionality
const FormsGrid: React.FC<{ 
  forms: FormConfig[]; 
  onRefresh: () => void;
  onEdit: (form: FormConfig) => void;
}> = ({ forms, onRefresh, onEdit }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    {forms.map((form) => (
      <FormCard 
        key={form.id} 
        form={form} 
        onRefresh={onRefresh}
        onEdit={onEdit}
      />
    ))}
  </div>
);

// ✅ FIX 2: Enhanced Form Card with Edit button and better stats display
const FormCard: React.FC<{ 
  form: FormConfig; 
  onRefresh: () => void;
  onEdit: (form: FormConfig) => void;
}> = ({ form, onRefresh, onEdit }) => {
  const [showDetails, setShowDetails] = useState(false);

  const toggleFormStatus = async () => {
    try {
      await supabase
        .from('form_configs')
        .update({ is_active: !form.is_active })
        .eq('id', form.id);
      
      onRefresh();
    } catch (error) {
      console.error('Error updating form status:', error);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow">
      <div className="p-6">
        {/* Form Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h3 className="font-medium text-gray-900 truncate">{form.form_name}</h3>
            <p className="text-sm text-gray-500 mt-1">
              Form ID: {form.form_id.slice(0, 12)}...
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
              form.is_active 
                ? 'bg-green-100 text-green-800' 
                : 'bg-gray-100 text-gray-800'
            }`}>
              {form.is_active ? '✅ Active' : '⏸️ Paused'}
            </span>
          </div>
        </div>

        {/* ✅ FIX 2: Enhanced Stats Display with explanation for new forms */}
        {form.stats && (
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="text-center">
              <div className="text-lg font-bold text-blue-600">{form.stats.total_transactions}</div>
              <div className="text-xs text-gray-500">Total Submissions</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-green-600">₹{form.stats.total_revenue.toLocaleString()}</div>
              <div className="text-xs text-gray-500">Revenue</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-purple-600">{form.stats.successful_transactions}</div>
              <div className="text-xs text-gray-500">Paid</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-orange-600">
                {form.stats.total_transactions > 0 ? `${form.stats.conversion_rate.toFixed(1)}%` : '—'}
              </div>
              <div className="text-xs text-gray-500">Conversion</div>
            </div>
          </div>
        )}

        {/* ✅ FIX 2: New forms message */}
        {form.stats && form.stats.total_transactions === 0 && (
          <div className="mb-4 p-3 bg-blue-50 rounded-lg text-xs text-blue-700">
            <p><strong>📊 New Form:</strong> Stats will appear here as customers submit payments through this form.</p>
          </div>
        )}

        {/* ✅ FIX 3: Removed Products section - products come from form responses */}

        {/* ✅ FIX 2: Enhanced Actions with Edit button */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <button
            onClick={() => setShowDetails(true)}
            className="bg-blue-50 text-blue-700 hover:bg-blue-100 px-3 py-2 rounded text-sm font-medium"
          >
            📊 Details
          </button>
          <button
            onClick={() => onEdit(form)}
            className="bg-gray-50 text-gray-700 hover:bg-gray-100 px-3 py-2 rounded text-sm font-medium"
          >
            ✏️ Edit
          </button>
          <button
            onClick={toggleFormStatus}
            className={`px-3 py-2 rounded text-sm font-medium ${
              form.is_active
                ? 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100'
                : 'bg-green-50 text-green-700 hover:bg-green-100'
            }`}
          >
            {form.is_active ? '⏸️ Pause' : '▶️ Activate'}
          </button>
        </div>

        {/* Quick Actions */}
        <div className="flex justify-between text-xs">
          <a 
            href={form.form_url} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800"
          >
            🔗 Open Form
          </a>
          <span className="text-gray-500">
            Added {new Date(form.created_at).toLocaleDateString()}
          </span>
        </div>
      </div>

      {/* Form Details Modal */}
      {showDetails && (
        <FormDetailsModal 
          form={form} 
          onClose={() => setShowDetails(false)}
          onRefresh={onRefresh}
        />
      )}
    </div>
  );
};

// ✅ FIX 3: Simplified Add Form Modal (no products configuration)
const AddFormModal: React.FC<{ onClose: () => void; onSuccess: () => void }> = ({ onClose, onSuccess }) => {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    form_url: '',
    form_name: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const extractFormId = (url: string) => {
    const match = url.match(/forms\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    const formId = extractFormId(formData.form_url);
    if (!formId) {
      setError('Invalid Google Form URL. Please check the URL format.');
      return;
    }

    setLoading(true);
    try {
      // Check if form already exists
      const { data: existingForm } = await supabase
        .from('form_configs')
        .select('id')
        .eq('form_id', formId)
        .eq('admin_id', user?.id)
        .single();

      if (existingForm) {
        setError('This form is already connected to your account.');
        setLoading(false);
        return;
      }

      // Insert form config
      const { error: formError } = await supabase
        .from('form_configs')
        .insert({
          form_id: formId,
          admin_id: user?.id,
          form_name: formData.form_name,
          form_url: formData.form_url,
          is_active: true,
          payment_settings: {
            currency: 'INR'
          }
        });

      if (formError) throw formError;

      // Insert basic payment config for backward compatibility
      const { error: paymentError } = await supabase
        .from('payment_configs')
        .insert({
          form_id: formId,
          admin_id: user?.id,
          form_name: formData.form_name,
          currency: 'INR',
          is_active: true
        });

      if (paymentError) throw paymentError;

      onSuccess();
    } catch (error) {
      console.error('Error saving form:', error);
      setError('Error saving form. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-medium text-gray-900">Connect New Google Form</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <span className="text-2xl">×</span>
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Google Form URL *
            </label>
            <input
              type="url"
              value={formData.form_url}
              onChange={(e) => setFormData(prev => ({ ...prev, form_url: e.target.value }))}
              placeholder="https://docs.google.com/forms/d/YOUR_FORM_ID/edit"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Copy the URL from your Google Form edit page
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Form Name *
            </label>
            <input
              type="text"
              value={formData.form_name}
              onChange={(e) => setFormData(prev => ({ ...prev, form_name: e.target.value }))}
              placeholder="e.g., Course Registration Form"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>

          {/* ✅ FIX 3: Added explanation about products */}
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800">
              <strong>💡 Note:</strong> Product details and pricing will be automatically extracted from your form responses. 
              Make sure your form includes a field with format like "Course - ₹2999".
            </p>
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Connecting...' : 'Connect Form'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ✅ FIX 2: New Edit Form Modal
const EditFormModal: React.FC<{ 
  form: FormConfig; 
  onClose: () => void; 
  onSuccess: () => void;
}> = ({ form, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    form_name: form.form_name,
    form_url: form.form_url,
    is_active: form.is_active
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { error: updateError } = await supabase
        .from('form_configs')
        .update({
          form_name: formData.form_name,
          form_url: formData.form_url,
          is_active: formData.is_active,
          updated_at: new Date().toISOString()
        })
        .eq('id', form.id);

      if (updateError) throw updateError;

      onSuccess();
    } catch (error) {
      console.error('Error updating form:', error);
      setError('Error updating form. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-medium text-gray-900">Edit Form</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <span className="text-2xl">×</span>
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Form Name *
            </label>
            <input
              type="text"
              value={formData.form_name}
              onChange={(e) => setFormData(prev => ({ ...prev, form_name: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Google Form URL *
            </label>
            <input
              type="url"
              value={formData.form_url}
              onChange={(e) => setFormData(prev => ({ ...prev, form_url: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="is_active"
              checked={formData.is_active}
              onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="is_active" className="ml-2 text-sm text-gray-700">
              Form is active
            </label>
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Form Details Modal (simplified)
const FormDetailsModal: React.FC<{ form: FormConfig; onClose: () => void; onRefresh: () => void }> = ({ form, onClose, onRefresh }) => (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-medium text-gray-900">{form.form_name} - Details</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <span className="text-2xl">×</span>
        </button>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-500">Form ID</label>
            <p className="text-sm text-gray-900 font-mono">{form.form_id}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500">Status</label>
            <p className="text-sm text-gray-900">{form.is_active ? 'Active' : 'Paused'}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500">Created</label>
            <p className="text-sm text-gray-900">{new Date(form.created_at).toLocaleDateString()}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500">Total Revenue</label>
            <p className="text-sm text-gray-900 font-bold">₹{form.stats?.total_revenue || 0}</p>
          </div>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-500">Form URL</label>
          <a href={form.form_url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:text-blue-800 break-all">
            {form.form_url}
          </a>
        </div>
      </div>
    </div>
  </div>
);

// Setup Guide Modal (unchanged)
const SetupGuideModal: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-medium text-gray-900">📖 Google Forms Integration Guide</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <span className="text-2xl">×</span>
        </button>
      </div>

      <div className="prose prose-sm max-w-none">
        <div className="text-center py-8">
          <p className="text-gray-600">Complete step-by-step setup guide coming soon!</p>
          <p className="text-sm text-gray-500 mt-2">
            This will include screenshots, code snippets, and troubleshooting tips.
          </p>
        </div>
      </div>
    </div>
  </div>
);
