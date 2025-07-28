// netlify/functions/google-oauth-callback.js - OAuth Callback Handler
const { createClient } = require('@supabase/supabase-js');
const { google } = require('googleapis');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event, context) => {
  console.log('🔄 OAuth callback received');
  console.log('Query params:', event.queryStringParameters);

  try {
    const { code, state: adminId, error } = event.queryStringParameters || {};

    // Handle OAuth error
    if (error) {
      console.error('OAuth error:', error);
      return {
        statusCode: 302,
        headers: {
          Location: `${process.env.URL}/?auth=error&message=${encodeURIComponent(error)}`
        }
      };
    }

    // Handle missing code or admin ID
    if (!code || !adminId) {
      console.error('Missing code or admin ID');
      return {
        statusCode: 302,
        headers: {
          Location: `${process.env.URL}/?auth=error&message=Missing authorization code`
        }
      };
    }

    console.log(`🔐 Processing OAuth callback for admin: ${adminId}`);

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.URL}/.netlify/functions/google-oauth-callback`
    );

    // Exchange authorization code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    console.log('✅ Tokens received from Google');

// Store tokens in database
const { error: dbError } = await supabase
  .from('google_auth_tokens')
  .upsert({
    admin_id: adminId,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_expires_at: new Date(tokens.expiry_date).toISOString(),
    scope: tokens.scope,
    updated_at: new Date().toISOString()
  }, {
    onConflict: 'admin_id'
  });
    
    if (dbError) {
      console.error('Database error:', dbError);
      throw dbError;
    }

    console.log('✅ Tokens stored in database successfully');

    // Get user info to verify connection
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();

    console.log(`✅ Google account connected: ${userInfo.data.email}`);

    // Redirect back to PayForm with success
    return {
      statusCode: 302,
      headers: {
        Location: `${process.env.URL}/?auth=success&email=${encodeURIComponent(userInfo.data.email)}`
      }
    };

  } catch (error) {
    console.error('❌ OAuth callback error:', error);
    
    return {
      statusCode: 302,
      headers: {
        Location: `${process.env.URL}/?auth=error&message=${encodeURIComponent('Failed to connect Google account')}`
      }
    };
  }
};
