// src/components/SetupWizard.tsx - Setup Wizard Component
import React, { useState } from 'react';
import { StripeConfig } from './setup/StripeConfig';
import { RazorpayConfig } from './setup/RazorpayConfig';
import { DiscountConfig } from './setup/DiscountConfig';
import { MessageTemplates } from './setup/MessageTemplates';

export const SetupWizard: React.FC = () => {
  const [activeStep, setActiveStep] = useState<'stripe' | 'razorpay' | 'discounts' | 'templates'>('stripe');

  const steps = [
    { id: 'stripe', label: 'Stripe Configuration', icon: '💳' },
    { id: 'razorpay', label: 'Razorpay Configuration', icon: '🏦' },
    { id: 'discounts', label: 'Discount Coupons', icon: '🎫' },
    { id: 'templates', label: 'Message Templates', icon: '📧' }
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">Setup Wizard</h2>
          <p className="mt-1 text-sm text-gray-600">
            Configure your PayForm settings using the sidebar on the right. Enter your payment 
            provider credentials and customize your form behavior.
          </p>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Left Side - Configuration Area */}
            <div className="lg:col-span-3">
              <div className="bg-gray-50 rounded-lg p-8 text-center">
                <div className="text-gray-400 text-lg mb-4">
                  {activeStep === 'stripe' && '💳'}
                  {activeStep === 'razorpay' && '🏦'}
                  {activeStep === 'discounts' && '🎫'}
                  {activeStep === 'templates' && '📧'}
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {steps.find(s => s.id === activeStep)?.label}
                </h3>
                <p className="text-gray-600">
                  This preview area would show your form configuration and preview in a real 
                  Google Forms Add-on environment.
                </p>
              </div>
            </div>

            {/* Right Side - Configuration Forms */}
            <div className="space-y-4">
              {/* Step Navigation */}
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

              {/* Configuration Forms */}
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                {activeStep === 'stripe' && <StripeConfig />}
                {activeStep === 'razorpay' && <RazorpayConfig />}
                {activeStep === 'discounts' && <DiscountConfig />}
                {activeStep === 'templates' && <MessageTemplates />}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
