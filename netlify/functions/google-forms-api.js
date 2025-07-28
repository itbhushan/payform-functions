// netlify/functions/google-forms-api.js - UPDATED VERSION (Database Credentials)
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

// Initialize Google API client with credentials from database
const initGoogleAuth = async () => {
  try {
    console.log('🔐 Loading Google service account credentials from database...');
    
    // Get credentials from Supabase
    const { data: credData, error } = await supabase
      .from('google_service_credentials')
      .select('service_account_json')
      .eq('is_active', true)
      .single();

    if (error || !credData) {
      throw new Error('No Google service account credentials found in database');
    }

    const serviceAccountKey = credData.service_account_json;
    console.log('✅ Service account credentials loaded from database');

    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccountKey,
      scopes: [
        'https://www.googleapis.com/auth/forms.responses.readonly',
        'https://www.googleapis.com/auth/forms.body.readonly'
      ]
    });

    return auth;
  } catch (error) {
    console.error('❌ Error initializing Google Auth:', error);
    throw new Error('Failed to initialize Google API authentication: ' + error.message);
  }
};

exports.handler = async (event, context) => {
  console.log('🚀 Google Forms API function called');
  console.log('Action:', JSON.parse(event.body || '{}').action);

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const requestBody = JSON.parse(event.body || '{}');
    const { action, formId, adminId, accessToken } = requestBody;

    // 🐛 DEBUG: Log all received parameters
    console.log('🔍 Received parameters:', { action, formId, adminId, accessToken });
    console.log('🔍 Full request body:', requestBody);
    
switch (action) {
  case 'getFormStructure':
    return await getFormStructure(formId, adminId);  // Pass adminId, not accessToken
  case 'getFormResponses':
    return await getFormResponses(formId, adminId);
  case 'testFormAccess':
    return await testFormAccess(formId, adminId);    // Pass adminId, not accessToken
  case 'generateAuthUrl':
    return await generateAuthUrl();
  
  default:
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ 
            error: 'Invalid action', 
            availableActions: ['getFormStructure', 'getFormResponses', 'testFormAccess', 'generateAuthUrl'] 
          })
        };
    }
  } catch (error) {
    console.error('❌ Google Forms API error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        success: false,
        error: 'Internal server error',
        message: error.message 
      })
    };
  }
};

// Generate OAuth URL for user authentication
const generateAuthUrl = async () => {
  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      'https://payform2025.netlify.app/auth/callback'
    );

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/forms.responses.readonly',
        'https://www.googleapis.com/auth/forms.body.readonly'
      ],
      prompt: 'consent'
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

// Get Google Form structure using USER'S OAuth token
const getFormStructure = async (formId, adminId) => {
  try {
    console.log(`🔍 Analyzing form structure for: ${formId}`);
    console.log(`👤 Admin requesting access: ${adminId}`);

    // ✅ PROPER FIX: Get user's OAuth token from database
    let authClient;
    
    if (adminId) {
      console.log('🔐 Looking up user OAuth token...');
      
      // Get stored access token for this admin
      const { data: adminTokens, error: tokenError } = await supabase
        .from('google_auth_tokens')
        .select('access_token, refresh_token, token_expires_at')
        .eq('admin_id', adminId)
        .single();

      if (tokenError || !adminTokens) {
        console.error('❌ No OAuth token found for admin:', adminId);
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ 
            success: false, 
            error: 'No Google authentication found. Please reconnect your Google account.',
            requiresAuth: true
          })
        };
      }

      // Check if token is expired
      const now = new Date();
      const expiresAt = new Date(adminTokens.token_expires_at);
      
      if (expiresAt <= now) {
        console.warn('⚠️ Access token expired, attempting refresh...');
        
        // Try to refresh the token
        const oauth2Client = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET
        );
        
        oauth2Client.setCredentials({
          refresh_token: adminTokens.refresh_token
        });
        
        try {
          const { credentials } = await oauth2Client.refreshAccessToken();
          console.log('✅ Token refreshed successfully');
          
          // Update token in database
          await supabase
            .from('google_auth_tokens')
            .update({
              access_token: credentials.access_token,
              token_expires_at: new Date(credentials.expiry_date).toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('admin_id', adminId);
          
          authClient = oauth2Client;
        } catch (refreshError) {
          console.error('❌ Token refresh failed:', refreshError);
          return {
            statusCode: 401,
            headers,
            body: JSON.stringify({ 
              success: false, 
              error: 'Google authentication expired. Please reconnect your Google account.',
              requiresAuth: true
            })
          };
        }
      } else {
        console.log('✅ Using valid OAuth token');
        authClient = new google.auth.OAuth2();
        authClient.setCredentials({ access_token: adminTokens.access_token });
      }
    } else {
      console.error('❌ No admin ID provided');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          success: false, 
          error: 'Admin ID required for form access'
        })
      };
    }

    console.log('🌐 Making Google Forms API request...');
    const forms = google.forms({ version: 'v1', auth: authClient });

    // Fetch form structure with user's OAuth token
    const response = await forms.forms.get({
      formId: formId
    });

    const form = response.data;
    console.log(`✅ Form fetched successfully: ${form.info?.title}`);

    // Parse form questions
    const questions = [];
    if (form.items) {
      form.items.forEach((item, index) => {
        if (item.questionItem) {
          const question = item.questionItem.question;
          questions.push({
            questionId: `entry.${item.itemId || index}`,
            title: item.title || `Question ${index + 1}`,
            type: question.choiceQuestion ? 'MULTIPLE_CHOICE' : 
                  question.textQuestion ? 'SHORT_ANSWER' : 
                  question.scaleQuestion ? 'SCALE' : 'OTHER',
            required: question.required || false,
            description: item.description || '',
            choices: question.choiceQuestion?.options?.map(opt => opt.value) || []
          });
        }
      });
    }

    const formStructure = {
      formId: formId,
      title: form.info?.title || 'Untitled Form',
      description: form.info?.description || '',
      questions: questions
    };

    console.log(`📊 Successfully parsed ${questions.length} questions from form`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        data: formStructure
      })
    };

  } catch (error) {
    console.error('❌ Error getting form structure:', error);
    
    // Handle specific API errors
    if (error.code === 403) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ 
          success: false, 
          error: 'Access denied. Please ensure you have permission to access this form.',
          requiresAuth: true
        })
      };
    }

    if (error.code === 404) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ 
          success: false, 
          error: 'Form not found. Please check the form URL and ensure the form exists.' 
        })
      };
    }

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        success: false, 
        error: 'Failed to analyze form structure',
        details: error.message
      })
    };
  }
};

// Get form responses using real API
const getFormResponses = async (formId, adminId) => {
  try {
    console.log(`📥 Fetching responses for form: ${formId}`);

    // Get stored access token for this admin
    const { data: adminTokens } = await supabase
      .from('google_auth_tokens')
      .select('access_token, refresh_token')
      .eq('admin_id', adminId)
      .single();

    if (!adminTokens) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ 
          success: false, 
          error: 'No Google authentication found. Please connect your Google account.',
          requiresAuth: true
        })
      };
    }

    // Initialize API client with stored token
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    
    oauth2Client.setCredentials({
      access_token: adminTokens.access_token,
      refresh_token: adminTokens.refresh_token
    });

    const forms = google.forms({ version: 'v1', auth: oauth2Client });

    // Get form responses
    const response = await forms.forms.responses.list({
      formId: formId
    });

    const responses = response.data.responses || [];
    console.log(`📊 Found ${responses.length} total responses`);

    // Filter for unprocessed responses
    const processedResponseIds = await getProcessedResponseIds(formId);
    const newResponses = responses.filter(r => !processedResponseIds.includes(r.responseId));

    console.log(`🆕 Found ${newResponses.length} new responses to process`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        data: {
          responses: newResponses,
          hasNewResponses: newResponses.length > 0,
          totalResponses: responses.length,
          newResponsesCount: newResponses.length
        }
      })
    };

  } catch (error) {
    console.error('❌ Error getting form responses:', error);
    
    if (error.code === 401) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ 
          success: false, 
          error: 'Authentication expired. Please reconnect your Google account.',
          requiresAuth: true
        })
      };
    }

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        success: false, 
        error: 'Failed to get form responses',
        details: error.message
      })
    };
  }
};

// Test form access using user's OAuth token
const testFormAccess = async (formId, adminId) => {
  // Add debug logging to see what parameters are actually received
  console.log('🔍 testFormAccess called with:', { formId, adminId });
  try {
    console.log(`🔐 Testing access to form: ${formId} for admin: ${adminId}`);

    if (!adminId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          success: false, 
          error: 'Admin ID required for form access test'
        })
      };
    }

    // Get user's OAuth token and test access
    const { data: adminTokens } = await supabase
      .from('google_auth_tokens')
      .select('access_token')
      .eq('admin_id', adminId)
      .single();

    if (!adminTokens) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ 
          success: false, 
          error: 'No Google authentication found. Please connect your Google account.',
          requiresAuth: true
        })
      };
    }

    const authClient = new google.auth.OAuth2();
    authClient.setCredentials({ access_token: adminTokens.access_token });

    const forms = google.forms({ version: 'v1', auth: authClient });

    // Try to get basic form info
    const response = await forms.forms.get({
      formId: formId
    });

    console.log(`✅ Access verified for form: ${response.data.info?.title}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Form access verified successfully',
        formTitle: response.data.info?.title,
        formId: formId
      })
    };

} catch (error) {
  console.error('❌ Form access test failed:', error);
  
  let errorMessage = 'Cannot access form';
  let helpText = '';
  
  if (error.code === 404) {
    errorMessage = 'Form not found';
    helpText = 'Please check the URL. Try using the form EDIT URL instead of the response/view URL.';
  } else if (error.code === 403) {
    errorMessage = 'Access denied';  
    helpText = 'Please ensure you have permission to access this form and your Google account is connected.';
  } else if (error.code === 401) {
    errorMessage = 'Authentication required';
    helpText = 'Please reconnect your Google account.';
  }
  
  return {
    statusCode: error.code || 500,
    headers,
    body: JSON.stringify({ 
      success: false, 
      error: errorMessage,
      details: error.message,
      helpText: helpText,
      requiresAuth: error.code === 403 || error.code === 401
    })
  };
}
};

// Helper function to get processed response IDs
const getProcessedResponseIds = async (formId) => {
  try {
    const { data } = await supabase
      .from('processed_form_responses')
      .select('response_id')
      .eq('form_id', formId);

    return data?.map(r => r.response_id) || [];
  } catch (error) {
    console.error('Error getting processed response IDs:', error);
    return [];
  }
};
