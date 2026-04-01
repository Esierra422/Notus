"""
AI backend: WebSocket transcription (Whisper), Pinecone per meeting, LangChain RAG.
Connect frontend transcription WS here instead of Express.
Supports OpenAI function calling to create calendar meetings and tasks via Firestore.
"""
import io
import json
import os
import struct
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from dotenv import load_dotenv
from typing import Optional

from pydantic import BaseModel

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from langchain_pinecone import PineconeVectorStore
from pinecone import Pinecone, ServerlessSpec
from langchain_openai import OpenAIEmbeddings
from openai import OpenAI

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
openai_client = OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None
WHISPER_SAMPLE_RATE = 16000
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")
PINECONE_INDEX_NAME = os.getenv("PINECONE_INDEX_NAME", "notus-meetings")
EMBEDDING_DIMENSION = 1536  # text-embedding-ada-002 (default OpenAIEmbeddings)

# LangChain: one Pinecone namespace per meeting (channel); embeddings + LLM use OpenAI
_embeddings = OpenAIEmbeddings(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None
_pinecone_client: Optional[Pinecone] = None
_pinecone_index = None  # pinecone.Index, set at startup
# Reuse one vectorstore per channel so we don't re-init on every transcript chunk
_vectorstore_cache: dict[str, PineconeVectorStore] = {}

# Firebase Admin SDK for Firestore writes (calendar meetings & tasks)
_firestore_db = None


def _namespace_for_channel(channel: str) -> str:
    """Map a channel name to a Pinecone namespace."""
    return (channel or "default").strip() or "default"


def _get_vectorstore(channel: str) -> Optional[PineconeVectorStore]:
    """Get or create PineconeVectorStore for this meeting (channel namespace). Cached per channel."""
    if not _embeddings or _pinecone_index is None:
        return None
    namespace = _namespace_for_channel(channel)
    if namespace not in _vectorstore_cache:
        _vectorstore_cache[namespace] = PineconeVectorStore(
            index=_pinecone_index,
            embedding=_embeddings,
            namespace=namespace,
        )
    return _vectorstore_cache[namespace]


def add_transcript_to_meeting(channel: str, text: str) -> None:
    """Store one transcript chunk in the vector DB for this meeting."""
    if not text.strip():
        return
    vs = _get_vectorstore(channel)
    if vs is None:
        return
    try:
        vs.add_texts([text.strip()])
    except Exception as e:
        print(f"Pinecone add_texts error: {e}")


TOOL_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "create_meeting",
            "description": "Create a calendar meeting in the user's organization.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "Meeting title"},
                    "start_time": {"type": "string", "description": "Start time in ISO 8601 format (e.g. 2026-03-26T10:00:00)"},
                    "end_time": {"type": "string", "description": "End time in ISO 8601 format. Defaults to 1 hour after start."},
                    "scope": {"type": "string", "enum": ["org", "team", "private"], "description": "Meeting visibility scope. Defaults to org."},
                },
                "required": ["title", "start_time"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_task",
            "description": "Create a personal to-do task for the user.",
            "parameters": {
                "type": "object",
                "properties": {
                    "text": {"type": "string", "description": "Task description"},
                    "due_date": {"type": "string", "description": "Due date in ISO 8601 format (optional)"},
                },
                "required": ["text"],
            },
        },
    },
]


def _parse_iso(dt_string: str, user_tz: str = "") -> datetime:
    """Parse an ISO 8601 string into a UTC datetime, interpreting naive times in the user's timezone."""
    dt = datetime.fromisoformat(dt_string)
    if dt.tzinfo is None:
        # Naive datetime — treat as user's local time, then convert to UTC
        try:
            tz = ZoneInfo(user_tz) if user_tz else timezone.utc
        except (KeyError, ValueError):
            tz = timezone.utc
        dt = dt.replace(tzinfo=tz)
    return dt.astimezone(timezone.utc)


def firestore_create_meeting(uid: str, org_id: str, title: str, start_time: str, end_time: Optional[str], scope: Optional[str], user_tz: str = "") -> dict:
    """Write a meeting document to Firestore. Returns result dict for the LLM tool response."""
    if not _firestore_db:
        return {"success": False, "error": "Calendar features not configured (Firestore unavailable)."}
    if not uid or not org_id:
        return {"success": False, "error": "Missing user or organization context. Cannot create meeting."}

    from google.cloud.firestore_v1 import SERVER_TIMESTAMP

    start_dt = _parse_iso(start_time, user_tz)
    if end_time:
        end_dt = _parse_iso(end_time, user_tz)
    else:
        end_dt = start_dt + timedelta(hours=1)

    scope = scope if scope in ("org", "team", "private") else "org"
    meetings_ref = _firestore_db.collection("organizations").document(org_id).collection("meetings")
    doc_ref = meetings_ref.document()
    doc_ref.set({
        "orgId": org_id,
        "title": title or "Meeting",
        "scope": scope,
        "scopeTeamId": None,
        "scopeInviteList": [],
        "startAt": start_dt,
        "endAt": end_dt,
        "createdBy": uid,
        "createdAt": SERVER_TIMESTAMP,
    })
    return {"success": True, "meetingId": doc_ref.id, "title": title, "startAt": start_time}


def firestore_create_task(uid: str, text: str, due_date: Optional[str], user_tz: str = "") -> dict:
    """Write a todo document to Firestore. Returns result dict for the LLM tool response."""
    if not _firestore_db:
        return {"success": False, "error": "Calendar features not configured (Firestore unavailable)."}
    if not uid:
        return {"success": False, "error": "Missing user context. Cannot create task."}

    from google.cloud.firestore_v1 import SERVER_TIMESTAMP

    data = {
        "text": (text or "").strip(),
        "done": False,
        "createdAt": SERVER_TIMESTAMP,
    }
    if due_date:
        data["dueDate"] = _parse_iso(due_date, user_tz)

    todos_ref = _firestore_db.collection("users").document(uid).collection("todos")
    doc_ref = todos_ref.document()
    doc_ref.set(data)
    return {"success": True, "taskId": doc_ref.id, "text": text}


def _execute_tool_call(name: str, arguments: dict, uid: str, org_id: str, user_tz: str = "") -> dict:
    """Dispatch a tool call to the appropriate Firestore helper."""
    try:
        if name == "create_meeting":
            return firestore_create_meeting(
                uid, org_id,
                arguments.get("title", "Meeting"),
                arguments["start_time"],
                arguments.get("end_time"),
                arguments.get("scope"),
                user_tz,
            )
        elif name == "create_task":
            return firestore_create_task(
                uid,
                arguments.get("text", ""),
                arguments.get("due_date"),
                user_tz,
            )
        return {"success": False, "error": f"Unknown tool: {name}"}
    except (ValueError, KeyError) as e:
        return {"success": False, "error": f"Invalid parameters: {e}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def ask_meeting(channel: str, question: str, uid: str = "", org_id: str = "", user_tz: str = "") -> dict:
    """RAG + function calling: answer transcript questions or create meetings/tasks."""
    if not OPENAI_API_KEY or not openai_client:
        return {"answer": "OpenAI API key not configured."}
    vs = _get_vectorstore(channel)
    context = "(No transcript content yet.)"
    if vs is not None:
        try:
            docs = vs.similarity_search(question, k=6)
            if docs:
                context = "\n\n".join(d.page_content for d in docs)
        except Exception:
            pass

    # Show the current time in the user's timezone so the LLM can resolve "tomorrow", "next Monday", etc.
    try:
        tz = ZoneInfo(user_tz) if user_tz else timezone.utc
    except (KeyError, ValueError):
        tz = timezone.utc
    now_local = datetime.now(tz).strftime("%Y-%m-%dT%H:%M:%S")
    tz_label = user_tz or "UTC"
    system_msg = (
        "You are an AI assistant in a video meeting. You can answer questions about the meeting transcript, "
        "create calendar meetings, and create tasks for the user. "
        "Use the provided tools when the user asks to schedule something or create a task. "
        "For questions about the meeting, answer based on the transcript context. "
        f"The current date/time in the user's timezone ({tz_label}) is {now_local}. "
        "IMPORTANT: All times in tool call arguments (start_time, end_time, due_date) must be plain local times "
        "WITHOUT any UTC offset or timezone suffix (e.g. 2026-03-27T14:00:00, not 2026-03-27T14:00:00-04:00). "
        "The server handles timezone conversion automatically.\n\n"
        f"Transcript excerpts:\n\n{context}"
    )

    messages = [
        {"role": "system", "content": system_msg},
        {"role": "user", "content": question},
    ]

    try:
        response = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            tools=TOOL_DEFINITIONS,
            temperature=0,
        )
        choice = response.choices[0]

        if choice.message.tool_calls:
            # Execute each tool call and collect results
            messages.append(choice.message)
            actions = []
            for tool_call in choice.message.tool_calls:
                args = json.loads(tool_call.function.arguments)
                result = _execute_tool_call(tool_call.function.name, args, uid, org_id, user_tz)
                actions.append({"type": tool_call.function.name, **result})
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": json.dumps(result),
                })

            # Second LLM call to get natural language confirmation
            follow_up = openai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=messages,
                temperature=0,
            )
            answer = follow_up.choices[0].message.content or ""
            return {"answer": answer, "actions": actions}
        else:
            return {"answer": choice.message.content or ""}

    except Exception as e:
        return {"answer": f"Error: {e}"}


def raw_pcm_to_wav_buffer(raw_pcm: bytes) -> bytes:
    """Prepend 44-byte WAV header to 16kHz mono 16-bit LE PCM."""
    data_size = len(raw_pcm)
    # RIFF header + fmt + data chunk
    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF",
        36 + data_size,
        b"WAVE",
        b"fmt ",
        16,  # fmt chunk size
        1,   # PCM
        1,   # mono
        WHISPER_SAMPLE_RATE,
        WHISPER_SAMPLE_RATE * 2,  # byte rate
        2,   # block align
        16,  # bits per sample
        b"data",
        data_size,
    )
    return header + raw_pcm


def on_transcript(channel: str, uid: int, text: str) -> None:
    """Called on each Whisper segment: log and add to Pinecone for this meeting."""
    print(f"[{channel}] Transcript (uid={uid}): {text}")
    add_transcript_to_meeting(channel, text)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _pinecone_client, _pinecone_index, _firestore_db

    # Firebase Admin SDK for Firestore (calendar meetings & tasks)
    firebase_sa_key = os.getenv("FIREBASE_SERVICE_ACCOUNT_KEY")
    if firebase_sa_key:
        try:
            import firebase_admin
            from firebase_admin import credentials, firestore
            creds = json.loads(firebase_sa_key)
            firebase_admin.initialize_app(credentials.Certificate(creds))
            _firestore_db = firestore.client()
            print("Firebase Admin SDK initialized (Firestore ready).")
        except Exception as e:
            print(f"Firebase Admin initialization error: {e}")
    else:
        print("FIREBASE_SERVICE_ACCOUNT_KEY not set. Calendar write features disabled.")

    if PINECONE_API_KEY:
        try:
            import time
            _pinecone_client = Pinecone(api_key=PINECONE_API_KEY)
            existing = [idx.name for idx in _pinecone_client.list_indexes()]
            if PINECONE_INDEX_NAME not in existing:
                print(f"Creating Pinecone index '{PINECONE_INDEX_NAME}'...")
                _pinecone_client.create_index(
                    name=PINECONE_INDEX_NAME,
                    dimension=EMBEDDING_DIMENSION,
                    metric="cosine",
                    spec=ServerlessSpec(cloud="aws", region="us-east-1"),
                )
                while not _pinecone_client.describe_index(PINECONE_INDEX_NAME).status.ready:
                    time.sleep(1)
            _pinecone_index = _pinecone_client.Index(PINECONE_INDEX_NAME)
            print(f"Connected to Pinecone index '{PINECONE_INDEX_NAME}'.")
        except Exception as e:
            print(f"Pinecone initialization error: {e}")
    else:
        print("PINECONE_API_KEY not set. Vector DB disabled.")

    yield


app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGIN", "http://localhost:5173").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok"}


class AskBody(BaseModel):
    channel: str = ""
    question: str = ""
    uid: str = ""
    orgId: str = ""
    timezone: str = ""


@app.post("/api/ask")
def ask(body: AskBody):
    """RAG + calendar tools: ask a question, schedule meetings, or create tasks."""
    if not body.question.strip():
        return {"answer": "", "error": "Missing 'question' in body."}
    result = ask_meeting(body.channel or "", body.question.strip(), body.uid, body.orgId, body.timezone)
    return result


@app.websocket("/ws/transcription")
async def websocket_transcription(websocket: WebSocket):
    await websocket.accept()
    channel = None
    uid = None

    try:
        while True:
            message = await websocket.receive()
            if message.get("type") == "websocket.disconnect":
                break
            if message.get("type") != "websocket.receive":
                continue
            # First message from client is text (JSON meta)
            if "text" in message:
                try:
                    meta = json.loads(message["text"])
                    if meta.get("type") == "meta":
                        channel = meta.get("channel")
                        uid = meta.get("uid")
                        print(f"Transcription WS: channel={channel}, uid={uid}")
                        # Prime vectorstore for this meeting so we only push when transcripts arrive
                        _get_vectorstore(channel)
                except json.JSONDecodeError:
                    pass
                continue
            # Binary: raw Int16 PCM (16kHz mono)
            data = message.get("bytes", b"")
            if not data or channel is None:
                continue
            if not openai_client:
                print("OpenAI API key not set. Set OPENAI_API_KEY in .env")
                continue
            try:
                wav_bytes = raw_pcm_to_wav_buffer(data)
                file_like = io.BytesIO(wav_bytes)
                file_like.name = "audio.wav"
                transcript = openai_client.audio.transcriptions.create(
                    file=file_like,
                    model="whisper-1",
                    language="en",
                )
                text = (transcript.text or "").strip()
                if text:
                    on_transcript(channel, uid, text)
            except Exception as e:
                print(f"Whisper transcription error: {e}")
    except WebSocketDisconnect:
        pass  # client closed normally
    except Exception as e:
        print(f"WebSocket error: {e}")
    finally:
        print(f"Transcription WS closed: channel={channel}, uid={uid}")
        # Test RAG when meeting ends: ask "What is MCP?" and print the answer
        if channel and OPENAI_API_KEY:
            try:
                test_answer = ask_meeting(channel, "What is MCP?")
                print(f"[RAG test] What is MCP? -> {test_answer}")
            except Exception as e:
                print(f"[RAG test] Error: {e}")
