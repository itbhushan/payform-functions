// src/components/TransactionDashboard.tsx - Transaction Dashboard Component
import React, { useState, useEffect } from 'react';
import { DashboardStats } from './dashboard/DashboardStats';
import { TransactionTable } from './dashboard/TransactionTable';
import { ExportTools } from './dashboard/ExportTools';

interface DashboardData {
  totalSales: number;
  totalTransactions: number;
  paidTransactions: number;
  pendingTransactions: number;
  transactions: any[];
}

export const TransactionDashboard: React.FC = () => {
  const [data, setData] = useState<DashboardData>({
    totalSales: 0,
    totalTransactions: 0,
    paidTransactions: 0,
    pendingTransactions: 0,
    transactions: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      // This will call our Netlify function
      const response = await fetch('/.netlify/functions/dashboard-data');
      const result = await response.json();
      setData(result);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
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

  return (
    <div className="space-y-6">
      {/* Dashboard Header */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-medium text-gray-900">Dashboard Overview</h2>
              <p className="mt-1 text-sm text-gray-600">
                Monitor your PayForm transactions and sales performance. View recent transactions 
                and export data as needed.
              </p>
            </div>
            <ExportTools />
          </div>
        </div>

        <div className="p-6">
          <DashboardStats data={data} />
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Recent Transactions</h3>
        </div>
        <TransactionTable transactions={data.transactions} onRefresh={fetchDashboardData} />
      </div>
    </div>
  );
};
