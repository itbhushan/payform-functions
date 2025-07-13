// src/components/admin/SuperAdminDashboard.tsx - Platform Owner Dashboard
import React, { useState, useEffect } from 'react';
import { useAuth, UserRoleBadge } from '../auth/AuthSystem';

interface PlatformStats {
  today_transactions: number;
  today_successful: number;
  today_revenue: number;
  today_commission: number;
  total_transactions: number;
  active_form_admins: number;
  total_revenue: number;
  total_commission: number;
  new_admins_30d: number;
  transactions_30d: number;
}

interface FormAdmin {
  id: string;
  email: string;
  name: string;
  company_name: string;
  total_transactions: number;
  successful_transactions: number;
  total_revenue: number;
  net_earnings: number;
  platform_fees_paid: number;
  is_active: boolean;
  created_at: string;
}

export const SuperAdminDashboard: React.FC = () => {
  const { user, signOut } = useAuth();
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [formAdmins, setFormAdmins] = useState<FormAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'admins' | 'transactions' | 'analytics'>('overview');

  useEffect(() => {
    fetchPlatformData();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchPlatformData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchPlatformData = async () => {
    try {
      const response = await fetch('/.netlify/functions/super-admin-data');
      const data = await response.json();
      
      setStats(data.stats);
      setFormAdmins(data.formAdmins);
    } catch (error) {
      console.error('Error fetching platform data:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleAdminStatus = async (adminId: string, isActive: boolean) => {
    try {
      const response = await fetch('/.netlify/functions/toggle-admin-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminId, isActive: !isActive })
      });

      if (response.ok) {
        await fetchPlatformData(); // Refresh data
      }
    } catch (error) {
      console.error('Error toggling admin status:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading platform data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-purple-900">👑 PayForm Super Admin</h1>
              <span className="ml-3 text-sm text-gray-500">Platform Management</span>
            </div>
            <div className="flex items-center space-x-4">
              <UserRoleBadge role={user?.role || 'super_admin'} />
              <div className="text-sm text-gray-700">
                Welcome, {user?.name || user?.email}
              </div>
              <button
                onClick={signOut}
                className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-lg text-sm"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            {[
              { id: 'overview', label: '📊 Platform Overview', icon: '📊' },
              { id: 'admins', label: '👥 Form Admins', icon: '👥' },
              { id: 'transactions', label: '💳 All Transactions', icon: '💳' },
              { id: 'analytics', label: '📈 Analytics', icon: '📈' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-purple-500 text-purple-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Platform Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Today's Revenue */}
              <div className="bg-gradient-to-r from-green-500 to-green-600 p-6 rounded-lg text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-green-100">Today's Revenue</p>
                    <p className="text-2xl font-bold">₹{stats?.today_revenue?.toFixed(2) || '0.00'}</p>
                    <p className="text-green-100 text-sm">Commission: ₹{stats?.today_commission?.toFixed(2) || '0.00'}</p>
                  </div>
                  <div className="text-green-200 text-3xl">💰</div>
                </div>
              </div>

              {/* Active Form Admins */}
              <div className="bg-gradient-to-r from-blue-500 to-blue-600 p-6 rounded-lg text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-blue-100">Active Form Admins</p>
                    <p className="text-2xl font-bold">{stats?.active_form_admins || 0}</p>
                    <p className="text-blue-100 text-sm">+{stats?.new_admins_30d || 0} this month</p>
                  </div>
                  <div className="text-blue-200 text-3xl">👥</div>
                </div>
              </div>

              {/* Total Platform Commission */}
              <div className="bg-gradient-to-r from-purple-500 to-purple-600 p-6 rounded-lg text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-purple-100">Total Commission</p>
                    <p className="text-2xl font-bold">₹{stats?.total_commission?.toFixed(2) || '0.00'}</p>
                    <p className="text-purple-100 text-sm">3% platform fee</p>
                  </div>
                  <div className="text-purple-200 text-3xl">🏢</div>
                </div>
              </div>

              {/* Total Transactions */}
              <div className="bg-gradient-to-r from-orange-500 to-orange-600 p-6 rounded-lg text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-orange-100">Total Transactions</p>
                    <p className="text-2xl font-bold">{stats?.total_transactions || 0}</p>
                    <p className="text-orange-100 text-sm">{stats?.transactions_30d || 0} last 30 days</p>
                  </div>
                  <div className="text-orange-200 text-3xl">📊</div>
                </div>
              </div>
            </div>

            {/* Revenue Breakdown */}
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Revenue Breakdown</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">₹{stats?.total_revenue?.toFixed(2) || '0.00'}</div>
                  <div className="text-sm text-gray-600">Total Platform Revenue</div>
                </div>
                <div className="text-center p-4 bg-purple-50 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">₹{stats?.total_commission?.toFixed(2) || '0.00'}</div>
                  <div className="text-sm text-gray-600">Your Commission (3%)</div>
                </div>
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">
                    ₹{((stats?.total_revenue || 0) - (stats?.total_commission || 0)).toFixed(2)}
                  </div>
                  <div className="text-sm text-gray-600">Form Admin Earnings</div>
                </div>
              </div>
            </div>

            {/* Top Performing Form Admins */}
            <div className="bg-white shadow rounded-lg">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">Top Performing Form Admins</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Form Admin
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Transactions
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Revenue Generated
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Commission Paid
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {formAdmins.slice(0, 5).map((admin) => (
                      <tr key={admin.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-medium text-gray-900">{admin.name || admin.email}</div>
                            <div className="text-sm text-gray-500">{admin.company_name}</div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <div className="font-medium">{admin.total_transactions}</div>
                          <div className="text-gray-500">{admin.successful_transactions} successful</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          ₹{admin.total_revenue?.toFixed(2) || '0.00'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600">
                          ₹{admin.platform_fees_paid?.toFixed(2) || '0.00'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            admin.is_active 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {admin.is_active ? '✅ Active' : '❌ Inactive'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'admins' && (
          <div className="bg-white shadow rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium text-gray-900">All Form Admins</h3>
                <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
                  + Add New Admin
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Admin Details
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Performance
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Earnings
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Commission Paid
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {formAdmins.map((admin) => (
                    <tr key={admin.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{admin.name || 'Unnamed'}</div>
                          <div className="text-sm text-gray-500">{admin.email}</div>
                          <div className="text-xs text-gray-400">{admin.company_name}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <div>Total: {admin.total_transactions}</div>
                        <div className="text-green-600">Success: {admin.successful_transactions}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        <div>Revenue: ₹{admin.total_revenue?.toFixed(2) || '0.00'}</div>
                        <div className="text-green-600">Net: ₹{admin.net_earnings?.toFixed(2) || '0.00'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-purple-600">
                        ₹{admin.platform_fees_paid?.toFixed(2) || '0.00'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button
                          onClick={() => toggleAdminStatus(admin.id, admin.is_active)}
                          className={`px-3 py-1 rounded text-xs font-medium ${
                            admin.is_active
                              ? 'bg-red-100 text-red-800 hover:bg-red-200'
                              : 'bg-green-100 text-green-800 hover:bg-green-200'
                          }`}
                        >
                          {admin.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'transactions' && (
          <div className="bg-white shadow rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">All Platform Transactions</h3>
              <p className="text-sm text-gray-600">Monitor all transactions across all form admins</p>
            </div>
            <div className="p-6">
              <div className="text-center text-gray-500">
                <div className="text-4xl mb-4">🔄</div>
                <p>All transactions view coming soon...</p>
                <p className="text-sm">This will show a comprehensive view of all platform transactions</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="space-y-6">
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Platform Analytics</h3>
              <div className="text-center text-gray-500">
                <div className="text-4xl mb-4">📊</div>
                <p>Advanced analytics dashboard coming soon...</p>
                <p className="text-sm">Revenue trends, growth metrics, user acquisition, etc.</p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
