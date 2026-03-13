"""
AI backend: WebSocket transcription (Whisper), Pinecone per meeting, LangChain RAG.
Connect frontend transcription WS here instead of Express.
"""
import io
import json
import os
import struct
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from pydantic import BaseModel

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from langchain_pinecone import PineconeVectorStore
from pinecone import Pinecone, ServerlessSpec
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_core.prompts import ChatPromptTemplate
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
_pinecone_client: Pinecone | None = None
_pinecone_index = None  # pinecone.Index, set at startup
# Reuse one vectorstore per channel so we don't re-init on every transcript chunk
_vectorstore_cache: dict[str, PineconeVectorStore] = {}


def _namespace_for_channel(channel: str) -> str:
    """Map a channel name to a Pinecone namespace."""
    return (channel or "default").strip() or "default"


def _get_vectorstore(channel: str) -> PineconeVectorStore | None:
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


def ask_meeting(channel: str, question: str) -> str:
    """RAG: retrieve relevant transcript chunks for this meeting, then answer with LLM."""
    if not OPENAI_API_KEY:
        return "OpenAI API key not configured."
    vs = _get_vectorstore(channel)
    if vs is None:
        return "Embeddings not available."
    try:
        docs = vs.similarity_search(question, k=6)
        context = "\n\n".join(d.page_content for d in docs) if docs else "(No transcript content yet.)"
        llm = ChatOpenAI(model="gpt-4o-mini", api_key=OPENAI_API_KEY, temperature=0)
        prompt = ChatPromptTemplate.from_messages([
            ("system", "Answer based only on the following meeting transcript excerpts. If the content does not contain enough information, say so briefly."),
            ("human", "Transcript excerpts:\n\n{context}\n\nQuestion: {question}"),
        ])
        chain = prompt | llm
        response = chain.invoke({"context": context, "question": question})
        return response.content if hasattr(response, "content") else str(response)
    except Exception as e:
        return f"Error: {e}"


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
    global _pinecone_client, _pinecone_index

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
                while not _pinecone_client.describe_index(PINECONE_INDEX_NAME).status["ready"]:
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


@app.get("/health")
def health():
    return {"status": "ok"}


class AskBody(BaseModel):
    channel: str = ""
    question: str = ""


@app.post("/ask")
def ask(body: AskBody):
    """RAG: ask a question about a meeting's transcript. Body: { \"channel\": \"channel1\", \"question\": \"What is MCP?\" }"""
    if not body.question.strip():
        return {"answer": "", "error": "Missing 'question' in body."}
    answer = ask_meeting(body.channel or "", body.question.strip())
    return {"answer": answer}


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
