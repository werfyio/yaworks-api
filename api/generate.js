// pages/api/generate.js
import OpenAI from "openai";

export const config = { api: { bodyParser: true } };

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Check of het model de Responses API moet gebruiken
const NEEDS_RESPONSES_API = (model = "") =>
  /^(gpt-5|gpt-4\.1|gpt-4o|o\d|o[34]-mini)/i.test(model);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
    profiel,
    model = "gpt-4",          // default model
    temperature = 0.4,
    max_tokens                // kan uit Glide komen
  } = req.body || {};

  if (!profiel || typeof profiel !== "string") {
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

Beantwoord alleen in geldig JSON-formaat, zonder extra uitleg.
`;

  try {
    // NIEUWE MODELLEN → Responses API
    if (NEEDS_RESPONSES_API(model)) {
      const resp = await openai.responses.create({
        model,
        instructions: "Je bent een technische recruiter bij YaWorks.",
        input: prompt,
        temperature,
        max_output_tokens: max_tokens ?? 400, // juiste parameternaam!
        stream: false
      });

      const text =
        resp.output_text ??
        resp.output?.[0]?.content?.find?.(c => c.type === "output_text")?.text ??
        "";

      try {
        const parsed = JSON.parse(text);
        return res.status(200).json(parsed);
      } catch {
        return res.status(200).json({
          ok: true,
          text,
          note: "Output was geen geldige JSON."
        });
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
      ...(max_tokens ? { max_tokens } : {})
    });

    const content = chat.choices?.[0]?.message?.content ?? "";

    try {
      const parsed = JSON.parse(content);
      return res.status(200).json(parsed);
    } catch {
      return res.status(200).json({
        ok: true,
        text: content,
        note: "Output was geen geldige JSON."
      });
    }
  } catch (apiError) {
    console.error("OpenAI fout:", apiError);
    return res.status(500).json({
      error: "OpenAI API-fout",
      detail: apiError?.message
    });
  }
}
