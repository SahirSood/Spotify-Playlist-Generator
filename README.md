# Spotify Playlist Generator

A full-stack Spotify app that:

- lets a user sign in with Spotify
- explores playlists and liked songs in the frontend
- stores listening history in DynamoDB
- clusters listening behavior with a Python Lambda
- uses OpenAI to label clusters and match playlist requests to a cluster
- creates a Spotify playlist from a natural-language prompt

## Project Structure

- `frontend/`: React app hosted locally or on Amplify
- `backend/`: Node/Express API deployed to AWS Lambda + API Gateway
- `backend-python/`: Python ML Lambda for feature extraction, clustering, and cluster matching

## What You Need

- AWS account
- Spotify Developer app
- OpenAI API key
- OpenWeather API key if you want weather enrichment
- Node.js 18+
- Python 3.11

## Environment Files

Copy each example file and fill in the values:

- `frontend/.env.example` -> `frontend/.env`
- `backend/.env.example` -> `backend/.env`
- `backend-python/.env.example` -> `backend-python/.env`

### Frontend

`frontend/.env`

```env
REACT_APP_API_URL=http://localhost:5000
```

### Backend

`backend/.env`

```env
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
SPOTIFY_REDIRECT_URI=http://localhost:5000/callback
FRONTEND_URL=http://localhost:3000
OPENWEATHER_API_KEY=optional_openweather_key
OPENAI_API_KEY=your_openai_api_key
ML_LAMBDA_ARN=
SYNC_LAMBDA_ARN=
KMS_KEY_ARN=
DYNAMODB_REGION=us-east-1
```

Notes:

- `FRONTEND_URL` is where users should land after Spotify login
- `SPOTIFY_REDIRECT_URI` must exactly match a redirect URI in your Spotify app settings
- `KMS_KEY_ARN` is recommended for production token encryption
- `ML_LAMBDA_ARN` and `SYNC_LAMBDA_ARN` are needed for full background sync + playlist generation flows in AWS

### Python ML Backend

`backend-python/.env`

```env
OPENAI_API_KEY=your_openai_api_key
DYNAMODB_REGION=us-east-1
```

## Local Development

### 1. Frontend

```bash
cd frontend
npm install
npm start
```

Runs on `http://localhost:3000`.

### 2. Node Backend

```bash
cd backend
npm install
node server.js
```

Runs on `http://localhost:5000`.

### 3. Python Backend

The Python Lambda is designed for AWS deployment. It is not fully wired for a nice local dev workflow yet because it depends on DynamoDB data and Lambda packaging.

## AWS Deployment

### Frontend

The repo includes `amplify.yml` for deploying the React app from `frontend/`.

Set the Amplify environment variable:

- `REACT_APP_API_URL`: your deployed backend API URL

### Node Backend

Deploys with Serverless from `backend/serverless.yml`.

Creates:

- API Gateway + Lambda for the Express app
- a scheduled Lambda for listening sync
- DynamoDB tables for listening events, features, clusters, generated playlists, and user metadata

Important environment variables for deploy:

- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`
- `SPOTIFY_REDIRECT_URI`
- `FRONTEND_URL`
- `OPENAI_API_KEY`
- `OPENWEATHER_API_KEY`
- `KMS_KEY_ARN`
- `ML_LAMBDA_ARN`
- `SYNC_LAMBDA_ARN`

### Python Backend

Deploys with Serverless from `backend-python/serverless.yml`.

Important:

- it requires a Lambda layer zip at `backend-python/layers/sklearn-layer.zip`
- the GitHub Actions workflow builds that layer during deployment

## GitHub Actions Secrets

If you use the included workflow, set these repository secrets:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`
- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`
- `SPOTIFY_REDIRECT_URI`
- `FRONTEND_URL`
- `OPENWEATHER_API_KEY`
- `OPENAI_API_KEY`
- `ML_LAMBDA_ARN`
- `SYNC_LAMBDA_ARN`
- `KMS_KEY_ARN`

## Current Limitations

- local automated verification has not been completed
- the Python Lambda packaging is AWS-first, not local-first
- OpenWeather enrichment is optional
- the first deployment is easiest to do manually before relying on GitHub Actions for continuous deploys

## Suggested First Launch Order

1. Create the Spotify app and set redirect URIs.
2. Create the OpenAI API key.
3. Fill in local `.env` files.
4. Deploy the Node backend.
5. Deploy the Python backend.
6. Copy the deployed API URL into Amplify as `REACT_APP_API_URL`.
7. Update Spotify redirect URIs for the production backend callback.
8. Test login, sync, clustering, and playlist generation with your own Spotify account.
