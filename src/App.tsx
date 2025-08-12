// src/App.tsx - Complete PayForm with Authentication + Fixed HTML Comments + Form Name Column
import React, { useState } from 'react';
import type { ReactNode } from 'react';
import { MyForms } from './components/dashboard/MyForms';
import { OrderSummary } from './components/OrderSummary';
import { AuthProvider, useAuth } from './hooks/useAuth';
//import { RegisterPage } from './components/auth/RegisterPage';
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
          <SimpleRegisterForm onSwitchToLogin={() => setActiveTab('login')} />
        )}
      </div>
    </div>
  );
};

// Simple Register Form Component (temporary replacement)
const SimpleRegisterForm: React.FC<{ onSwitchToLogin: () => void }> = ({ onSwitchToLogin }) => {
  const { signUp } = useAuth();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
    company_name: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error } = await signUp(formData.email, formData.password, formData.name, formData.company_name);
    if (error) {
      setError(error.message);
    } else {
      alert('Account created! Please check your email to verify your account.');
      onSwitchToLogin();
    }
    setLoading(false);
  };

  return (
    <div>
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Enter your full name"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
          <input
            type="text"
            value={formData.company_name}
            onChange={(e) => setFormData(prev => ({ ...prev, company_name: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Your company (optional)"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email Address *</label>
          <input
            type="email"
            value={formData.email}
            onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Enter your email"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
          <input
            type="password"
            value={formData.password}
            onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Create a password"
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          {loading ? 'Creating Account...' : 'Create Account'}
        </button>
      </form>
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
      <main className="max-w-full mx-auto py-3 px-2 sm:px-4 lg:px-6">
        {/* Form Admin Views */}
        {/* DEBUG MODE - Replace this section with normal dashboard later */}
        {isFormAdmin && activeTab === 'dashboard' && (
      
<DashboardContent 
  key={`dashboard-${dashboardData?.totalTransactions || 0}-${Date.now()}`}
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

// Dashboard Content Component with Form Filter and CSV Export
const DashboardContent: React.FC<{ 
  stats: any;
  transactions: Transaction[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}> = ({ stats, transactions, loading, error, onRefresh }) => {
  
  // 🆕 NEW: Filter state for form names
  const [selectedFormFilter, setSelectedFormFilter] = useState<string>('all');
  
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

  // 🆕 NEW: Get unique form names from transactions
  const uniqueFormNames = React.useMemo(() => {
    if (!transactions || transactions.length === 0) return [];
    
    const formNames = transactions
      .map(t => t.formName || t.form_name || 'Unknown Form')
      .filter(name => name && name !== 'Unknown Form');
    
    return [...new Set(formNames)].sort();
  }, [transactions]);

  // 🆕 NEW: Filter transactions based on selected form
  const filteredTransactions = React.useMemo(() => {
    if (!transactions) return [];
    
    if (selectedFormFilter === 'all') {
      return transactions;
    }
    
    return transactions.filter(t => 
      (t.formName || t.form_name || 'Unknown Form') === selectedFormFilter
    );
  }, [transactions, selectedFormFilter]);

  // 🆕 NEW: Recalculate stats from filtered transactions
  const filteredStats = React.useMemo(() => {
    if (!filteredTransactions || filteredTransactions.length === 0) {
      return {
        totalSales: 0,
        totalTransactions: 0,
        completedTransactions: 0,
        pendingTransactions: 0,
        totalEarnings: 0
      };
    }

    const totalSales = filteredTransactions.reduce((sum, t) => sum + (t.payment_amount || 0), 0);
    const completedTransactions = filteredTransactions.filter(t => t.payment_status === 'paid' || t.payment_status === 'SUCCESS').length;
    const pendingTransactions = filteredTransactions.filter(t => t.payment_status === 'pending' || t.payment_status === 'ACTIVE').length;
    const totalEarnings = filteredTransactions.reduce((sum, t) => sum + (t.net_amount_to_admin || 0), 0);

    return {
      totalSales,
      totalTransactions: filteredTransactions.length,
      completedTransactions,
      pendingTransactions,
      totalEarnings
    };
  }, [filteredTransactions]);

  // 🆕 NEW: CSV Export Function
  const exportFilteredCSV = React.useCallback(() => {
    if (!filteredTransactions || filteredTransactions.length === 0) {
      alert('No transactions to export!');
      return;
    }

    // Create CSV headers
    const headers = [
      'Transaction ID',
      'Date',
      'Customer Name',
      'Customer Email',
      'Product',
      'Form Name',
      'Amount',
      'Your Earnings',
      'Gateway Fee',
      'Platform Commission',
      'Status',
      'Payment Provider',
      'Cashfree Order ID'
    ];

    // Convert transactions to CSV rows
    const csvRows = filteredTransactions.map(t => [
      t.transaction_id || t.cashfree_order_id || `#${t.id}`,
      new Date(t.created_at).toLocaleDateString('en-IN'),
      `"${t.customer_name || 'N/A'}"`,
      t.email,
      `"${t.product_name || 'Payment'}"`,
      `"${t.formName || t.form_name || 'Unknown Form'}"`,
      t.payment_amount?.toFixed(2) || '0.00',
      t.net_amount_to_admin?.toFixed(2) || (t.payment_amount * 0.94).toFixed(2),
      t.gateway_fee?.toFixed(2) || '0.00',
      t.platform_commission?.toFixed(2) || '0.00',
      t.payment_status || 'pending',
      t.payment_provider || 'cashfree',
      t.cashfree_order_id || ''
    ]);

    // Combine headers and rows
    const csvContent = [headers, ...csvRows]
      .map(row => row.join(','))
      .join('\n');

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    
    // Generate filename with filter info
    const filterSuffix = selectedFormFilter === 'all' ? 'All_Forms' : selectedFormFilter.replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `PayForm_Transactions_${filterSuffix}_${new Date().toISOString().split('T')[0]}.csv`;
    link.setAttribute('download', fileName);
    
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    console.log(`✅ CSV exported: ${filteredTransactions.length} transactions for filter "${selectedFormFilter}"`);
  }, [filteredTransactions, selectedFormFilter]);

  return (
    <div className="space-y-4">
      {/* Stats Cards - Using Filtered Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-600">Total Revenue</p>
              <p className="text-xl font-bold text-green-600">₹{filteredStats.totalSales?.toLocaleString() || 0}</p>
            </div>
            <div className="text-green-500 text-2xl">💰</div>
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-600">Transactions</p>
              <p className="text-xl font-bold text-blue-600">{filteredStats.totalTransactions || 0}</p>
            </div>
            <div className="text-blue-500 text-2xl">📊</div>
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-600">Completed</p>
              <p className="text-xl font-bold text-green-600">{filteredStats.completedTransactions || 0}</p>
            </div>
            <div className="text-green-500 text-2xl">✅</div>
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-600">Pending</p>
              <p className="text-xl font-bold text-yellow-600">{filteredStats.pendingTransactions || 0}</p>
            </div>
            <div className="text-yellow-500 text-2xl">⏳</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-600">Your Earnings</p>
              <p className="text-xl font-bold text-purple-600">₹{filteredStats.totalEarnings?.toFixed(2) || '0.00'}</p>
            </div>
            <div className="text-purple-500 text-2xl">💎</div>
          </div>
        </div>
      </div>

      {/* Recent Transactions with Filter */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium text-gray-900">Recent Transactions</h3>
            <div className="flex space-x-2">
              <button 
                onClick={onRefresh}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm transition-colors"
              >
                🔄 Refresh
              </button>
              <button 
                onClick={exportFilteredCSV}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
              >
                📥 Export CSV ({filteredStats.totalTransactions})
              </button>
            </div>
          </div>

          {/* 🆕 NEW: Form Filter Dropdown */}
          {uniqueFormNames.length > 0 && (
            <div className="flex items-center space-x-3">
              <label className="text-sm font-medium text-gray-700">Filter by Form:</label>
              <select
                value={selectedFormFilter}
                onChange={(e) => setSelectedFormFilter(e.target.value)}
                className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All Forms ({transactions.length})</option>
                {uniqueFormNames.map((formName) => {
                  const count = transactions.filter(t => 
                    (t.formName || t.form_name || 'Unknown Form') === formName
                  ).length;
                  return (
                    <option key={formName} value={formName}>
                      📝 {formName} ({count})
                    </option>
                  );
                })}
              </select>
              {selectedFormFilter !== 'all' && (
                <button
                  onClick={() => setSelectedFormFilter('all')}
                  className="text-blue-600 hover:text-blue-800 text-sm underline"
                >
                  Clear Filter
                </button>
              )}
            </div>
          )}
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Transaction ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Customer
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Product
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Form Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Your Earnings
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredTransactions && filteredTransactions.length > 0 ? (
                filteredTransactions.map((transaction, index) => (
                  <tr key={transaction.id || index} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                      {transaction.transaction_id || transaction.cashfree_order_id || `#${transaction.id}`}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
                      <div>
                        <div className="font-medium">{transaction.customer_name || 'N/A'}</div>
                        <div className="text-gray-500">{transaction.email}</div>
                      </div>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
                      {transaction.product_name || 'Payment'}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        selectedFormFilter !== 'all' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        📝 {transaction.formName || transaction.form_name || 'Unknown Form'}
                      </span>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
                      ₹{transaction.payment_amount?.toFixed(2) || '0.00'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 font-medium">
                      ₹{transaction.net_amount_to_admin?.toFixed(2) || (transaction.payment_amount * 0.94).toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        transaction.payment_status === 'paid' || transaction.payment_status === 'SUCCESS'
                          ? 'bg-green-100 text-green-800'
                          : transaction.payment_status === 'pending' || transaction.payment_status === 'ACTIVE'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {transaction.payment_status === 'paid' || transaction.payment_status === 'SUCCESS' 
                          ? 'Paid' 
                          : transaction.payment_status === 'pending' || transaction.payment_status === 'ACTIVE'
                          ? 'Pending'
                          : 'Failed'
                        }
                      </span>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
                      {new Date(transaction.created_at).toLocaleDateString('en-IN')}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                    <div className="text-4xl mb-4">
                      {selectedFormFilter === 'all' ? '💳' : '🔍'}
                    </div>
                    <p className="text-lg font-medium">
                      {selectedFormFilter === 'all' 
                        ? 'No transactions yet' 
                        : `No transactions for "${selectedFormFilter}"`
                      }
                    </p>
                    <p className="text-sm">
                      {selectedFormFilter === 'all'
                        ? 'Your transactions will appear here once customers start paying'
                        : 'Try selecting a different form or "All Forms" to see more data'
                      }
                    </p>
                  </td>
                </tr>
              )}
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

// Order Summary Route Component
const OrderSummaryRoute: React.FC = () => {
  const urlParams = new URLSearchParams(window.location.search);
  const orderId = window.location.pathname.split('/').pop();
  
  if (!orderId || !orderId.startsWith('PAYFORM_')) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">❌</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Invalid Order</h2>
          <p className="text-gray-600">Order not found or invalid order ID.</p>
        </div>
      </div>
    );
  }

  return <OrderSummary orderId={orderId} />;
};

// Router Component
const AppRouter: React.FC = () => {
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

  // Check if this is an order summary page
  if (window.location.pathname.startsWith('/order/')) {
    return <OrderSummaryRoute />;
  }

  return user ? <Dashboard /> : <LoginPage />;
};

// Main App Component
const App: React.FC = () => {
  const { user, loading } = useAuth();

  // Google OAuth URL parameter handling
  React.useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const authStatus = urlParams.get('auth');
    const email = urlParams.get('email');
    const message = urlParams.get('message');

    if (authStatus === 'success' && email) {
      console.log('✅ Google OAuth successful for:', email);
      // Clean URL and show success message
      window.history.replaceState({}, document.title, window.location.pathname);
      // You could add a toast notification here
    } else if (authStatus === 'error') {
      console.error('❌ Google OAuth error:', message);
      window.history.replaceState({}, document.title, window.location.pathname);
      // You could add an error notification here
    }
  }, []);

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
      <AppRouter />
    </AuthProvider>
  );
};

export default PayFormApp;
