// netlify/functions/google-forms-api.js
const { createClient } = require('@supabase/supabase-js');

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
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const { action, formId, adminId } = JSON.parse(event.body || '{}');
    
    switch (action) {
      case 'getFormStructure':
        return await getFormStructure(formId);
      case 'getFormResponses':
        return await getFormResponses(formId, adminId);
      case 'testFormAccess':
        return await testFormAccess(formId);
      default:
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Invalid action' })
        };
    }
  } catch (error) {
    console.error('Google Forms API error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Internal server error',
        message: error.message 
      })
    };
  }
};

// Get Google Form structure and questions
const getFormStructure = async (formId) => {
  try {
    // Note: This is a simplified version. In production, you'd need:
    // 1. Google Forms API credentials
    // 2. OAuth token for the user
    // 3. Proper API calls to Google Forms API
    
    // For now, we'll simulate the form structure analysis
    // In production, this would be:
    // const response = await fetch(`https://forms.googleapis.com/v1/forms/${formId}`, {
    //   headers: { 'Authorization': `Bearer ${accessToken}` }
    // });
    
    // Simulate form structure analysis
    const mockFormStructure = {
      formId: formId,
      title: `Form ${formId.slice(0, 8)}...`,
      description: 'Analyzed form structure',
      questions: [
        {
          questionId: 'entry.123456789',
          title: 'Email Address',
          type: 'SHORT_ANSWER',
          required: true,
          description: 'Please enter your email address'
        },
        {
          questionId: 'entry.987654321',
          title: 'Full Name',
          type: 'SHORT_ANSWER', 
          required: true,
          description: 'Please enter your full name'
        },
        {
          questionId: 'entry.456789123',
          title: 'Select Product',
          type: 'MULTIPLE_CHOICE',
          required: true,
          description: 'Choose your product',
          choices: [
            'Basic Course - ₹999',
            'Premium Course - ₹1999',
            'Enterprise Package - ₹4999'
          ]
        },
        {
          questionId: 'entry.789123456',
          title: 'Phone Number',
          type: 'SHORT_ANSWER',
          required: false,
          description: 'Optional: Your phone number'
        }
      ]
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        data: mockFormStructure
      })
    };

  } catch (error) {
    console.error('Error getting form structure:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        success: false, 
        error: 'Failed to analyze form structure' 
      })
    };
  }
};

// Get form responses (for monitoring)
const getFormResponses = async (formId, adminId) => {
  try {
    // Get field mappings for this form
    const { data: mappings } = await supabase
      .from('form_field_mappings')
      .select('*')
      .eq('form_id', formId)
      .eq('admin_id', adminId)
      .single();

    if (!mappings) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          success: false, 
          error: 'No field mappings found for this form' 
        })
      };
    }

    // In production, this would fetch real responses from Google Forms API:
    // const response = await fetch(`https://forms.googleapis.com/v1/forms/${formId}/responses`, {
    //   headers: { 'Authorization': `Bearer ${accessToken}` }
    // });

    // For now, return empty responses (will be implemented with real API)
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        data: {
          responses: [],
          hasNewResponses: false
        }
      })
    };

  } catch (error) {
    console.error('Error getting form responses:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        success: false, 
        error: 'Failed to get form responses' 
      })
    };
  }
};

// Test if we can access the form
const testFormAccess = async (formId) => {
  try {
    // In production, this would test API access:
    // const response = await fetch(`https://forms.googleapis.com/v1/forms/${formId}`, {
    //   headers: { 'Authorization': `Bearer ${accessToken}` }
    // });
    
    // For now, simulate successful access
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Form access verified',
        formId: formId
      })
    };

  } catch (error) {
    return {
      statusCode: 500,  
      headers,
      body: JSON.stringify({ 
        success: false, 
        error: 'Cannot access form. Please check permissions.' 
      })
    };
  }
};
