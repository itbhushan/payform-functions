// src/App.tsx - Replace your existing App.tsx with this complete dashboard

import React, { useState, useEffect } from 'react';
import './App.css';
import { CashfreeConfig } from './components/setup/CashfreeConfig';

// Mock Supabase client for demo purposes
const mockSupabase = {
  from: (table: string) => ({
    select: (columns = '*', options = {}) => ({
      eq: (column: string, value: any) => ({
        order: (column: string, options: any) => ({
          then: () => Promise.resolve({
            data: getMockData(table, { filter: { [column]: value } }),
            error: null
          })
        }),
        single: () => Promise.resolve({
          data: getMockData(table, { filter: { [column]: value }, single: true }),
          error: null
        }),
        then: () => Promise.resolve({
          data: getMockData(table, { filter: { [column]: value } }),
          error: null
        })
      }),
      order: (column: string, options: any) => ({
        then: () => Promise.resolve({
          data: getMockData(table),
          error: null
        })
      }),
      then: () => Promise.resolve({
        data: getMockData(table),
        error: null,
        count: getMockData(table).length
      })
    })
  })
};

// Mock data generator
const getMockData = (table: string, options: any = {}) => {
  const { filter, single } = options;
  
  let data: any[] = [];
  
  switch (table) {
    case 'form_admins':
      data = [
        {
          id: 'f807a8c3-316b-4df0-90e7-5f7796c86f71',
          email: 'bhuvnagreens@gmail.com',
          name: 'Bhushan Agrawal',
          company_name: 'BhuvnaGreens',
          created_at: '2025-01-10T10:00:00Z',
          is_active: true
        },
        {
          id: 'admin-2',
          email: 'admin2@example.com',
          name: 'John Doe',
          company_name: 'TechCorp',
          created_at: '2025-01-05T10:00:00Z',
          is_active: true
        }
      ];
      break;
      
    case 'transactions':
      data = [
        {
          id: 1,
          form_id: 'form_123',
          email: 'customer1@example.com',
          customer_name: 'Customer One',
          product_name: 'E-Book Course',
          payment_amount: 299.00,
          payment_currency: 'INR',
          payment_status: 'paid',
          payment_provider: 'cashfree',
          transaction_id: 'PF_1673456789_abc123',
          cashfree_order_id: 'CF_12345',
          admin_id: 'f807a8c3-316b-4df0-90e7-5f7796c86f71',
          gateway_fee: 10.48,
          platform_commission: 8.97,
          net_amount_to_admin: 279.55,
          created_at: '2025-01-11T09:30:00Z'
        },
        {
          id: 2,
          form_id: 'form_123',
          email: 'customer2@example.com',
          customer_name: 'Customer Two',
          product_name: 'Online Workshop',
          payment_amount: 999.00,
          payment_currency: 'INR',
          payment_status: 'paid',
          payment_provider: 'cashfree',
          transaction_id: 'PF_1673456790_def456',
          cashfree_order_id: 'CF_67890',
          admin_id: 'f807a8c3-316b-4df0-90e7-5f7796c86f71',
          gateway_fee: 27.48,
          platform_commission: 29.97,
          net_amount_to_admin: 941.55,
          created_at: '2025-01-11T10:15:00Z'
        },
        {
          id: 3,
          form_id: 'form_456',
          email: 'customer3@example.com',
          customer_name: 'Customer Three',
          product_name: 'Consultation',
          payment_amount: 1999.00,
          payment_currency: 'INR',
          payment_status: 'pending',
          payment_provider: 'cashfree',
          transaction_id: 'PF_1673456791_ghi789',
          cashfree_order_id: 'CF_11111',
          admin_id: 'f807a8c3-316b-4df0-90e7-5f7796c86f71',
          gateway_fee: 52.48,
          platform_commission: 59.97,
          net_amount_to_admin: 1886.55,
          created_at: '2025-01-11T11:00:00Z'
        }
      ];
      break;
      
    default:
      data = [];
  }
  
  // Apply filters
  if (filter) {
    Object.keys(filter).forEach(key => {
      data = data.filter(item => item[key] === filter[key]);
    });
  }
  
  return single ? data[0] : data;
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'setup' | 'dashboard' | 'earnings' | 'overview' | 'admins' | 'transactions' | 'revenue'>('setup');
  const [userRole, setUserRole] = useState<'form_admin' | 'super_admin'>('form_admin');
  const [currentAdminId] = useState('f807a8c3-316b-4df0-90e7-5f7796c86f71');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-gray-900">PayForm</h1>
              <span className="ml-2 text-sm text-gray-500">
                {userRole === 'super_admin' ? 'Super Admin Dashboard' : 'Admin Dashboard'}
              </span>
            </div>
            <div className="flex items-center space-x-4">
              <select
                value={userRole}
                onChange={(e) => {
                  setUserRole(e.target.value as 'form_admin' | 'super_admin');
                  setActiveTab(e.target.value === 'super_admin' ? 'overview' : 'setup');
                }}
                className="border border-gray-300 rounded-md px-3 py-1 text-sm"
              >
                <option value="form_admin">Form Admin View</option>
                <option value="super_admin">Super Admin View</option>
              </select>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            {userRole === 'form_admin' ? (
              <>
                <TabButton
                  id="setup"
                  label="🛠️ Cashfree Setup"
                  active={activeTab === 'setup'}
                  onClick={() => setActiveTab('setup')}
                />
                <TabButton
                  id="dashboard"
                  label="📊 My Transactions"
                  active={activeTab === 'dashboard'}
                  onClick={() => setActiveTab('dashboard')}
                />
                <TabButton
                  id="earnings"
                  label="💰 My Earnings"
                  active={activeTab === 'earnings'}
                  onClick={() => setActiveTab('earnings')}
                />
              </>
            ) : (
              <>
                <TabButton
                  id="overview"
                  label="🏢 Platform Overview"
                  active={activeTab === 'overview'}
                  onClick={() => setActiveTab('overview')}
                />
                <TabButton
                  id="admins"
                  label="👥 Form Admins"
                  active={activeTab === 'admins'}
                  onClick={() => setActiveTab('admins')}
                />
                <TabButton
                  id="transactions"
                  label="💳 All Transactions"
                  active={activeTab === 'transactions'}
                  onClick={() => setActiveTab('transactions')}
                />
                <TabButton
                  id="revenue"
                  label="📈 Revenue Analytics"
                  active={activeTab === 'revenue'}
                  onClick={() => setActiveTab('revenue')}
                />
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {userRole === 'form_admin' ? (
          <>
            {activeTab === 'setup' && <CashfreeSetupWizard adminId={currentAdminId} />}
            {activeTab === 'dashboard' && <FormAdminDashboard adminId={currentAdminId} />}
            {activeTab === 'earnings' && <EarningsDashboard adminId={currentAdminId} />}
          </>
        ) : (
          <>
            {activeTab === 'overview' && <SuperAdminOverview />}
            {activeTab === 'admins' && <FormAdminsManagement />}
            {activeTab === 'transactions' && <AllTransactionsView />}
            {activeTab === 'revenue' && <RevenueAnalytics />}
          </>
        )}
      </main>
    </div>
  );
};

// Tab Button Component
interface TabButtonProps {
  id: string;
  label: string;
  active: boolean;
  onClick: () => void;
}

const TabButton: React.FC<TabButtonProps> = ({ label, active, onClick }) => (
  <button
    onClick={onClick}
    className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
      active
        ? 'border-blue-500 text-blue-600'
        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
    }`}
  >
    {label}
  </button>
);

// Super Admin Overview Component
const SuperAdminOverview: React.FC = () => {
  const [stats, setStats] = useState({
    totalFormAdmins: 0,
    totalTransactions: 0,
    totalRevenue: 0,
    platformCommission: 0,
    activePayments: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPlatformStats();
  }, []);

  const fetchPlatformStats = async () => {
    try {
      // Get total form admins
      const adminCount = 2; // Mock data

      // Get transaction stats
      const transactionStats = getMockData('transactions');
      const paidTransactions = transactionStats?.filter(t => t.payment_status === 'paid') || [];
      const totalRevenue = paidTransactions.reduce((sum, t) => sum + (t.payment_amount || 0), 0);
      const platformCommission = paidTransactions.reduce((sum, t) => sum + (t.platform_commission || 0), 0);

      setStats({
        totalFormAdmins: adminCount,
        totalTransactions: transactionStats?.length || 0,
        totalRevenue: totalRevenue,
        platformCommission: platformCommission,
        activePayments: transactionStats?.filter(t => t.payment_status === 'pending').length || 0
      });
    } catch (error) {
      console.error('Error fetching platform stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
    </div>;
  }

  return (
    <div className="space-y-6">
      {/* Platform Stats */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b">
          <h2 className="text-lg font-medium text-gray-900">Platform Overview</h2>
          <p className="text-sm text-gray-600">Real-time PayForm platform statistics</p>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <StatCard
              title="Form Admins"
              value={stats.totalFormAdmins}
              icon="👥"
              color="blue"
            />
            <StatCard
              title="Total Transactions"
              value={stats.totalTransactions}
              icon="💳"
              color="green"
            />
            <StatCard
              title="Total Revenue"
              value={`₹${stats.totalRevenue.toFixed(2)}`}
              icon="💰"
              color="purple"
            />
            <StatCard
              title="Platform Commission"
              value={`₹${stats.platformCommission.toFixed(2)}`}
              icon="🏦"
              color="indigo"
            />
            <StatCard
              title="Active Payments"
              value={stats.activePayments}
              icon="⏳"
              color="yellow"
            />
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <RecentActivityFeed />
    </div>
  );
};

// Form Admin Dashboard Component
interface FormAdminDashboardProps {
  adminId: string;
}

const FormAdminDashboard: React.FC<FormAdminDashboardProps> = ({ adminId }) => {
  const [dashboardData, setDashboardData] = useState({
    stats: {
      totalSales: 0,
      totalTransactions: 0,
      paidTransactions: 0,
      pendingTransactions: 0
    },
    recentTransactions: [] as any[]
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, [adminId]);

  const fetchDashboardData = async () => {
    try {
      // Fetch transactions for this admin
      const transactions = getMockData('transactions', { filter: { admin_id: adminId } });

      const paidTransactions = transactions?.filter(t => t.payment_status === 'paid') || [];
      const pendingTransactions = transactions?.filter(t => t.payment_status === 'pending') || [];
      const totalSales = paidTransactions.reduce((sum, t) => sum + (t.payment_amount || 0), 0);

      setDashboardData({
        stats: {
          totalSales,
          totalTransactions: transactions?.length || 0,
          paidTransactions: paidTransactions.length,
          pendingTransactions: pendingTransactions.length
        },
        recentTransactions: transactions?.slice(0, 10) || []
      });
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
    </div>;
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Sales"
          value={`₹${dashboardData.stats.totalSales.toFixed(2)}`}
          icon="💰"
          color="green"
        />
        <StatCard
          title="Total Transactions"
          value={dashboardData.stats.totalTransactions}
          icon="📊"
          color="blue"
        />
        <StatCard
          title="Completed"
          value={dashboardData.stats.paidTransactions}
          icon="✅"
          color="green"
        />
        <StatCard
          title="Pending"
          value={dashboardData.stats.pendingTransactions}
          icon="⏳"
          color="yellow"
        />
      </div>

      {/* Recent Transactions */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-medium text-gray-900">Recent Transactions</h3>
            <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
              📥 Export CSV
            </button>
          </div>
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
              {dashboardData.recentTransactions.map((transaction) => (
                <tr key={transaction.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                    {transaction.transaction_id?.substring(0, 15)}...
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{transaction.customer_name}</div>
                      <div className="text-sm text-gray-500">{transaction.email}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {transaction.product_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    ₹{transaction.payment_amount?.toFixed(2)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 font-medium">
                    ₹{transaction.net_amount_to_admin?.toFixed(2)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      transaction.payment_status === 'paid' 
                        ? 'bg-green-100 text-green-800' 
                        : transaction.payment_status === 'pending'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {transaction.payment_status === 'paid' ? '✅ Paid' : 
                       transaction.payment_status === 'pending' ? '⏳ Pending' : '❌ Failed'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {new Date(transaction.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* Summary Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t">
          <div className="flex justify-between items-center text-sm">
            <div className="text-gray-600">
              Showing {dashboardData.recentTransactions.length} transactions
            </div>
            <div className="flex items-center space-x-6">
              <div className="text-gray-700">
                <span className="font-medium">Total Revenue:</span> ₹{dashboardData.stats.totalSales.toFixed(2)}
              </div>
              <div className="text-green-600 font-medium">
                <span>Your Earnings:</span> ₹{dashboardData.recentTransactions
                  .filter(t => t.payment_status === 'paid')
                  .reduce((sum, t) => sum + (t.net_amount_to_admin || 0), 0)
                  .toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Cashfree Setup Wizard Component
interface CashfreeSetupWizardProps {
  adminId: string;
}

const CashfreeSetupWizard: React.FC<CashfreeSetupWizardProps> = ({ adminId }) => {
  return (
    <div className="space-y-6">
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">Cashfree Setup Wizard</h2>
          <p className="mt-1 text-sm text-gray-600">
            Configure your Cashfree payment settings. Start with bank details for Indian payments.
          </p>
        </div>

        <div className="p-6">
          <CashfreeConfig adminId={adminId} />
        </div>
      </div>
    </div>
  );
};

// Earnings Dashboard Component
interface EarningsDashboardProps {
  adminId: string;
}

const EarningsDashboard: React.FC<EarningsDashboardProps> = ({ adminId }) => {
  const earnings = {
    totalEarnings: 1221.10,
    thisMonth: 892.45,
    pendingPayouts: 328.65,
    commissionRate: 3.0,
    transactionCount: 12
  };

  return (
    <div className="space-y-6">
      {/* Earnings Overview */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b">
          <h2 className="text-lg font-medium text-gray-900">💰 Earnings Overview</h2>
          <p className="text-sm text-gray-600">Track your PayForm earnings and commission</p>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <StatCard
              title="Total Earnings"
              value={`₹${earnings.totalEarnings.toFixed(2)}`}
              icon="💰"
              color="green"
              subtitle="All time"
            />
            <StatCard
              title="This Month"
              value={`₹${earnings.thisMonth.toFixed(2)}`}
              icon="📅"
              color="blue"
              subtitle="January 2025"
            />
            <StatCard
              title="Pending Payouts"
              value={`₹${earnings.pendingPayouts.toFixed(2)}`}
              icon="⏳"
              color="yellow"
              subtitle="Processing"
            />
            <StatCard
              title="Platform Fee"
              value={`${earnings.commissionRate}%`}
              icon="📊"
              color="purple"
              subtitle="PayForm commission"
            />
          </div>
        </div>
      </div>

      {/* Commission Breakdown */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b">
          <h3 className="text-lg font-medium text-gray-900">Commission Breakdown</h3>
        </div>
        <div className="p-6">
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-medium text-blue-900 mb-2">How PayForm Commission Works</h4>
              <div className="text-sm text-blue-800 space-y-2">
                <div className="flex justify-between">
                  <span>Customer pays:</span>
                  <span className="font-mono">₹1000</span>
                </div>
                <div className="flex justify-between text-red-600">
                  <span>- Cashfree fee (2.5% + ₹3):</span>
                  <span className="font-mono">₹28</span>
                </div>
                <div className="flex justify-between text-orange-600">
                  <span>- Platform commission (3%):</span>
                  <span className="font-mono">₹30</span>
                </div>
                <div className="flex justify-between font-semibold text-green-600 pt-2 border-t border-blue-300">
                  <span>You receive:</span>
                  <span className="font-mono">₹942</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Stat Card Component
interface StatCardProps {
  title: string;
  value: string | number;
  icon: string;
  color: 'blue' | 'green' | 'purple' | 'yellow' | 'indigo';
  subtitle?: string;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon, color, subtitle }) => {
  const colorClasses = {
    blue: 'text-blue-600',
    green: 'text-green-600', 
    purple: 'text-purple-600',
    yellow: 'text-yellow-600',
    indigo: 'text-indigo-600'
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className={`text-2xl font-bold ${colorClasses[color]}`}>{value}</p>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
        </div>
        <div className={`${colorClasses[color]} text-2xl`}>{icon}</div>
      </div>
    </div>
  );
};

// Recent Activity Feed Component
const RecentActivityFeed: React.FC = () => (
  <div className="bg-white shadow rounded-lg">
    <div className="px-6 py-4 border-b">
      <h3 className="text-lg font-medium text-gray-900">Recent Platform Activity</h3>
    </div>
    <div className="p-6">
      <div className="space-y-4">
        <ActivityItem
          icon="💳"
          title="New payment processed"
          description="₹999 payment for Online Workshop"
          time="2 minutes ago"
          color="green"
        />
        <ActivityItem
          icon="👤"
          title="New form admin registered"
          description="john@techcorp.com joined the platform"
          time="1 hour ago"
          color="blue"
        />
        <ActivityItem
          icon="💰"
          title="Commission collected"
          description="₹29.97 platform commission from recent transaction"
          time="3 hours ago"
          color="purple"
        />
      </div>
    </div>
  </div>
);

// Activity Item Component
interface ActivityItemProps {
  icon: string;
  title: string;
  description: string;
  time: string;
  color: 'green' | 'blue' | 'purple';
}

const ActivityItem: React.FC<ActivityItemProps> = ({ icon, title, description, time, color }) => {
  const colorClasses = {
    green: 'bg-green-100 text-green-600',
    blue: 'bg-blue-100 text-blue-600',
    purple: 'bg-purple-100 text-purple-600'
  };

  return (
    <div className="flex items-start space-x-3">
      <div className={`p-2 rounded-full ${colorClasses[color]}`}>
        {icon}
      </div>
      <div className="flex-1">
        <p className="font-medium text-gray-900">{title}</p>
        <p className="text-sm text-gray-600">{description}</p>
        <p className="text-xs text-gray-500 mt-1">{time}</p>
      </div>
    </div>
  );
};

// Placeholder components for Super Admin tabs
const FormAdminsManagement: React.FC = () => (
  <div className="bg-white shadow rounded-lg p-6">
    <h2 className="text-lg font-medium text-gray-900 mb-4">👥 Form Admins Management</h2>
    <p className="text-gray-600 mb-6">Manage all form administrators, approve new registrations, and monitor their activity.</p>
    
    <div className="space-y-4">
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-medium text-gray-900">Bhushan Agrawal</h4>
            <p className="text-sm text-gray-600">bhuvnagreens@gmail.com • BhuvnaGreens</p>
            <p className="text-xs text-gray-500">Joined: Jan 10, 2025</p>
          </div>
          <div className="flex items-center space-x-2">
            <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
              ✅ Active
            </span>
            <button className="text-blue-600 hover:text-blue-800 text-sm">Manage</button>
          </div>
        </div>
      </div>
      
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-medium text-gray-900">John Doe</h4>
            <p className="text-sm text-gray-600">john@techcorp.com • TechCorp</p>
            <p className="text-xs text-gray-500">Joined: Jan 5, 2025</p>
          </div>
          <div className="flex items-center space-x-2">
            <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
              ✅ Active
            </span>
            <button className="text-blue-600 hover:text-blue-800 text-sm">Manage</button>
          </div>
        </div>
      </div>
    </div>
  </div>
);

const AllTransactionsView: React.FC = () => {
  const allTransactions = getMockData('transactions');
  
  return (
    <div className="bg-white shadow rounded-lg">
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-lg font-medium text-gray-900">💳 All Platform Transactions</h2>
        <p className="text-sm text-gray-600">View and manage all transactions across the entire PayForm platform.</p>
      </div>
      
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Transaction ID
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Form Admin
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Customer
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Product
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Amount
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Platform Commission
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
            {allTransactions.map((transaction: any) => (
              <tr key={transaction.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                  {transaction.transaction_id?.substring(0, 15)}...
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {transaction.admin_id === 'f807a8c3-316b-4df0-90e7-5f7796c86f71' ? 'Bhushan A.' : 'John D.'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div>
                    <div className="text-sm font-medium text-gray-900">{transaction.customer_name}</div>
                    <div className="text-sm text-gray-500">{transaction.email}</div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {transaction.product_name}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  ₹{transaction.payment_amount?.toFixed(2)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 font-medium">
                  ₹{transaction.platform_commission?.toFixed(2)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                    transaction.payment_status === 'paid' 
                      ? 'bg-green-100 text-green-800' 
                      : transaction.payment_status === 'pending'
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {transaction.payment_status === 'paid' ? '✅ Paid' : 
                     transaction.payment_status === 'pending' ? '⏳ Pending' : '❌ Failed'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {new Date(transaction.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {/* Summary Footer */}
      <div className="px-6 py-4 bg-gray-50 border-t">
        <div className="flex justify-between items-center text-sm">
          <div className="text-gray-600">
            Total transactions: {allTransactions.length}
          </div>
          <div className="flex items-center space-x-6">
            <div className="text-gray-700">
              <span className="font-medium">Platform Revenue:</span> ₹{allTransactions
                .filter(t => t.payment_status === 'paid')
                .reduce((sum, t) => sum + (t.platform_commission || 0), 0)
                .toFixed(2)}
            </div>
            <div className="text-green-600 font-medium">
              <span>Total Processed:</span> ₹{allTransactions
                .filter(t => t.payment_status === 'paid')
                .reduce((sum, t) => sum + (t.payment_amount || 0), 0)
                .toFixed(2)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const RevenueAnalytics: React.FC = () => (
  <div className="space-y-6">
    <div className="bg-white shadow rounded-lg p-6">
      <h2 className="text-lg font-medium text-gray-900 mb-4">📈 Revenue Analytics</h2>
      <p className="text-gray-600 mb-6">Deep dive into platform revenue, growth metrics, and financial analytics.</p>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg p-6 text-white">
          <h3 className="text-lg font-semibold mb-2">Monthly Recurring Revenue</h3>
          <p className="text-3xl font-bold">₹38,940</p>
          <p className="text-blue-100 text-sm mt-1">+12% from last month</p>
        </div>
        
        <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-lg p-6 text-white">
          <h3 className="text-lg font-semibold mb-2">Transaction Volume</h3>
          <p className="text-3xl font-bold">1,298</p>
          <p className="text-green-100 text-sm mt-1">+8% from last month</p>
        </div>
        
        <div className="bg-gradient-to-r from-purple-500 to-purple-600 rounded-lg p-6 text-white">
          <h3 className="text-lg font-semibold mb-2">Average Order Value</h3>
          <p className="text-3xl font-bold">₹782</p>
          <p className="text-purple-100 text-sm mt-1">+3% from last month</p>
        </div>
      </div>
    </div>
    
    <div className="bg-white shadow rounded-lg p-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">Commission Breakdown</h3>
      <div className="space-y-3">
        <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
          <span className="text-gray-700">Total Platform Commission (3%)</span>
          <span className="font-semibold text-gray-900">₹38.94</span>
        </div>
        <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
          <span className="text-gray-700">Gateway Fees Collected</span>
          <span className="font-semibold text-gray-900">₹55.96</span>
        </div>
        <div className="flex justify-between items-center p-3 bg-green-50 rounded border-l-4 border-green-400">
          <span className="text-green-700 font-medium">Net Platform Revenue</span>
          <span className="font-bold text-green-900">₹38.94</span>
        </div>
      </div>
    </div>
  </div>
);

export default App;
