// src/App.tsx - Complete PayForm Application with Real Data Integration
import React, { useState, useEffect, createContext, useContext } from 'react';
import { supabase } from './lib/supabase';
import { 
  useDashboardData, 
  useFormAdmin, 
  usePlatformData, 
  useCashfreeConfig,
  useFormConfigs,
  Transaction 
} from './hooks/useData';

// Types
interface User {
  id: string;
  email: string;
  user_metadata?: {
    role: 'form_admin' | 'super_admin';
    name?: string;
  };
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<any>;
  signOut: () => Promise<void>;
  isFormAdmin: boolean;
  isSuperAdmin: boolean;
}

// Auth Context
const AuthContext = createContext<AuthContextType | null>(null);

// Auth Provider Component
const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    try {
      // Check for stored user first
      const stored = localStorage.getItem('payform_user');
      if (stored) {
        setUser(JSON.parse(stored));
      }
      
      // TODO: Later replace with real Supabase auth
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        setUser(data.user);
      }
    } catch (error) {
      console.error('Error checking user:', error);
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    setLoading(true);
    
    // Demo credentials (replace with real auth later)
    if (email === 'admin@payform.com' && password === 'admin123') {
      const adminUser = {
        id: 'super-admin-123',
        email: 'admin@payform.com',
        user_metadata: { role: 'super_admin' as const, name: 'PayForm Admin' }
      };
      setUser(adminUser);
      localStorage.setItem('payform_user', JSON.stringify(adminUser));
      setLoading(false);
      return { data: { user: adminUser }, error: null };
    } else if (email === 'formadmin@example.com' && password === 'form123') {
      const formAdminUser = {
        id: 'f807a8c3-316b-4df0-90e7-5f7796c86f71',
        email: 'formadmin@example.com',
        user_metadata: { role: 'form_admin' as const, name: 'Bhushan Agrawal' }
      };
      setUser(formAdminUser);
      localStorage.setItem('payform_user', JSON.stringify(formAdminUser));
      setLoading(false);
      return { data: { user: formAdminUser }, error: null };
    }
    
    setLoading(false);
    return { data: { user: null }, error: { message: 'Invalid credentials' } };
  };

  const signOut = async () => {
    setUser(null);
    localStorage.removeItem('payform_user');
  };

  const value: AuthContextType = {
    user,
    signIn,
    signOut,
    loading,
    isFormAdmin: user?.user_metadata?.role === 'form_admin',
    isSuperAdmin: user?.user_metadata?.role === 'super_admin'
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

// Login Component (unchanged)
const LoginPage: React.FC = () => {
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
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="text-4xl mb-4">💳</div>
            <h1 className="text-2xl font-bold text-gray-900">PayForm</h1>
            <p className="text-gray-600 mt-2">Sign in to your dashboard</p>
          </div>

          {/* Demo Credentials */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <h3 className="font-medium text-blue-900 mb-3">🎯 Demo Credentials:</h3>
            <div className="space-y-2">
              <button
                onClick={() => handleDemoLogin('admin@payform.com', 'admin123')}
                className="w-full text-left bg-blue-100 hover:bg-blue-200 p-2 rounded text-sm transition-colors"
              >
                <strong>Super Admin:</strong> admin@payform.com / admin123
              </button>
              <button
                onClick={() => handleDemoLogin('formadmin@example.com', 'form123')}
                className="w-full text-left bg-green-100 hover:bg-green-200 p-2 rounded text-sm transition-colors"
              >
                <strong>Form Admin:</strong> formadmin@example.com / form123
              </button>
            </div>
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
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-6 text-center text-sm text-gray-500">
            <p>New to PayForm? <span className="text-blue-600 cursor-pointer">Contact Support</span></p>
          </div>
        </div>
      </div>
    </div>
  );
};

// Dashboard Component with Real Data
const Dashboard: React.FC = () => {
  const { user, signOut, isFormAdmin, isSuperAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  
  // Use real data hooks based on user role
  const adminId = isFormAdmin ? user?.id : undefined;
  const { data: dashboardData, transactions, loading: dashboardLoading, error: dashboardError, refetch } = useDashboardData(adminId);
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
                Welcome, {admin?.name || user?.user_metadata?.name || user?.email}
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
        {isFormAdmin && activeTab === 'dashboard' && (
          <DashboardContent 
            stats={dashboardData} 
            transactions={transactions}
            loading={dashboardLoading}
            error={dashboardError}
            onRefresh={refetch}
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
          <FormsManagement 
            forms={forms}
            loading={formsLoading}
          />
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
          Connect your Google Forms and start accepting payments to see your analytics here.
        </p>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 max-w-md mx-auto">
          <h4 className="font-medium text-blue-900 mb-2">💡 Quick Start:</h4>
          <ol className="text-sm text-blue-800 text-left space-y-1">
            <li>1. Complete Cashfree setup</li>
            <li>2. Connect your Google Form</li>
            <li>3. Start accepting payments</li>
            <li>4. Watch your earnings grow!</li>
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
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Transaction ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Customer
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Product
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Your Earnings
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Date
                </th>
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

  useEffect(() => {
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

// Forms Management Component with Real Data
const FormsManagement: React.FC<{ 
  forms: any[];
  loading: boolean;
}> = ({ forms, loading }) => {
  const [showAddForm, setShowAddForm] = useState(false);

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
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-medium text-gray-900">Connected Forms</h2>
          <p className="text-sm text-gray-600">Manage your Google Forms with payment integration</p>
        </div>
        <button 
          onClick={() => setShowAddForm(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm"
        >
          + Connect New Form
        </button>
      </div>

      {/* Forms Grid */}
      {forms.length > 0 ? (
        <div className="grid gap-6">
          {forms.map((form) => (
            <div key={form.id} className="bg-white shadow rounded-lg border">
              <div className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <h3 className="text-lg font-medium text-gray-900">{form.form_name}</h3>
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                        form.is_active 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {form.is_active ? 'Active' : 'Paused'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">Form ID: {form.form_id}</p>
                    <p className="text-sm text-blue-600 mt-1 truncate">{form.form_url}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Created: {new Date(form.created_at).toLocaleDateString('en-IN')}
                    </p>
                  </div>
                  
                  <div className="flex flex-col space-y-2">
                    <button className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1 rounded text-sm">
                      View Analytics
                    </button>
                    <button className="bg-blue-50 hover:bg-blue-100 text-blue-600 px-3 py-1 rounded text-sm">
                      Configure
                    </button>
                    <button className={`px-3 py-1 rounded text-sm ${
                      form.is_active 
                        ? 'bg-yellow-50 hover:bg-yellow-100 text-yellow-600' 
                        : 'bg-green-50 hover:bg-green-100 text-green-600'
                    }`}>
                      {form.is_active ? 'Pause' : 'Activate'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">📝</div>
          <h3 className="text-xl font-medium text-gray-900 mb-2">No Forms Connected Yet</h3>
          <p className="text-gray-600 mb-6">
            Connect your first Google Form to start accepting payments
          </p>
          <button 
            onClick={() => setShowAddForm(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium"
          >
            + Connect Your First Form
          </button>
        </div>
      )}

      {/* Add Form Modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Connect New Google Form</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Form Name
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g., Course Registration Form"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Google Form URL
                </label>
                <input
                  type="url"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  placeholder="https://docs.google.com/forms/d/..."
                />
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button 
                onClick={() => setShowAddForm(false)}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm"
              >
                Cancel
              </button>
              <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm">
                Connect Form
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
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
