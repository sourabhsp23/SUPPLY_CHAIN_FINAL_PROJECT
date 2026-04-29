import axios from 'axios';
import type { Config, PredictionRequest, PredictionResponse } from '../types';

const API_BASE_URL = import.meta.env.MODE === 'production' ? '' : 'http://localhost:8009';

const api = axios.create({
  baseURL: API_BASE_URL,
});

export const getApiConfig = async (): Promise<Config> => {
  const response = await api.get('/api/config');
  return response.data;
};

export const predictDisruption = async (request: PredictionRequest): Promise<PredictionResponse> => {
  const response = await api.post('/api/predict', request);
  return response.data;
};
