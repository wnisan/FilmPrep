# FilmPrep ML module

Rule-based NLP pipeline for subtitle processing (MVP for coursework/diploma).

## What it does

1. Parse `.srt` / `.vtt`
2. Tokenize + simple lemmatization
3. Build frequency lexicon with CEFR heuristics
4. Extract useful phrases from cues
5. Detect grammar patterns (conditionals, passive, perfect, modals, phrasal verbs)

## Usage

Imported by the API worker (`processing.service.js`) when admin starts a job:

`POST /api/v1/admin/media/:id/process`

No Python required for MVP. Can later be replaced by spaCy/LLM without changing the admin UX.
