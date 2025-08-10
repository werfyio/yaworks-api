// pages/api/generate.js
import OpenAI from "openai";

export const config = { api: { bodyParser: true } };

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Nieuwe modellen gebruiken de Responses API
const NEEDS_RESPONSES_API = (model = "") =>
  /^(gpt-5|gpt-4\.1|gpt-4o|o\d|o[34]-mini)/i.test(model);

function safeJsonParse(s) { try { return JSON.parse(s); } catch { return null; } }
function stripCodeFence(s = "") {
  let t = String(s).trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  }
  return t;
}

export default async function handler(req, res) {
  // (optioneel) CORS preflight
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Body kan string of JSON zijn → beide ondersteunen
    const raw = req.body;
    const body = typeof raw === "string" ? (safeJsonParse(raw) ?? raw) : (raw || {});

    const model = (typeof body === "object" ? body.model : undefined) ?? "gpt-4o-mini";
    const temperature = (typeof body === "object" ? body.temperature : undefined) ?? 0.4;
    const max_tokens = (typeof body === "object" ? body.max_tokens : undefined);

    let profiel = null;
    if (typeof body === "string") {
      profiel = body;
    } else {
      // accepteer zowel 'profiel' als 'Profiel'
      profiel = body.profiel ?? body.Profiel ?? null;
    }

    if (!profiel || typeof profiel !== "string" || !profiel.trim()) {
      return res.status(400).json({ error: "Ongeldig of ontbrekend profiel." });
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
`;

    // NIEUWE MODELLEN → Responses API
    if (NEEDS_RESPONSES_API(model)) {
      const resp = await openai.responses.create({
        model,
        instructions: "Je bent een technische recruiter bij YaWorks.",
        input: prompt,
        temperature,
        // juiste parameternaam in Responses API
        max_output_tokens: typeof max_tokens === "number" ? max_tokens : 400,
        stream: false
      });

      const text =
        resp.output_text ??
        resp.output?.[0]?.content?.find?.(c => c.type === "output_text")?.text ??
        "";

      const cleaned = stripCodeFence(text);
      try {
        return res.status(200).json(JSON.parse(cleaned));
      } catch {
        return res.status(200).json({ ok: true, text: cleaned, note: "Output was geen geldige JSON." });
      }
    }

    // OUDE MODELLEN → Chat Completions API
    const chat = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: "Je bent een technische recruiter bij YaWorks." },
        { role: "user", content: prompt }
      ],
      temperature,
      ...(typeof max_tokens === "number" ? { max_tokens } : {})
    });

    const content = chat.choices?.[0]?.message?.content ?? "";
    const cleaned = stripCodeFence(content);
    try {
      return res.status(200).json(JSON.parse(cleaned));
    } catch {
      return res.status(200).json({ ok: true, text: cleaned, note: "Output was geen geldige JSON." });
    }
  } catch (e) {
    console.error("OpenAI fout:", e);
    return res.status(500).json({ error: "OpenAI API-fout", detail: e?.message });
  }
}
