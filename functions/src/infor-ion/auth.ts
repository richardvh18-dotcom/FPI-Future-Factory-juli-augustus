import axios from 'axios';

let accessToken: string | null = null;
let tokenExpiry: number | null = null;

/**
 * Retrieves a valid OAuth 2.0 access token from Infor ION API.
 * Uses client credentials flow.
 */
export async function getIonAccessToken(): Promise<string> {
  const now = Date.now();
  
  // Return cached token if valid (with 5 min buffer)
  if (accessToken && tokenExpiry && now < tokenExpiry - 300000) {
    return accessToken;
  }

  const tokenUrl = process.env.ION_TOKEN_URL;
  const clientId = process.env.ION_CLIENT_ID;
  const clientSecret = process.env.ION_CLIENT_SECRET;

  if (!tokenUrl || !clientId || !clientSecret) {
    throw new Error('Infor ION API credentials are not fully configured in the environment variables.');
  }

  try {
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);

    const response = await axios.post(tokenUrl, params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    accessToken = response.data.access_token;
    // Calculate expiry time (expires_in is usually in seconds)
    tokenExpiry = now + (response.data.expires_in * 1000);

    if (!accessToken) {
        throw new Error('Failed to retrieve access token from Infor.');
    }

    return accessToken;
  } catch (error) {
    console.error('Error fetching Infor ION Access Token:', error);
    throw error;
  }
}
