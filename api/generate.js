import { OpenAI } from "openai";

export const config = {
  api: {
    bodyParser: true,
  },
};

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let { profiel } = req.body;

  if (!profiel || typeof profiel !== "string") {
    return res.status(400).json({ error: "Ongeldig of ontbrekend profiel." });
  }

  // Als profiel een string van JSON is, parse het
  try {
    // Haalt eventueel omringende quotes weg
    if (profiel.startsWith('"') && profiel.endsWith('"')) {
      profiel = profiel.slice(1, -1);
    }
    // Zet escape sequences om
    profiel = profiel.replace(/\\"/g, '"');
  } catch (e) {
    console.error("Kon profiel niet opschonen:", e);
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

Beantwoord alleen in geldig JSON-formaat, zonder extra uitleg.`;

  try {
    const chatResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Je bent een technische recruiter bij YaWorks." },
        { role: "user", content: prompt }
      ],
      temperature: 0.4,
      max_output_tokens: 500
    });

    const content = chatResponse.choices[0].message.content;

    try {
      const parsed = JSON.parse(content);
      return res.status(200).json(parsed);
    } catch (jsonError) {
      return res.status(500).json({ error: "Kon JSON niet parsen", content });
    }
  } catch (apiError) {
    console.error("OpenAI fout:", apiError);
    return res.status(500).json({ error: "OpenAI API-fout", detail: apiError.message });
  }
}
