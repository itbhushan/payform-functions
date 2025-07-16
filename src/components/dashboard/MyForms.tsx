// src/components/dashboard/MyForms.tsx
import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';

interface FormConfig {
  id: string;
  form_id: string;
  form_name: string;
  form_url: string;
  is_active: boolean;
  payment_settings: {
    products: Array<{
      name: string;
      price: number;
    }>;
    currency: string;
  };
  created_at: string;
  stats?: {
    total_transactions: number;
    successful_transactions: number;
    total_revenue: number;
    conversion_rate: number;
  };
}

export const MyForms: React.FC = () => {
  const { user } = useAuth();
  const [forms, setForms] = useState<FormConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showSetupGuide, setShowSetupGuide] = useState(false);

  useEffect(() => {
    if (user) {
      loadUserForms();
    }
  }, [user]);

  const loadUserForms = async () => {
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
          payment_settings,
          created_at
        `)
        .eq('admin_id', user?.id)
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
              .eq('admin_id', user?.id);

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
  };

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
            <FormsGrid forms={forms} onRefresh={loadUserForms} />
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

      {/* Setup Guide Modal */}
      {showSetupGuide && (
        <SetupGuideModal onClose={() => setShowSetupGuide(false)} />
      )}
    </div>
  );
};

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

    {/* Quick Setup Guide Preview */}
    <div className="mt-12 bg-blue-50 border border-blue-200 rounded-lg p-6 text-left max-w-2xl mx-auto">
      <h4 className="font-medium text-blue-900 mb-4">📋 Google Form Setup Guide</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-blue-800">
        <div>
          <h5 className="font-medium mb-2">1. Required Form Fields</h5>
          <ul className="space-y-1 text-xs">
            <li>• Email (required for payment links)</li>
            <li>• Product with pricing (e.g., "Course - ₹2999")</li>
            <li>• Customer name (recommended)</li>
            <li>• Phone number (optional)</li>
          </ul>
        </div>
        <div>
          <h5 className="font-medium mb-2">2. Integration Steps</h5>
          <ul className="space-y-1 text-xs">
            <li>• Copy your form ID from the URL</li>
            <li>• Install PayForm Apps Script code</li>
            <li>• Configure form submit trigger</li>
            <li>• Test with sample submission</li>
          </ul>
        </div>
      </div>
      <button 
        onClick={onShowGuide}
        className="mt-4 bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700"
      >
        📖 View Complete Setup Guide
      </button>
    </div>
  </div>
);

// Forms Grid Component
const FormsGrid: React.FC<{ forms: FormConfig[]; onRefresh: () => void }> = ({ forms, onRefresh }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    {forms.map((form) => (
      <FormCard key={form.id} form={form} onRefresh={onRefresh} />
    ))}
  </div>
);

// Individual Form Card Component
const FormCard: React.FC<{ form: FormConfig; onRefresh: () => void }> = ({ form, onRefresh }) => {
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

        {/* Stats Grid */}
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
              <div className="text-lg font-bold text-orange-600">{form.stats.conversion_rate.toFixed(1)}%</div>
              <div className="text-xs text-gray-500">Conversion</div>
            </div>
          </div>
        )}

        {/* Products */}
        <div className="mb-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Products:</h4>
          <div className="space-y-1">
            {form.payment_settings?.products?.map((product, index) => (
              <div key={index} className="flex justify-between text-sm">
                <span className="text-gray-600">{product.name}</span>
                <span className="font-medium">₹{product.price}</span>
              </div>
            )) || (
              <p className="text-sm text-gray-500 italic">No products configured</p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex space-x-2">
          <button
            onClick={() => setShowDetails(true)}
            className="flex-1 bg-blue-50 text-blue-700 hover:bg-blue-100 px-3 py-2 rounded text-sm font-medium"
          >
            📊 Details
          </button>
          <button
            onClick={toggleFormStatus}
            className={`flex-1 px-3 py-2 rounded text-sm font-medium ${
              form.is_active
                ? 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100'
                : 'bg-green-50 text-green-700 hover:bg-green-100'
            }`}
          >
            {form.is_active ? '⏸️ Pause' : '▶️ Activate'}
          </button>
        </div>

        {/* Quick Actions */}
        <div className="mt-3 flex justify-between text-xs">
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

// Add Form Modal Component
const AddFormModal: React.FC<{ onClose: () => void; onSuccess: () => void }> = ({ onClose, onSuccess }) => {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    form_url: '',
    form_name: '',
    products: [{ name: '', price: 0 }]
  });
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);

  const extractFormId = (url: string) => {
    const match = url.match(/forms\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
  };

  const addProduct = () => {
    setFormData(prev => ({
      ...prev,
      products: [...prev.products, { name: '', price: 0 }]
    }));
  };

  const removeProduct = (index: number) => {
    setFormData(prev => ({
      ...prev,
      products: prev.products.filter((_, i) => i !== index)
    }));
  };

  const updateProduct = (index: number, field: 'name' | 'price', value: string | number) => {
    setFormData(prev => ({
      ...prev,
      products: prev.products.map((product, i) => 
        i === index ? { ...product, [field]: value } : product
      )
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const formId = extractFormId(formData.form_url);
    if (!formId) {
      alert('Invalid Google Form URL. Please check the URL format.');
      return;
    }

    setLoading(true);
    try {
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
            products: formData.products.filter(p => p.name && p.price > 0),
            currency: 'INR'
          }
        });

      if (formError) throw formError;

      // Insert payment config for backward compatibility
      const { error: paymentError } = await supabase
        .from('payment_configs')
        .insert({
          form_id: formId,
          admin_id: user?.id,
          form_name: formData.form_name,
          products: formData.products.filter(p => p.name && p.price > 0),
          price: formData.products[0]?.price || 0,
          currency: 'INR',
          is_active: true
        });

      if (paymentError) throw paymentError;

      onSuccess();
    } catch (error) {
      console.error('Error saving form:', error);
      alert('Error saving form. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-medium text-gray-900">Connect New Google Form</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <span className="text-2xl">×</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Step 1: Basic Info */}
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

          {/* Products Section */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <label className="block text-sm font-medium text-gray-700">
                Products/Services *
              </label>
              <button
                type="button"
                onClick={addProduct}
                className="text-blue-600 hover:text-blue-800 text-sm"
              >
                + Add Product
              </button>
            </div>
            
            {formData.products.map((product, index) => (
              <div key={index} className="flex space-x-3 mb-3">
                <input
                  type="text"
                  value={product.name}
                  onChange={(e) => updateProduct(index, 'name', e.target.value)}
                  placeholder="Product name"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  required
                />
                <div className="flex items-center">
                  <span className="text-gray-500 mr-2">₹</span>
                  <input
                    type="number"
                    value={product.price}
                    onChange={(e) => updateProduct(index, 'price', parseInt(e.target.value) || 0)}
                    placeholder="0"
                    min="1"
                    className="w-24 px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
                {formData.products.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeProduct(index)}
                    className="text-red-600 hover:text-red-800 px-2"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Submit Button */}
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

// Form Details Modal
const FormDetailsModal: React.FC<{ form: FormConfig; onClose: () => void; onRefresh: () => void }> = ({ form, onClose, onRefresh }) => (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-medium text-gray-900">{form.form_name} - Details</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <span className="text-2xl">×</span>
        </button>
      </div>

      {/* Detailed stats and management options would go here */}
      <div className="text-center py-8">
        <p className="text-gray-600">Detailed form analytics and management coming soon!</p>
        <p className="text-sm text-gray-500 mt-2">
          This will include transaction history, revenue trends, and advanced settings.
        </p>
      </div>
    </div>
  </div>
);

// Setup Guide Modal
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
        {/* Comprehensive setup guide content would go here */}
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
