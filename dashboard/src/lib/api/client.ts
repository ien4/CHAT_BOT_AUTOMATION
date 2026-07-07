import axios from 'axios';
import { API_BASE_API_URL } from '../config/env';

export function createApiClient() {
  return axios.create({
    baseURL: API_BASE_API_URL,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default createApiClient;
