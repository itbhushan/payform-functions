// src/components/DebugDashboard.tsx
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

interface DebugInfo {
  session?: any;
  sessionError?: any;
  user?: any;
  dbConnection?: string;
  dbError?: any;
  dbConnectionError?: string;
  adminRecord?: any;
  adminError?: any;
  adminQueryError?: string;
  totalTransactions?: number;
  transactionsError?: any;
  transactionsQueryError?: string;
  userTransactions?: any[];
  userTransactionsError?: any;
  userTransactionsQueryError?: string;
  dashboardEndpoint?: any;
  dashboardEndpointStatus?: number;
  dashboardEndpointError?: string;
  supabaseUrl?: string;
  supabaseKey?: string;
  generalError?: string;
  errorDetails?: any;
}

const DebugDashboard: React.FC = () => {
  const [debugInfo, setDebugInfo] = useState<DebugInfo>({});
  const [loading, setLoading] = useState(true);
  const { user, signOut } = useAuth();

  useEffect(() => {
    debugDashboardData();
  }, []);

  const debugDashboardData = async () => {
    try {
      setLoading(true);
      const debug: DebugInfo = {};

      // 1. Check authentication state
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      debug.session = session;
      debug.sessionError = sessionError;
      debug.user = session?.user;

      // 2. Test basic database connection
      try {
        const { data: testData, error: testError } = await supabase
          .from('form_admins')
          .select('count')
          .limit(1);
        debug.dbConnection = testData ? 'Connected' : 'Failed';
        debug.dbError = testError;
      } catch (err: any) {
        debug.dbConnection = 'Failed';
        debug.dbConnectionError = err.message;
      }

      // 3. Check if user exists in form_admins table
      if (session?.user) {
        try {
          const { data: adminData, error: adminError } = await supabase
            .from('form_admins')
            .select('*')
            .eq('email', session.user.email)
            .single();
          
          debug.adminRecord = adminData;
          debug.adminError = adminError;
        } catch (err: any) {
          debug.adminQueryError = err.message;
        }
      }

      // 4. Check total transactions
      try {
        const { data: transactionsData, error: transactionsError } = await supabase
          .from('transactions')
          .select('count');
        
        debug.totalTransactions = transactionsData?.length || 0;
        debug.transactionsError = transactionsError;
      } catch (err: any) {
        debug.transactionsQueryError = err.message;
      }

      // 5. Check specific user transactions
      if (session?.user) {
        try {
          const { data: userTransactions, error: userTransError } = await supabase
            .from('transactions')
            .select('*')
            .eq('admin_id', session.user.id)
            .limit(5);
          
          debug.userTransactions = userTransactions;
          debug.userTransactionsError = userTransError;
        } catch (err: any) {
          debug.userTransactionsQueryError = err.message;
        }
      }

      // 6. Test the dashboard function endpoint
      try {
        const response = await fetch('/.netlify/functions/dashboard-data');
        const dashboardData = await response.json();
        debug.dashboardEndpoint = dashboardData;
        debug.dashboardEndpointStatus = response.status;
      } catch (err: any) {
        debug.dashboardEndpointError = err.message;
      }

      // 7. Check environment variables
      debug.supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'Missing';
      debug.supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY ? 'Present' : 'Missing';

      setDebugInfo(debug);

    } catch (error: any) {
      setDebugInfo({ 
        generalError: error.message,
        errorDetails: error
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Debugging dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">🔍 PayForm Dashboard Debug</h1>
          
          {/* Authentication Status */}
          <div className="mb-6 p-4 border rounded-lg">
            <h2 className="text-lg font-semibold mb-3 text-blue-600">1. Authentication Status</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p><strong>Session:</strong> {debugInfo.session ? '✅ Active' : '❌ None'}</p>
                <p><strong>User Email:</strong> {debugInfo.user?.email || 'None'}</p>
                <p><strong>User ID:</strong> {debugInfo.user?.id || 'None'}</p>
                <p><strong>User Role:</strong> {debugInfo.user?.user_metadata?.role || 'Not set'}</p>
              </div>
              <div>
                <p><strong>Session Error:</strong> {debugInfo.sessionError ? '❌ ' + debugInfo.sessionError.message : '✅ None'}</p>
                <p><strong>Auth Provider:</strong> {debugInfo.user?.app_metadata?.provider || 'Unknown'}</p>
              </div>
            </div>
          </div>

          {/* Database Connection */}
          <div className="mb-6 p-4 border rounded-lg">
            <h2 className="text-lg font-semibold mb-3 text-green-600">2. Database Connection</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p><strong>Connection:</strong> {debugInfo.dbConnection === 'Connected' ? '✅ Connected' : '❌ Failed'}</p>
                <p><strong>Supabase URL:</strong> {debugInfo.supabaseUrl}</p>
                <p><strong>API Key:</strong> {debugInfo.supabaseKey}</p>
              </div>
              <div>
                <p><strong>DB Error:</strong> {debugInfo.dbError ? '❌ ' + debugInfo.dbError.message : '✅ None'}</p>
                <p><strong>Connection Error:</strong> {debugInfo.dbConnectionError || '✅ None'}</p>
              </div>
            </div>
          </div>

          {/* User Record */}
          <div className="mb-6 p-4 border rounded-lg">
            <h2 className="text-lg font-semibold mb-3 text-purple-600">3. Form Admin Record</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p><strong>Admin Record:</strong> {debugInfo.adminRecord ? '✅ Found' : '❌ Missing'}</p>
                {debugInfo.adminRecord && (
                  <>
                    <p><strong>Admin ID:</strong> {debugInfo.adminRecord.id}</p>
                    <p><strong>Name:</strong> {debugInfo.adminRecord.name || 'Not set'}</p>
                    <p><strong>Active:</strong> {debugInfo.adminRecord.is_active ? '✅ Yes' : '❌ No'}</p>
                  </>
                )}
              </div>
              <div>
                <p><strong>Admin Error:</strong> {debugInfo.adminError ? '❌ ' + debugInfo.adminError.message : '✅ None'}</p>
                <p><strong>Query Error:</strong> {debugInfo.adminQueryError || '✅ None'}</p>
              </div>
            </div>
          </div>

          {/* Transactions Data */}
          <div className="mb-6 p-4 border rounded-lg">
            <h2 className="text-lg font-semibold mb-3 text-orange-600">4. Transactions Data</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p><strong>Total Transactions:</strong> {debugInfo.totalTransactions || 0}</p>
                <p><strong>User Transactions:</strong> {debugInfo.userTransactions?.length || 0}</p>
                {debugInfo.userTransactions && debugInfo.userTransactions.length > 0 && (
                  <p><strong>Latest Transaction:</strong> {debugInfo.userTransactions[0].product_name}</p>
                )}
              </div>
              <div>
                <p><strong>Transactions Error:</strong> {debugInfo.transactionsError ? '❌ ' + debugInfo.transactionsError.message : '✅ None'}</p>
                <p><strong>User Trans Error:</strong> {debugInfo.userTransactionsError ? '❌ ' + debugInfo.userTransactionsError.message : '✅ None'}</p>
              </div>
            </div>
          </div>

          {/* Dashboard Endpoint */}
          <div className="mb-6 p-4 border rounded-lg">
            <h2 className="text-lg font-semibold mb-3 text-red-600">5. Dashboard Endpoint</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p><strong>Endpoint Status:</strong> {debugInfo.dashboardEndpointStatus || 'Not tested'}</p>
                {debugInfo.dashboardEndpoint && (
                  <p><strong>Endpoint Data:</strong> {JSON.stringify(debugInfo.dashboardEndpoint).substring(0, 100)}...</p>
                )}
              </div>
              <div>
                <p><strong>Endpoint Error:</strong> {debugInfo.dashboardEndpointError || '✅ None'}</p>
              </div>
            </div>
          </div>

          {/* Raw Debug Data */}
          <div className="mb-6 p-4 border rounded-lg bg-gray-50">
            <h2 className="text-lg font-semibold mb-3 text-gray-600">6. Raw Debug Data</h2>
            <pre className="text-xs overflow-auto max-h-96 bg-white p-3 rounded border">
              {JSON.stringify(debugInfo, null, 2)}
            </pre>
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-4">
            <button
              onClick={debugDashboardData}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
            >
              🔄 Refresh Debug
            </button>
            
            <button
              onClick={() => window.open('https://app.supabase.com/project/ofzhgpjqmtngrpnltegl/editor/form_admins', '_blank')}
              className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700"
            >
              📊 Open Supabase
            </button>

            <button
              onClick={signOut}
              className="bg-red-600 text-white px-6 py-2 rounded-lg hover:bg-red-700"
            >
              🚪 Sign Out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DebugDashboard;
