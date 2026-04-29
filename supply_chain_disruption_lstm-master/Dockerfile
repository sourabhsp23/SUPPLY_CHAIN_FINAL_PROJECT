# Stage 1: Build React Frontend
FROM node:18 AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ .
RUN npm run build

# Stage 2: Serve with FastAPI
FROM python:3.9
WORKDIR /app

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy all backend code and models
COPY . .

# Copy built frontend from Stage 1 to a static folder
COPY --from=frontend-build /app/frontend/dist /app/static

# Port 7860 for HF Spaces
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "7860"]
