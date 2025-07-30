// netlify/functions/google-oauth.js - OAuth Authentication Handler
const { createClient } = require('@supabase/supabase-js');
const { google } = require('googleapis');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// CORS headers
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json'
};

exports.handler = async (event, context) => {
  console.log('🔐 Google OAuth handler called');

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const { action, code, adminId } = JSON.parse(event.body || '{}');
    
    switch (action) {
      case 'getAuthUrl':
        return await generateAuthUrl(adminId);
      case 'exchangeCode':
        return await exchangeCodeForTokens(code, adminId);
      case 'refreshToken':
        return await refreshAccessToken(adminId);
      case 'checkAuth':
        return await checkAuthStatus(adminId);
      default:
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Invalid action' })
        };
    }
  } catch (error) {
    console.error('❌ OAuth handler error:', error);
    return {
      statusCode: 500,
      headers,  
      body: JSON.stringify({
        success: false,
        error: 'OAuth authentication failed',
        message: error.message
      })
    };
  }
};

// Generate Google OAuth URL
const generateAuthUrl = async (adminId) => {
  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.URL}/.netlify/functions/google-oauth-callback`
    );

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/forms.responses.readonly',
        'https://www.googleapis.com/auth/forms.body.readonly',
        'https://www.googleapis.com/auth/gmail.send'
      ],
      prompt: 'consent',
      state: adminId // Pass admin ID in state parameter
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        authUrl: authUrl
      })
    };

  } catch (error) {
    console.error('Error generating auth URL:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Failed to generate authentication URL'
      })
    };
  }
};

// Exchange authorization code for access tokens
const exchangeCodeForTokens = async (code, adminId) => {
  try {
    console.log(`🔄 Exchanging code for tokens for admin: ${adminId}`);

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.URL}/.netlify/functions/google-oauth-callback`
    );

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    console.log('✅ Tokens received from Google');

    // Store tokens in database
    const { error } = await supabase
      .from('google_auth_tokens')
      .upsert({
        admin_id: adminId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expires_at: new Date(tokens.expiry_date).toISOString(),
        scope: tokens.scope,
        updated_at: new Date().toISOString()
      });

    if (error) throw error;

    console.log('✅ Tokens stored in database');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Google account connected successfully',
        expiresAt: tokens.expiry_date
      })
    };

  } catch (error) {
    console.error('Error exchanging code for tokens:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Failed to connect Google account',
        details: error.message
      })
    };
  }
};

// Refresh expired access token
const refreshAccessToken = async (adminId) => {
  try {
    console.log(`🔄 Refreshing access token for admin: ${adminId}`);

    // Get stored tokens
    const { data: tokenData, error: fetchError } = await supabase
      .from('google_auth_tokens')
      .select('refresh_token')
      .eq('admin_id', adminId)
      .single();

    if (fetchError || !tokenData?.refresh_token) {
      throw new Error('No refresh token found');
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );

    oauth2Client.setCredentials({
      refresh_token: tokenData.refresh_token
    });

    // Refresh the access token
    const { credentials } = await oauth2Client.refreshAccessToken();
    console.log('✅ Access token refreshed');

    // Update stored tokens
    const { error: updateError } = await supabase
      .from('google_auth_tokens')
      .update({
        access_token: credentials.access_token,
        token_expires_at: new Date(credentials.expiry_date).toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('admin_id', adminId);

    if (updateError) throw updateError;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Access token refreshed successfully'
      })
    };

  } catch (error) {
    console.error('Error refreshing access token:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Failed to refresh access token',
        requiresReauth: true
      })
    };
  }
};

// Check current authentication status
const checkAuthStatus = async (adminId) => {
  try {
    const { data: tokenData } = await supabase
      .from('google_auth_tokens')
      .select('access_token, token_expires_at')
      .eq('admin_id', adminId)
      .single();

    if (!tokenData) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          authenticated: false,
          message: 'No Google authentication found'
        })
      };
    }

    const expiresAt = new Date(tokenData.token_expires_at);
    const now = new Date();
    const isExpired = expiresAt <= now;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        authenticated: !isExpired,
        expiresAt: tokenData.token_expires_at,
        needsRefresh: isExpired
      })
    };

  } catch (error) {
    console.error('Error checking auth status:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Failed to check authentication status'
      })
    };
  }
};
