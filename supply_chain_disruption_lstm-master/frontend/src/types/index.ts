export interface CityCoords {
  [key: string]: [number, number];
}

export interface Config {
  cities: string[];
  products: string[];
  transport_modes: string[];
  suppliers: string[];
  city_coords: CityCoords;
}

export interface RiskCause {
  text: string;
  detail: string;
}

export interface WeatherInfo {
  rain: number;
  temp: number;
  wind: number;
  severity: number;
  anomaly: boolean;
}

export interface SupplierRisk {
  composite_risk_score: number;
  delivery_reliability_score: number;
  regional_risk_index: number;
  strike_incidents_3yr: number;
  financial_stability_score: number;
  risk_category: string;
}

export interface PredictionRequest {
  origin_city: string;
  destination_city: string;
  product_category: string;
  transport_mode: string;
  quantity_units: number;
  order_date: string;
  supplier_name: string;
}

export interface PredictionResponse {
  disruption_probability: number;
  confidence: number;
  predicted_delay_days: number;
  base_travel_days: number;
  expected_delivery_date: string;
  distance_km: number;
  causes: RiskCause[];
  weather: WeatherInfo;
  supplier_risk: SupplierRisk;
  historical_disruptions: number;
}
