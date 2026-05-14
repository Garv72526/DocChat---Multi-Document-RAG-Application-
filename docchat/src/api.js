// src/api.js — all API calls in one place
import axios from "axios";

const BASE = "http://localhost:5002";

export const uploadDoc    = (formData)           => axios.post(`${BASE}/documents`, formData);
export const listDocs     = ()                   => axios.get(`${BASE}/documents`);
export const deleteDoc    = (doc_id)             => axios.delete(`${BASE}/documents/${doc_id}`);
export const chat         = (question, doc_id)   => axios.post(`${BASE}/chat`, { question, doc_id });
export const compareDocs  = (question, id1, id2) => axios.post(`${BASE}/compare`, { question, doc_id_1: id1, doc_id_2: id2 });
export const resetHistory = (doc_id)             => axios.post(`${BASE}/reset`, { doc_id });