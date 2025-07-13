// generate.js
import { OpenAI } from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { profiel } = req.body;

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

Beantwoord alleen in geldig JSON-formaat, zonder extra uitleg.`;

  try {
    const chatResponse = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: "Je bent een technische recruiter bij YaWorks." },
        { role: "user", content: prompt }
      ],
      temperature: 0.4
    });

    const content = chatResponse.choices[0].message.content;

    // Probeer JSON te parsen
    try {
      const parsed = JSON.parse(content);
      return res.status(200).json(parsed);
    } catch (jsonError) {
      return res.status(500).json({ error: "Kon JSON niet parsen", content });
    }
  } catch (apiError) {
    return res.status(500).json({ error: "OpenAI API-fout", detail: apiError.message });
  }
}
