import os
import uuid
from datetime import datetime
from dotenv import load_dotenv
from flask import Flask, request, jsonify
from flask_cors import CORS
from werkzeug.utils import secure_filename
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from sentence_transformers import SentenceTransformer
import chromadb
from groq import Groq

load_dotenv()

app = Flask(__name__)
CORS(app)

os.makedirs("./uploads", exist_ok=True)

# ── Initialize once at startup ─────────────────────────────
embedder      = SentenceTransformer("all-MiniLM-L6-v2")
chroma_client = chromadb.PersistentClient(path="./chroma_db")
try:
    collection = chroma_client.get_collection("documents")
except:
    collection = chroma_client.create_collection("documents")
groq_client   = Groq(api_key=os.environ.get("GROQ_API_KEY"))

documents      = {}  # { doc_id: { name, pages, chunks, uploaded } }
chat_histories = {}  # { doc_id: [messages] }
global_history = []



# ── Helpers ────────────────────────────────────────────────

def process_pdf(path, doc_id, doc_name):
    pages  = PyPDFLoader(path).load()
    chunks = RecursiveCharacterTextSplitter(
        chunk_size=500, chunk_overlap=50
    ).split_documents(pages)
    texts  = [c.page_content for c in chunks]
    collection.add(
        documents  = texts,
        embeddings = embedder.encode(texts).tolist(),
        metadatas  = [
            {"doc_id": doc_id, "doc_name": doc_name,
             "page": c.metadata.get("page", 0) + 1}
            for c in chunks
        ],
        ids = [f"{doc_id}_{i}" for i in range(len(chunks))]
    )
    return len(pages), len(chunks)


def retrieve(question, doc_id=None, n=3):
    args = dict(
        query_embeddings = embedder.encode([question]).tolist(),
        n_results        = n,
        include          = ["documents", "metadatas", "distances"]
    )
    if doc_id:
        args["where"] = {"doc_id": doc_id}
    r = collection.query(**args)
    return [
        {
            "text":      r["documents"][0][i],
            "page":      r["metadatas"][0][i]["page"],
            "doc_name":  r["metadatas"][0][i]["doc_name"],
            "relevance": round(1 - r["distances"][0][i], 2)
        }
        for i in range(len(r["documents"][0]))
    ]


def answer(question, chunks, history, scope="all documents"):
    context = "\n\n".join(
        f"[{c['doc_name']} — Page {c['page']}]: {c['text']}"
        for c in chunks
    )
    messages = [
        {
            "role": "system",
            "content": f"Answer using ONLY this context from {scope}. "
                       f"Cite page numbers. Say 'I don't have that info' if insufficient.\n\n{context}"
        }
    ] + history + [{"role": "user", "content": question}]

    return groq_client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=messages,
        max_tokens=400,
        temperature=0.1
    ).choices[0].message.content


# Routes 

@app.route("/", methods=["GET"])
def home():
    return jsonify({"status": "running", "documents": len(documents)})


# Upload PDF
@app.route("/documents", methods=["POST"])
def upload():
    file     = request.files["file"]
    doc_id   = str(uuid.uuid4())[:8]
    doc_name = request.form.get("name", file.filename)
    filepath = f"./uploads/{doc_id}_{secure_filename(file.filename)}"
    file.save(filepath)

    pages, chunks = process_pdf(filepath, doc_id, doc_name)
    documents[doc_id]      = {"name": doc_name, "pages": pages,
                               "chunks": chunks, "filepath": filepath,
                               "uploaded": datetime.now().strftime("%H:%M")}
    chat_histories[doc_id] = []

    return jsonify({"doc_id": doc_id, "name": doc_name,
                    "pages": pages, "chunks": chunks}), 201


# List documents
@app.route("/documents", methods=["GET"])
def list_docs():
    return jsonify({
        "documents": [
            {"doc_id": k, **{f: v for f, v in info.items() if f != "filepath"}}
            for k, info in documents.items()
        ]
    })


# Delete document
@app.route("/documents/<doc_id>", methods=["DELETE"])
def delete(doc_id):
    ids = collection.get(where={"doc_id": doc_id})["ids"]
    if ids:
        collection.delete(ids=ids)
    filepath = documents[doc_id]["filepath"]
    if os.path.exists(filepath):
        os.remove(filepath)
    del documents[doc_id]
    del chat_histories[doc_id]
    return jsonify({"message": f"Deleted {doc_id}"})


# Chat
@app.route("/chat", methods=["POST"])
def chat():
    global global_history
    data     = request.get_json()
    question = data["question"]
    doc_id   = data.get("doc_id")
    history  = chat_histories.get(doc_id, []) if doc_id else global_history
    scope    = f"'{documents[doc_id]['name']}'" if doc_id else "all documents"

    chunks   = retrieve(question, doc_id)
    response = answer(question, chunks, history, scope)

    updated  = (history + [
        {"role": "user",      "content": question},
        {"role": "assistant", "content": response}
    ])[-10:]

    if doc_id:
        chat_histories[doc_id] = updated
    else:
        global_history = updated

    return jsonify({
        "answer":  response,
        "sources": [{"doc": c["doc_name"], "page": c["page"],
                     "relevance": c["relevance"]} for c in chunks]
    })


# Compare two documents
@app.route("/compare", methods=["POST"])
def compare():
    data     = request.get_json()
    question = data["question"]
    id1, id2 = data["doc_id_1"], data["doc_id_2"]
    n1, n2   = documents[id1]["name"], documents[id2]["name"]
    c1, c2   = retrieve(question, id1, n=2), retrieve(question, id2, n=2)

    prompt = f"""Compare what these documents say about: "{question}"

{n1}: {" ".join(c["text"] for c in c1)}

{n2}: {" ".join(c["text"] for c in c2)}

Answer:
1. {n1} says...
2. {n2} says...
3. Similarities...
4. Differences..."""

    response = groq_client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=500, temperature=0.1
    ).choices[0].message.content

    return jsonify({"comparison": response})


# Reset history
@app.route("/reset", methods=["POST"])
def reset():
    global global_history
    doc_id = (request.get_json() or {}).get("doc_id")
    if doc_id:
        chat_histories[doc_id] = []
    else:
        global_history = []
    return jsonify({"message": "History reset"})


if __name__ == "__main__":
    app.run(debug=True, port=5002)
