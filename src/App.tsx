import React, { useState } from 'react';
import './App.css';
import { StripeConfig } from './components/setup/StripeConfig';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'setup' | 'dashboard'>('setup');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-gray-900">PayForm</h1>
              <span className="ml-2 text-sm text-gray-500">Admin Dashboard</span>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            <button
              onClick={() => setActiveTab('setup')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'setup'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              🛠️ Setup Wizard
            </button>
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'dashboard'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              📊 Transaction Details
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {activeTab === 'setup' ? <SetupWizard /> : <TransactionDashboard />}
      </main>
    </div>
  );
};

// Enhanced Setup Wizard Component
const SetupWizard: React.FC = () => {
  const [activeStep, setActiveStep] = useState<'stripe' | 'razorpay' | 'discounts' | 'templates'>('stripe');

  const steps = [
    { id: 'stripe', label: 'Stripe Configuration', icon: '💳', component: StripeConfig },
    { id: 'razorpay', label: 'Razorpay Configuration', icon: '🏦', component: RazorpayPlaceholder },
    { id: 'discounts', label: 'Discount Coupons', icon: '🎫', component: DiscountPlaceholder },
    { id: 'templates', label: 'Message Templates', icon: '📧', component: TemplatePlaceholder }
  ];

  const activeStepData = steps.find(s => s.id === activeStep);
  const ActiveComponent = activeStepData?.component || StripeConfig;

  return (
    <div className="space-y-6">
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">Setup Wizard</h2>
          <p className="mt-1 text-sm text-gray-600">
            Configure your PayForm settings. Set up payment providers, discount coupons, and message templates.
          </p>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Left Side - Configuration Component */}
            <div className="lg:col-span-3">
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <ActiveComponent />
              </div>
            </div>

            {/* Right Side - Configuration Navigation */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">Configuration</h3>
              
              <div className="space-y-2">
                {steps.map((step) => (
                  <button
                    key={step.id}
                    onClick={() => setActiveStep(step.id as any)}
                    className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                      activeStep === step.id
                        ? 'bg-blue-50 border-blue-200 text-blue-700'
                        : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <span className="text-lg">{step.icon}</span>
                      <span className="font-medium">{step.label}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Placeholder components for other configurations
const RazorpayPlaceholder: React.FC = () => (
  <div className="text-center py-8">
    <div className="text-4xl mb-4">🏦</div>
    <h3 className="text-lg font-medium text-gray-900 mb-2">Razorpay Configuration</h3>
    <p className="text-gray-600">Coming soon! This will configure Razorpay for UPI payments.</p>
  </div>
);

const DiscountPlaceholder: React.FC = () => (
  <div className="text-center py-8">
    <div className="text-4xl mb-4">🎫</div>
    <h3 className="text-lg font-medium text-gray-900 mb-2">Discount Coupons</h3>
    <p className="text-gray-600">Coming soon! This will manage discount codes and promotions.</p>
  </div>
);

const TemplatePlaceholder: React.FC = () => (
  <div className="text-center py-8">
    <div className="text-4xl mb-4">📧</div>
    <h3 className="text-lg font-medium text-gray-900 mb-2">Message Templates</h3>
    <p className="text-gray-600">Coming soon! This will customize email templates and success messages.</p>
  </div>
);

// Transaction Dashboard Component (unchanged)
const TransactionDashboard: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* Dashboard Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Sales</p>
              <p className="text-2xl font-bold text-green-600">₹3,248.49</p>
            </div>
            <div className="text-green-500 text-2xl">💰</div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Transactions</p>
              <p className="text-2xl font-bold text-blue-600">12</p>
            </div>
            <div className="text-blue-500 text-2xl">📊</div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Completed</p>
              <p className="text-2xl font-bold text-green-600">8</p>
            </div>
            <div className="text-green-500 text-2xl">✅</div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Pending</p>
              <p className="text-2xl font-bold text-yellow-600">4</p>
            </div>
            <div className="text-yellow-500 text-2xl">⏳</div>
          </div>
        </div>
      </div>

      {/* Transaction Table */}
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
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
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
              <tr>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                  txn_1234567...
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  customer@example.com
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  ₹299.00
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                    Paid
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  2025-07-06
                </td>
              </tr>
              
              <tr>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                  txn_9876543...
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  user@test.com
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  ₹999.00
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                    Pending
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  2025-07-06
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default App;
