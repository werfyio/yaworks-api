// pages/api/generate.js  (of api/generate.js)
import { OpenAI } from "openai";

export const config = {
  api: {
    bodyParser: true, // laat Vercel JSON parsen; we vangen vreemde gevallen zelf af
  },
};

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Helpers
const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

function stripCodeFence(s = "") {
  let t = String(s).trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  }
  return t;
}

// Normaliseer willekeurige Glide/Client payloads naar { profiel: string }
function normalizeBody(req) {
  let raw = req.body;

  // Log raw binnenkomende body
  console.log("Raw body (typeof):", typeof raw);
  console.log("Raw body (value):", raw);

  // Buffers → string
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(raw)) {
    raw = raw.toString("utf8");
  }

  // string → probeer JSON, anders als platte tekst interpreteren
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("\"{") && trimmed.endsWith("}\""))) {
      try {
        raw = JSON.parse(trimmed);
      } catch {
        // als het echt niet te parsen is, stuur als platte tekst
        return { profiel: trimmed };
      }
    } else {
      return { profiel: trimmed };
    }
  }

  // object
  if (isPlainObject(raw)) {
    // ideale pad
    if (typeof raw.profiel === "string" && raw.profiel.trim() !== "") {
      return { profiel: raw.profiel };
    }

    // body heeft 1 key met een string (soms JSON-als-string)
    const keys = Object.keys(raw);
    if (keys.length === 1) {
      const val = raw[keys[0]];
      if (typeof val === "string") {
        const v = val.trim();
        if (v.startsWith("{") && v.endsWith("}")) {
          try {
            const inner = JSON.parse(v);
            if (typeof inner.profiel === "string" && inner.profiel.trim() !== "") {
              return { profiel: inner.profiel };
            }
          } catch {
            return { profiel: v };
          }
        } else {
          return { profiel: v };
        }
      }
    }

    // laatste redmiddel: probeer eerste stringwaarde te pakken
    for (const k of keys) {
      if (typeof raw[k] === "string" && raw[k].trim() !== "") {
        return { profiel: raw[k] };
      }
    }
  }

  // niets bruikbaars
  return { profiel: "" };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const debug = req.query?.debug === "1" || req.headers["x-debug"] === "1";

  // Normaliseer inkomende body naar { profiel }
  const norm = normalizeBody(req);

  // Optionele extra opschoning: buitenste quotes weg, escaped quotes/newlines normaliseren
  let profiel = norm.profiel;
  if (typeof profiel === "string") {
    const p = profiel.trim();
    if (p.startsWith('"') && p.endsWith('"')) {
      profiel = p.slice(1, -1);
    }
    profiel = profiel.replace(/\\"/g, '"').replace(/\\n/g, "\n");
  }

  // Debug-echo (handig voor Glide)
  if (debug) {
    return res.status(200).json({
      debug: true,
      normalized: { profiel },
      typeof_body: typeof req.body,
      received_body: req.body,
      headers: req.headers,
    });
  }

  if (!profiel || typeof profiel !== "string" || !profiel.trim()) {
    return res.status(400).json({
      error: "Ongeldig of ontbrekend profiel.",
      hint: "Zorg dat je in Glide de key 'profiel' meestuurt, of stuur pure tekst; dit script pakt beide.",
      received_preview: typeof req.body === "string" ? req.body.slice(0, 200) : req.body,
    });
  }

  const prompt = `
Je bent een technisch recruiter bij YaWorks. Analyseer dit profiel:

"""
${profiel}
"""

Geef output in JSON met de volgende velden:
- voornaam
- achternaam
- profieltype (zoals Engineer, Architect, Automation, etc.)
- persoonlijkheid (3 woorden)
- skills (comma separated)
- samenvatting (1 zin)
- bericht (max 6 regels, eindigend op: Laat maar weten als je benieuwd bent hoe dat er voor jou uitziet. Kijk anders even op www.yaworkscareers.com.)

Beantwoord alleen in geldig JSON-formaat, zonder extra uitleg en zonder codeblokken.
`.trim();

  try {
    // Chat Completions (werkt prima met gpt-4o-mini)
    const chat = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Je bent een technische recruiter bij YaWorks." },
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
      max_tokens: 500,
    });

    const raw = chat.choices?.[0]?.message?.content ?? "";
    const cleaned = stripCodeFence(raw);

    try {
      const parsed = JSON.parse(cleaned);
      return res.status(200).json(parsed);
    } catch {
      // Niet helemaal zuivere JSON? Geef de tekst terug i.p.v. 500
      return res.status(200).json({
        ok: true,
        text: cleaned,
        note: "Output was geen geldige JSON; text teruggegeven voor debug.",
      });
    }
  } catch (err) {
    console.error("OpenAI fout:", err);
    return res.status(500).json({
      error: "OpenAI API-fout",
      detail: err?.message || String(err),
    });
  }
}
