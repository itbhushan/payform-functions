// src/components/RealDashboard.tsx - Dashboard with Real Data
import React, { useState, useEffect } from 'react';

interface DashboardStats {
  totalTransactions: number;
  paidCount: number;
  pendingCount: number;
  failedCount: number;
  totalRevenue: string;
  totalCommissions: string;
  totalNetEarnings: string;
  averageOrderValue: string;
  conversionRate: string;
}

interface Transaction {
  id: string;
  transactionId: string;
  email: string;
  productName: string;
  amount: string;
  commission: string;
  netAmount: string;
  status: string;
  paymentMethod: string;
  formattedDate: string;
  formattedTime: string;
}

interface DashboardData {
  stats: DashboardStats;
  transactions: Transaction[];
  commissions: any;
  adminId: string;
}

export const RealDashboard: React.FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchDashboardData();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchDashboardData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchDashboardData = async () => {
    try {
      if (!loading) setRefreshing(true);
      
      const response = await fetch('/.netlify/functions/dashboard-data?admin_id=f807a8c3-316b-4df0-90e7-5f7796c86f71');
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      setData(result);
      setError(null);
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch dashboard data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const exportTransactions = () => {
    if (!data?.transactions.length) return;

    const csvContent = [
      ['Transaction ID', 'Email', 'Product', 'Amount', 'Commission', 'Net Amount', 'Status', 'Date', 'Time'].join(','),
      ...data.transactions.map(t => [
        t.transactionId,
        t.email,
        `"${t.productName}"`,
        t.amount,
        t.commission,
        t.netAmount,
        t.status,
        t.formattedDate,
        t.formattedTime
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payform-transactions-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      paid: { bg: 'bg-green-100', text: 'text-green-800', icon: '✅', label: 'Paid' },
      pending: { bg: 'bg-yellow-100', text: 'text-yellow-800', icon: '⏳', label: 'Pending' },
      failed: { bg: 'bg-red-100', text: 'text-red-800', icon: '❌', label: 'Failed' }
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
    
    return (
      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
        <span className="mr-1">{config.icon}</span>
        {config.label}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading dashboard data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-center">
          <span className="text-red-500 text-xl mr-2">⚠️</span>
          <div>
            <h3 className="text-red-800 font-medium">Error Loading Dashboard</h3>
            <p className="text-red-600 text-sm">{error}</p>
            <button 
              onClick={fetchDashboardData}
              className="mt-2 text-red-600 hover:text-red-800 text-sm underline"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-600">No dashboard data available</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Refresh */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-medium text-gray-900">Live Dashboard</h2>
              <p className="mt-1 text-sm text-gray-600">
                Real-time view of your PayForm transactions and earnings
                {refreshing && <span className="ml-2 text-blue-600">• Refreshing...</span>}
              </p>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={fetchDashboardData}
                disabled={refreshing}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {refreshing ? '🔄' : '↻'} Refresh
              </button>
              <button
                onClick={exportTransactions}
                className="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                📥 Export CSV
              </button>
            </div>
          </div>
        </div>

        {/* Dashboard Stats */}
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Revenue */}
            <div className="bg-gradient-to-r from-green-400 to-green-600 p-6 rounded-lg text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-100">Total Revenue</p>
                  <p className="text-2xl font-bold">₹{data.stats.totalRevenue}</p>
                  <p className="text-green-100 text-sm">Your Earnings: ₹{data.stats.totalNetEarnings}</p>
                </div>
                <div className="text-green-200 text-3xl">💰</div>
              </div>
            </div>

            {/* Total Transactions */}
            <div className="bg-gradient-to-r from-blue-400 to-blue-600 p-6 rounded-lg text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-100">Total Transactions</p>
                  <p className="text-2xl font-bold">{data.stats.totalTransactions}</p>
                  <p className="text-blue-100 text-sm">Avg: ₹{data.stats.averageOrderValue}</p>
                </div>
                <div className="text-blue-200 text-3xl">📊</div>
              </div>
            </div>

            {/* Success Rate */}
            <div className="bg-gradient-to-r from-purple-400 to-purple-600 p-6 rounded-lg text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-purple-100">Success Rate</p>
                  <p className="text-2xl font-bold">{data.stats.conversionRate}%</p>
                  <p className="text-purple-100 text-sm">{data.stats.paidCount} of {data.stats.totalTransactions} paid</p>
                </div>
                <div className="text-purple-200 text-3xl">📈</div>
              </div>
            </div>

            {/* Platform Commissions */}
            <div className="bg-gradient-to-r from-orange-400 to-orange-600 p-6 rounded-lg text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-orange-100">Platform Fees</p>
                  <p className="text-2xl font-bold">₹{data.stats.totalCommissions}</p>
                  <p className="text-orange-100 text-sm">3% commission</p>
                </div>
                <div className="text-orange-200 text-3xl">🏢</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Status Summary */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Transaction Status Summary</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600">{data.stats.paidCount}</div>
            <div className="text-sm text-gray-600">Successful Payments</div>
          </div>
          <div className="text-center p-4 bg-yellow-50 rounded-lg">
            <div className="text-2xl font-bold text-yellow-600">{data.stats.pendingCount}</div>
            <div className="text-sm text-gray-600">Pending Payments</div>
          </div>
          <div className="text-center p-4 bg-red-50 rounded-lg">
            <div className="text-2xl font-bold text-red-600">{data.stats.failedCount}</div>
            <div className="text-sm text-gray-600">Failed Payments</div>
          </div>
        </div>
      </div>

      {/* Recent Transactions Table */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Recent Transactions</h3>
          <p className="text-sm text-gray-600">
            Showing {data.transactions.length} most recent transactions
          </p>
        </div>
        
        <div className="overflow-x-auto">
          {data.transactions.length > 0 ? (
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
                    Your Share
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
                {data.transactions.map((transaction) => (
                  <tr key={transaction.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                      {transaction.transactionId}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {transaction.email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {transaction.productName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      ₹{transaction.amount}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600">
                      ₹{transaction.netAmount}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(transaction.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div>{transaction.formattedDate}</div>
                      <div className="text-xs text-gray-500">{transaction.formattedTime}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-12">
              <div className="text-gray-400 text-4xl mb-4">💳</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Transactions Yet</h3>
              <p className="text-gray-600">
                Your transactions will appear here once customers start making payments through your forms.
              </p>
            </div>
          )}
        </div>
        
        {/* Footer with Summary */}
        {data.transactions.length > 0 && (
          <div className="px-6 py-4 bg-gray-50 border-t">
            <div className="flex justify-between items-center text-sm">
              <div className="text-gray-600">
                Total: {data.stats.totalTransactions} transactions • Success Rate: {data.stats.conversionRate}%
              </div>
              <div className="flex items-center space-x-6 text-gray-700">
                <div>
                  <span className="font-medium">Total Revenue:</span> ₹{data.stats.totalRevenue}
                </div>
                <div className="text-green-600 font-medium">
                  <span>Your Earnings:</span> ₹{data.stats.totalNetEarnings}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
