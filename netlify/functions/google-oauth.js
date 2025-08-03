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

// Main handler
exports.handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    console.log('🔐 Google OAuth handler called');
    
    const { action, adminId, code } = JSON.parse(event.body || '{}');

    switch (action) {
      case 'getAuthUrl':
        return await generateAuthUrl(adminId);
      case 'exchangeCode':
        return await exchangeCodeForTokens(code, adminId);
      case 'refreshToken':
        return await refreshAccessToken(adminId);
      case 'checkAuth':
        return await checkAuthStatus(adminId);
      case 'revokeAccess':
        return await revokeGoogleAccess(adminId);
      case 'getUserInfo':
        return await getUserInfo(adminId);
      case 'forceUpdateEmail':
        return await forceUpdateUserEmail(adminId);
      default:
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Invalid action' })
        };
    }

  } catch (error) {
    console.error('OAuth handler error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};

// Force update user email for existing tokens
const forceUpdateUserEmail = async (adminId) => {
  try {
    console.log(`🔄 Force updating user email for admin: ${adminId}`);

    // Get current token
    const { data: tokenData, error: fetchError } = await supabase
      .from('google_auth_tokens')
      .select('access_token, refresh_token')
      .eq('admin_id', adminId)
      .single();

    if (fetchError || !tokenData) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'No tokens found'
        })
      };
    }

    // Try with current token first
    let userEmail = null;
    try {
      const userInfoResponse = await fetch(`https://www.googleapis.com/oauth2/v2/userinfo?access_token=${tokenData.access_token}`);
      
      if (userInfoResponse.ok) {
        const userInfo = await userInfoResponse.json();
        userEmail = userInfo.email;
        console.log('✅ Got email with current token:', userEmail);
      } else if (userInfoResponse.status === 401 && tokenData.refresh_token) {
        // Token expired, try refresh
        console.log('🔄 Token expired, refreshing...');
        
        const oauth2Client = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET,
          `${process.env.URL}/.netlify/functions/google-oauth-callback`
        );

        oauth2Client.setCredentials({
          refresh_token: tokenData.refresh_token
        });

        const { credentials } = await oauth2Client.refreshAccessToken();
        
        // Try again with new token
        const retryResponse = await fetch(`https://www.googleapis.com/oauth2/v2/userinfo?access_token=${credentials.access_token}`);
        
        if (retryResponse.ok) {
          const userInfo = await retryResponse.json();
          userEmail = userInfo.email;
          console.log('✅ Got email with refreshed token:', userEmail);
          
          // Update database with new token and email
          await supabase
            .from('google_auth_tokens')
            .update({
              access_token: credentials.access_token,
              token_expires_at: new Date(credentials.expiry_date).toISOString(),
              user_email: userEmail,
              updated_at: new Date().toISOString()
            })
            .eq('admin_id', adminId);
        }
      }
    } catch (apiError) {
      console.error('❌ API error:', apiError);
    }

    if (userEmail) {
      // Update just the email if we didn't update above
      if (!tokenData.refresh_token) {
        await supabase
          .from('google_auth_tokens')
          .update({ user_email: userEmail })
          .eq('admin_id', adminId);
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          email: userEmail,
          message: 'Email updated successfully'
        })
      };
    } else {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Could not fetch email'
        })
      };
    }

  } catch (error) {
    console.error('❌ Error force updating email:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Failed to update email'
      })
    };
  }

// Generate Google OAuth URL
const generateAuthUrl = async (adminId) => {
  try {
    console.log(`🔗 Generating auth URL for admin: ${adminId}`);

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.URL}/.netlify/functions/google-oauth-callback`
    );

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      state: adminId,
      scope: [
        'https://www.googleapis.com/auth/forms.responses.readonly',
        'https://www.googleapis.com/auth/forms.body.readonly',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile'
      ],
    });

    console.log('✅ Auth URL generated successfully');

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
        error: 'Failed to generate auth URL'
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

    // Get user info during token exchange
    let userEmail = null;
    try {
      console.log('🔍 Fetching user info during OAuth...');
      const userInfoResponse = await fetch(`https://www.googleapis.com/oauth2/v2/userinfo?access_token=${tokens.access_token}`);
      
      if (userInfoResponse.ok) {
        const userInfo = await userInfoResponse.json();
        userEmail = userInfo.email;
        console.log('✅ Got user info during OAuth:', { email: userEmail });
      } else {
        console.log('⚠️ Could not fetch user info, status:', userInfoResponse.status);
      }
    } catch (emailFetchError) {
      console.log('⚠️ Could not fetch user email during OAuth:', emailFetchError.message);
    }

    // Store tokens in database with user info
    const { error: insertError } = await supabase
      .from('google_auth_tokens')
      .upsert({
        admin_id: adminId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expires_at: new Date(tokens.expiry_date).toISOString(),
        scope: tokens.scope,
        user_email: userEmail,
        updated_at: new Date().toISOString()
      });

    if (insertError) {
      console.error('❌ Database error:', insertError);
      throw insertError;
    }

    console.log('✅ Tokens and user info stored in database');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Google account connected successfully',
        email: userEmail,
        expiresAt: tokens.expiry_date
      })
    };

  } catch (functionError) {
    console.error('Error exchanging code for tokens:', functionError);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Failed to connect Google account',
        details: functionError.message
      })
    };
  }
};

// Refresh access token using refresh token
const refreshAccessToken = async (adminId) => {
  try {
    console.log(`🔄 Refreshing token for admin: ${adminId}`);

    // Get refresh token from database
    const { data: tokenData, error: fetchError } = await supabase
      .from('google_auth_tokens')
      .select('refresh_token')
      .eq('admin_id', adminId)
      .single();

    if (fetchError || !tokenData?.refresh_token) {
      console.log('❌ No refresh token found');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'No refresh token available'
        })
      };
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.URL}/.netlify/functions/google-oauth-callback`
    );

    oauth2Client.setCredentials({
      refresh_token: tokenData.refresh_token
    });

    // Refresh the token
    const { credentials } = await oauth2Client.refreshAccessToken();
    console.log('✅ Token refreshed successfully');

    // Update database with new token
    const { error: updateError } = await supabase
      .from('google_auth_tokens')
      .update({
        access_token: credentials.access_token,
        token_expires_at: new Date(credentials.expiry_date).toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('admin_id', adminId);

    if (updateError) throw updateError;

    console.log('✅ New token stored in database');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Token refreshed successfully',
        expiresAt: credentials.expiry_date
      })
    };

  } catch (refreshError) {
    console.error('Error refreshing token:', refreshError);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Failed to refresh token',
        details: refreshError.message
      })
    };
  }
};

// Check authentication status
const checkAuthStatus = async (adminId) => {
  try {
    console.log(`🔐 Checking auth for admin: ${adminId}`);

    const { data: tokenData, error: fetchError } = await supabase
      .from('google_auth_tokens')
      .select('access_token, token_expires_at, user_email')
      .eq('admin_id', adminId)
      .single();

    if (fetchError || !tokenData) {
      console.log('❌ No auth tokens found');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          authenticated: false,
          message: 'No authentication found'
        })
      };
    }

    console.log('✅ Found auth tokens for admin', adminId);

    // Check if token is expired
    const now = new Date();
    const expiresAt = new Date(tokenData.token_expires_at);

    if (now >= expiresAt) {
      console.log('⚠️ Token expired, attempting refresh...');
      const refreshResult = await refreshAccessToken(adminId);
      const refreshData = JSON.parse(refreshResult.body);
      
      if (refreshData.success) {
        console.log('✅ Token refreshed successfully');
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            authenticated: true,
            email: tokenData.user_email,
            message: 'Authenticated (token refreshed)'
          })
        };
      } else {
        console.log('❌ Token refresh failed');
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            authenticated: false,
            message: 'Token expired and refresh failed'
          })
        };
      }
    }

    console.log('🕐 Token expires at:', expiresAt.toISOString());

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        authenticated: true,
        email: tokenData.user_email,
        expiresAt: expiresAt.toISOString(),
        message: 'Authenticated'
      })
    };

  } catch (authError) {
    console.error('Error checking auth status:', authError);
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

// Revoke Google access tokens
const revokeGoogleAccess = async (adminId) => {
  try {
    console.log(`🚪 Revoking Google access for admin: ${adminId}`);

    // Get stored tokens to revoke
    const { data: tokenData, error: fetchError } = await supabase
      .from('google_auth_tokens')
      .select('access_token, refresh_token')
      .eq('admin_id', adminId)
      .single();

    console.log('🔍 Token data found:', !!tokenData);

    if (tokenData?.access_token) {
      // Revoke the access token with Google
      try {
        const revokeResponse = await fetch(`https://oauth2.googleapis.com/revoke?token=${tokenData.access_token}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        console.log('🔍 Google token revocation status:', revokeResponse.status);
      } catch (revokeError) {
        console.log('⚠️ Token revocation failed (might already be invalid):', revokeError);
      }
    }

    // Delete tokens from database
    const { error: deleteError } = await supabase
      .from('google_auth_tokens')
      .delete()
      .eq('admin_id', adminId);

    if (deleteError) {
      console.error('❌ Database deletion error:', deleteError);
      throw deleteError;
    }

    console.log('✅ Google auth tokens removed from database');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Google account disconnected successfully'
      })
    };

  } catch (error) {
    console.error('❌ Error revoking Google access:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Failed to disconnect Google account',
        details: error.message
      })
    };
  }
};

// Get user info from stored data or Google API
const getUserInfo = async (adminId) => {
  try {
    console.log(`🔍 Getting user info for admin: ${adminId}`);

    // Get stored tokens and user info
    const { data: tokenData, error: fetchError } = await supabase
      .from('google_auth_tokens')
      .select('access_token, user_email')
      .eq('admin_id', adminId)
      .single();

    console.log('🔍 Token data:', { 
      hasToken: !!tokenData?.access_token, 
      userEmail: tokenData?.user_email,
      error: fetchError?.message 
    });

    if (fetchError || !tokenData) {
      console.error('❌ No token data found');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'No authentication data found'
        })
      };
    }

    // If we have stored email, use it
    if (tokenData.user_email) {
      console.log('✅ Using stored email:', tokenData.user_email);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          email: tokenData.user_email
        })
      };
    }

    // Fallback: Try Google API call if no stored email
    if (tokenData.access_token) {
      try {
        console.log('🔄 Trying Google API fallback...');
        
        const userInfoResponse = await fetch(`https://www.googleapis.com/oauth2/v2/userinfo?access_token=${tokenData.access_token}`);
        
        if (userInfoResponse.ok) {
          const userInfo = await userInfoResponse.json();
          console.log('✅ Got user info from Google API:', userInfo.email);
          
          // Store the email for future use
          await supabase
            .from('google_auth_tokens')
            .update({ 
              user_email: userInfo.email
            })
            .eq('admin_id', adminId);
          
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              success: true,
              email: userInfo.email
            })
          };
        } else {
          console.error('❌ Google API failed:', userInfoResponse.status);
        }
      } catch (apiError) {
        console.error('❌ Google API error:', apiError.message);
      }
    }

    // Final fallback: return success but no email
    console.log('⚠️ Using fallback - no email available');
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        email: null
      })
    };

  } catch (error) {
    console.error('❌ Error in getUserInfo:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Failed to get user info'
      })
    };
  }
};
