# AskQL — Text-to-SQL Chatbot

A conversational chatbot that converts plain English questions into SQL queries and executes them on real-world databases from the **KaggleDBQA** benchmark dataset.

No SQL knowledge required — just type your question and get results instantly.

---

## Features

- Natural language → SQL query generation using **Google Gemini API**
- Query validation (blocks DROP, DELETE, UPDATE, and other unsafe operations)
- In-browser SQL execution engine (WHERE, ORDER BY, LIMIT, MAX, MIN, AVG, SUM, COUNT)
- Plain-English summary of query results
- Schema viewer for all loaded databases
- Two KaggleDBQA databases: **Pesticide** and **World Development**
- Clean teal & white UI built in React

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite |
| LLM Backend | Google Gemini API (`gemini-1.5-flash`) |
| Query Engine | Custom in-browser JavaScript SQL simulator |
| Dataset | KaggleDBQA |
| Styling | Inline React styles (no CSS framework) |

---

## Setup

### 1. Clone the repo

```bash
git clone https://github.com/your-username/askql.git
cd askql
```

### 2. Install dependencies

```bash
npm install
```

### 3. Get a free Gemini API key

Go to [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) and create a free API key. No credit card needed.

### 4. Create your `.env` file

```bash
cp .env.example .env
```

Open `.env` and replace the placeholder with your real key:

```
VITE_GEMINI_API_KEY=AIzaSy_your_actual_key_here
```

### 5. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Example Questions

**Pesticide database:**
- `Show maximum Low_Estimate`
- `Which state used the most pesticide?`
- `List all compounds used in California`
- `Show average High_Estimate per compound`

**World Development database:**
- `Show all High income countries`
- `Which countries are in South Asia?`
- `Count total countries`
- `List all indicators for India`

---

## Project Structure

```
askql/
├── src/
│   ├── AskQL.jsx        # Main component — all logic, UI, SQL engine, API calls
│   └── main.jsx         # React entry point
├── index.html           # HTML shell
├── vite.config.js       # Vite config
├── package.json         # Dependencies
├── .env.example         # API key template
└── .gitignore
```

---

## Dataset

This project uses the [KaggleDBQA](https://github.com/chiahao3/unkp) benchmark — a cross-domain Text-to-SQL dataset built from real Kaggle databases with natural language questions and corresponding SQL queries.

---

## License

MIT
