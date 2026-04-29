import streamlit as st
import pandas as pd
import numpy as np
import math
import requests
import joblib
import json
import warnings
import tensorflow as tf
from tensorflow.keras.models import load_model
from datetime import datetime

warnings.filterwarnings('ignore')

st.set_page_config(
    page_title="Supply Chain Disruption Predictor",
    page_icon="🚚",
    layout="wide",
    initial_sidebar_state="expanded",
)

DATA_DIR   = 'datasets/'
MODELS_DIR = 'models/'

@st.cache_resource
def load_all_assets():
    xgb_model    = joblib.load(MODELS_DIR + 'xgboost_model.pkl')
    lstm_model   = load_model(MODELS_DIR + 'lstm_model.h5')
    iso_forest   = joblib.load(MODELS_DIR + 'isolation_forest.pkl')
    scaler       = joblib.load(MODELS_DIR + 'scaler.pkl')
    le_transport = joblib.load(MODELS_DIR + 'le_transport.pkl')
    le_product   = joblib.load(MODELS_DIR + 'le_product.pkl')
    le_city      = joblib.load(MODELS_DIR + 'le_city.pkl')
    le_dest      = joblib.load(MODELS_DIR + 'le_dest.pkl')
    with open(MODELS_DIR + 'feature_list.json') as f:
        XGB_FEATURES = json.load(f)
    return {
        'xgb': xgb_model, 'lstm': lstm_model, 'iso': iso_forest,
        'scaler': scaler, 'le_transport': le_transport, 'le_product': le_product,
        'le_city': le_city, 'le_dest': le_dest, 'xgb_features': XGB_FEATURES
    }

@st.cache_data
def load_lookups():
    d3     = pd.read_csv(DATA_DIR + 'dataset3_news_sentiment_india.csv', parse_dates=['date'])
    d4     = pd.read_csv(DATA_DIR + 'dataset4_supplier_risk_india.csv')
    merged = pd.read_csv(DATA_DIR + 'merged_dataset.csv')

    d3['month'] = d3['date'].dt.month
    sentiment_lookup = d3.groupby(['affected_city', 'month']).agg(
        avg_sentiment=('sentiment_score', 'mean'),
        avg_disruption_signal=('disruption_signal', 'mean')
    ).reset_index()

    city_hist_avg = merged.groupby('supplier_city')['historical_disruption_count'].mean().to_dict()

    city_rolling = merged.groupby('supplier_city').agg(
        avg_rolling7 =('rolling_7d_delay',  'mean'),
        avg_rolling14=('rolling_14d_delay', 'mean'),
        avg_lag1     =('lag1_delay',        'mean'),
        avg_lag2     =('lag2_delay',        'mean')
    ).to_dict('index')

    return sentiment_lookup, d4, merged, city_hist_avg, city_rolling

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

# ── Mode-specific constants ───────────────────────────────────────────────
MODE_DIST_MULT = {'Air': 1.0, 'Rail': 1.15, 'Road+Rail': 1.22, 'Road': 1.35}
MODE_SPEED     = {'Air': 800,  'Rail': 450,  'Road+Rail': 380,  'Road': 280}

def haversine(lat1, lon1, lat2, lon2):
    R = 6371
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return 2 * R * math.asin(math.sqrt(a))

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

def get_sentiment(city, month, sentiment_lookup):
    row = sentiment_lookup[
        (sentiment_lookup['affected_city'] == city) &
        (sentiment_lookup['month'] == month)
    ]
    if len(row) == 0:
        return 0.0, 0.0
    return float(row['avg_sentiment'].values[0]), float(row['avg_disruption_signal'].values[0])

def get_supplier_risk(supplier_name, d4):
    row = d4[d4['supplier_name'] == supplier_name]
    if len(row) == 0:
        return {c: float(d4[c].median()) for c in
                ['composite_risk_score', 'delivery_reliability_score',
                 'regional_risk_index', 'strike_incidents_3yr',
                 'financial_stability_score']} | {'risk_category': 'Medium'}
    return row[['composite_risk_score', 'delivery_reliability_score',
                'regional_risk_index', 'strike_incidents_3yr',
                'financial_stability_score', 'risk_category']].iloc[0].to_dict()

# ── Distance + promised days lookups with haversine fallback ──────────────
def get_distance(merged, origin, destination, transport_mode):
    """Get distance: data lookup first, haversine fallback with mode multiplier."""
    pair = merged[
        (merged['supplier_city']    == origin) &
        (merged['destination_city'] == destination) &
        (merged['transport_mode']   == transport_mode)
    ]['distance_km']
    if len(pair) > 0:
        return float(pair.mean())
    # Fallback: haversine × mode multiplier (guarantees Air < Road)
    if origin in CITY_COORDS and destination in CITY_COORDS:
        la1, lo1 = CITY_COORDS[origin]
        la2, lo2 = CITY_COORDS[destination]
        straight = haversine(la1, lo1, la2, lo2)
        return round(straight * MODE_DIST_MULT.get(transport_mode, 1.3), 1)
    return float(merged[merged['transport_mode'] == transport_mode]['distance_km'].mean())

def get_promised_days(merged, origin, destination, transport_mode):
    """Get promised days: data lookup, then derive from distance/speed."""
    pair = merged[
        (merged['supplier_city']    == origin) &
        (merged['destination_city'] == destination) &
        (merged['transport_mode']   == transport_mode)
    ]['promised_delivery_days']
    if len(pair) > 0:
        return float(pair.mean())
    # Fallback: calculate from distance and mode speed
    dist = get_distance(merged, origin, destination, transport_mode)
    speed = MODE_SPEED.get(transport_mode, 350)
    return max(2, round(dist / speed + 1.5))

def get_top_causes(origin_city, transport_mode, weather_sev, sentiment, supplier_risk_cat,
                   weather_anomaly, hist_count, composite_risk):
    causes = []

    if weather_sev == 2:
        causes.append({
            'text': f'Severe weather alert in {origin_city}',
            'detail': 'Heavy rainfall (>50mm) or strong winds (>60 km/h) forecast in the next 7 days — high chance of road blocks or route closures.'
        })
    elif weather_sev == 1:
        causes.append({
            'text': f'Moderate weather conditions in {origin_city}',
            'detail': 'Moderate rain or wind expected — minor delays possible, especially for open trucks or road transport.'
        })

    if weather_anomaly:
        causes.append({
            'text': f'Unusual weather pattern detected in {origin_city}',
            'detail': 'The weather combination today is statistically abnormal compared to historical norms — even if not severe, unusual patterns often precede disruptions.'
        })

    if sentiment <= -0.7:
        causes.append({
            'text': f'Strongly negative news sentiment in {origin_city}',
            'detail': f'Recent news from {origin_city} this month is very negative (score {round(sentiment,2)}) — likely reports of strikes, protests, flooding, or political unrest affecting logistics.'
        })
    elif sentiment < -0.4:
        causes.append({
            'text': f'Negative news sentiment in {origin_city}',
            'detail': f'News from {origin_city} this month leans negative (score {round(sentiment,2)}) — signals possible local disruptions like road blocks, labour issues, or extreme weather coverage.'
        })

    if supplier_risk_cat == 'High':
        causes.append({
            'text': f'Supplier rated HIGH risk',
            'detail': f'This supplier has a composite risk score of {round(composite_risk,2)} — history of delivery failures, financial instability, or regional strikes in the past 3 years.'
        })
    elif supplier_risk_cat == 'Medium':
        causes.append({
            'text': f'Supplier rated Medium risk',
            'detail': f'This supplier has a moderate risk score of {round(composite_risk,2)} — occasional past delays or moderate regional exposure. Not alarming but worth monitoring.'
        })

    if transport_mode == 'Road':
        causes.append({
            'text': 'Road transport vulnerability',
            'detail': 'Road shipments are directly exposed to weather, traffic, and political blockades. Most disruptions in India affect road transport first.'
        })
    elif transport_mode == 'Rail':
        causes.append({
            'text': 'Rail transport dependency',
            'detail': 'Rail is generally reliable but subject to fixed schedules and occasional signal/track failures. Delays tend to cascade once they start.'
        })
    elif transport_mode == 'Air':
        causes.append({
            'text': 'Air transport selected',
            'detail': 'Air is the fastest mode but sensitive to weather-based flight cancellations and airport congestion. Also highest cost if rerouting is needed.'
        })
    elif transport_mode == 'Road+Rail':
        causes.append({
            'text': 'Multi-modal (Road + Rail) route',
            'detail': 'Combined road and rail involves handoff points — each transfer is a potential delay source if timing or coordination fails.'
        })

    if len(causes) == 0:
        causes.append({
            'text': 'Combined low-level risk factors',
            'detail': 'No single dominant risk factor — the model detected a combination of mild weather, moderate sentiment, and supplier/route patterns that together push the risk score higher.'
        })

    return causes[:3]


def main():
    st.sidebar.title("Navigation")
    page = st.sidebar.radio("Go to", ["Predict Disruption", "About the System"])

    assets = load_all_assets()
    sentiment_lookup, d4, merged, city_hist_avg, city_rolling = load_lookups()

    if page == "Predict Disruption":
        render_predictor(assets, sentiment_lookup, d4, merged, city_hist_avg, city_rolling)
    else:
        render_about()


def render_predictor(assets, sentiment_lookup, d4, merged, city_hist_avg, city_rolling):
    st.title("🚚 Supply Chain Disruption Predictor")
    st.markdown("Enter shipment details to predict the risk of disruption and estimated delivery delay.")

    col1, col2 = st.columns(2)

    with col1:
        origin_city      = st.selectbox("Origin City",      list(CITY_COORDS.keys()))
        destination_city = st.selectbox("Destination City", list(CITY_COORDS.keys()), index=1)
        product_category = st.selectbox("Product Category", list(assets['le_product'].classes_))
        transport_mode   = st.selectbox("Transport Mode",   list(assets['le_transport'].classes_))

    with col2:
        quantity_units = st.number_input("Quantity (Units)", min_value=1, value=500)
        order_date     = st.date_input("Order Date", datetime.now())
        supplier_name  = st.selectbox("Supplier Name", list(d4['supplier_name'].unique()))

    if st.button("Predict Disruption Risk", type="primary"):
        with st.spinner("Fetching live weather, running models..."):

            order_dt       = pd.to_datetime(order_date)
            shipment_month = order_dt.month

            # Weather
            rain, temp, wind, sev = fetch_forecast(origin_city)
            weather_vec     = np.array([[rain, temp, wind, sev]])
            iso_pred        = assets['iso'].predict(weather_vec)
            weather_anomaly = int(iso_pred[0] == -1)

            # Sentiment
            sentiment, disruption_signal = get_sentiment(origin_city, shipment_month, sentiment_lookup)

            # Supplier risk
            risk = get_supplier_risk(supplier_name, d4)

            # City averages
            hist_count = city_hist_avg.get(origin_city, 0.0)
            cr = city_rolling.get(origin_city, {
                'avg_rolling7': 0, 'avg_rolling14': 0, 'avg_lag1': 0, 'avg_lag2': 0
            })

            # Encodings
            transport_enc = int(assets['le_transport'].transform([transport_mode])[0])
            product_enc   = int(assets['le_product'].transform([product_category])[0])
            city_enc      = int(assets['le_city'].transform([origin_city])[0])
            dest_enc      = int(assets['le_dest'].transform([destination_city])[0])

            # ── FIXED: distance and promised days filtered by transport mode ──
            distance_km       = get_distance(merged, origin_city, destination_city, transport_mode)
            promised_days_est = get_promised_days(merged, origin_city, destination_city, transport_mode)

            feat = {
                'distance_km':                 distance_km,
                'promised_delivery_days':      promised_days_est,
                'quantity_units':              float(quantity_units),
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
            lstm_vec_scaled = assets['scaler'].transform(lstm_vec.reshape(1, -1))
            lstm_seq        = np.tile(lstm_vec_scaled, (SEQ_LEN, 1)).reshape(1, SEQ_LEN, len(LSTM_FEATURES))
            lstm_prob       = float(assets['lstm'].predict(lstm_seq, verbose=0)[0][0])

            # XGBoost
            feat['lstm_disruption_prob'] = lstm_prob
            xgb_df   = pd.DataFrame([[feat[f] for f in assets['xgb_features']]], columns=assets['xgb_features'])
            xgb_prob = float(assets['xgb'].predict_proba(xgb_df)[0][1])

            final_pct  = round(xgb_prob * 100, 1)
            confidence = round((abs(xgb_prob - 0.5) / 0.5) * 100, 1)

            # Delivery estimate
            # ── travel days from mode-specific speed ──────────────────────
            mode_speed = MODE_SPEED.get(transport_mode, 350)
            
            # Same city delivery logic
            if origin_city == destination_city:
                distance_km = 50.0  # Assumed intra-city distance
                base_travel_days = 1
                
                # Intra-city delays should be significantly shorter
                MODE_MAX_DELAY = {'Air': 1, 'Rail': 1, 'Road+Rail': 2, 'Road': 2}
                max_delay = MODE_MAX_DELAY.get(transport_mode, 2)
                predicted_delay = int(round(max_delay * xgb_prob))
                
                if xgb_prob >= 0.7:
                    predicted_delay = max(predicted_delay, 1) # Max 1 day delay for high risk intra-city
                else:
                    predicted_delay = 0 # No delay for low/medium risk intra-city
            else:
                base_travel_days = max(1, int(round(distance_km / mode_speed)))

                # ── delay: scale with risk probability + mode-specific caps ──
                MODE_MAX_DELAY = {'Air': 8, 'Rail': 12, 'Road+Rail': 14, 'Road': 18}
                max_delay = MODE_MAX_DELAY.get(transport_mode, 12)

                # Primary delay: proportional to risk and mode ceiling
                predicted_delay = int(round(max_delay * xgb_prob * 0.7))

                # Enforce minimum delays so high risk ≠ 0 delay
                if xgb_prob >= 0.7:                             # High risk
                    predicted_delay = max(predicted_delay, 3)
                elif xgb_prob >= 0.4:                           # Medium risk
                    predicted_delay = max(predicted_delay, 1)
                else:                                           # Low risk
                    predicted_delay = max(predicted_delay, 0)
                    
            expected_actual = order_dt + pd.Timedelta(days=base_travel_days + predicted_delay)

            causes = get_top_causes(
                origin_city, transport_mode, sev, sentiment,
                risk['risk_category'], weather_anomaly,
                hist_count, float(risk['composite_risk_score'])
            )

        # ── OUTPUT ────────────────────────────────────────────────────────────
        st.divider()

        res_col1, res_col2, res_col3 = st.columns(3)

        with res_col1:
            if final_pct >= 70:
                st.error(f"### High Risk: {final_pct}%")
            elif final_pct >= 40:
                st.warning(f"### Medium Risk: {final_pct}%")
            else:
                st.success(f"### Low Risk: {final_pct}%")
            st.write(f"**Confidence:** {confidence}%")
            st.write(f"**Est. Distance:** {round(distance_km)} km via {transport_mode}")

        with res_col2:
            st.metric("Predicted Delay", f"{predicted_delay} Days")
            st.write(f"**Base Travel Time:** {base_travel_days} days")
            st.write(f"**Exp. Delivery:** {expected_actual.strftime('%Y-%m-%d')}")

        with res_col3:
            st.write("**Top Risk Factors:**")
            for cause in causes:
                st.write(f"**• {cause['text']}**")
                st.caption(cause['detail'])

        st.divider()

        det_col1, det_col2 = st.columns(2)

        with det_col1:
            st.write("### 🌦️ Environmental Factors")

            # Weather
            sev_label = {0: 'Normal ✅', 1: 'Moderate ⚠️', 2: 'Severe 🔴'}
            st.write(f"- **Weather Forecast:** {round(rain,1)}mm rain, {round(wind,1)}km/h wind, {round(temp,1)}°C")
            st.write(f"- **Weather Severity:** {sev_label[sev]}")

            # Anomaly with explanation
            if weather_anomaly:
                st.write("- **Anomaly Detected:** Yes ⚠️")
                st.caption("The weather pattern today is statistically unusual compared to historical data for this city — even without extreme rain or wind, the combination of conditions is abnormal.")
            else:
                st.write("- **Anomaly Detected:** No ✅")
                st.caption("Weather conditions are within the normal historical range for this city. No unusual pattern flagged.")

            # Sentiment with explanation
            if sentiment <= -0.7:
                sentiment_label = "Very Negative 🔴"
            elif sentiment < -0.4:
                sentiment_label = "Negative 🟠"
            elif sentiment < 0.1:
                sentiment_label = "Neutral ➖"
            else:
                sentiment_label = "Positive 🟢"

            st.write(f"- **News Sentiment:** {round(sentiment,2)} — {sentiment_label} (Disruption Signal: {round(disruption_signal,2)})")
            st.caption(
                f"Score ranges from -1 (very bad news) to +1 (very good news). "
                f"A score of {round(sentiment,2)} means recent news from {origin_city} this month "
                f"{'is reporting serious local issues like strikes, floods, or unrest.' if sentiment < -0.4 else 'is mostly neutral with no major disruption signals.'}"
            )

        with det_col2:
            st.write("### 🏭 Supplier & Logistics")

            # Supplier risk with explanation
            st.write(f"- **Supplier Risk:** {risk['risk_category']} (Score: {round(float(risk['composite_risk_score']),2)})")
            st.caption(
                f"Score from 0 (very reliable) to 1 (very risky). "
                f"Score of {round(float(risk['composite_risk_score']),2)} means this supplier is rated {risk['risk_category'].lower()} risk "
                f"based on past delivery failures, financial health, regional exposure, and strike history."
            )

            # Historical disruptions with explanation
            st.write(f"- **Historical Disruptions:** {round(hist_count,1)} avg per day in {origin_city}")
            st.caption(
                f"This is the average number of recorded disruption events per day in {origin_city} "
                f"from historical data (2021–2024). Higher = this city has a track record of supply chain problems."
            )

            # Model probabilities with explanation
            st.write(f"- **LSTM Probability:** {round(lstm_prob*100,1)}%")
            st.caption(
                f"The deep learning model analysed the last 14-day delay trend for {origin_city} "
                f"and predicts a {round(lstm_prob*100,1)}% chance of disruption based on time patterns alone."
            )
            st.write(f"- **XGBoost Final Probability:** {round(xgb_prob*100,1)}%")
            st.caption(
                f"The final model combined ALL factors — weather, supplier risk, sentiment, LSTM output, "
                f"route data — and gives a final disruption probability of {round(xgb_prob*100,1)}%. "
                f"This is the number the Risk Score above is based on."
            )


def render_about():
    st.title("📖 About the System")
    st.markdown("""
    ### 🎯 End Goal
    The primary objective of this system is to provide **proactive visibility** into supply chain disruptions within the Indian logistics network. By integrating real-time environmental data, news sentiment, and historical patterns, it enables businesses to:
    1. **Anticipate Delays:** Move from reactive to predictive logistics management.
    2. **Mitigate Risk:** Identify high-risk shipments before they leave the warehouse.
    3. **Optimize Planning:** Adjust buffer stocks and delivery promises based on data-driven insights.

    ---

    ### 🤖 The Multi-Model Architecture

    #### 1. Isolation Forest (Anomaly Detection)
    Monitors weather inputs (rainfall, wind, temperature) and flags statistically unusual combinations — even when raw numbers don't cross a "severe" threshold, abnormal patterns are caught.

    #### 2. LSTM — Long Short-Term Memory (Deep Learning)
    Analyses sequences of 21 features over a 14-day window to understand how a build-up of minor issues leads to disruption. Captures time-based patterns XGBoost cannot see.

    #### 3. XGBoost (Final Classifier)
    Takes all raw inputs plus the LSTM probability output and delivers the final risk score. Best at weighing categorical factors like transport mode, product type, and supplier category.

    ---

    ### 📊 Data Sources
    - **Historical Supply Chain Data:** 2,000+ shipment records across 15 Indian cities (2021–2024)
    - **Live Weather Forecast:** Real-time 7-day data from Open-Meteo API (no API key required)
    - **News & Sentiment:** Pre-labelled disruption signals from regional news coverage
    - **Supplier Risk Profiles:** Composite scoring across 15 major Indian suppliers
    """)


if __name__ == "__main__":
    main()