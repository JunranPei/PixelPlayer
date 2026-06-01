import fs from "fs";
import path from "path";
import readline from "readline";

// Reset styles and define terminal colors
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";
const CYAN = "\x1b[36m";

// Simple utility to read user input from the console
function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans.trim());
    })
  );
}

// Loads environment variables from .env file
function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf-8");
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
        const index = trimmed.indexOf("=");
        const key = trimmed.slice(0, index).trim();
        const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
        if (value) {
          process.env[key] = value;
        }
      }
    }
  }
}

// Fetch models from Gemini API
async function fetchGeminiModels(apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
  const response = await fetch(url);
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Error fetching Gemini models (${response.status}): ${errText}`);
  }
  const data = await response.json();
  
  // Filter for text generation models
  return (data.models || [])
    .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent"))
    .map(m => ({
      id: m.name.replace(/^models\//, ""),
      name: m.displayName || m.name,
      description: m.description || ""
    }));
}

// Fetch models from OpenAI API
async function fetchOpenAIModels(apiKey, baseURL) {
  const url = `${baseURL}/models`.replace(/([^:]\/)\/+/g, "$1");
  const response = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${apiKey}`
    }
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Error fetching OpenAI models (${response.status}): ${errText}`);
  }
  const data = await response.json();
  
  // Filter for common chat/instruct models (gpt, o1, etc.)
  return (data.data || [])
    .filter(m => m.id.includes("gpt") || m.id.startsWith("o1-") || m.id.includes("claude") || m.id.includes("llama"))
    .map(m => ({
      id: m.id,
      name: m.id,
      description: `Provider: ${m.owned_by || "OpenAI"}`
    }));
}

// Native call to Gemini
async function queryGemini(apiKey, model, systemPrompt, userPrompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: `${systemPrompt}\n\n[DATOS PARA EVALUAR]\n${userPrompt}` }]
        }
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json"
      }
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini API Error (${response.status}): ${text}`);
  }

  const data = await response.json();
  const resText = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  return JSON.parse(resText);
}

// Native call to OpenAI
async function queryOpenAI(apiKey, baseURL, model, systemPrompt, userPrompt) {
  const url = `${baseURL}/chat/completions`.replace(/([^:]\/)\/+/g, "$1");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.1,
      response_format: { type: "json_object" }
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI API Error (${response.status}): ${text}`);
  }

  const data = await response.json();
  const resText = data.choices?.[0]?.message?.content || "{}";
  return JSON.parse(resText);
}

async function main() {
  console.log(`\n${BOLD}${CYAN}🔍 KNOWLEDGE GRAPH FACTUAL VALIDATOR (LLM-AS-A-JUDGE)${RESET}\n`);

  loadEnv();

  // 1. Resolve credentials (checking dedicated LLM_JUDGE variables first, then standard overrides)
  const judgeProvider = process.env.LLM_JUDGE_PROVIDER; // 'gemini' | 'openai'
  const judgeApiKey = process.env.LLM_JUDGE_API_KEY;
  const judgeBaseUrl = process.env.LLM_JUDGE_BASE_URL;

  const geminiKey = judgeApiKey && judgeProvider === "gemini" ? judgeApiKey : (process.env.GEMINI_API_KEY || "");
  const openaiKey = judgeApiKey && judgeProvider === "openai" ? judgeApiKey : (process.env.OPENAI_API_KEY || "");
  const openaiBaseUrl = judgeBaseUrl || (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1");

  const hasGemini = !!geminiKey;
  const hasOpenAI = !!openaiKey;

  if (!hasGemini && !hasOpenAI) {
    console.log(`${RED}${BOLD}❌ ERROR: No se encontraron API keys para el Juez.${RESET}`);
    console.log(`Por favor, configura las variables del Juez en tu archivo ${BLUE}.env${RESET}:`);
    console.log(`  ${BOLD}LLM_JUDGE_API_KEY${RESET}="tu_clave_api"`);
    console.log(`  ${BOLD}LLM_JUDGE_PROVIDER${RESET}="gemini" (o "openai")\n`);
    console.log(`O usa las variables compartidas del scanner (${BOLD}GEMINI_API_KEY${RESET} / ${BOLD}OPENAI_API_KEY${RESET}).\n`);
    process.exit(1);
  }

  // 2. Select provider based on config or interactive prompt
  let providerType = "";
  if (judgeProvider && (judgeProvider === "gemini" || judgeProvider === "openai")) {
    providerType = judgeProvider;
    const keyInUse = providerType === "gemini" ? geminiKey : openaiKey;
    if (!keyInUse) {
      console.log(`${RED}${BOLD}❌ ERROR: Se especificó LLM_JUDGE_PROVIDER='${providerType}' pero no se configuró una API Key válida.${RESET}\n`);
      process.exit(1);
    }
    console.log(`${GREEN}✓ Usando proveedor del Juez configurado en .env: ${BOLD}${providerType.toUpperCase()}${RESET}`);
  } else if (hasGemini && hasOpenAI) {
    console.log("Se detectaron credenciales para múltiples proveedores.");
    console.log(`  ${BOLD}[1]${RESET} Google Gemini Cloud`);
    console.log(`  ${BOLD}[2]${RESET} OpenAI (o compatible)`);
    const choice = await askQuestion(`\nSelecciona el proveedor a utilizar [1-2]: `);
    providerType = choice === "2" ? "openai" : "gemini";
  } else if (hasGemini) {
    providerType = "gemini";
    console.log(`${GREEN}✓ Usando Google Gemini Cloud (API Key detectada)${RESET}`);
  } else {
    providerType = "openai";
    console.log(`${GREEN}✓ Usando OpenAI o compatible (API Key detectada)${RESET}`);
  }

  const activeApiKey = providerType === "gemini" ? geminiKey : openaiKey;

  // 3. Fetch models
  console.log(`\n${BLUE}Fetching opciones de modelos disponibles desde el servidor...${RESET}`);
  let models = [];
  try {
    if (providerType === "gemini") {
      models = await fetchGeminiModels(activeApiKey);
    } else {
      models = await fetchOpenAIModels(activeApiKey, openaiBaseUrl);
    }
  } catch (error) {
    console.log(`${RED}${BOLD}❌ Error al listar modelos: ${error.message}${RESET}\n`);
    process.exit(1);
  }

  if (models.length === 0) {
    console.log(`${YELLOW}⚠️ No se encontraron modelos compatibles con generación de contenido.${RESET}\n`);
    process.exit(1);
  }

  // 3. Choose model
  console.log(`\n${BOLD}Modelos disponibles para actuar como Juez:${RESET}`);
  models.forEach((m, idx) => {
    console.log(`  [${BOLD}${idx + 1}${RESET}] ${BOLD}${m.id}${RESET} - ${CYAN}${m.name}${RESET}`);
    if (m.description) {
      console.log(`      ${RESET}\x1b[2m${m.description.slice(0, 100)}${RESET}`);
    }
  });

  const modelIdxStr = await askQuestion(`\nSelecciona el modelo ingresando el número [1-${models.length}]: `);
  const modelIdx = parseInt(modelIdxStr) - 1;

  if (isNaN(modelIdx) || modelIdx < 0 || modelIdx >= models.length) {
    console.log(`${RED}Selección inválida. Abortando.${RESET}\n`);
    process.exit(1);
  }

  const selectedModel = models[modelIdx];
  console.log(`\n${GREEN}Juez configurado con éxito:${RESET} ${BOLD}${selectedModel.id}${RESET}`);

  // 4. Load Knowledge Graph
  console.log(`\n${BLUE}Cargando knowledge-graph.json...${RESET}`);
  const graphPath = path.resolve(process.cwd(), "knowledge-graph.json");
  if (!fs.existsSync(graphPath)) {
    console.log(`${RED}❌ Error: No se encontró 'knowledge-graph.json' en el directorio de trabajo.${RESET}\n`);
    process.exit(1);
  }

  let graph;
  try {
    graph = JSON.parse(fs.readFileSync(graphPath, "utf-8"));
  } catch (error) {
    console.log(`${RED}❌ Error al parsear el grafo: ${error.message}${RESET}\n`);
    process.exit(1);
  }

  console.log(`Grafo cargado correctamente: ${BOLD}${graph.nodes.length}${RESET} nodos, ${BOLD}${graph.edges.length}${RESET} aristas.`);

  // 5. Select evaluation sample size
  const sampleInput = await askQuestion(`\n¿Cuántas relaciones al azar deseas evaluar? [por defecto: 5]: `);
  const sampleSize = parseInt(sampleInput) || 5;

  if (sampleSize <= 0) {
    console.log(`${RED}Cantidad inválida.${RESET}\n`);
    process.exit(1);
  }

  const shuffledEdges = [...graph.edges].sort(() => 0.5 - Math.random());
  const sampledEdges = shuffledEdges.slice(0, Math.min(sampleSize, graph.edges.length));

  console.log(`\n${BOLD}Iniciando evaluación factual de ${sampledEdges.length} relaciones al azar...${RESET}\n`);

  const systemPrompt = [
    "Act as a Senior Software Architect & Expert Knowledge Graph Evaluator.",
    "You are given a factual relation (Subject, Relation, Object) extracted from an Android codebase.",
    "Determine if the relation is logically plausible and factually correct based solely on the architectural responsibilities described in the subject and object summaries.",
    "Be strict. If a dependency direction is reversed (e.g. core calls presentation directly) or makes no sense, penalize it.",
    "Return your response STRICTLY as a valid JSON object matching this structure:",
    "{",
    "  \"plausible\": boolean,",
    "  \"score\": number (1 to 5, where 5 is 100% correct/logical and 1 is completely illogical/hallucinated),",
    "  \"reason\": \"A concise single-sentence explanation of your evaluation\"",
    "}"
  ].join("\n");

  const nodeMap = new Map(graph.nodes.map(n => [n.id, n]));
  const results = [];

  for (let i = 0; i < sampledEdges.length; i++) {
    const edge = sampledEdges[i];
    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);

    if (!sourceNode || !targetNode) {
      continue;
    }

    console.log(`[${i + 1}/${sampledEdges.length}] Evaluando: ${BOLD}${sourceNode.name}${RESET} -> ${edge.type} -> ${BOLD}${targetNode.name}${RESET}...`);

    const userPrompt = JSON.stringify({
      subject: {
        name: sourceNode.name,
        type: sourceNode.type,
        summary: sourceNode.summary,
        filePath: sourceNode.filePath || "N/A"
      },
      object: {
        name: targetNode.name,
        type: targetNode.type,
        summary: targetNode.summary,
        filePath: targetNode.filePath || "N/A"
      },
      relation: {
        type: edge.type,
        description: edge.description || "N/A"
      }
    }, null, 2);

    try {
      let evaluation;
      if (providerType === "gemini") {
        evaluation = await queryGemini(geminiKey, selectedModel.id, systemPrompt, userPrompt);
      } else {
        evaluation = await queryOpenAI(openaiKey, openaiBaseUrl, selectedModel.id, systemPrompt, userPrompt);
      }

      results.push({
        edge,
        source: sourceNode,
        target: targetNode,
        evaluation
      });

      const scoreColor = evaluation.score >= 4 ? GREEN : evaluation.score >= 3 ? YELLOW : RED;
      console.log(`    ↳ Puntaje: ${scoreColor}${evaluation.score}/5${RESET} - Plausible: ${evaluation.plausible ? GREEN + "SÍ" : RED + "NO"}${RESET}`);
      console.log(`    ↳ Razón: \x1b[2m"${evaluation.reason}"${RESET}\n`);
    } catch (error) {
      console.log(`    ${RED}❌ Error al evaluar esta relación: ${error.message}${RESET}\n`);
    }
  }

  // 6. Print Report Summary
  console.log(`\n========================================================================`);
  console.log(`${BOLD}${CYAN}📊 REPORTE DE AUDITORÍA SEMÁNTICA${RESET}`);
  console.log(`========================================================================`);
  console.log(`Modelo Juez:  ${BOLD}${selectedModel.id}${RESET}`);
  console.log(`Proveedor:    ${BOLD}${providerType.toUpperCase()}${RESET}`);
  console.log(`Evaluadas:    ${BOLD}${results.length}${RESET} relaciones.`);

  const passedCount = results.filter(r => r.evaluation.plausible).length;
  const avgScore = results.reduce((acc, curr) => acc + curr.evaluation.score, 0) / results.length;

  const passedPercent = ((passedCount / results.length) * 100).toFixed(1);
  const finalStatus = avgScore >= 4.0 ? `${GREEN}${BOLD}GRAFO SANO (EXCELENTE)${RESET}` : avgScore >= 3.0 ? `${YELLOW}${BOLD}GRAFO ACEPTABLE (CON ALGUNAS ALERTAS)${RESET}` : `${RED}${BOLD}GRAFO INCOHERENTE / RUIDOSO (REVISAR EXTRACTOR)${RESET}`;

  console.log(`Plausibles:   ${passedCount === results.length ? GREEN : YELLOW}${passedCount} / ${results.length} (${passedPercent}%)${RESET}`);
  console.log(`Puntaje Prom: ${avgScore >= 4.0 ? GREEN : avgScore >= 3.0 ? YELLOW : RED}${avgScore.toFixed(2)} / 5.0${RESET}`);
  console.log(`Estado Final: ${finalStatus}`);
  console.log(`========================================================================\n`);

  // 7. Save Report to a log file
  const logsDir = path.resolve(process.cwd(), "logs");
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  const now = new Date();
  const formatDigit = (d) => String(d).padStart(2, "0");
  const year = now.getFullYear();
  const month = formatDigit(now.getMonth() + 1);
  const day = formatDigit(now.getDate());
  const hours = formatDigit(now.getHours());
  const minutes = formatDigit(now.getMinutes());
  const seconds = formatDigit(now.getSeconds());
  
  const dateStr = `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
  const logFileName = `audit-log-${dateStr}.md`;
  const logFilePath = path.join(logsDir, logFileName);

  const mdReport = [
    `# Reporte de Auditoría Semántica de Knowledge Graph`,
    `**Fecha y Hora:** ${now.toLocaleString()}`,
    `**Modelo Juez:** ${selectedModel.id}`,
    `**Proveedor:** ${providerType.toUpperCase()}`,
    ``,
    `## 📊 Resumen Ejecutivo`,
    `- **Relaciones Evaluadas:** ${results.length}`,
    `- **Relaciones Plausibles:** ${passedCount} / ${results.length} (${passedPercent}%)`,
    `- **Puntaje Promedio:** ${avgScore.toFixed(2)} / 5.0`,
    `- **Estado de Salud del Grafo:** ${avgScore >= 4.0 ? "GRAFO SANO (EXCELENTE)" : avgScore >= 3.0 ? "GRAFO ACEPTABLE (CON ALGUNAS ALERTAS)" : "GRAFO INCOHERENTE / RUIDOSO (REVISAR EXTRACTOR)"}`,
    ``,
    `## 🔍 Relaciones Evaluadas`,
    ...results.map((r, idx) => [
      `### ${idx + 1}. ${r.source.name} ➔ ${r.edge.type} ➔ ${r.target.name}`,
      `- **Ruta de Origen:** \`${r.source.filePath || "N/A"}\` (${r.source.type})`,
      `- **Ruta de Destino:** \`${r.target.filePath || "N/A"}\` (${r.target.type})`,
      `- **Plausibilidad:** ${r.evaluation.plausible ? "✅ SÍ" : "❌ NO"}`,
      `- **Puntaje del Juez:** **${r.evaluation.score}/5**`,
      `- **Razón del Juez:** *"${r.evaluation.reason}"*`,
      ``
    ].join("\n")),
  ].join("\n");

  fs.writeFileSync(logFilePath, mdReport, "utf-8");
  console.log(`💾 ${GREEN}${BOLD}Reporte guardado con éxito:${RESET} ${CYAN}tools/knowledge-engine/logs/${logFileName}${RESET}\n`);
}

main().catch(err => {
  console.error(`\n${RED}Error crítico inesperado: ${err.message}${RESET}\n`);
});
