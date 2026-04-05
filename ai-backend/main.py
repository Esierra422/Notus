"""
AI backend: WebSocket transcription (Whisper), Pinecone per meeting, LangChain RAG.
Connect frontend transcription WS here instead of Express.
Supports OpenAI function calling to create calendar meetings and tasks via Firestore.
Post-meeting summary generation with full transcript stored in Firestore.
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


def add_transcript_to_meeting(rag_namespace: str, text: str) -> None:
    """Store one transcript chunk in the vector DB for this meeting session."""
    if not text.strip():
        return
    vs = _get_vectorstore(rag_namespace)
    if vs is None:
        return
    try:
        vs.add_texts([text.strip()])
    except Exception as e:
        print(f"Pinecone add_texts error: {e}")


def _transcript_text_from_pinecone(namespace: str) -> str:
    """
    Reconstruct meeting text from Pinecone (same namespace as live /api/ask RAG).
    Used when meetingTranscripts/{sessionId} is missing or empty but in-meeting Q&A still worked.
    """
    key = (namespace or "").strip() or "default"
    vs = _get_vectorstore(key)
    if vs is None:
        return ""
    seen: set[str] = set()
    parts: list[str] = []
    for q in (
        "meeting discussion decisions",
        "action items tasks next steps",
        "what participants said",
        "summary topics",
    ):
        try:
            docs = vs.similarity_search(q, k=25)
            for d in docs:
                t = (d.page_content or "").strip()
                if len(t) < 3 or t in seen:
                    continue
                seen.add(t)
                parts.append(t)
        except Exception as e:
            print(f"[Summary] Pinecone gather error ({q[:20]}…): {e}")
    return " ".join(parts)


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


def ask_meeting(
    channel: str,
    question: str,
    uid: str = "",
    org_id: str = "",
    user_tz: str = "",
    session_id: str = "",
) -> dict:
    """RAG + function calling: answer transcript questions or create meetings/tasks."""
    if not OPENAI_API_KEY or not openai_client:
        return {"answer": "OpenAI API key not configured."}
    rag_key = (session_id or channel or "").strip() or "default"
    vs = _get_vectorstore(rag_key)
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


def _append_transcript_to_firestore(session_id: str, channel: str, uid, text: str) -> None:
    """Append a transcript chunk to Firestore meetingTranscripts/{session_id} (one doc per meeting session)."""
    if not _firestore_db or not session_id:
        return
    try:
        from google.cloud.firestore_v1 import ArrayUnion, Increment, SERVER_TIMESTAMP
        doc_ref = _firestore_db.collection("meetingTranscripts").document(session_id)
        chunk = {
            "text": text,
            "uid": str(uid) if uid else "",
            "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S"),
        }
        doc_ref.set({
            "sessionId": session_id,
            "channelName": channel or "",
            "chunks": ArrayUnion([chunk]),
            "totalWordCount": Increment(len(text.split())),
            "updatedAt": SERVER_TIMESTAMP,
        }, merge=True)
    except Exception as e:
        print(f"Firestore transcript append error: {e}")


def on_transcript(session_id: str, channel: str, uid: int, text: str) -> None:
    """Called on each Whisper segment: Pinecone namespace = session, Firestore doc = session_id."""
    print(f"[session={session_id} channel={channel}] Transcript (uid={uid}): {text}")
    add_transcript_to_meeting(session_id, text)
    _append_transcript_to_firestore(session_id, channel, uid, text)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _pinecone_client, _pinecone_index, _firestore_db

    # Firebase Admin SDK for Firestore (calendar meetings & tasks)
    firebase_sa_key = (os.getenv("FIREBASE_SERVICE_ACCOUNT_KEY") or "").strip()
    if firebase_sa_key:
        try:
            import firebase_admin
            from firebase_admin import credentials, firestore
            creds = json.loads(firebase_sa_key)
            firebase_admin.initialize_app(credentials.Certificate(creds))
            _firestore_db = firestore.client()
            print("Firebase Admin SDK initialized (Firestore ready).")
        except json.JSONDecodeError as e:
            print(
                f"Firebase Admin JSON parse error: {e}. "
                "Use one line of minified JSON (jq -c . serviceAccount.json). "
                "On Render, paste the entire value with no leading # or label."
            )
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
# Browser calls /api/* from Firebase Hosting or localhost. This API does not rely on cookies;
# allow_origins=* avoids broken summaries when CORS_ORIGIN is not set on Render.
# Set CORS_ORIGIN=https://yourapp.web.app,https://yourdomain.com for an explicit allow list (no spaces after commas).
_cors_raw = (os.getenv("CORS_ORIGIN") or "*").strip()
_cors_list = [o.strip() for o in _cors_raw.split(",") if o.strip()]
if not _cors_list:
    _cors_list = ["*"]
_cors_credentials = "*" not in _cors_list
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_list,
    allow_credentials=_cors_credentials,
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
    sessionId: str = ""


@app.post("/api/ask")
def ask(body: AskBody):
    """RAG + calendar tools: ask a question, schedule meetings, or create tasks."""
    if not body.question.strip():
        return {"answer": "", "error": "Missing 'question' in body."}
    result = ask_meeting(
        body.channel or "",
        body.question.strip(),
        body.uid,
        body.orgId,
        body.timezone,
        (body.sessionId or "").strip(),
    )
    return result


class SummarizeBody(BaseModel):
    channel: str = ""
    sessionId: str = ""
    uid: str = ""
    orgId: str = ""
    participants: list[str] = []


@app.post("/api/generate-summary")
def generate_summary(body: SummarizeBody):
    """Generate a post-meeting summary from the full transcript stored in Firestore."""
    print(f"[Summary] Request: channel={body.channel}, sessionId={body.sessionId}, uid={body.uid}, orgId={body.orgId}")
    if not _firestore_db:
        print("[Summary] ERROR: Firestore not configured")
        return {"error": "Firestore not configured."}
    if not openai_client or not OPENAI_API_KEY:
        print("[Summary] ERROR: OpenAI not configured")
        return {"error": "OpenAI API key not configured."}

    transcript_doc_id = (body.sessionId or "").strip() or (body.channel or "").strip()
    if not transcript_doc_id:
        print("[Summary] ERROR: Missing sessionId or channel")
        return {"error": "Missing session id or channel."}

    doc_ref = _firestore_db.collection("meetingTranscripts").document(transcript_doc_id)
    chunks: list = []
    try:
        doc = doc_ref.get()
        if doc.exists:
            data = doc.to_dict() or {}
            raw_chunks = data.get("chunks", [])
            if isinstance(raw_chunks, list):
                chunks = raw_chunks
            print(f"[Summary] Firestore chunk count={len(chunks)} for id '{transcript_doc_id}'")
        else:
            print(f"[Summary] No Firestore transcript doc for id '{transcript_doc_id}' (will try Pinecone)")
    except Exception as e:
        print(f"[Summary] ERROR reading Firestore transcript: {e}")
        return {"error": f"Failed to read transcript: {e}"}

    full_text = " ".join(
        (c.get("text", "") if isinstance(c, dict) else str(c))
        for c in chunks
    ).strip()
    word_count = len(full_text.split())

    # Live Q&A reads Pinecone only; Firestore append can fail while vectors succeed. Merge Pinecone if thin/missing.
    if word_count < 100:
        pc_text = _transcript_text_from_pinecone(transcript_doc_id)
        pc_words = len(pc_text.split()) if pc_text else 0
        if pc_text:
            print(f"[Summary] Firestore words={word_count}; Pinecone fallback words≈{pc_words}")
            full_text = (full_text + " " + pc_text).strip() if full_text else pc_text
            word_count = len(full_text.split())
        elif not full_text:
            print(f"[Summary] No Firestore text and no Pinecone vectors for namespace '{transcript_doc_id}'")
            return {
                "error": "No transcript found for this meeting. Speak with the mic on, or check AI / Pinecone.",
                "wordCount": 0,
            }

    print(f"[Summary] Total word count (after merge): {word_count}")
    MIN_SUMMARY_WORDS = 70
    if word_count < MIN_SUMMARY_WORDS:
        print(f"[Summary] Transcript too short ({word_count} words, min {MIN_SUMMARY_WORDS})")
        return {
            "error": "Transcript too short for a meaningful summary. Talk longer with the microphone on, then use End for everyone.",
            "wordCount": word_count,
        }

    # Generate summary via OpenAI
    print("[Summary] Calling OpenAI for summary generation...")
    try:
        system_prompt = (
            "You are an AI that summarizes meeting transcripts. Given the full transcript below, "
            "produce a structured JSON response with these keys:\n"
            '- "title": a short, descriptive meeting title (5-10 words)\n'
            '- "summary": a 2-4 paragraph summary of what was discussed\n'
            '- "keyPoints": an array of 3-7 key takeaways as short bullet strings\n'
            '- "actionItems": an array of action items or next steps mentioned (empty array if none)\n\n'
            "Respond ONLY with valid JSON. No markdown, no extra text.\n\n"
            f"Transcript:\n\n{full_text}"
        )
        response = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": "Please summarize this meeting."},
            ],
            response_format={"type": "json_object"},
            temperature=0.3,
        )
        raw = response.choices[0].message.content or "{}"
        summary_data = json.loads(raw)
    except Exception as e:
        print(f"[Summary] ERROR OpenAI: {e}")
        return {"error": f"Summary generation failed: {e}"}

    print(f"[Summary] OpenAI returned title: {summary_data.get('title')}")
    # Write summary to Firestore
    try:
        from google.cloud.firestore_v1 import SERVER_TIMESTAMP
        summary_doc = {
            "channelName": (body.channel or "").strip() or transcript_doc_id,
            "transcriptSessionId": transcript_doc_id,
            "generatedBy": body.uid,
            "orgId": body.orgId,
            "title": summary_data.get("title", "Meeting Summary"),
            "summary": summary_data.get("summary", ""),
            "keyPoints": summary_data.get("keyPoints", []),
            "actionItems": summary_data.get("actionItems", []),
            "participants": body.participants,
            "transcript": full_text,
            "wordCount": word_count,
            "createdAt": SERVER_TIMESTAMP,
        }
        sum_ref = _firestore_db.collection("meetingSummaries").document()
        sum_ref.set(summary_doc)
        print(f"[Summary] SUCCESS: saved as {sum_ref.id}")
        # Consume transcript so leaving again does not re-summarize stale text
        try:
            doc_ref.delete()
            print(f"[Summary] Deleted transcript doc '{transcript_doc_id}'")
        except Exception as del_e:
            print(f"[Summary] WARN: could not delete transcript doc: {del_e}")
        return {
            "success": True,
            "summaryId": sum_ref.id,
            "title": summary_doc["title"],
            "wordCount": word_count,
        }
    except Exception as e:
        print(f"[Summary] ERROR saving to Firestore: {e}")
        return {"error": f"Failed to save summary: {e}"}


@app.websocket("/ws/transcription")
async def websocket_transcription(websocket: WebSocket):
    await websocket.accept()
    channel = None
    uid = None
    session_id = None

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
                        session_id = (meta.get("sessionId") or meta.get("session_id") or "").strip() or None
                        if not session_id and channel:
                            session_id = str(channel).strip()
                        print(f"Transcription WS: channel={channel}, uid={uid}, sessionId={session_id}")
                        if session_id:
                            _get_vectorstore(session_id)
                except json.JSONDecodeError:
                    pass
                continue
            # Binary: raw Int16 PCM (16kHz mono)
            data = message.get("bytes", b"")
            if not data or channel is None or not session_id:
                continue
            if not openai_client:
                print("OpenAI API key not set. Set OPENAI_API_KEY in .env")
                continue
            try:
                duration_sec = len(data) / (WHISPER_SAMPLE_RATE * 2)  # 16-bit = 2 bytes per sample
                print(f"[{session_id}] Audio chunk: {len(data)} bytes, ~{duration_sec:.1f}s")
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
                    on_transcript(session_id, channel, uid, text)
                    try:
                        await websocket.send_json({"type": "transcript", "text": text})
                    except Exception:
                        pass  # client may have disconnected
            except Exception as e:
                print(f"Whisper transcription error: {e}")
    except WebSocketDisconnect:
        pass  # client closed normally
    except Exception as e:
        print(f"WebSocket error: {e}")
    finally:
        print(f"Transcription WS closed: channel={channel}, uid={uid}, sessionId={session_id}")
