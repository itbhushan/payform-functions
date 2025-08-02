// src/components/dashboard/MyForms.tsx - UPDATED VERSION with Setup Guide and Logout
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
// ADD these imports after your existing imports:
import { 
  fetchGoogleFormStructure, 
  testGoogleFormAccess, 
  extractGoogleFormId 
} from '../../lib/supabase';
import { useGoogleFormIntegration } from '../../hooks/useData';

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

  // Google Logout Handler
  const handleGoogleLogout = async () => {
    const confirmed = window.confirm(
      "⚠️ Are you sure you want to disconnect your Google account?\n\n" +
      "This will:\n" +
      "• Stop monitoring your forms for new responses\n" +
      "• Stop sending payment emails to customers\n" +
      "• Require re-authorization to resume payments\n\n" +
      "Your existing transaction data will NOT be lost."
    );
    
    if (!confirmed) return;
    
    try {
      // Show loading state
      setLoading(true);
      
      // Call logout API
      const response = await fetch('/.netlify/functions/google-oauth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'revokeAccess',
          adminId: user?.id || 'default'
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        // Show success message
        alert('✅ Google account disconnected successfully!\n\nTo resume payments, click "Connect Google Account" again.');
        
        // Refresh the page to update connection status
        window.location.reload();
      } else {
        throw new Error(result.error || 'Failed to disconnect Google account');
      }
      
    } catch (error) {
      console.error('Google logout error:', error);
      alert('❌ Failed to disconnect Google account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

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
              
              {/* Google Account Status with Logout */}
              <div className="flex items-center px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
                <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                <span className="text-sm text-green-700">Google Connected</span>
                <button
                  onClick={handleGoogleLogout}
                  className="ml-2 text-red-600 hover:text-red-800 text-sm font-medium"
                  title="Disconnect Google Account"
                >
                  🚪 Logout
                </button>
              </div>
              
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

      {/* Enhanced Setup Guide Modal */}
      {showSetupGuide && (
        <SetupGuideModal onClose={() => setShowSetupGuide(false)} />
      )}
    </div>
  );
});

// REPLACE the existing EmptyState component with this enhanced version:
const EmptyState: React.FC<{ onConnectForm: () => void; onShowGuide: () => void }> = ({ onConnectForm, onShowGuide }) => {
  const { user } = useAuth();

  return (
    <div className="text-center py-12">
      <div className="text-6xl mb-6">📋</div>
      <h3 className="text-lg font-medium text-gray-900 mb-2">No Forms Connected Yet</h3>
      <p className="text-gray-600 mb-8">Connect your first Google Form to start accepting payments</p>
      
      {/* Google Authentication Status */}
      <div className="mb-8 p-4 bg-blue-50 border border-blue-200 rounded-lg max-w-md mx-auto">
        <h4 className="font-medium text-blue-900 mb-3">🔐 Google Account Connection</h4>
        <GoogleAuthButton 
          adminId={user?.id || ''} 
          onAuthSuccess={() => {
            console.log('Google auth successful');
          }} 
        />
        <p className="text-xs text-blue-700 mt-2">
          Required to access your Google Forms and monitor responses
        </p>
      </div>
      
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

      {/* Rest of existing EmptyState content */}
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
              <li>• Connect Google account</li>
              <li>• Paste your form URL</li>
              <li>• Map form fields to payment data</li>
              <li>• Automatic monitoring begins</li>
            </ul>
          </div>
        </div>
        <div className="mt-4 p-3 bg-blue-100 rounded-lg text-xs text-blue-700">
          <p><strong>💡 New:</strong> No more manual code setup! Just connect your Google account and paste form URLs.</p>
        </div>
      </div>
    </div>
  );
};

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

  const deleteForm = async () => {
  if (!confirm('Are you sure you want to delete this form? This action cannot be undone.')) {
    return;
  }
  
  try {
    const { error } = await supabase
      .from('form_configs')
      .delete()
      .eq('id', form.id);
      
    if (error) throw error;
    
    onRefresh();
    alert('Form deleted successfully');
  } catch (error) {
    console.error('Error deleting form:', error);
    alert('Failed to delete form');
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

{/* ✅ FIX 2: Enhanced Actions with Edit and Delete buttons */}
<div className="grid grid-cols-4 gap-2 mb-3">
  <button
    onClick={() => setShowDetails(true)}
    className="bg-blue-50 text-blue-700 hover:bg-blue-100 px-2 py-2 rounded text-xs font-medium"
  >
    📊 Details
  </button>
  <button
    onClick={() => onEdit(form)}
    className="bg-gray-50 text-gray-700 hover:bg-gray-100 px-2 py-2 rounded text-xs font-medium"
  >
    ✏️ Edit
  </button>
  <button
    onClick={toggleFormStatus}
    className={`px-2 py-2 rounded text-xs font-medium ${
      form.is_active
        ? 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100'
        : 'bg-green-50 text-green-700 hover:bg-green-100'
    }`}
  >
    {form.is_active ? '⏸️ Pause' : '▶️ Active'}
  </button>
  <button
    onClick={deleteForm}
    className="bg-red-50 text-red-700 hover:bg-red-100 px-2 py-2 rounded text-xs font-medium"
  >
    🗑️ Delete
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

// ADD THIS COMPONENT BEFORE AddFormModal
const URLFormatHelper: React.FC = () => (
  <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
    <h4 className="font-medium text-gray-900 mb-3">📋 URL Format Examples</h4>
    
    <div className="space-y-3 text-sm">
      <div className="flex items-start space-x-2">
        <span className="text-green-500 font-bold text-lg">✅</span>
        <div>
          <p className="font-medium text-green-700">Correct - Edit URL:</p>
          <code className="block mt-1 text-xs bg-green-100 p-2 rounded text-green-800 break-all">
            https://docs.google.com/forms/d/1ZbHjoqP8iTGAHw9wLm-NKNQdF2WBPJW-4yT1tyvZmbk/edit
          </code>
        </div>
      </div>
      
      <div className="flex items-start space-x-2">
        <span className="text-red-500 font-bold text-lg">❌</span>
        <div>
          <p className="font-medium text-red-700">Wrong - Response URL:</p>
          <code className="block mt-1 text-xs bg-red-100 p-2 rounded text-red-800 break-all">
            https://docs.google.com/forms/d/e/1FAIpQLSdu_sTrQcY3zUICIhA075jCR_gTdtAtA8gaXrX5nbfV2pdIHw/viewform
          </code>
        </div>
      </div>
    </div>
  </div>
);

// REPLACE the existing AddFormModal component in MyForms.tsx with this:
const AddFormModal: React.FC<{ onClose: () => void; onSuccess: () => void }> = ({ onClose, onSuccess }) => {
  const { user } = useAuth();
 
  // 🐛 DEBUG: Log user context when modal opens
  React.useEffect(() => {
    console.log('🔍 AddFormModal - User context:', user);
    console.log('🔍 AddFormModal - User ID:', user?.id);
    console.log('🔍 AddFormModal - User email:', user?.email);
  }, [user]);
  
  const { saveFieldMapping } = useGoogleFormIntegration(user?.id);
  
  // Form state
  const [step, setStep] = useState<'url' | 'mapping' | 'review'>('url');
  const [formData, setFormData] = useState({
    form_url: '',
    form_name: ''
  });
  const [formStructure, setFormStructure] = useState<any>(null);
  const [fieldMappings, setFieldMappings] = useState({
    emailField: '',
    productField: '',
    nameField: '',
    phoneField: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Step 1: Analyze Google Form URL
  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
// Enhanced form ID extraction with validation
let formId;
try {
  formId = extractGoogleFormId(formData.form_url);
  if (!formId) {
    setError('Invalid Google Form URL format. Please use the edit URL from forms.google.com');
    return;
  }
} catch (error) {
  setError(error.message);
  setLoading(false);
  return;
}

console.log('✅ Successfully extracted form ID:', formId);
    
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

      // Test form access
// 🐛 DEBUG: Check user context
console.log('🔍 DEBUG - User object:', user);
console.log('🔍 DEBUG - User ID:', user?.id);
console.log('🔍 DEBUG - Form ID extracted:', formId);

if (!user?.id) {
  setError('User authentication required. Please refresh the page and try again.');
  setLoading(false);
  return;
}

// Test form access with proper user ID
console.log('🔐 Testing form access with admin ID:', user.id);
const hasAccess = await testGoogleFormAccess(formId, user.id);
if (!hasAccess) {
  setError('Cannot access this form. Please check the URL and permissions, or ensure your Google account is connected.');
  setLoading(false);
  return;
}

// Get form structure with proper user ID
console.log('🔍 Fetching form structure with admin ID:', user.id);
const structure = await fetchGoogleFormStructure(formId, user.id);
      
      if (!structure) {
        setError('Failed to analyze form structure. Please try again.');
        setLoading(false);
        return;
      }

      setFormStructure(structure);
      setStep('mapping');
      
    } catch (error) {
      console.error('Error analyzing form:', error);
      setError('Error analyzing form. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Save field mappings and form
  const handleMappingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate required mappings
    if (!fieldMappings.emailField || !fieldMappings.productField) {
      setError('Email and Product fields are required.');
      return;
    }

    setLoading(true);
    try {
      const formId = extractGoogleFormId(formData.form_url)!;

      // Save form config
      const { error: formError } = await supabase
        .from('form_configs')
        .insert({
          form_id: formId,
          admin_id: user?.id,
          form_name: formData.form_name || formStructure.title,
          form_url: formData.form_url,
          is_active: true,
          payment_settings: {
            currency: 'INR',
            integration_type: 'google_forms_api'
          }
        });

      if (formError) throw formError;

      // Save field mappings
      const mappingResult = await saveFieldMapping(formId, fieldMappings);
      if (!mappingResult.success) {
        throw new Error(mappingResult.error);
      }

      // Save payment config for backward compatibility
      await supabase
        .from('payment_configs')
        .insert({
          form_id: formId,
          admin_id: user?.id,
          form_name: formData.form_name || formStructure.title,
          currency: 'INR',
          is_active: true
        });

      setStep('review');
      
    } catch (error: any) {
      console.error('Error saving form:', error);
      setError('Error saving form. Please try again.');
      setLoading(false);
    }
  };

  // Step 3: Complete setup
  const handleComplete = () => {
    onSuccess();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-lg font-medium text-gray-900">Connect Google Form</h3>
            <div className="flex items-center mt-2 space-x-2">
              <div className={`w-2 h-2 rounded-full ${step === 'url' ? 'bg-blue-500' : 'bg-green-500'}`}></div>
              <span className="text-xs text-gray-500">URL Analysis</span>
              <div className={`w-2 h-2 rounded-full ${step === 'mapping' ? 'bg-blue-500' : step === 'review' ? 'bg-green-500' : 'bg-gray-300'}`}></div>
              <span className="text-xs text-gray-500">Field Mapping</span>
              <div className={`w-2 h-2 rounded-full ${step === 'review' ? 'bg-blue-500' : 'bg-gray-300'}`}></div>
              <span className="text-xs text-gray-500">Complete</span>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <span className="text-2xl">×</span>
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
            {error}
          </div>
        )}

        {/* Step 1: URL Input */}
        {step === 'url' && (
          <form onSubmit={handleUrlSubmit} className="space-y-4">

            <div>
  <label className="block text-sm font-medium text-gray-700 mb-2">
    Google Form URL * <span className="text-red-600 font-bold">(EDIT URL ONLY)</span>
  </label>
  <input
    type="url"
    value={formData.form_url}
    onChange={(e) => setFormData(prev => ({ ...prev, form_url: e.target.value }))}
    placeholder="https://docs.google.com/forms/d/YOUR_FORM_ID/edit"
    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
    required
  />
  
  {/* Enhanced Instructions */}
  <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
    <p className="font-medium text-blue-900 mb-2">📝 How to get the correct URL:</p>
    <ol className="list-decimal list-inside text-blue-800 space-y-1">
      <li>Go to <a href="https://forms.google.com" target="_blank" className="underline font-medium">forms.google.com</a></li>
      <li>Find your form and click the <strong>EDIT button</strong> (pencil icon)</li>
      <li>Copy the URL from your browser's address bar</li>
      <li>Make sure the URL ends with <code className="bg-blue-100 px-1 rounded">/edit</code></li>
    </ol>
  </div>
  
  {/* Warning about wrong URLs */}
  <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm">
    <p className="font-medium text-red-900 mb-1">❌ Don't use these URLs:</p>
    <ul className="text-red-800 space-y-1 text-xs">
      <li>• URLs with <code className="bg-red-100 px-1 rounded">/d/e/LONG_ID/viewform</code> (response URLs)</li>
      <li>• URLs ending with <code className="bg-red-100 px-1 rounded">?usp=dialog</code> (sharing URLs)</li>
      <li>• URLs from "Send" or "Share" buttons</li>
    </ul>
  </div>
  
  {/* Success indicator */}
  {formData.form_url.includes('/edit') && (
    <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
      ✅ Perfect! This looks like a valid edit URL.
    </div>
  )}
  
  {/* Error indicator */}
  {(formData.form_url.includes('/d/e/') || formData.form_url.includes('viewform')) && (
    <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
      ❌ This appears to be a response URL. Please use the edit URL instead.
    </div>
  )}
  {/* Add URL Format Helper */}
  <URLFormatHelper />
</div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Form Name (Optional)
              </label>
              <input
                type="text"
                value={formData.form_name}
                onChange={(e) => setFormData(prev => ({ ...prev, form_name: e.target.value }))}
                placeholder="Will auto-detect from form if empty"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>🔍 What happens next:</strong> We'll analyze your form structure and help you map fields for automatic payment processing.
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
                {loading ? 'Analyzing...' : 'Analyze Form →'}
              </button>
            </div>
          </form>
        )}

        {/* Step 2: Field Mapping */}
        {step === 'mapping' && formStructure && (
          <form onSubmit={handleMappingSubmit} className="space-y-6">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h4 className="font-medium text-green-900 mb-2">✅ Form Analysis Complete</h4>
              <p className="text-sm text-green-800">
                <strong>Form:</strong> {formStructure.title}<br/>
                <strong>Questions Found:</strong> {formStructure.questions?.length || 0}
              </p>
            </div>

            <div className="space-y-4">
              <h4 className="font-medium text-gray-900">Map Form Fields to Payment Data</h4>
              <p className="text-sm text-gray-600">
                Select which form questions correspond to payment information:
              </p>

              {/* Email Field Mapping */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email Field * <span className="text-red-500">(Required)</span>
                </label>
                <select
                  value={fieldMappings.emailField}
                  onChange={(e) => setFieldMappings(prev => ({ ...prev, emailField: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  required
                >
                  <option value="">Select email field...</option>
                  {formStructure.questions?.map((q: any) => (
                    <option key={q.questionId} value={q.questionId}>
                      {q.title} {q.required ? '(Required)' : '(Optional)'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Product Field Mapping */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Product/Amount Field * <span className="text-red-500">(Required)</span>
                </label>
                <select
                  value={fieldMappings.productField}
                  onChange={(e) => setFieldMappings(prev => ({ ...prev, productField: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  required
                >
                  <option value="">Select product field...</option>
                  {formStructure.questions?.map((q: any) => (
                    <option key={q.questionId} value={q.questionId}>
                      {q.title} {q.required ? '(Required)' : '(Optional)'}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Field should contain format like "Course - ₹2999" or "Premium Package - ₹5000"
                </p>
              </div>

              {/* Name Field Mapping */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Customer Name Field (Recommended)
                </label>
                <select
                  value={fieldMappings.nameField}
                  onChange={(e) => setFieldMappings(prev => ({ ...prev, nameField: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select name field...</option>
                  {formStructure.questions?.map((q: any) => (
                    <option key={q.questionId} value={q.questionId}>
                      {q.title} {q.required ? '(Required)' : '(Optional)'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Phone Field Mapping */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Phone Number Field (Optional)
                </label>
                <select
                  value={fieldMappings.phoneField}
                  onChange={(e) => setFieldMappings(prev => ({ ...prev, phoneField: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select phone field...</option>
                  {formStructure.questions?.map((q: any) => (
                    <option key={q.questionId} value={q.questionId}>
                      {q.title} {q.required ? '(Required)' : '(Optional)'}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800">
                <strong>💡 Tip:</strong> After mapping, we'll automatically monitor your form for new submissions and send payment links within 60 seconds.
              </p>
            </div>

            <div className="flex justify-end space-x-3 pt-4 border-t">
              <button
                type="button"
                onClick={() => setStep('url')}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
              >
                ← Back
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Saving...' : 'Save & Activate →'}
              </button>
            </div>
          </form>
        )}

        {/* Step 3: Success/Review */}
        {step === 'review' && (
          <div className="space-y-6">
            <div className="text-center py-8">
              <div className="text-6xl mb-4">🎉</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Form Connected Successfully!</h3>
              <p className="text-gray-600">Your Google Form is now integrated with PayForm.</p>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h4 className="font-medium text-green-900 mb-3">✅ What's Activated:</h4>
              <ul className="space-y-2 text-sm text-green-800">
                <li>• <strong>Automatic Monitoring:</strong> We check for new responses every 60 seconds</li>
                <li>• <strong>Payment Processing:</strong> Cashfree orders created automatically</li>
                <li>• <strong>Email Notifications:</strong> Payment links sent to customers instantly</li>
                <li>• <strong>Dashboard Tracking:</strong> All transactions appear in your dashboard</li>
              </ul>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-medium text-blue-900 mb-2">🧪 How to Test:</h4>
              <ol className="space-y-1 text-sm text-blue-800 list-decimal list-inside">
                <li>Submit a test response to your Google Form</li>
                <li>Check your email for the payment link (within 60 seconds)</li>
                <li>Complete a test payment</li>
                <li>Verify the transaction appears in your dashboard</li>
              </ol>
            </div>

            <div className="flex justify-end space-x-3 pt-4 border-t">
              <button
                onClick={handleComplete}
                className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
              >
                Complete Setup ✅
              </button>
            </div>
          </div>
        )}
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
        </form>
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

// Enhanced Setup Guide Modal with Complete Guide Content
const SetupGuideModal: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center p-6 border-b border-gray-200">
        <h3 className="text-xl font-semibold text-gray-900 flex items-center">
          <span className="text-2xl mr-3">📚</span>
          PayForm Complete Setup Guide
        </h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 p-1"
        >
          <span className="text-2xl">×</span>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="prose prose-blue max-w-none">
          
          {/* Quick Start */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <h4 className="text-lg font-semibold text-blue-900 mb-2">🚀 Quick Start (10 minutes)</h4>
            <p className="text-blue-800 text-sm">Turn your Google Forms into payment-enabled forms</p>
            <div className="grid grid-cols-4 gap-2 mt-3 text-xs">
              <div className="text-center">
                <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center mx-auto mb-1">1</div>
                <span>Create Form</span>
              </div>
              <div className="text-center">
                <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center mx-auto mb-1">2</div>
                <span>Connect PayForm</span>
              </div>
              <div className="text-center">
                <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center mx-auto mb-1">3</div>
                <span>Setup Cashfree</span>
              </div>
              <div className="text-center">
                <div className="w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center mx-auto mb-1">✓</div>
                <span>Go Live!</span>
              </div>
            </div>
          </div>

          {/* Step 1: Create Google Form */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <span className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm mr-3">1</span>
              Create Your Google Form (3 minutes)
            </h3>
            
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <h4 className="font-semibold text-red-900 mb-2">⚠️ Required Fields (Must Include)</h4>
              <div className="space-y-2 text-sm">
                <div className="flex items-center">
                  <span className="w-4 h-4 bg-red-600 text-white rounded-full flex items-center justify-center text-xs mr-2">!</span>
                  <strong>Email Address</strong> - Short answer, Required
                </div>
                <div className="flex items-center">
                  <span className="w-4 h-4 bg-red-600 text-white rounded-full flex items-center justify-center text-xs mr-2">!</span>
                  <strong>Product Selection</strong> - Format: "Product Name - ₹Price"
                </div>
                <div className="flex items-center">
                  <span className="w-4 h-4 bg-red-600 text-white rounded-full flex items-center justify-center text-xs mr-2">!</span>
                  <strong>Name</strong> - Short answer, Required
                </div>
              </div>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h4 className="font-semibold text-gray-900 mb-2">✅ Example Form Structure</h4>
              <div className="bg-white border rounded p-3 text-sm font-mono">
                <div className="text-blue-600 font-bold mb-2">📋 Course Registration Form</div>
                <div className="space-y-1 text-gray-700">
                  <div>📧 Email Address *</div>
                  <div>👤 Full Name *</div>
                  <div>🛒 Select Course *</div>
                  <div className="ml-4 text-gray-600">○ Digital Marketing Course - ₹999</div>
                  <div className="ml-4 text-gray-600">○ Web Development Course - ₹1499</div>
                  <div className="ml-4 text-gray-600">○ Data Science Course - ₹1999</div>
                  <div>📱 Phone Number</div>
                </div>
              </div>
            </div>
          </div>

          {/* Step 2: Connect to PayForm */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <span className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm mr-3">2</span>
              Connect to PayForm (2 minutes)
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-semibold text-blue-900 mb-2">A. Register Your Form</h4>
                <ol className="text-sm space-y-1 text-blue-800">
                  <li>1. Click "+ Connect New Form"</li>
                  <li>2. Enter Form Name & URL</li>
                  <li>3. Extract Form ID from URL</li>
                </ol>
              </div>
              
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h4 className="font-semibold text-green-900 mb-2">B. Authorize Google</h4>
                <ol className="text-sm space-y-1 text-green-800">
                  <li>1. Click "Connect Google Account"</li>
                  <li>2. Select your Google account</li>
                  <li>3. Allow all permissions</li>
                </ol>
              </div>
            </div>
          </div>

          {/* Step 3: Setup Cashfree */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <span className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm mr-3">3</span>
              Setup Cashfree Payment (4 minutes)
            </h3>
            
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
              <h4 className="font-semibold text-yellow-900 mb-2">💳 Required Information</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <strong className="text-yellow-900">Bank Details:</strong>
                  <ul className="mt-1 space-y-1 text-yellow-800">
                    <li>• Account Number</li>
                    <li>• IFSC Code (e.g., HDFC0000123)</li>
                    <li>• Account Holder Name</li>
                  </ul>
                </div>
                <div>
                  <strong className="text-yellow-900">Business Info:</strong>
                  <ul className="mt-1 space-y-1 text-yellow-800">
                    <li>• Business Type</li>
                    <li>• PAN Number (ABCDE1234F)</li>
                    <li>• GST Number (optional)</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h4 className="font-semibold text-green-900 mb-2">⏱️ Approval Process</h4>
              <p className="text-sm text-green-800">Submit → Wait 24-48 hours → Email confirmation → Start accepting payments!</p>
            </div>
          </div>

          {/* Fee Structure */}
          <div className="mb-8">
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <h4 className="font-semibold text-purple-900 mb-3">💰 Fee Structure (Transparent Pricing)</h4>
              <div className="text-sm text-purple-800">
                <p className="mb-2"><strong>Example for ₹1000 transaction:</strong></p>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="bg-white rounded p-2 text-center">
                    <div className="font-semibold">Cashfree Fee</div>
                    <div className="text-purple-600">₹28 (2.5% + ₹3)</div>
                  </div>
                  <div className="bg-white rounded p-2 text-center">
                    <div className="font-semibold">PayForm Fee</div>
                    <div className="text-purple-600">₹30 (3%)</div>
                  </div>
                  <div className="bg-white rounded p-2 text-center">
                    <div className="font-semibold">You Receive</div>
                    <div className="text-green-600 font-bold">₹942</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Troubleshooting */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">🔧 Common Issues & Solutions</h3>
            
            <div className="space-y-3">
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <div className="flex items-start">
                  <span className="text-red-600 mr-2">❌</span>
                  <div>
                    <strong className="text-red-900">"No Google authentication"</strong>
                    <p className="text-sm text-red-800 mt-1">Fix: Go to My Forms → Click "Connect Google Account"</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <div className="flex items-start">
                  <span className="text-red-600 mr-2">❌</span>
                  <div>
                    <strong className="text-red-900">"Payment emails not sending"</strong>
                    <p className="text-sm text-red-800 mt-1">Fix: Verify Gmail permission granted during setup</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <div className="flex items-start">
                  <span className="text-red-600 mr-2">❌</span>
                  <div>
                    <strong className="text-red-900">"Cashfree not approved"</strong>
                    <p className="text-sm text-red-800 mt-1">Fix: Check PAN format (ABCDE1234F) → Wait 24-48 hours</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-gray-200 p-6 bg-gray-50">
        <div className="flex justify-between items-center">
          <div className="text-sm text-gray-600">
            📞 Need help? Email: <strong>support@payform.com</strong>
          </div>
          <button
            onClick={onClose}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium"
          >
            Got it! Let's Start
          </button>
        </div>
      </div>
    </div>
  </div>
);

// Google Authentication Component
const GoogleAuthButton: React.FC<{ adminId: string; onAuthSuccess: () => void }> = ({ adminId, onAuthSuccess }) => {
  const [authStatus, setAuthStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const [userEmail, setUserEmail] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    checkAuthStatus();
  }, [adminId]);

  const checkAuthStatus = async () => {
    try {
      const response = await fetch('/.netlify/functions/google-oauth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'checkAuth', adminId })
      });

      const result = await response.json();
      
      if (result.success && result.authenticated) {
        setAuthStatus('connected');
        // You could also fetch user email here
      } else {
        setAuthStatus('disconnected');
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
      setAuthStatus('disconnected');
    }
  };

const connectGoogleAccount = async () => {
  try {
    setLoading(true);
    
    const response = await fetch('/.netlify/functions/google-oauth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'getAuthUrl', adminId })
    });

    const result = await response.json();
    
    if (result.success) {
      // 🆕 Simple redirect instead of popup + polling
      console.log('🔐 Redirecting to Google OAuth...');
      window.location.href = result.authUrl;
    } else {
      console.error('Failed to get OAuth URL:', result.error);
      setLoading(false);
    }
  } catch (error) {
    console.error('Error connecting Google account:', error);
    setLoading(false);
  }
};
  
  if (authStatus === 'checking') {
    return (
      <div className="flex items-center space-x-2 text-gray-500">
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-500"></div>
        <span className="text-sm">Checking Google connection...</span>
      </div>
    );
  }

  if (authStatus === 'connected') {
    return (
      <div className="flex items-center space-x-2 text-green-600">
        <span className="text-lg">✅</span>
        <span className="text-sm font-medium">Google Forms Connected</span>
      </div>
    );
  }

  return (
    <button
      onClick={connectGoogleAccount}
      disabled={loading}
      className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
    >
      {loading ? (
        <>
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
          <span>Connecting...</span>
        </>
      ) : (
        <>
          <span>🔗</span>
          <span>Connect Google Account</span>
        </>
      )}
    </button>
  );
};
