import os

# --- Simple Setup: Suppress Warnings & Force CPU ---
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
os.environ['TF_ENABLE_ONEDNN_OPTS'] = '0'
os.environ['CUDA_VISIBLE_DEVICES'] = '-1'

import joblib
import json
import math
import warnings
import requests
import pandas as pd
import numpy as np
import tensorflow as tf
from datetime import datetime
from typing import List, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from tensorflow.keras.models import load_model

warnings.filterwarnings('ignore')

app = FastAPI(title="Supply Chain Disruption API")

# Configure CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_DIR   = 'datasets/'
MODELS_DIR = 'models/'

# --- Global Assets ---
ASSETS = {}
LOOKUPS = {}

CITY_COORDS = {
    'Mumbai':    (19.08, 72.88), 'Delhi':     (28.61, 77.21),
    'Chennai':   (13.08, 80.27), 'Kolkata':   (22.57, 88.36),
    'Bangalore': (12.97, 77.59), 'Hyderabad': (17.38, 78.49),
    'Pune':      (18.52, 73.86), 'Ahmedabad': (23.03, 72.58),
    'Jaipur':    (26.91, 75.79), 'Lucknow':   (26.85, 80.95),
    'Surat':     (21.17, 72.83), 'Kanpur':    (26.46, 80.33),
    'Nagpur':    (21.15, 79.08), 'Indore':    (22.72, 75.86),
    'Bhopal':    (23.26, 77.41),
}

MODE_DIST_MULT = {'Air': 1.0, 'Rail': 1.15, 'Road+Rail': 1.22, 'Road': 1.35}
MODE_SPEED     = {'Air': 800,  'Rail': 450,  'Road+Rail': 380,  'Road': 280}

LSTM_FEATURES = [
    'distance_km', 'promised_delivery_days', 'quantity_units',
    'rainfall_mm', 'temperature_celsius', 'wind_speed_kmh',
    'severity_score', 'weather_anomaly_score',
    'sentiment_score', 'disruption_signal',
    'composite_risk_score', 'delivery_reliability_score',
    'regional_risk_index', 'historical_disruption_count',
    'rolling_7d_delay', 'rolling_14d_delay', 'lag1_delay', 'lag2_delay',
    'transport_mode_enc', 'product_category_enc', 'supplier_city_enc'
]
SEQ_LEN = 14

# --- Schemas ---
class PredictionRequest(BaseModel):
    origin_city: str
    destination_city: str
    product_category: str
    transport_mode: str
    quantity_units: int
    order_date: str # ISO format YYYY-MM-DD
    supplier_name: str

class RiskCause(BaseModel):
    text: str
    detail: str

class PredictionResponse(BaseModel):
    disruption_probability: float
    confidence: float
    predicted_delay_days: int
    base_travel_days: int
    expected_delivery_date: str
    distance_km: float
    causes: List[RiskCause]
    weather: dict
    supplier_risk: dict
    historical_disruptions: float

# --- Helper Functions ---
def haversine(lat1, lon1, lat2, lon2):
    R = 6371
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return 2 * R * math.asin(math.sqrt(a))

def fetch_forecast(city):
    try:
        lat, lon = CITY_COORDS[city]
        resp = requests.get('https://api.open-meteo.com/v1/forecast', params={
            'latitude': lat, 'longitude': lon,
            'daily': 'precipitation_sum,temperature_2m_max,wind_speed_10m_max',
            'forecast_days': 7, 'timezone': 'Asia/Kolkata'
        }, timeout=10)
        resp.raise_for_status()
        wf   = pd.DataFrame(resp.json()['daily'])
        rain = float(wf['precipitation_sum'].fillna(0).mean())
        temp = float(wf['temperature_2m_max'].fillna(28).mean())
        wind = float(wf['wind_speed_10m_max'].fillna(10).mean())
        sev  = 2 if (rain > 50 or wind > 60) else (1 if (rain > 15 or wind > 35) else 0)
        return rain, temp, wind, sev
    except Exception:
        return 0.0, 28.0, 10.0, 0

def get_sentiment(city, month):
    sentiment_lookup = LOOKUPS['sentiment']
    row = sentiment_lookup[
        (sentiment_lookup['affected_city'] == city) &
        (sentiment_lookup['month'] == month)
    ]
    if len(row) == 0:
        return 0.0, 0.0
    return float(row['avg_sentiment'].values[0]), float(row['avg_disruption_signal'].values[0])

def get_supplier_risk(supplier_name):
    d4 = LOOKUPS['supplier_risk']
    row = d4[d4['supplier_name'] == supplier_name]
    if len(row) == 0:
        return {c: float(d4[c].median()) for c in
                ['composite_risk_score', 'delivery_reliability_score',
                 'regional_risk_index', 'strike_incidents_3yr',
                 'financial_stability_score']} | {'risk_category': 'Medium'}
    return row[['composite_risk_score', 'delivery_reliability_score',
                'regional_risk_index', 'strike_incidents_3yr',
                'financial_stability_score', 'risk_category']].iloc[0].to_dict()

def get_distance(origin, destination, transport_mode):
    merged = LOOKUPS['merged']
    pair = merged[
        (merged['supplier_city']    == origin) &
        (merged['destination_city'] == destination) &
        (merged['transport_mode']   == transport_mode)
    ]['distance_km']
    if len(pair) > 0:
        return float(pair.mean())
    if origin in CITY_COORDS and destination in CITY_COORDS:
        la1, lo1 = CITY_COORDS[origin]
        la2, lo2 = CITY_COORDS[destination]
        straight = haversine(la1, lo1, la2, lo2)
        return round(straight * MODE_DIST_MULT.get(transport_mode, 1.3), 1)
    return float(merged[merged['transport_mode'] == transport_mode]['distance_km'].mean())

def get_top_causes(origin_city, transport_mode, weather_sev, sentiment, supplier_risk_cat,
                   weather_anomaly, hist_count, composite_risk):
    causes = []
    if weather_sev == 2:
        causes.append({'text': f'Severe weather alert in {origin_city}', 'detail': 'Heavy rainfall (>50mm) or strong winds (>60 km/h) forecast.'})
    elif weather_sev == 1:
        causes.append({'text': f'Moderate weather conditions in {origin_city}', 'detail': 'Moderate rain or wind expected.'})
    if weather_anomaly:
        causes.append({'text': f'Unusual weather pattern detected in {origin_city}', 'detail': 'The weather combination today is statistically abnormal.'})
    if sentiment <= -0.7:
        causes.append({'text': f'Strongly negative news sentiment in {origin_city}', 'detail': f'Recent news is very negative (score {round(sentiment,2)}).'})
    elif sentiment < -0.4:
        causes.append({'text': f'Negative news sentiment in {origin_city}', 'detail': f'News leans negative (score {round(sentiment,2)}).'})
    if supplier_risk_cat == 'High':
        causes.append({'text': f'Supplier rated HIGH risk', 'detail': f'Composite risk score of {round(composite_risk,2)}.'})
    elif supplier_risk_cat == 'Medium':
        causes.append({'text': f'Supplier rated Medium risk', 'detail': f'Moderate risk score of {round(composite_risk,2)}.'})
    if transport_mode == 'Road':
        causes.append({'text': 'Road transport vulnerability', 'detail': 'Exposed to weather, traffic, and political blockades.'})
    elif transport_mode == 'Rail':
        causes.append({'text': 'Rail transport dependency', 'detail': 'Subject to fixed schedules and track failures.'})
    elif transport_mode == 'Air':
        causes.append({'text': 'Air transport selected', 'detail': 'Sensitive to weather-based flight cancellations.'})
    elif transport_mode == 'Road+Rail':
        causes.append({'text': 'Multi-modal route', 'detail': 'Handoff points are potential delay sources.'})
    if not causes:
        causes.append({'text': 'Combined low-level risk factors', 'detail': 'Combination of mild factors push risk higher.'})
    return causes[:3]

# --- Lifecycle & Lazy Loading ---
def load_assets():
    if ASSETS.get('loaded'):
        return
    
    print("🚀 Loading AI models in background...")
    # Load Models
    try:
        print("📦 Loading XGBoost model...")
        ASSETS['xgb'] = joblib.load(MODELS_DIR + 'xgboost_model.pkl')
    except Exception as e: print(f"⚠️ XGBoost fail: {e}")

    try:
        print("🧠 Loading LSTM model (TensorFlow)...")
        ASSETS['lstm'] = load_model(MODELS_DIR + 'lstm_model.h5')
    except Exception as e: print(f"⚠️ LSTM fail: {e}")

    try:
        print("🌲 Loading Isolation Forest model...")
        ASSETS['iso'] = joblib.load(MODELS_DIR + 'isolation_forest.pkl')
    except Exception as e: print(f"⚠️ IsoForest fail: {e}")

    try:
        print("⚖️ Loading Scaler and Encoders...")
        ASSETS['scaler'] = joblib.load(MODELS_DIR + 'scaler.pkl')
        ASSETS['le_transport'] = joblib.load(MODELS_DIR + 'le_transport.pkl')
        ASSETS['le_product'] = joblib.load(MODELS_DIR + 'le_product.pkl')
        ASSETS['le_city'] = joblib.load(MODELS_DIR + 'le_city.pkl')
        ASSETS['le_dest'] = joblib.load(MODELS_DIR + 'le_dest.pkl')
    except Exception as e: print(f"⚠️ Encoders fail: {e}")

    try:
        print("📄 Loading Feature List...")
        with open(MODELS_DIR + 'feature_list.json') as f:
            ASSETS['xgb_features'] = json.load(f)
    except Exception as e: print(f"⚠️ Feature list fail: {e}")

    # Load Lookups
    try:
        print("📊 Loading Sentiment and Dataset lookups...")
        d3 = pd.read_csv(DATA_DIR + 'dataset3_news_sentiment_india.csv', parse_dates=['date'])
        d3['month'] = d3['date'].dt.month
        LOOKUPS['sentiment'] = d3.groupby(['affected_city', 'month']).agg(
            avg_sentiment=('sentiment_score', 'mean'),
            avg_disruption_signal=('disruption_signal', 'mean')
        ).reset_index()

        LOOKUPS['supplier_risk'] = pd.read_csv(DATA_DIR + 'dataset4_supplier_risk_india.csv')
        LOOKUPS['merged'] = pd.read_csv(DATA_DIR + 'merged_dataset.csv')
        LOOKUPS['city_hist_avg'] = LOOKUPS['merged'].groupby('supplier_city')['historical_disruption_count'].mean().to_dict()
        LOOKUPS['city_rolling'] = LOOKUPS['merged'].groupby('supplier_city').agg(
            avg_rolling7 =('rolling_7d_delay',  'mean'),
            avg_rolling14=('rolling_14d_delay', 'mean'),
            avg_lag1     =('lag1_delay',        'mean'),
            avg_lag2     =('lag2_delay',        'mean')
        ).to_dict('index')
    except Exception as e: print(f"⚠️ Datasets fail: {e}")
    
    ASSETS['loaded'] = True
    print("✅ All models and datasets ready!")

# Remove the old startup event to allow instant server launch

# --- Routes ---
@app.get("/")
def read_root():
    if os.path.exists("static/index.html"):
        return FileResponse("static/index.html")
    return {"status": "ok", "message": "API is running (frontend not found)"}

@app.get("/api/config")
def get_config():
    load_assets()
    
    # Safe fallbacks if models failed to load
    products = list(ASSETS['le_product'].classes_) if 'le_product' in ASSETS else ["Electronics", "Pharma", "Consumer Goods"]
    transport = list(ASSETS['le_transport'].classes_) if 'le_transport' in ASSETS else ["Road", "Rail", "Air", "Road+Rail"]
    suppliers = list(LOOKUPS['supplier_risk']['supplier_name'].unique()) if 'supplier_risk' in LOOKUPS else ["Default Supplier"]

    return {
        "cities": list(CITY_COORDS.keys()),
        "products": products,
        "transport_modes": transport,
        "suppliers": suppliers,
        "city_coords": CITY_COORDS
    }

@app.post("/api/predict", response_model=PredictionResponse)
def predict(req: PredictionRequest):
    load_assets()
    try:
        order_dt = pd.to_datetime(req.order_date)
        shipment_month = order_dt.month

        # Weather
        rain, temp, wind, sev = fetch_forecast(req.origin_city)
        weather_vec = np.array([[rain, temp, wind, sev]])
        iso_pred = ASSETS['iso'].predict(weather_vec)
        weather_anomaly = int(iso_pred[0] == -1)

        # Sentiment
        sentiment, disruption_signal = get_sentiment(req.origin_city, shipment_month)

        # Supplier risk
        risk = get_supplier_risk(req.supplier_name)

        # City averages
        hist_count = LOOKUPS['city_hist_avg'].get(req.origin_city, 0.0)
        cr = LOOKUPS['city_rolling'].get(req.origin_city, {
            'avg_rolling7': 0, 'avg_rolling14': 0, 'avg_lag1': 0, 'avg_lag2': 0
        })

        # Encodings
        transport_enc = int(ASSETS['le_transport'].transform([req.transport_mode])[0])
        product_enc   = int(ASSETS['le_product'].transform([req.product_category])[0])
        city_enc      = int(ASSETS['le_city'].transform([req.origin_city])[0])
        dest_enc      = int(ASSETS['le_dest'].transform([req.destination_city])[0])

        distance_km = get_distance(req.origin_city, req.destination_city, req.transport_mode)

        feat = {
            'distance_km':                 distance_km,
            'promised_delivery_days':      0.0, # Placeholder, logic below
            'quantity_units':              float(req.quantity_units),
            'rainfall_mm':                 rain,
            'temperature_celsius':         temp,
            'wind_speed_kmh':              wind,
            'severity_score':              float(sev),
            'weather_anomaly_score':       float(weather_anomaly),
            'sentiment_score':             sentiment,
            'disruption_signal':           disruption_signal,
            'composite_risk_score':        float(risk['composite_risk_score']),
            'delivery_reliability_score':  float(risk['delivery_reliability_score']),
            'regional_risk_index':         float(risk['regional_risk_index']),
            'strike_incidents_3yr':        float(risk['strike_incidents_3yr']),
            'financial_stability_score':   float(risk['financial_stability_score']),
            'historical_disruption_count': hist_count,
            'rolling_7d_delay':            cr['avg_rolling7'],
            'rolling_14d_delay':           cr['avg_rolling14'],
            'lag1_delay':                  cr['avg_lag1'],
            'lag2_delay':                  cr['avg_lag2'],
            'transport_mode_enc':          float(transport_enc),
            'product_category_enc':        float(product_enc),
            'supplier_city_enc':           float(city_enc),
            'destination_city_enc':        float(dest_enc),
        }

        # LSTM
        lstm_vec        = np.array([feat[f] for f in LSTM_FEATURES], dtype=np.float32)
        lstm_vec_scaled = ASSETS['scaler'].transform(lstm_vec.reshape(1, -1))
        lstm_seq        = np.tile(lstm_vec_scaled, (SEQ_LEN, 1)).reshape(1, SEQ_LEN, len(LSTM_FEATURES))
        lstm_prob       = float(ASSETS['lstm'].predict(lstm_seq, verbose=0)[0][0])

        # XGBoost
        feat['lstm_disruption_prob'] = lstm_prob
        xgb_df   = pd.DataFrame([[feat[f] for f in ASSETS['xgb_features']]], columns=ASSETS['xgb_features'])
        xgb_prob = float(ASSETS['xgb'].predict_proba(xgb_df)[0][1])

        # Delay Logic
        mode_speed = MODE_SPEED.get(req.transport_mode, 350)
        if req.origin_city == req.destination_city:
            distance_km = 50.0
            base_travel_days = 1
            predicted_delay = 1 if xgb_prob >= 0.7 else 0
        else:
            base_travel_days = max(1, int(round(distance_km / mode_speed)))
            MODE_MAX_DELAY = {'Air': 8, 'Rail': 12, 'Road+Rail': 14, 'Road': 18}
            max_delay = MODE_MAX_DELAY.get(req.transport_mode, 12)
            predicted_delay = int(round(max_delay * xgb_prob * 0.7))
            if xgb_prob >= 0.7: predicted_delay = max(predicted_delay, 3)
            elif xgb_prob >= 0.4: predicted_delay = max(predicted_delay, 1)

        expected_actual = order_dt + pd.Timedelta(days=base_travel_days + predicted_delay)

        causes = get_top_causes(
            req.origin_city, req.transport_mode, sev, sentiment,
            risk['risk_category'], weather_anomaly,
            hist_count, float(risk['composite_risk_score'])
        )

        return PredictionResponse(
            disruption_probability=round(xgb_prob * 100, 1),
            confidence=round((abs(xgb_prob - 0.5) / 0.5) * 100, 1),
            predicted_delay_days=predicted_delay,
            base_travel_days=base_travel_days,
            expected_delivery_date=expected_actual.strftime('%Y-%m-%d'),
            distance_km=round(distance_km, 1),
            causes=causes,
            weather={"rain": rain, "temp": temp, "wind": wind, "severity": sev, "anomaly": bool(weather_anomaly)},
            supplier_risk=risk,
            historical_disruptions=hist_count
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Static File Serving (Deployment) ---
if os.path.exists("static"):
    app.mount("/assets", StaticFiles(directory="static/assets"), name="assets")

@app.get("/{full_path:path}")
async def catch_all(full_path: str):
    # If the file exists in static, serve it
    file_path = os.path.join("static", full_path)
    if os.path.isfile(file_path):
        return FileResponse(file_path)
    # Otherwise, serve index.html for SPA routing
    if os.path.exists("static/index.html"):
        return FileResponse("static/index.html")
    return {"error": "Not Found"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8009)
