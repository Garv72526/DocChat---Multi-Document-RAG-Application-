import { useState, useEffect, useRef } from "react";
import { uploadDoc, listDocs, deleteDoc, chat, compareDocs, resetHistory } from "./api";
import "./App.css";

export default function App() {
  const [docs,          setDocs]          = useState([]);
  const [selectedDoc,   setSelectedDoc]   = useState(null);
  const [messages,      setMessages]      = useState([]);
  const [question,      setQuestion]      = useState("");
  const [loading,       setLoading]       = useState(false);
  const [uploading,     setUploading]     = useState(false);
  const [tab,           setTab]           = useState("chat");
  const [compareDoc1,   setCompareDoc1]   = useState("");
  const [compareDoc2,   setCompareDoc2]   = useState("");
  const [compareQ,      setCompareQ]      = useState("");
  const [compareResult, setCompareResult] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => { fetchDocs(); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function fetchDocs() {
    const res = await listDocs();
    setDocs(res.data.documents);
  }

  async function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    form.append("name", file.name.replace(".pdf", ""));
    setUploading(true);
    await uploadDoc(form);
    await fetchDocs();
    setUploading(false);
    e.target.value = "";
  }

  async function handleDelete(doc_id, name) {
    if (!window.confirm(`Delete "${name}"?`)) return;
    await deleteDoc(doc_id);
    if (selectedDoc === doc_id) setSelectedDoc(null);
    await fetchDocs();
  }

  async function handleChat(e) {
    e.preventDefault();
    if (!question.trim()) return;
    setMessages(prev => [...prev, { role: "user", text: question }]);
    setQuestion("");
    setLoading(true);
    try {
      const res = await chat(question, selectedDoc);
      setMessages(prev => [...prev, {
        role: "assistant",
        text: res.data.answer,
        sources: res.data.sources
      }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: "assistant", text: "Error: " + err.message }]);
    }
    setLoading(false);
  }

  async function handleReset() {
    await resetHistory(selectedDoc);
    setMessages([]);
  }

  async function handleCompare(e) {
    e.preventDefault();
    if (!compareQ || !compareDoc1 || !compareDoc2) return alert("Fill all fields");
    if (compareDoc1 === compareDoc2) return alert("Pick two different documents");
    setLoading(true);
    const res = await compareDocs(compareQ, compareDoc1, compareDoc2);
    setCompareResult(res.data.comparison);
    setLoading(false);
  }

  return (
    <div className="app">

      {/* Sidebar */}
      <div className="sidebar">
        <h2 className="logo">DocChat</h2>

        <label className="upload-btn">
          {uploading ? "Uploading..." : "+ Upload PDF"}
          <input type="file" accept=".pdf" onChange={handleUpload} hidden />
        </label>

        <p className="section-label">Documents</p>

        <div
          className={`doc-item ${!selectedDoc ? "active" : ""}`}
          onClick={() => setSelectedDoc(null)}
        >
          🌐 All Documents
        </div>

        {docs.length === 0 && <p className="muted">No documents yet</p>}

        {docs.map(doc => (
          <div
            key={doc.doc_id}
            className={`doc-item ${selectedDoc === doc.doc_id ? "active" : ""}`}
            onClick={() => setSelectedDoc(doc.doc_id)}
          >
            <div>
              <div className="doc-name">📄 {doc.name}</div>
              <div className="muted">{doc.pages} pages · {doc.chunks} chunks</div>
            </div>
            <button
              className="delete-btn"
              onClick={e => { e.stopPropagation(); handleDelete(doc.doc_id, doc.name); }}
            >✕</button>
          </div>
        ))}
      </div>

      {/* Main */}
      <div className="main">

        {/* Tabs */}
        <div className="tabs">
          <button className={`tab ${tab === "chat" ? "active" : ""}`} onClick={() => setTab("chat")}>Chat</button>
          <button className={`tab ${tab === "compare" ? "active" : ""}`} onClick={() => setTab("compare")}>Compare</button>
        </div>

        {/* Chat tab */}
        {tab === "chat" && (
          <div className="chat-wrap">
            <div className="chat-header">
              <span>{selectedDoc ? `📄 ${docs.find(d => d.doc_id === selectedDoc)?.name}` : "🌐 All Documents"}</span>
              <button className="clear-btn" onClick={handleReset}>Clear</button>
            </div>

            <div className="messages">
              {messages.length === 0 && (
                <p className="muted center">Upload a PDF and start asking questions.</p>
              )}
              {messages.map((msg, i) => (
                <div key={i} className={`message ${msg.role}`}>
                  <p>{msg.text}</p>
                  {msg.sources?.length > 0 && (
                    <div className="sources">
                      {msg.sources.map((s, j) => (
                        <span key={j} className="source-tag">
                          {s.doc} · Page {s.page} · {Math.round(s.relevance * 100)}%
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {loading && <div className="message assistant"><p>Thinking...</p></div>}
              <div ref={bottomRef} />
            </div>

            <form className="input-row" onSubmit={handleChat}>
              <input
                value={question}
                onChange={e => setQuestion(e.target.value)}
                placeholder="Ask a question..."
                disabled={loading}
              />
              <button type="submit" disabled={loading || !question.trim()}>Send</button>
            </form>
          </div>
        )}

        {/* Compare tab */}
        {tab === "compare" && (
          <div className="compare-wrap">
            <h3>Compare Two Documents</h3>
            <form onSubmit={handleCompare} className="compare-form">
              <select value={compareDoc1} onChange={e => setCompareDoc1(e.target.value)}>
                <option value="">Document 1</option>
                {docs.map(d => <option key={d.doc_id} value={d.doc_id}>{d.name}</option>)}
              </select>
              <select value={compareDoc2} onChange={e => setCompareDoc2(e.target.value)}>
                <option value="">Document 2</option>
                {docs.map(d => <option key={d.doc_id} value={d.doc_id}>{d.name}</option>)}
              </select>
              <input
                value={compareQ}
                onChange={e => setCompareQ(e.target.value)}
                placeholder="What do you want to compare?"
              />
              <button type="submit" disabled={loading}>
                {loading ? "Comparing..." : "Compare"}
              </button>
            </form>
            {compareResult && (
              <div className="compare-result">
                <h4>Result</h4>
                <pre>{compareResult}</pre>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
