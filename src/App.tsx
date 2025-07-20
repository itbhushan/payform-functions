// src/App.tsx - Complete PayForm with Authentication + Existing Components
import React, { useState } from 'react';
import type { ReactNode } from 'react';
import { MyForms } from './components/dashboard/MyForms';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { RegisterPage } from './components/auth/RegisterPage';
//import DebugDashboard from './components/DebugDashboard';
import { 
  useDashboardData, 
  useFormAdmin, 
  usePlatformData, 
  useCashfreeConfig,
  useFormConfigs,
  Transaction 
} from './hooks/useData';

// Login Component with Registration Support
const LoginPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const { signIn } = useAuth();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error } = await signIn(email, password);
    if (error) {
      setError(error.message);
    }
    setLoading(false);
  };

  const handleDemoLogin = (demoEmail: string, demoPassword: string) => {
    setEmail(demoEmail);
    setPassword(demoPassword);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-4xl mb-4">💳</div>
          <h1 className="text-2xl font-bold text-gray-900">PayForm</h1>
          <p className="text-gray-600 mt-2">
            {activeTab === 'login' ? 'Sign in to your dashboard' : 'Join thousands earning with PayForm'}
          </p>
        </div>

        {/* Tabs */}
        <div className="flex mb-6 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => {
              setActiveTab('login');
              setError('');
            }}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'login'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => {
              setActiveTab('register');
              setError('');
            }}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'register'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Sign Up
          </button>
        </div>

        {/* Content */}
        {activeTab === 'login' ? (
          <div>
            {/* Demo Credentials for Testing */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
              <h3 className="font-medium text-blue-900 mb-2 text-sm">🎯 Demo Access:</h3>
              <button
                onClick={() => handleDemoLogin('admin@payform.com', 'admin123')}
                className="w-full text-left bg-blue-100 hover:bg-blue-200 p-2 rounded text-sm transition-colors mb-1"
              >
                <strong>Super Admin:</strong> admin@payform.com
              </button>
              <button
                onClick={() => handleDemoLogin('formadmin@example.com', 'form123')}
                className="w-full text-left bg-green-100 hover:bg-green-200 p-2 rounded text-sm transition-colors"
              >
                <strong>Form Admin:</strong> formadmin@example.com
              </button>
              <p className="text-xs text-blue-700 mt-2">Or create your own account with Sign Up tab</p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <p className="text-red-800 text-sm">{error}</p>
              </div>
            )}

            {/* Login Form */}
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter your email"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter your password"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          </div>
        ) : (
          <RegisterPage onSwitchToLogin={() => setActiveTab('login')} />
        )}
      </div>
    </div>
  );
};

// Dashboard Component - Uses existing components
const Dashboard: React.FC = () => {
  const { user, signOut, isFormAdmin, isSuperAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');

  // Use real data hooks based on user role
  //const adminId = isFormAdmin ? user?.id : undefined;
  const adminId = user?.id; // Temporary fix - force adminId for testing
  console.log('🎯 APP.TSX ADMIN ID BEING PASSED:', adminId);
  console.log('🎯 USER OBJECT:', user);
  const { data: dashboardData, transactions, loading: dashboardLoading, error: dashboardError, refetch } = useDashboardData(adminId);
// ✅ Enhanced refresh function with debug logging
const handleRefresh = React.useCallback(() => {
  console.log('🔄 MANUAL REFRESH TRIGGERED');
  console.log('🔍 Current admin ID:', adminId);
  console.log('🔍 Current stats:', dashboardData);
  console.log('🔍 Current transactions count:', transactions?.length);
  
  // Force a fresh data fetch
  refetch();
  
  // Also refresh MyForms if it's active
  if (activeTab === 'forms') {
    console.log('🔄 Also refreshing forms data...');
    // This will be handled by MyForms component
  }
}, [refetch, adminId, dashboardData, transactions, activeTab]);

  
  const { admin, loading: adminLoading } = useFormAdmin(adminId);
  const { data: platformData, loading: platformLoading, error: platformError } = usePlatformData();
  const { config: cashfreeConfig, loading: configLoading, saveConfig } = useCashfreeConfig(adminId);
  const { forms, loading: formsLoading } = useFormConfigs(adminId);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-blue-600">PayForm</h1>
              <span className="ml-2 text-sm text-gray-500">
                {isSuperAdmin ? 'Super Admin' : 'Form Admin'} Dashboard
              </span>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-sm text-gray-600">
                Welcome, {admin?.name || user?.profile?.name || user?.user_metadata?.name || user?.email}
                {adminLoading && <span className="ml-1 text-gray-400">(loading...)</span>}
              </div>
              <button
                onClick={signOut}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            {isFormAdmin && (
              <>
                <button
                  onClick={() => setActiveTab('dashboard')}
                  className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                    activeTab === 'dashboard'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  📊 Dashboard
                </button>
                <button
                  onClick={() => setActiveTab('setup')}
                  className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                    activeTab === 'setup'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  🛠️ Cashfree Setup
                </button>
                <button
                  onClick={() => setActiveTab('forms')}
                  className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                    activeTab === 'forms'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  📝 My Forms ({forms.length})
                </button>
              </>
            )}
            {isSuperAdmin && (
              <>
                <button
                  onClick={() => setActiveTab('overview')}
                  className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                    activeTab === 'overview'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  🌍 Platform Overview
                </button>
                <button
                  onClick={() => setActiveTab('admins')}
                  className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                    activeTab === 'admins'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  👥 Form Admins
                </button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {/* Form Admin Views */}
        {/* DEBUG MODE - Replace this section with normal dashboard later */}
        {isFormAdmin && activeTab === 'dashboard' && (
          <DashboardContent 
  stats={dashboardData} 
  transactions={transactions}
  loading={dashboardLoading}
  error={dashboardError}
  onRefresh={handleRefresh}
          />
        )}
        {isFormAdmin && activeTab === 'setup' && (
          <CashfreeSetup 
            config={cashfreeConfig}
            loading={configLoading}
            onSave={saveConfig}
          />
        )}
      {isFormAdmin && activeTab === 'forms' && (
        <MyForms />
      )}
        {/* Super Admin Views */}
        {isSuperAdmin && activeTab === 'overview' && (
          <PlatformOverview 
            data={platformData}
            loading={platformLoading}
            error={platformError}
          />
        )}
        {isSuperAdmin && activeTab === 'admins' && <AdminManagement />}
      </main>
      </div>
  );
};

// ALL YOUR EXISTING COMPONENTS (Copy from your current App.tsx)

// Dashboard Content Component with Real Data
const DashboardContent: React.FC<{ 
  stats: any;
  transactions: Transaction[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}> = ({ stats, transactions, loading, error, onRefresh }) => {
  
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <div className="flex items-center space-x-3">
          <div className="text-red-500 text-xl">⚠️</div>
          <div>
            <h3 className="font-medium text-red-900">Error Loading Data</h3>
            <p className="text-red-800 text-sm mt-1">{error}</p>
          </div>
        </div>
        <button 
          onClick={onRefresh}
          className="mt-4 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
        >
          🔄 Try Again
        </button>
      </div>
    );
  }

  if (!stats || stats.totalTransactions === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">🚀</div>
        <h3 className="text-xl font-medium text-gray-900 mb-2">Ready to Start Earning!</h3>
        <p className="text-gray-600 mb-6">
          Complete your Cashfree setup and connect your Google Forms to start accepting payments.
        </p>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 max-w-md mx-auto">
          <h4 className="font-medium text-blue-900 mb-3">💡 Quick Start Guide:</h4>
          <ol className="text-sm text-blue-800 text-left space-y-2">
            <li className="flex items-center">
              <span className="bg-blue-200 text-blue-800 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mr-2">1</span>
              Complete Cashfree setup (Setup tab)
            </li>
            <li className="flex items-center">
              <span className="bg-blue-200 text-blue-800 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mr-2">2</span>
              Connect your Google Form (Forms tab)
            </li>
            <li className="flex items-center">
              <span className="bg-blue-200 text-blue-800 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mr-2">3</span>
              Start accepting payments & earning!
            </li>
          </ol>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Revenue</p>
              <p className="text-2xl font-bold text-green-600">₹{stats.totalSales?.toLocaleString() || 0}</p>
            </div>
            <div className="text-green-500 text-2xl">💰</div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Transactions</p>
              <p className="text-2xl font-bold text-blue-600">{stats.totalTransactions || 0}</p>
            </div>
            <div className="text-blue-500 text-2xl">📊</div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Completed</p>
              <p className="text-2xl font-bold text-green-600">{stats.completedTransactions || 0}</p>
            </div>
            <div className="text-green-500 text-2xl">✅</div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Pending</p>
              <p className="text-2xl font-bold text-yellow-600">{stats.pendingTransactions || 0}</p>
            </div>
            <div className="text-yellow-500 text-2xl">⏳</div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Your Earnings</p>
              <p className="text-2xl font-bold text-purple-600">₹{stats.totalEarnings?.toFixed(2) || '0.00'}</p>
            </div>
            <div className="text-purple-500 text-2xl">💎</div>
          </div>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-medium text-gray-900">Recent Transactions</h3>
            <div className="flex space-x-2">
              <button 
                onClick={onRefresh}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm transition-colors"
              >
                🔄 Refresh
              </button>
              <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm">
                📥 Export CSV
              </button>
            </div>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Transaction ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Your Earnings</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {transactions.map((transaction) => (
                <tr key={transaction.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                    {transaction.transaction_id}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    <div>
                      <div className="font-medium">{transaction.customer_name || 'Anonymous'}</div>
                      <div className="text-gray-500">{transaction.email}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {transaction.product_name || 'Product'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                    ₹{transaction.payment_amount.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 font-medium">
                    ₹{(transaction.net_amount_to_admin || 0).toFixed(2)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      transaction.payment_status === 'paid'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {transaction.payment_status === 'paid' ? '✅ Paid' : '⏳ Pending'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {new Date(transaction.created_at).toLocaleDateString('en-IN')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// Cashfree Setup Component with Real Data
const CashfreeSetup: React.FC<{ 
  config: any;
  loading: boolean;
  onSave: (data: any) => Promise<any>;
}> = ({ config, loading, onSave }) => {
  const [formData, setFormData] = useState({
    business_name: '',
    pan_number: '',
    account_number: '',
    ifsc_code: '',
    business_type: 'individual'
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  React.useEffect(() => {
    if (config?.config_data) {
      setFormData(config.config_data);
    }
  }, [config]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const result = await onSave(formData);
      if (result.success) {
        setMessage({ type: 'success', text: 'Cashfree configuration saved successfully!' });
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to save configuration.' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'An error occurred while saving.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading Cashfree configuration...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="text-2xl">💳</div>
              <div>
                <h2 className="text-lg font-medium text-gray-900">Cashfree Setup</h2>
                <p className="text-sm text-gray-600">Configure your Indian payment processing</p>
              </div>
            </div>
            {config && (
              <span className={`px-3 py-1 text-sm font-semibold rounded-full ${
                config.verification_status === 'verified'
                  ? 'bg-green-100 text-green-800'
                  : 'bg-yellow-100 text-yellow-800'
              }`}>
                {config.verification_status === 'verified' ? '✅ Verified' : '⏳ Pending Verification'}
              </span>
            )}
          </div>
        </div>

        <div className="p-6">
          {/* Status Message */}
          {message && (
            <div className={`p-4 rounded-lg mb-6 ${
              message.type === 'success' 
                ? 'bg-green-50 border border-green-200 text-green-800'
                : 'bg-red-50 border border-red-200 text-red-800'
            }`}>
              {message.text}
            </div>
          )}

          <form onSubmit={handleSave} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Business Information */}
              <div className="space-y-4">
                <h3 className="font-medium text-gray-900">Business Information</h3>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Business Name *
                  </label>
                  <input
                    type="text"
                    value={formData.business_name}
                    onChange={(e) => setFormData({...formData, business_name: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Your business or personal name"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    PAN Number *
                  </label>
                  <input
                    type="text"
                    value={formData.pan_number}
                    onChange={(e) => setFormData({...formData, pan_number: e.target.value.toUpperCase()})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    placeholder="ABCDE1234F"
                    maxLength={10}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Business Type *
                  </label>
                  <select
                    value={formData.business_type}
                    onChange={(e) => setFormData({...formData, business_type: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    required
                  >
                    <option value="individual">Individual</option>
                    <option value="proprietorship">Proprietorship</option>
                    <option value="partnership">Partnership</option>
                    <option value="company">Private Company</option>
                  </select>
                </div>
              </div>

              {/* Bank Details */}
              <div className="space-y-4">
                <h3 className="font-medium text-gray-900">Bank Account Details</h3>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Bank Account Number *
                  </label>
                  <input
                    type="text"
                    value={formData.account_number}
                    onChange={(e) => setFormData({...formData, account_number: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    placeholder="1234567890123456"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    IFSC Code *
                  </label>
                  <input
                    type="text"
                    value={formData.ifsc_code}
                    onChange={(e) => setFormData({...formData, ifsc_code: e.target.value.toUpperCase()})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    placeholder="HDFC0000123"
                    maxLength={11}
                    required
                  />
                </div>
              </div>
            </div>

            {/* Commission Structure */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-medium text-blue-900 mb-2">💰 Commission Structure</h4>
              <div className="text-sm text-blue-800 space-y-1">
                <p><strong>Example for ₹1000 transaction:</strong></p>
                <p>• Cashfree Fee: ₹28 (2.5% + ₹3)</p>
                <p>• Platform Commission: ₹30 (3%)</p>
                <p>• <strong>You Receive: ₹942</strong></p>
                <p className="text-xs mt-2 text-blue-600">✓ Instant settlement to your bank account</p>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Configuration'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

// Forms Management Component - Now using MyForms
const FormsManagement: React.FC<{ 
  forms: any[];
  loading: boolean;
}> = ({ forms, loading }) => {
  // This component is now replaced by the new MyForms component
  return <MyForms />;
};

// Platform Overview Component with Real Data
const PlatformOverview: React.FC<{ 
  data: any;
  loading: boolean;
  error: string | null;
}> = ({ data, loading, error }) => {
  
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading platform data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <p className="text-red-800">Error loading platform data: {error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12">
        <div className="text-4xl mb-4">🌍</div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">Platform data unavailable</h3>
        <p className="text-gray-600">Unable to load platform overview.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Platform Overview</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-gradient-to-r from-blue-500 to-blue-600 p-6 rounded-lg text-white">
            <h3 className="text-2xl font-bold">{data.totalFormAdmins}</h3>
            <p className="text-blue-100">Total Form Admins</p>
          </div>
          <div className="bg-gradient-to-r from-green-500 to-green-600 p-6 rounded-lg text-white">
            <h3 className="text-2xl font-bold">₹{data.totalRevenue?.toLocaleString() || 0}</h3>
            <p className="text-green-100">Total Revenue</p>
          </div>
          <div className="bg-gradient-to-r from-purple-500 to-purple-600 p-6 rounded-lg text-white">
            <h3 className="text-2xl font-bold">₹{data.platformCommission?.toFixed(0) || 0}</h3>
            <p className="text-purple-100">Platform Commission</p>
          </div>
          <div className="bg-gradient-to-r from-orange-500 to-orange-600 p-6 rounded-lg text-white">
            <h3 className="text-2xl font-bold">{data.totalTransactions}</h3>
            <p className="text-orange-100">Total Transactions</p>
          </div>
        </div>
      </div>
      
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Platform Activity</h3>
        {data.recentTransactions && data.recentTransactions.length > 0 ? (
          <div className="space-y-3">
            {data.recentTransactions.slice(0, 5).map((transaction: any) => (
              <div key={transaction.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">{transaction.product_name || 'Payment'}</p>
                  <p className="text-sm text-gray-500">{transaction.email}</p>
                </div>
                <div className="text-right">
                  <p className="font-medium text-gray-900">₹{transaction.payment_amount}</p>
                  <p className="text-sm text-gray-500">{new Date(transaction.created_at).toLocaleDateString()}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <div className="text-4xl mb-4">📈</div>
            <p>No recent transactions to display</p>
          </div>
        )}
      </div>
    </div>
  );
};

// Admin Management Component
const AdminManagement: React.FC = () => {
  return (
    <div className="text-center py-12">
      <div className="text-4xl mb-4">👥</div>
      <h3 className="text-lg font-medium text-gray-900 mb-2">Form Admin Management</h3>
      <p className="text-gray-600">Manage form admin accounts (Coming in Phase 2)</p>
    </div>
  );
};

// Main App Component
const App: React.FC = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading PayForm...</p>
        </div>
      </div>
    );
  }

  return user ? <Dashboard /> : <LoginPage />;
};

// Export the complete app with auth provider
const PayFormApp: React.FC = () => {
  return (
    <AuthProvider>
      <App />
    </AuthProvider>
  );
};

export default PayFormApp;
