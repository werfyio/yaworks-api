// pages/api/generate.js
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const debug = req.query?.debug === "1" || req.headers["x-debug"] === "1";

  console.log("Raw body ontvangen (type):", typeof req.body);
  console.log("Raw body ontvangen (waarde):", req.body);

  let bodyData = req.body;
  if (typeof bodyData === "string") {
    try {
      bodyData = JSON.parse(bodyData);
    } catch (err) {
      console.log("Kon body niet parsen als JSON:", err.message);
    }
  }

  if (debug) {
    return res.status(200).json({
      debug: true,
      typeof_body: typeof bodyData,
      received_body: bodyData,
      headers: req.headers,
    });
  }

  const profiel = bodyData?.profiel;
  if (!profiel || typeof profiel !== "string" || !profiel.trim()) {
    return res.status(400).json({
      error: "Ongeldig of ontbrekend profiel.",
      typeof_body: typeof bodyData,
      received_body: bodyData,
    });
  }

  // Basis schema voor validatie
  const schemaTemplate = {
    schema_version: "2025-08-F2F3",
    dienstverband: null,
    werkgebied: { woonplaats: null, provincie: null, binnen_1_uur_steden: [] },
    opleidingen: { hoogst_afgeronde_opleiding: null, werk_en_denk_niveau: null, relevant_voor_roles: null },
    certificaten: [{ naam: "", status: "" }],
    werkervaring_relevant: null,
    functie_type: null,
    functie_groep: [],
    industry: [],
    type_ervaring_bedrijven: [],
    niveau_overall: null,
    skills_top5: [{ skill: "", niveau: "" }],
    skills_all: [],
    werkervaring_samenvatting_gdpr: "",
    beschikbaarheid: "",
    contract_voorkeur: [],
    reisbereidheid: "",
    talen: [{ taal: "", niveau: "" }],
    sectoren_telling: 0,
    project_ervaring_type: [],
    tech_stack_aantal: 0,
    laatste_functie_einddatum: "",
    rolgschiedenis: [{ rol: "", jaren: 0 }],
    certificeringen_totaal: 0,
    red_flags: [],
    pluspunten: [],
    gdpr_cleaned: true,
    schrijfstijl: "",
    zelfpresentatie: "",
    ambitie_korte_termijn: "",
    ambitie_lange_termijn: "",
    mogelijke_next_step: "",
    core_capabilities: {
      Conviction: { score: 0, omschrijving: "" },
      Storytelling: { score: 0, omschrijving: "" },
      Subject Mastery: { score: 0, omschrijving: "" },
      Multidisciplinary Teamwork: { score: 0, omschrijving: "" },
    },
    champions_league_score: {
      totaal_score: 0,
      breakdown: {
        experience_seniority: 0,
        enterprise_exposure: 0,
        technical_consultancy_skills: 0,
        certifications_education: 0,
        leadership_potential: 0,
      },
      uitleg: "",
    },
    teamrol: { rol: "", gedrag: "", sterke_punten: "", aandachtspunten: "" },
    disq_profiel: {
      Dominant: { score: 0, interpretatie: "" },
      Invloed: { score: 0, interpretatie: "" },
      Stabiel: { score: 0, interpretatie: "" },
      Consciëntieus: { score: 0, interpretatie: "" },
      combinatieprofiel: "",
      combinatie_uitleg: "",
    },
    culture_fit_score: 0,
    impact_highlights: [],
    preferred_tech_focus: [],
    persoonlijke_usp: "",
  };

  const prompt = `
${/* jouw volledige ROL & DOEL prompt hier, ingekort voor leesbaarheid */""}
${profiel}
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
          {
            role: "system",
            content:
              "Je bent een zeer strikte JSON-extractor die alleen geldige JSON produceert volgens het gegeven schema.",
          },
          { role: "user", content: prompt },
        ],
        max_tokens: 3000,
        temperature: 0,
      }),
    });

    const completionData = await completion.json();

    if (!completion.ok) {
      console.error("OpenAI API-fout:", completionData);
      return res.status(500).json({ error: "OpenAI API-fout", detail: completionData });
    }

    let text = completionData.choices[0]?.message?.content || "";
    text = text.trim();
    if (text.startsWith("```")) {
      text = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    }

    // Probeer JSON te parsen
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      return res.status(500).json({ error: "AI-output geen geldige JSON", ai_output: text });
    }

    // Vul ontbrekende velden in met defaults uit schemaTemplate
    function fillDefaults(template, data) {
      for (const key in template) {
        if (typeof template[key] === "object" && !Array.isArray(template[key])) {
          if (typeof data[key] !== "object" || Array.isArray(data[key])) {
            data[key] = JSON.parse(JSON.stringify(template[key]));
          } else {
            fillDefaults(template[key], data[key]);
          }
        } else if (Array.isArray(template[key])) {
          if (!Array.isArray(data[key])) {
            data[key] = template[key];
          }
        } else {
          if (!(key in data)) {
            data[key] = template[key];
          }
        }
      }
      return data;
    }

    const validated = fillDefaults(schemaTemplate, parsed);

    res.status(200).json(validated);
  } catch (err) {
    console.error("Serverfout:", err);
    res.status(500).json({ error: "Serverfout", detail: err.message });
  }
}
