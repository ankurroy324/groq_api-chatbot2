
# ============================================================================
# main.py — FastAPI Backend for the Groq AI Chatbot
#
# What this file does:
#   1. Starts a FastAPI web server via Uvicorn.
#   2. Exposes one main endpoint: POST /api/chat
#   3. That endpoint takes the conversation so far, sends it to Groq's API,
#      and STREAMS the AI's reply back to the browser token-by-token.
#   4. It also serves the frontend (the Vite React build) so you only need
#      to run ONE server for the whole app.
#
# Why a backend at all (instead of calling Groq directly from the browser)?
#   Your GROQ_API_KEY is a secret. If you put it in frontend JavaScript,
#   anyone visiting your site can open dev tools and steal it. The backend
#   keeps the key safely on the server and never sends it to the browser.
# ============================================================================

import os
import time
from typing import Literal

from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse, FileResponse
from pydantic import BaseModel, field_validator
from groq import Groq

# Load variables from the .env file (must be before reading env vars)
load_dotenv()

# ----------------------------------------------------------------------------
# 1. STARTUP VALIDATION
# Fail fast and loud if the API key is missing, instead of crashing later
# mid-conversation with a confusing error.
# ----------------------------------------------------------------------------
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
if not GROQ_API_KEY:
    print("[WARNING] GROQ_API_KEY is not set. Set it as an environment variable.")
    print("          API calls will fail until the key is provided.")

# Which model to use. Groq deprecates/updates models periodically —
# check https://console.groq.com/docs/models for the current list.
MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
PORT = int(os.getenv("PORT", "8000"))

groq_client = Groq(api_key=GROQ_API_KEY)

# ----------------------------------------------------------------------------
# 2. FASTAPI APP + MIDDLEWARE
# ----------------------------------------------------------------------------
app = FastAPI(title="Groq AI Chatbot", version="1.0.0")

# CORS — allows the frontend to call this API (safe here since we serve both
# from one origin, but handy if you split them later).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------------------------------------------------------------------
# 3. IN-MEMORY RATE LIMITER (per IP)
# Prevents someone from hammering your API key and running up your Groq bill.
# Good enough for a small/demo app; swap for a proper solution for production.
# ----------------------------------------------------------------------------
RATE_LIMIT = 20           # max requests
RATE_WINDOW_SECS = 60     # per 1 minute

# ip -> list of timestamps
request_log: dict[str, list[float]] = {}


def is_rate_limited(ip: str) -> bool:
    now = time.time()
    cutoff = now - RATE_WINDOW_SECS
    timestamps = [t for t in request_log.get(ip, []) if t > cutoff]
    timestamps.append(now)
    request_log[ip] = timestamps
    return len(timestamps) > RATE_LIMIT


# ----------------------------------------------------------------------------
# 4. PYDANTIC MODELS FOR INPUT VALIDATION
# ----------------------------------------------------------------------------
class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str

    @field_validator("content")
    @classmethod
    def content_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Message content must not be empty.")
        return v


class ChatRequest(BaseModel):
    messages: list[ChatMessage]

    @field_validator("messages")
    @classmethod
    def messages_not_empty(cls, v: list[ChatMessage]) -> list[ChatMessage]:
        if len(v) == 0:
            raise ValueError("Messages array must not be empty.")
        return v


# ----------------------------------------------------------------------------
# 5. HEALTH CHECK
# Handy for confirming the server is alive, and required by most hosting
# platforms (Render, Railway, etc.) to know your app is up.
# ----------------------------------------------------------------------------
@app.get("/")
async def root():
    dist_index = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist", "index.html")
    if os.path.exists(dist_index):
        return FileResponse(dist_index)
    return {"status": "ok", "message": "Groq AI Chatbot API is running"}


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "model": MODEL}


# ----------------------------------------------------------------------------
# 6. MAIN CHAT ENDPOINT
# Expects: { messages: [{ role: 'user' | 'assistant', content: string }, ...] }
# Responds with: a plain-text stream of the AI's reply (chunked transfer).
# ----------------------------------------------------------------------------
@app.post("/api/chat")
async def chat(request: Request, body: ChatRequest):
    # Rate limiting
    client_ip = request.client.host if request.client else "unknown"
    if is_rate_limited(client_ip):
        raise HTTPException(
            status_code=429,
            detail="Too many requests. Please slow down and try again shortly.",
        )

    # Only keep the last 20 messages. This keeps requests fast/cheap and stays
    # well within the model's context window for a simple chatbot.
    recent_history = body.messages[-20:]

    # A system prompt sets the assistant's personality/behavior. Customize this!
    system_message = {
        "role": "system",
        "content": (
            "You are a helpful, friendly AI assistant in a chat app. Give clear, "
            "concise answers. Use markdown formatting (like **bold** or lists) "
            "when it improves readability."
        ),
    }

    # Build the messages list for the Groq API
    api_messages = [system_message] + [
        {"role": m.role, "content": m.content} for m in recent_history
    ]

    async def stream_tokens():
        """Async generator that yields tokens from the Groq streaming API."""
        try:
            stream = groq_client.chat.completions.create(
                model=MODEL,
                messages=api_messages,
                temperature=0.7,    # 0 = deterministic, 1+ = more creative
                max_tokens=1024,    # cap on reply length
                stream=True,
            )

            for chunk in stream:
                token = chunk.choices[0].delta.content or ""
                if token:
                    yield token

        except Exception as e:
            print(f"Groq API error: {e}")
            # If the stream hasn't started sending data, this will propagate
            # as part of the response. If it has, the frontend's error handling
            # will catch the incomplete reply.
            error_msg = (
                "Invalid Groq API key. Check your .env file."
                if getattr(e, "status_code", None) == 401
                else "Something went wrong talking to the AI. Please try again."
            )
            yield f"\n\n[Error: {error_msg}]"

    return StreamingResponse(
        stream_tokens(),
        media_type="text/plain; charset=utf-8",
        headers={"Cache-Control": "no-cache"},
    )


# ----------------------------------------------------------------------------
# 7. PYDANTIC VALIDATION ERROR HANDLER
# Return clean JSON errors instead of FastAPI's default 422 format, matching
# the error format the frontend expects.
# ----------------------------------------------------------------------------
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.detail},
    )


from fastapi.exceptions import RequestValidationError

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=400,
        content={
            "error": "Each message needs a role of 'user' or 'assistant' and non-empty string content."
        },
    )


# ----------------------------------------------------------------------------
# 8. START SERVER (local dev only)
# On Vercel, the ASGI app is invoked directly by the Python runtime.
# Locally, run: python main.py
# ----------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    print(f"\n[OK] Groq chatbot backend running at http://localhost:{PORT}")
    print(f"   Using model: {MODEL}")
    print("   Frontend dev server: npm run dev (in frontend/)\n")
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="info")
