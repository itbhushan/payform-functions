// src/App.tsx - Complete PayForm Application with Authentication
import React, { useState, useEffect, createContext, useContext } from 'react';
import { supabase } from './lib/supabase';

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
      const { data } = await supabase.auth.getUser();
      setUser(data.user);
    } catch (error) {
      console.error('Error checking user:', error);
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    // For demo purposes, we'll simulate authentication
    // Replace this with real Supabase auth later
    setLoading(true);
    
    // Demo credentials
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

// Login Component
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

// Mock data for initial testing
const mockTransactions = [
  {
    id: 1,
    transaction_id: 'CF_2025071401',
    email: 'customer1@example.com',
    customer_name: 'Rahul Sharma',
    product_name: 'Digital Marketing Course',
    payment_amount: 2999,
    payment_status: 'paid',
    net_amount_to_admin: 2831.55,
    created_at: '2025-07-14T10:30:00Z'
  },
  {
    id: 2,
    transaction_id: 'CF_2025071402',
    email: 'student@college.edu',
    customer_name: 'Priya Patel',
    product_name: 'E-Book Bundle',
    payment_amount: 599,
    payment_status: 'paid',
    net_amount_to_admin: 563.05,
    created_at: '2025-07-14T09:15:00Z'
  },
  {
    id: 3,
    transaction_id: 'CF_2025071403',
    email: 'workshop@business.com',
    customer_name: 'Amit Kumar',
    product_name: 'Business Consultation',
    payment_amount: 4999,
    payment_status: 'pending',
    net_amount_to_admin: 4721.55,
    created_at: '2025-07-14T08:45:00Z'
  }
];

// Dashboard Component
const Dashboard: React.FC = () => {
  const { user, signOut, isFormAdmin, isSuperAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(false);

  // Calculate stats from mock data
  const stats = {
    totalSales: mockTransactions.reduce((sum, t) => sum + t.payment_amount, 0),
    totalTransactions: mockTransactions.length,
    completedTransactions: mockTransactions.filter(t => t.payment_status === 'paid').length,
    pendingTransactions: mockTransactions.filter(t => t.payment_status === 'pending').length,
    totalEarnings: mockTransactions.reduce((sum, t) => sum + (t.net_amount_to_admin || 0), 0)
  };

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
                Welcome, {user?.user_metadata?.name || user?.email}
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
                  📝 My Forms
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
        {activeTab === 'dashboard' && <DashboardContent stats={stats} />}
        {activeTab === 'setup' && <CashfreeSetup />}
        {activeTab === 'forms' && <FormsManagement />}
        {activeTab === 'overview' && <PlatformOverview />}
        {activeTab === 'admins' && <AdminManagement />}
      </main>
    </div>
  );
};

// Dashboard Content Component
const DashboardContent: React.FC<{ stats: any }> = ({ stats }) => {
  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Revenue</p>
              <p className="text-2xl font-bold text-green-600">₹{stats.totalSales.toLocaleString()}</p>
            </div>
            <div className="text-green-500 text-2xl">💰</div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Transactions</p>
              <p className="text-2xl font-bold text-blue-600">{stats.totalTransactions}</p>
            </div>
            <div className="text-blue-500 text-2xl">📊</div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Completed</p>
              <p className="text-2xl font-bold text-green-600">{stats.completedTransactions}</p>
            </div>
            <div className="text-green-500 text-2xl">✅</div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Pending</p>
              <p className="text-2xl font-bold text-yellow-600">{stats.pendingTransactions}</p>
            </div>
            <div className="text-yellow-500 text-2xl">⏳</div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Your Earnings</p>
              <p className="text-2xl font-bold text-purple-600">₹{stats.totalEarnings.toFixed(2)}</p>
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
            <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm">
              📥 Export CSV
            </button>
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
              {mockTransactions.map((transaction) => (
                <tr key={transaction.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                    {transaction.transaction_id}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    <div>
                      <div className="font-medium">{transaction.customer_name}</div>
                      <div className="text-gray-500">{transaction.email}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {transaction.product_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                    ₹{transaction.payment_amount.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 font-medium">
                    ₹{transaction.net_amount_to_admin.toFixed(2)}
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

// Cashfree Setup Component
const CashfreeSetup: React.FC = () => {
  const [formData, setFormData] = useState({
    business_name: '',
    pan_number: '',
    account_number: '',
    ifsc_code: '',
    business_type: 'individual'
  });

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="text-2xl">💳</div>
            <div>
              <h2 className="text-lg font-medium text-gray-900">Cashfree Setup</h2>
              <p className="text-sm text-gray-600">Configure your Indian payment processing</p>
            </div>
          </div>
        </div>

        <div className="p-6">
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
                />
              </div>
            </div>
          </div>

          {/* Commission Structure */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-6">
            <h4 className="font-medium text-blue-900 mb-2">💰 Commission Structure</h4>
            <div className="text-sm text-blue-800 space-y-1">
              <p><strong>Example for ₹1000 transaction:</strong></p>
              <p>• Cashfree Fee: ₹28 (2.5% + ₹3)</p>
              <p>• Platform Commission: ₹30 (3%)</p>
              <p>• <strong>You Receive: ₹942</strong></p>
              <p className="text-xs mt-2 text-blue-600">✓ Instant settlement to your bank account</p>
            </div>
          </div>

          <div className="flex justify-end mt-6">
            <button className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors">
              Save Configuration
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Forms Management Component
const FormsManagement: React.FC = () => {
  return (
    <div className="text-center py-12">
      <div className="text-4xl mb-4">📝</div>
      <h3 className="text-lg font-medium text-gray-900 mb-2">Forms Management</h3>
      <p className="text-gray-600">Connect and manage your Google Forms (Coming in Step 1.2)</p>
    </div>
  );
};

// Platform Overview Component
const PlatformOverview: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Platform Overview</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-gradient-to-r from-blue-500 to-blue-600 p-6 rounded-lg text-white">
            <h3 className="text-2xl font-bold">248</h3>
            <p className="text-blue-100">Total Form Admins</p>
          </div>
          <div className="bg-gradient-to-r from-green-500 to-green-600 p-6 rounded-lg text-white">
            <h3 className="text-2xl font-bold">₹12.5L</h3>
            <p className="text-green-100">Monthly Revenue</p>
          </div>
          <div className="bg-gradient-to-r from-purple-500 to-purple-600 p-6 rounded-lg text-white">
            <h3 className="text-2xl font-bold">₹37.5K</h3>
            <p className="text-purple-100">Platform Commission</p>
          </div>
          <div className="bg-gradient-to-r from-orange-500 to-orange-600 p-6 rounded-lg text-white">
            <h3 className="text-2xl font-bold">1,847</h3>
            <p className="text-orange-100">Total Transactions</p>
          </div>
        </div>
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
      <p className="text-gray-600">Manage form admin accounts (Coming in Step 2.1)</p>
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
