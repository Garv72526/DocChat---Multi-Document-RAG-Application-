# DocChat – Multi-Document RAG Application

DocChat is a full-stack AI-powered Retrieval-Augmented Generation (RAG) application that enables users to upload multiple PDF documents and perform semantic question answering across them using Large Language Models (LLMs).

The application uses LangChain, ChromaDB, Sentence Transformers, and Groq LLaMA 3 to retrieve context-aware answers with source citations.

---

## Features

- Multi-document semantic search and question answering
- Retrieval-Augmented Generation (RAG) pipeline
- PDF upload and document management
- Source citations with page numbers
- Conversation memory with sliding window history
- Cross-document comparison
- Flask REST API backend
- React.js frontend
- Vector embeddings using Sentence Transformers
- ChromaDB vector database integration

---

## Tech Stack

### Backend
- Python
- Flask
- LangChain
- ChromaDB
- Sentence Transformers
- Groq API

### Frontend
- React.js
- Vite
- Axios

### Database & Tools
- ChromaDB
- Git
- Docker (optional)

---

## Project Structure

```bash
DocChat/
│
├── backend/
│   ├── app.py
│   ├── rag_pipeline.py
│   ├── requirements.txt
│   └── uploads/
│
├── frontend/
│   ├── src/
│   ├── public/
│   └── package.json
│
├── .gitignore
├── README.md
└── .env
