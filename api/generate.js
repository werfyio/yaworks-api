// pages/api/generate.js
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let bodyData = req.body;

  // Als body een string is, probeer hem te parsen
  if (typeof bodyData === "string") {
    try {
      bodyData = JSON.parse(bodyData);
    } catch {
      // Laat als string staan als het geen geldige JSON is
    }
  }

  const profiel = bodyData?.profiel;

  if (!profiel || typeof profiel !== "string" || !profiel.trim()) {
    return res.status(400).json({
      error: "Ongeldig of ontbrekend profiel.",
      received_body: bodyData,
    });
  }

  // Prompt met jouw volledige instructies
  const prompt = `
ROL & DOEL
Je bent een zeer strikte extractor. Analyseer de kandidaat-informatie (CV, LinkedIn-profiel, notities). Gebruik uitsluitend informatie die expliciet in de tekst staat. Verzin niets. Als informatie ontbreekt, volg de fallback-regels. Geef uitsluitend geldige JSON volgens het exacte schema onder “JSON-schema”. Geen uitleg, geen extra tekst.

GDPR-regel: Nooit bedrijfsnamen opnemen; gebruik generieke omschrijvingen zoals “grote telecomprovider” of “publieke sectororganisatie”.

BESLISREGELS PER VELD
[ ... hier laat je alle beslisregels uit je prompt volledig staan ... ]

JSON-SCHEMA
{
  "schema_version": "2025-08-F2F3",
  "dienstverband": "",
  "werkgebied": {
    "woonplaats": "",
    "provincie": "",
    "binnen_1_uur_steden": []
  },
  "opleidingen": {
    "hoogst_afgeronde_opleiding": "",
    "werk_en_denk_niveau": "",
    "relevant_voor_roles": ""
  },
  "certificaten": [
    { "naam": "", "status": "" }
  ],
  "werkervaring_relevant": "",
  "functie_type": "",
  "functie_groep": [],
  "industry": [],
  "type_ervaring_bedrijven": [],
  "niveau_overall": "",
  "skills_top5": [
    { "skill": "", "niveau": "" }
  ],
  "skills_all": [],
  "werkervaring_samenvatting_gdpr": "",
  "beschikbaarheid": "",
  "contract_voorkeur": [],
  "reisbereidheid": "",
  "talen": [
    { "taal": "", "niveau": "" }
  ],
  "sectoren_telling": 0,
  "project_ervaring_type": [],
  "tech_stack_aantal": 0,
  "laatste_functie_einddatum": "",
  "rolgeschiedenis": [
    { "rol": "", "jaren": 0 }
  ],
  "certificeringen_totaal": 0,
  "red_flags": [],
  "pluspunten": [],
  "gdpr_cleaned": true,
  "schrijfstijl": "",
  "zelfpresentatie": "",
  "ambitie_korte_termijn": "",
  "ambitie_lange_termijn": "",
  "mogelijke_next_step": "",
  "core_capabilities": {
    "Conviction": { "score": 0, "omschrijving": "" },
    "Storytelling": { "score": 0, "omschrijving": "" },
    "Subject Mastery": { "score": 0, "omschrijving": "" },
    "Multidisciplinary Teamwork": { "score": 0, "omschrijving": "" }
  },
  "champions_league_score": {
    "totaal_score": 0,
    "breakdown": {
      "experience_seniority": 0,
      "enterprise_exposure": 0,
      "technical_consultancy_skills": 0,
      "certifications_education": 0,
      "leadership_potential": 0
    },
    "uitleg": ""
  },
  "teamrol": {
    "rol": "",
    "gedrag": "",
    "sterke_punten": "",
    "aandachtspunten": ""
  },
  "disq_profiel": {
    "Dominant": { "score": 0, "interpretatie": "" },
    "Invloed": { "score": 0, "interpretatie": "" },
    "Stabiel": { "score": 0, "interpretatie": "" },
    "Consciëntieus": { "score": 0, "interpretatie": "" },
    "combinatieprofiel": "",
    "combinatie_uitleg": ""
  },
  "culture_fit_score": 0,
  "impact_highlights": [],
  "preferred_tech_focus": [],
  "persoonlijke_usp": ""
}

Kandidaatprofiel:
${profiel}

LET OP:
Output is alleen de json {} Niks ervoor of erna.
haal dingen als \`\`\`json en  \`\`\` weg alleen { en wat er tussen zit en }.
Check goed dat alles is ingevuld. Als je klaar bent loop alles na en check of je alle info hebt verstrekt.
  `.trim();

  try {
    const completion = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        messages: [
          { role: "system", content: "Je bent een zeer strikte data-extractor." },
          { role: "user", content: prompt },
        ],
        max_tokens: 2000,
        temperature: 0.2,
      }),
    });

    const completionData = await completion.json();

    if (!completion.ok) {
      return res.status(500).json({
        error: "OpenAI API-fout",
        detail: completionData,
      });
    }

    let text = completionData.choices?.[0]?.message?.content?.trim() || "";

    // Strip eventuele ```json fences
    if (text.startsWith("```")) {
      text = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    }

    try {
      const parsed = JSON.parse(text);
      return res.status(200).json(parsed);
    } catch {
      return res.status(200).json({
        ok: true,
        raw_text: text,
        note: "Kon geen geldige JSON parsen.",
      });
    }
  } catch (err) {
    return res.status(500).json({
      error: "Serverfout",
      detail: err.message,
    });
  }
}
