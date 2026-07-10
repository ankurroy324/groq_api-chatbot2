# ⚡ Groq AI Chatbot

A production-ready, highly responsive AI chatbot powered by [Groq](https://groq.com)'s ultra-fast inference API. It uses a **Python (FastAPI)** backend to keep your API key secure and a modern **React (Vite)** frontend to deliver token-by-token streaming responses.

---

## 🏗️ Project Architecture & Structure

The repository is organized into a decoupled client-server architecture:

```
groq-chatbot/
├── backend/
│   ├── main.py            # FastAPI server + Groq API integration
│   ├── requirements.txt   # Python dependencies (FastAPI, uvicorn, groq, etc.)
│   ├── .env               # Local environment variables (do not commit!)
│   ├── .env.example       # Environment template
│   └── .gitignore         # Ignores virtualenv and local secrets
├── frontend/
│   ├── index.html         # HTML entry point
│   ├── package.json       # React dependencies and build scripts
│   ├── vite.config.js     # Vite configuration with API dev proxy
│   └── src/
│       ├── main.jsx       # React application mounting
│       ├── App.jsx        # Core chat layout and messaging state logic
│       └── index.css      # CSS styling and variables
├── README.md              # ← You are here
└── setup.md               # Detailed Setup Guide
```

For step-by-step guidance on running the app from clean machine states, see the companion [setup.md](file:///c:/Users/ankur/Downloads/groq-chatbot/groq-chatbot/setup.md) guide.

---

## 🚀 Quick Start (5 Minutes)

### 1. Prerequisites
Ensure you have **Python 3.10+** and **Node.js 18+** installed. You will also need a free Groq API key from the [Groq Console](https://console.groq.com).

### 2. Configure Environment Variables
From the [backend/](file:///c:/Users/ankur/Downloads/groq-chatbot/groq-chatbot/backend) directory:
```bash
cd backend
cp .env.example .env
```
Open [backend/.env](file:///c:/Users/ankur/Downloads/groq-chatbot/groq-chatbot/backend/.env) and paste your key:
```env
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxx
```

### 3. Run Backend (FastAPI)
Initialize a virtual environment, activate it, install dependencies, and run:
```bash
python -m venv venv

# Activate (On Windows CMD):
venv\Scripts\activate
# Activate (On Windows PowerShell):
.\venv\Scripts\Activate.ps1
# Activate (On macOS/Linux):
source venv/bin/activate

pip install -r requirements.txt
python main.py
```
*The FastAPI backend starts on http://localhost:8000.*

### 4. Run Frontend (Vite + React)
In a new terminal window, navigate to the [frontend/](file:///c:/Users/ankur/Downloads/groq-chatbot/groq-chatbot/frontend) directory and start the Vite dev server:
```bash
cd frontend
npm install
npm run dev
```
*The Vite development server runs on http://localhost:5173, proxying API calls to http://127.0.0.1:8000.*

---

## 🛠️ How It Works (The Short Version)

1. **User interaction:** When you send a message, the React state in [App.jsx](file:///c:/Users/ankur/Downloads/groq-chatbot/groq-chatbot/frontend/src/App.jsx) appends the message to a list.
2. **Conversation History:** The React client sends the last 20 messages to the backend `/api/chat` endpoint. Sending the array gives the LLM "memory" since the model itself is stateless.
3. **Backend validation & API call:** The FastAPI app in [main.py](file:///c:/Users/ankur/Downloads/groq-chatbot/groq-chatbot/backend/main.py) validates the request format using Pydantic, applies a custom system prompt setting the bot's behavior, and initiates a stream request with the Groq Python SDK.
4. **Token Streaming:** FastAPI yields chunks to the browser in real time via a `StreamingResponse`. The client reads this stream chunk-by-chunk using a fetch stream reader, rendering the text as it is generated for a smooth typing effect.
5. **Persistence:** Once streaming is completed, the full assistant reply is saved to the local conversation history list and persisted in the browser's `localStorage`.

---

## ✨ Best Practices Built-in

* 🔒 **API Key Protection:** The API key is stored safely on the server inside [backend/.env](file:///c:/Users/ankur/Downloads/groq-chatbot/groq-chatbot/backend/.env) and never exposed to the client browser.
* ⚡ **Ultra-low latency streaming:** Leverages ASGI-compatible streaming, enabling immediate token delivery to the frontend.
* 🚦 **Per-IP Rate Limiting:** Includes an in-memory sliding window rate limiter in [main.py](file:///c:/Users/ankur/Downloads/groq-chatbot/groq-chatbot/backend/main.py) to avoid unintended api billing runaways.
* 🛡️ **Request Validation:** Strict data structures validated via Pydantic model configurations.
* 🚫 **Fail Fast Startup Checks:** Validates the presence of `GROQ_API_KEY` on startup, crashing with a readable configuration prompt if missing.

---

## 🎨 Configuration & Customization

* **Bot Personality:** Modify the system prompt's instruction contents in [main.py](file:///c:/Users/ankur/Downloads/groq-chatbot/groq-chatbot/backend/main.py#L147-L154).
* **Model selection:** Change `GROQ_MODEL` in `.env` (check [console.groq.com/docs/models](https://console.groq.com/docs/models) for supported models).
* **Rate Limits:** Adjust `RATE_LIMIT` and `RATE_WINDOW_SECS` constants in [main.py](file:///c:/Users/ankur/Downloads/groq-chatbot/groq-chatbot/backend/main.py#L75).
* **Styling & Colors:** Modify the color palette variables in [frontend/src/index.css](file:///c:/Users/ankur/Downloads/groq-chatbot/groq-chatbot/frontend/src/index.css).

---

## 🌐 Production & Deployment

In production, build the frontend into static assets:
```bash
cd frontend
npm run build
```
Then start the FastAPI backend:
```bash
cd ../backend
python main.py
```
FastAPI will detect the `frontend/dist` directory and serve the static files directly from `http://localhost:8000` alongside the `/api` routes, meaning you only need to deploy **one** container or service.

### Recommended Free/Low-cost Hosts
1. **Render.com:** Deploy a Python **Web Service** with the root directory set to `backend`. Configure the build command `pip install -r requirements.txt` and the start command `python main.py`. Make sure to set `GROQ_API_KEY` in Render's Env settings.
2. **Railway.app:** Create a web service using the `backend/` subdirectory. Railway will auto-discover the requirements and `python main.py` entry point.
