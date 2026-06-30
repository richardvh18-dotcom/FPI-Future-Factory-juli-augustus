import axios from 'axios';
import { getIonAccessToken } from './auth';

/**
 * Sends a generic request to Infor ION API.
 */
export async function sendIonRequest(endpoint: string, data: any, method: 'POST' | 'GET' | 'PUT' | 'DELETE' = 'POST') {
  const baseUrl = process.env.ION_API_URL;
  const tenantId = process.env.ION_TENANT_ID;

  if (!baseUrl || !tenantId) {
    throw new Error('Infor ION API base URL or Tenant ID not configured.');
  }

  const token = await getIonAccessToken();
  const url = `${baseUrl}/${tenantId}/${endpoint}`;

  try {
    const response = await axios({
      method,
      url,
      data,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json', // Or application/xml if sending XML BODs
      }
    });

    return response.data;
  } catch (error) {
    console.error(`Error communicating with Infor ION API at ${url}:`, error);
    throw error;
  }
}

/**
 * Example: Send a Production Order BOD (JSON formatted).
 */
export async function sendProductionOrderBOD(orderData: any) {
  // Translate orderData to ION BOD format here
  const bodPayload = {
    // ... OAGIS BOD structure ...
  };

  // Endpoint depends on your exact ION API configuration
  const endpoint = 'InforIONAPI/Mongoose/Data/OrderBODs'; 
  return sendIonRequest(endpoint, bodPayload);
}
