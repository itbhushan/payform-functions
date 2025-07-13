// src/App.tsx - Main Application with Authentication Routing
import React from 'react';
import './App.css';
import { AuthProvider, useAuth, ProtectedRoute } from './components/auth/AuthSystem';
import { SuperAdminDashboard } from './components/admin/SuperAdminDashboard';
import { FormAdminDashboard } from './components/admin/FormAdminDashboard';
import { RealDashboard } from './components/RealDashboard';
import { CashfreeConfig } from './components/setup/CashfreeConfig';

// Main App Router Component
const AppRouter: React.FC = () => {
  const { user } = useAuth();

  // Route based on user role
  if (user?.role === 'super_admin') {
    return (
      <ProtectedRoute requiredRole={['super_admin']}>
        <SuperAdminDashboard />
      </ProtectedRoute>
    );
  }

  if (user?.role === 'form_admin') {
    return (
      <ProtectedRoute requiredRole={['form_admin']}>
        <FormAdminDashboard />
      </ProtectedRoute>
    );
  }

  // Default: Show login form (
