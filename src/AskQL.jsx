import { useState, useRef, useEffect } from "react";

// ─── Color tokens (teal & white theme) ───────────────────────────────────────
const T = {
  teal900:"#04342C", teal800:"#085041", teal700:"#0a5c4a",
  teal600:"#0F6E56", teal400:"#1D9E75", teal200:"#5DCAA5",
  teal100:"#9FE1CB", teal50:"#E1F5EE",
  white:"#ffffff", gray50:"#F7FAF9", gray100:"#E8F0EE",
  gray300:"#B0C4BE", gray500:"#6B8C84", gray700:"#2E4D46",
  red50:"#FFF0F0", red400:"#E24B4A",
  amber50:"#FFFBF0",
};

// ─── KaggleDBQA Schemas ───────────────────────────────────────────────────────
const DB_SCHEMAS = {
  Pesticide: {
    description: "Agricultural pesticide usage data across US states (KaggleDBQA)",
    tables: {
      PESTICIDE: {
        columns: ["State","Year","Compound","Low_Estimate","High_Estimate"],
        types:   ["TEXT","INTEGER","TEXT","REAL","REAL"],
        sample: [
          { State:"Alabama",    Year:1992, Compound:"ATRAZINE",    Low_Estimate:1200000,  High_Estimate:1500000  },
          { State:"California", Year:1993, Compound:"GLYPHOSATE",  Low_Estimate:8000000,  High_Estimate:9500000  },
          { State:"Iowa",       Year:1994, Compound:"ATRAZINE",    Low_Estimate:6000000,  High_Estimate:7200000  },
          { State:"Texas",      Year:1992, Compound:"METOLACHLOR", Low_Estimate:2100000,  High_Estimate:2700000  },
          { State:"Nebraska",   Year:1995, Compound:"ATRAZINE",    Low_Estimate:3400000,  High_Estimate:4100000  },
          { State:"Illinois",   Year:1993, Compound:"GLYPHOSATE",  Low_Estimate:5100000,  High_Estimate:6300000  },
          { State:"Ohio",       Year:1994, Compound:"METOLACHLOR", Low_Estimate:1800000,  High_Estimate:2200000  },
          { State:"Minnesota",  Year:1995, Compound:"ATRAZINE",    Low_Estimate:2900000,  High_Estimate:3500000  },
        ]
      }
    }
  },
  World_Development: {
    description: "World development indicators — GDP, population, income groups (KaggleDBQA)",
    tables: {
      COUNTRY: {
        columns: ["CountryCode","ShortName","Region","IncomeGroup"],
        types:   ["TEXT","TEXT","TEXT","TEXT"],
        sample: [
          { CountryCode:"USA", ShortName:"United States",  Region:"North America",             IncomeGroup:"High income"         },
          { CountryCode:"IND", ShortName:"India",          Region:"South Asia",                IncomeGroup:"Lower middle income" },
          { CountryCode:"CHN", ShortName:"China",          Region:"East Asia & Pacific",       IncomeGroup:"Upper middle income" },
          { CountryCode:"BRA", ShortName:"Brazil",         Region:"Latin America & Caribbean", IncomeGroup:"Upper middle income" },
          { CountryCode:"GBR", ShortName:"United Kingdom", Region:"Europe & Central Asia",     IncomeGroup:"High income"         },
          { CountryCode:"NGA", ShortName:"Nigeria",        Region:"Sub-Saharan Africa",        IncomeGroup:"Lower middle income" },
        ]
      },
      INDICATOR: {
        columns: ["CountryCode","IndicatorName","Year","Value"],
        types:   ["TEXT","TEXT","INTEGER","REAL"],
        sample: [
          { CountryCode:"USA", IndicatorName:"GDP (current US$)",            Year:2020, Value:20936600000000 },
          { CountryCode:"IND", IndicatorName:"GDP (current US$)",            Year:2020, Value:2622980000000  },
          { CountryCode:"CHN", IndicatorName:"GDP per capita (current US$)", Year:2020, Value:10409           },
          { CountryCode:"BRA", IndicatorName:"Population growth (annual %)", Year:2020, Value:0.72            },
          { CountryCode:"GBR", IndicatorName:"GDP per capita (current US$)", Year:2020, Value:40284           },
          { CountryCode:"NGA", IndicatorName:"GDP (current US$)",            Year:2020, Value:432293770000    },
        ]
      }
    }
  }
};

const EXAMPLES = {
  Pesticide: [
    "Show maximum Low_Estimate",
    "Which state used the most pesticide?",
    "List all compounds used in California",
    "Show average High_Estimate per compound",
  ],
  World_Development: [
    "Show all High income countries",
    "Which countries are in South Asia?",
    "Count total countries",
    "List all indicators for India",
  ]
};

// ─── Gemini API call ──────────────────────────────────────────────────────────
// Uses the v1beta REST endpoint — no extra SDK needed, works directly in browser
async function callGemini(systemPrompt, userMessage) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  const model  = "gemini-2.5-flash"; // free-tier model

  // Gemini doesn't have a separate "system" role in the REST API — we prepend
  // the system prompt as the first user turn with a model acknowledgement.
  const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`;

  const body = {
    contents: [
      { role: "user",  parts: [{ text: systemPrompt }] },
      { role: "model", parts: [{ text: "Understood. I will follow these rules exactly and return only raw SQL." }] },
      { role: "user",  parts: [{ text: userMessage  }] },
    ],
    generationConfig: {
      temperature: 0.1,     // low temperature = more deterministic SQL output
      maxOutputTokens: 400,
    }
  };

  const res  = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) {
    const msg = data.error?.message || `Gemini API error ${res.status}`;
    throw new Error(msg);
  }

  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
}

// ─── System prompt builder ────────────────────────────────────────────────────
function buildPrompt(dbName) {
  const schema = DB_SCHEMAS[dbName];
  const schemaStr = Object.entries(schema.tables).map(([t, info]) =>
    `Table ${t}:\n  Columns: ${info.columns.map((c, i) => `${c} (${info.types[i]})`).join(", ")}`
  ).join("\n\n");

  return `You are AskQL, a precise Text-to-SQL assistant for a SQLite database.

DATABASE: ${dbName}

${schemaStr}

STRICT OUTPUT RULES:
1. Output ONLY the raw SQL SELECT statement — no explanation, no markdown, no backticks.
2. Use exact column names from the schema above, including underscores (e.g. Low_Estimate, High_Estimate).
3. For aggregations write standard SQL: SELECT MAX(Low_Estimate) FROM PESTICIDE
4. Never use DROP, DELETE, UPDATE, INSERT, ALTER, or CREATE.
5. If the question cannot be answered from the schema, output exactly: ERROR: <brief reason>`;
}

// ─── SQL executor (in-browser SQLite simulation) ──────────────────────────────
function resolveKey(row, col) {
  if (col in row) return col;
  const lo = col.toLowerCase();
  return Object.keys(row).find(k => k.toLowerCase() === lo) || col;
}

function applyWhere(data, cond) {
  const eqStr  = cond.match(/([\w]+)\s*=\s*'([^']+)'/i);
  const neqStr = cond.match(/([\w]+)\s*!=\s*'([^']+)'/i);
  const gte    = cond.match(/([\w]+)\s*>=\s*([\d.]+)/i);
  const lte    = cond.match(/([\w]+)\s*<=\s*([\d.]+)/i);
  const gt     = cond.match(/([\w]+)\s*>\s*([\d.]+)/i);
  const lt     = cond.match(/([\w]+)\s*<\s*([\d.]+)/i);
  const eqNum  = cond.match(/([\w]+)\s*=\s*([\d.]+)/i);
  const like   = cond.match(/([\w]+)\s+LIKE\s+'%([^%']+)%'/i);

  if (eqStr)  { const [,c,v]=eqStr;  return data.filter(r => String(r[resolveKey(r,c)]).toLowerCase() === v.toLowerCase()); }
  if (neqStr) { const [,c,v]=neqStr; return data.filter(r => String(r[resolveKey(r,c)]).toLowerCase() !== v.toLowerCase()); }
  if (gte)    { const [,c,v]=gte;    return data.filter(r => Number(r[resolveKey(r,c)]) >= Number(v)); }
  if (lte)    { const [,c,v]=lte;    return data.filter(r => Number(r[resolveKey(r,c)]) <= Number(v)); }
  if (gt)     { const [,c,v]=gt;     return data.filter(r => Number(r[resolveKey(r,c)]) >  Number(v)); }
  if (lt)     { const [,c,v]=lt;     return data.filter(r => Number(r[resolveKey(r,c)]) <  Number(v)); }
  if (eqNum)  { const [,c,v]=eqNum;  return data.filter(r => Number(r[resolveKey(r,c)]) === Number(v)); }
  if (like)   { const [,c,v]=like;   return data.filter(r => String(r[resolveKey(r,c)]).toLowerCase().includes(v.toLowerCase())); }
  return data;
}

function executeSQL(sql, dbName) {
  const db = DB_SCHEMAS[dbName];
  const up = sql.trim().toUpperCase();

  for (const op of ["DROP","DELETE","UPDATE","INSERT","ALTER","CREATE"]) {
    if (new RegExp(`\\b${op}\\b`).test(up))
      return { error: `"${op}" operations are not permitted. Only SELECT is allowed.` };
  }
  if (!up.includes("SELECT"))
    return { error: "Only SELECT queries are supported." };

  const fromM = sql.match(/\bFROM\s+([\w]+)/i);
  if (!fromM) return { error: "No FROM clause found in the generated query." };
  const tableKey = Object.keys(db.tables).find(t => t.toUpperCase() === fromM[1].toUpperCase());
  if (!tableKey) return { error: `Table "${fromM[1]}" not found. Available: ${Object.keys(db.tables).join(", ")}` };

  let data = db.tables[tableKey].sample.map(r => ({ ...r }));
  const selectRaw = sql.match(/\bSELECT\b(.+?)\bFROM\b/i)?.[1]?.trim() || "*";

  // ── Aggregations — run on full filtered dataset BEFORE order/limit ──────────
  // Uses [\w]+ so underscores in column names (Low_Estimate) match correctly
  const aggRE   = /\b(MAX|MIN|AVG|SUM|COUNT)\s*\(\s*(\*|[\w]+)\s*\)/gi;
  const aggHits = [...selectRaw.matchAll(aggRE)];

  if (aggHits.length > 0) {
    const whereM = sql.match(/\bWHERE\b(.+?)(?:\bGROUP\b|\bORDER\b|\bLIMIT\b|$)/i);
    if (whereM) data = applyWhere(data, whereM[1].trim());

    const resultRow = {};
    for (const m of aggHits) {
      const fn  = m[1].toUpperCase();
      const col = m[2];
      const key = `${fn}(${col})`;
      if (fn === "COUNT") {
        resultRow[key] = data.length;
      } else {
        const vals = data.map(r => Number(r[resolveKey(r, col)])).filter(n => !isNaN(n));
        if      (fn === "MAX") resultRow[key] = vals.length ? Math.max(...vals) : null;
        else if (fn === "MIN") resultRow[key] = vals.length ? Math.min(...vals) : null;
        else if (fn === "SUM") resultRow[key] = vals.length ? vals.reduce((a,b) => a+b, 0) : null;
        else if (fn === "AVG") resultRow[key] = vals.length ? Math.round((vals.reduce((a,b) => a+b, 0) / vals.length) * 1000) / 1000 : null;
      }
    }
    return { results: [resultRow], columns: Object.keys(resultRow) };
  }

  // ── WHERE ──────────────────────────────────────────────────────────────────
  const whereM = sql.match(/\bWHERE\b(.+?)(?:\bGROUP\b|\bORDER\b|\bLIMIT\b|$)/i);
  if (whereM) data = applyWhere(data, whereM[1].trim());

  // ── ORDER BY ───────────────────────────────────────────────────────────────
  const orderM = sql.match(/\bORDER\s+BY\s+([\w]+)(?:\s+(ASC|DESC))?/i);
  if (orderM) {
    const [, col, dir] = orderM;
    data.sort((a, b) => {
      const av = a[resolveKey(a,col)], bv = b[resolveKey(b,col)];
      const d  = typeof av === "number" ? av - bv : String(av).localeCompare(String(bv));
      return (dir||"").toUpperCase() === "DESC" ? -d : d;
    });
  }

  // ── LIMIT ──────────────────────────────────────────────────────────────────
  const limitM = sql.match(/\bLIMIT\s+(\d+)/i);
  if (limitM) data = data.slice(0, parseInt(limitM[1]));

  // ── Column projection ──────────────────────────────────────────────────────
  if (selectRaw !== "*") {
    const cols = selectRaw.split(",").map(c => c.trim().replace(/['"]/g, ""));
    if (data.length) {
      const valid = cols.filter(c => resolveKey(data[0], c) in data[0]);
      if (valid.length) {
        data = data.map(r => {
          const out = {};
          valid.forEach(c => { const k = resolveKey(r,c); out[k] = r[k]; });
          return out;
        });
      }
    }
  }

  if (!data.length) return { results: [], columns: [] };
  return { results: data, columns: Object.keys(data[0]) };
}

// ─── UI Sub-components ────────────────────────────────────────────────────────
function SQLBlock({ sql }) {
  return (
    <div style={{ background:T.teal900, borderRadius:10, padding:"10px 14px", marginBottom:8, maxWidth:"90%" }}>
      <div style={{ fontSize:10, color:T.teal200, fontWeight:700, letterSpacing:"0.08em", marginBottom:5, textTransform:"uppercase" }}>Generated SQL</div>
      <code style={{ fontFamily:"'Fira Mono','Courier New',monospace", fontSize:12.5, color:T.teal50, whiteSpace:"pre-wrap", wordBreak:"break-all", lineHeight:1.7 }}>{sql}</code>
    </div>
  );
}

function ResultsTable({ results, columns }) {
  return (
    <div style={{ background:T.white, border:`1.5px solid ${T.teal100}`, borderRadius:12, overflow:"hidden", maxWidth:"90%", marginBottom:8 }}>
      <div style={{ background:T.teal50, padding:"7px 14px", borderBottom:`1px solid ${T.teal100}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <span style={{ fontSize:10, color:T.teal600, fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase" }}>Results</span>
        <span style={{ fontSize:11, padding:"2px 9px", borderRadius:99, background:T.teal200, color:T.teal900, fontWeight:700 }}>
          {results.length} row{results.length !== 1 ? "s" : ""}
        </span>
      </div>
      <div style={{ overflowX:"auto" }}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr>
              {columns.map(c => (
                <th key={c} style={{ padding:"7px 12px", textAlign:"left", fontSize:12, fontWeight:600, color:T.teal700, background:T.gray50, borderBottom:`1px solid ${T.teal100}`, whiteSpace:"nowrap" }}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {results.map((row, i) => (
              <tr key={i} style={{ borderBottom:`1px solid ${T.gray100}` }}>
                {columns.map(c => {
                  const v = row[c]; const isNum = typeof v === "number";
                  return (
                    <td key={c} style={{ padding:"7px 12px", fontSize:13, color:isNum?T.teal800:T.gray700, fontFamily:isNum?"'Fira Mono',monospace":"inherit" }}>
                      {isNum ? v.toLocaleString() : String(v ?? "")}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MsgBubble({ msg }) {
  if (msg.role === "user") return (
    <div style={{ display:"flex", flexDirection:"row-reverse", gap:8, marginBottom:16, alignItems:"flex-start" }}>
      <div style={{ width:30, height:30, borderRadius:"50%", flexShrink:0, background:T.teal600, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, color:T.white }}>U</div>
      <div style={{ background:T.teal600, color:T.white, padding:"9px 14px", borderRadius:"14px 4px 14px 14px", fontSize:14, lineHeight:1.5, maxWidth:"76%" }}>{msg.content}</div>
    </div>
  );
  return (
    <div style={{ display:"flex", flexDirection:"row", gap:8, marginBottom:16, alignItems:"flex-start" }}>
      <div style={{ width:30, height:30, borderRadius:"50%", flexShrink:0, background:T.teal50, border:`1.5px solid ${T.teal200}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700, color:T.teal600 }}>AQ</div>
      <div style={{ display:"flex", flexDirection:"column", gap:5, flex:1 }}>
        {msg.sql   && <SQLBlock sql={msg.sql} />}
        {msg.error && <div style={{ background:T.red50, border:`1px solid #FFCCCC`, borderRadius:"4px 12px 12px 12px", padding:"9px 13px", fontSize:13, color:T.red400, maxWidth:"80%" }}>{msg.error}</div>}
        {msg.results && msg.results.length === 0 && !msg.error && (
          <div style={{ background:T.amber50, border:"1px solid #FFE0A0", borderRadius:"4px 12px 12px 12px", padding:"9px 13px", fontSize:13, color:"#7A5800", maxWidth:"78%" }}>Query returned no rows.</div>
        )}
        {msg.results && msg.results.length > 0 && <ResultsTable results={msg.results} columns={msg.columns} />}
        {msg.summary && <div style={{ background:T.teal50, border:`1px solid ${T.teal100}`, borderRadius:"4px 14px 14px 14px", padding:"9px 13px", fontSize:13.5, color:T.teal900, lineHeight:1.6, maxWidth:"84%" }}>{msg.summary}</div>}
      </div>
    </div>
  );
}

function TypingBubble() {
  return (
    <div style={{ display:"flex", gap:8, marginBottom:16, alignItems:"flex-start" }}>
      <div style={{ width:30, height:30, borderRadius:"50%", flexShrink:0, background:T.teal50, border:`1.5px solid ${T.teal200}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700, color:T.teal600 }}>AQ</div>
      <div style={{ background:T.teal50, border:`1px solid ${T.teal100}`, borderRadius:"4px 12px 12px 12px", padding:"10px 16px", display:"flex", gap:5, alignItems:"center" }}>
        {[0,1,2].map(i => <div key={i} style={{ width:6, height:6, borderRadius:"50%", background:T.teal400, animation:`aqDot 1.2s ease-in-out ${i*0.2}s infinite` }} />)}
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function AskQL() {
  const [db,    setDb]    = useState("Pesticide");
  const [msgs,  setMsgs]  = useState([]);
  const [input, setInput] = useState("");
  const [busy,  setBusy]  = useState(false);
  const [tab,   setTab]   = useState("chat");
  const bottomRef         = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:"smooth" }); }, [msgs, busy]);
  useEffect(() => { setMsgs([]); }, [db]);

  async function send(text) {
    const q = (text || input).trim();
    if (!q || busy) return;
    setInput("");
    setMsgs(p => [...p, { role:"user", content:q }]);
    setBusy(true);

    let sqlOut = "";
    try {
      // ── Step 1: Generate SQL with Gemini ──────────────────────────────────
      const raw = await callGemini(buildPrompt(db), q);
      const sql = raw.replace(/```sql\n?/gi, "").replace(/```/g, "").trim();

      if (!sql) throw new Error("Gemini returned an empty response. Try rephrasing.");

      if (sql.startsWith("ERROR:")) {
        setMsgs(p => [...p, { role:"assistant", sql:null, error: sql.replace("ERROR:", "").trim() }]);
        setBusy(false);
        return;
      }

      sqlOut = sql;

      // ── Step 2: Validate and execute SQL ──────────────────────────────────
      const { results, columns, error } = executeSQL(sql, db);

      // ── Step 3: Generate plain-English summary with Gemini ────────────────
      let summary = null;
      if (results && results.length > 0) {
        try {
          const summaryPrompt = `Given: question="${q}", SQL="${sql}", results=${JSON.stringify(results.slice(0,4))}. Write exactly one short plain-English sentence summarising the finding. No preamble.`;
          summary = await callGemini("You are a helpful data analyst. Summarise query results in one sentence.", summaryPrompt);
        } catch (_) { /* summary is optional */ }
      }

      setMsgs(p => [...p, { role:"assistant", sql, results: results||[], columns: columns||[], error, summary }]);

    } catch (err) {
      setMsgs(p => [...p, { role:"assistant", sql: sqlOut||null, error:`Error: ${err.message}` }]);
    }
    setBusy(false);
  }

  const schema = DB_SCHEMAS[db];

  return (
    <div style={{ fontFamily:"system-ui,-apple-system,sans-serif", maxWidth:880, margin:"0 auto", padding:"0 0 2rem", color:T.gray700 }}>
      <style>{`
        @keyframes aqDot { 0%,100%{opacity:.2;transform:scale(.75)} 50%{opacity:1;transform:scale(1)} }
        * { box-sizing: border-box; }
      `}</style>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div style={{ background:T.teal800, padding:"14px 22px", borderRadius:"0 0 18px 18px", marginBottom:16, display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:10 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:38, height:38, borderRadius:10, background:T.teal400, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:800, color:T.white, letterSpacing:-1 }}>AQ</div>
          <div>
            <div style={{ fontSize:22, fontWeight:700, color:T.white, letterSpacing:-0.5 }}>AskQL</div>
            <div style={{ fontSize:11, color:T.teal100, marginTop:1 }}>Natural language → SQL · KaggleDBQA</div>
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8, background:"rgba(255,255,255,0.12)", border:"1px solid rgba(255,255,255,0.2)", borderRadius:10, padding:"6px 12px" }}>
          <span style={{ fontSize:11, color:T.teal100, fontWeight:500 }}>Database</span>
          <select value={db} onChange={e => setDb(e.target.value)}
            style={{ background:"transparent", border:"none", outline:"none", color:T.white, fontSize:13, fontWeight:600, cursor:"pointer" }}>
            {Object.keys(DB_SCHEMAS).map(k => <option key={k} value={k} style={{ background:T.teal800 }}>{k.replace("_"," ")}</option>)}
          </select>
        </div>
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────────────── */}
      <div style={{ display:"flex", borderBottom:`1.5px solid ${T.gray100}`, marginBottom:16, padding:"0 2px" }}>
        {["chat","schema"].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding:"8px 18px", fontSize:13, fontWeight:tab===t?600:400,
            background:"transparent", border:"none", cursor:"pointer",
            borderBottom:tab===t?`2.5px solid ${T.teal600}`:"2.5px solid transparent",
            color:tab===t?T.teal600:T.gray500, marginBottom:-1.5,
          }}>{t === "chat" ? "Chat" : "Schema"}</button>
        ))}
      </div>

      {/* ── Schema Tab ──────────────────────────────────────────────────────── */}
      {tab === "schema" ? (
        <div style={{ padding:"0 4px" }}>
          <div style={{ background:T.teal50, border:`1px solid ${T.teal100}`, borderRadius:10, padding:"10px 14px", fontSize:13, color:T.teal800, marginBottom:12 }}>{schema.description}</div>
          {Object.entries(schema.tables).map(([tName, tInfo]) => (
            <div key={tName} style={{ background:T.white, border:`1.5px solid ${T.teal100}`, borderRadius:12, overflow:"hidden", marginBottom:12 }}>
              <div style={{ background:T.teal50, padding:"9px 14px", borderBottom:`1px solid ${T.teal100}`, display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ fontSize:10, padding:"2px 8px", borderRadius:99, background:T.teal200, color:T.teal900, fontWeight:700, letterSpacing:"0.05em" }}>TABLE</span>
                <code style={{ fontFamily:"'Fira Mono',monospace", fontSize:13, fontWeight:600, color:T.teal900 }}>{tName}</code>
              </div>
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse" }}>
                  <thead>
                    <tr>
                      {["Column","Type","Sample values"].map(h => (
                        <th key={h} style={{ padding:"7px 14px", textAlign:"left", fontSize:12, fontWeight:600, color:T.teal700, background:T.gray50, borderBottom:`1px solid ${T.teal100}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tInfo.columns.map((col, i) => (
                      <tr key={col} style={{ borderBottom:`1px solid ${T.gray100}` }}>
                        <td style={{ padding:"7px 14px", fontFamily:"'Fira Mono',monospace", fontSize:12, color:T.teal800 }}>{col}</td>
                        <td style={{ padding:"7px 14px" }}>
                          <span style={{ fontSize:11, padding:"1px 8px", borderRadius:99, fontWeight:600, background:tInfo.types[i]==="TEXT"?"#FFF8E1":"#E8FAF3", color:tInfo.types[i]==="TEXT"?"#7A5800":T.teal700 }}>{tInfo.types[i]}</span>
                        </td>
                        <td style={{ padding:"7px 14px", fontSize:12, color:T.gray500 }}>
                          {[...new Set(tInfo.sample.map(r => r[col]))].slice(0,3).map(String).join(", ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ── Chat Tab ───────────────────────────────────────────────────────── */
        <div style={{ padding:"0 4px" }}>
          {msgs.length === 0 && (
            <div style={{ marginBottom:18 }}>
              <div style={{ fontSize:12, color:T.gray500, fontWeight:500, marginBottom:8 }}>Try an example:</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                {EXAMPLES[db].map(q => (
                  <button key={q} onClick={() => send(q)} style={{ fontSize:12, padding:"5px 12px", borderRadius:99, background:T.teal50, border:`1px solid ${T.teal200}`, color:T.teal800, cursor:"pointer", fontWeight:500 }}>
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{ minHeight:300, marginBottom:4 }}>
            {msgs.map((m, i) => <MsgBubble key={i} msg={m} />)}
            {busy && <TypingBubble />}
            <div ref={bottomRef} />
          </div>

          {/* ── Input bar ─────────────────────────────────────────────────── */}
          <div style={{ display:"flex", gap:8, alignItems:"flex-end", background:T.white, border:`1.5px solid ${T.teal200}`, borderRadius:14, padding:"8px 8px 8px 14px", marginTop:8 }}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={`Ask anything about ${db.replace("_"," ")} data...`}
              rows={1}
              style={{ flex:1, resize:"none", border:"none", outline:"none", background:"transparent", fontSize:14, color:T.gray700, fontFamily:"inherit", lineHeight:1.5, minHeight:22 }}
            />
            <button onClick={() => send()} disabled={busy || !input.trim()} style={{
              padding:"7px 18px", borderRadius:10, fontSize:13, fontWeight:600,
              cursor: busy || !input.trim() ? "not-allowed" : "pointer",
              opacity: busy || !input.trim() ? 0.4 : 1,
              background: busy || !input.trim() ? T.gray100 : T.teal600,
              color: busy || !input.trim() ? T.gray500 : T.white,
              border:"none", flexShrink:0, transition:"background 0.15s",
            }}>Run</button>
          </div>
          <div style={{ fontSize:11, color:T.gray500, textAlign:"center", marginTop:6 }}>
            Enter to run · Shift+Enter for newline · SELECT only
          </div>
        </div>
      )}
    </div>
  );
}
