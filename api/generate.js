import OpenAI from "openai";
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 1️⃣ Matchcheck – JA/NEE + scores
export async function matchCheck(profiel) {
  const prompt = `
Jij bent een recruiter die kandidaten beoordeelt voor YaWorks, een consultancybedrijf gespecialiseerd in complexe IT- en netwerktransformatieprojecten voor Top-500 bedrijven.

Over YaWorks:
YaWorks richt zich op het ontwerpen, bouwen en automatiseren van netwerkinfrastructuren, cloudomgevingen en securityoplossingen. Belangrijke vaardigheden: netwerkarchitectuur, netwerk- en cloudautomatisering (Infrastructure as Code, CI/CD), enterprise security, migraties, vendorselectie, projectleiding.

Opdracht:
Analyseer het volledige kandidatenprofiel dat ik geef. Geef scores (0–5, halve punten toegestaan) voor onderstaande criteria, met een korte toelichting.

Criteria:
- Technische expertise – Beoordeel kennis en certificeringen in netwerken, cloud, security en automatisering.
- Relevantie voor YaWorks-profielen – Match met rollen zoals automation consultant, netwerkengineer in enterprise omgevingen, cloudtransformatieprojecten.
- Hands-on inzetbaarheid – Hoe snel kan de kandidaat waarde leveren in een project.
- Enterprise & projectervaring – Ervaring in grote, complexe, multi-vendor of Top-500 enterprise omgevingen.
- Soft skills & klantgerichtheid – Communicatieve vaardigheden, samenwerking, klantinteractie.

Tel de scores op en bereken een totaalscore op 25.

Aanschrijven (JA/NEE) – JA als totaalscore ≥ 17 én de kandidaat Nederlands kan (afleiden uit werkervaring, opleiding, of andere duidelijke signalen).  
Bij twijfel onder 80% zekerheid → "NEE".

Output JSON (geen extra tekst, geen \`\`\`):
{
  "criteria": [
    { "naam": "Technische expertise", "score": X, "toelichting": "..." },
    { "naam": "Relevantie voor Yaworks-profielen", "score": X, "toelichting": "..." },
    { "naam": "Hands-on inzetbaarheid", "score": X, "toelichting": "..." },
    { "naam": "Enterprise & projectervaring", "score": X, "toelichting": "..." },
    { "naam": "Soft skills & klantgerichtheid", "score": X, "toelichting": "..." }
  ],
  "totaalscore": X,
  "nederlands": "JA of NEE",
  "aanschrijven": "JA of NEE",
  "conclusie": "Max 500 tekens, GDPR-proof, geen namen/bedrijven."
}

Kandidaatprofiel:
${profiel}
`;

  const completion = await client.responses.create({
    model: "gpt-4o-mini",
    input: prompt,
    temperature: 0.2,
    max_output_tokens: 1000,
  });

  return completion.output_text;
}

// 2️⃣ LinkedIn connectieverzoek
export async function linkedinMessage(profielJson, naamKandidaat, recruiterNaam) {
  const prompt = `
Opdracht:
Schrijf een kort, persoonlijk LinkedIn-connectieverzoek namens een recruiter van YaWorks aan een kandidaat.

Gebruik deze info uit JSON:
${JSON.stringify(profielJson)}

Vaste opbouw:
Hé [Naam],  

Jouw ervaring heeft veel overlap tussen jouw [certificeringen/ervaring] in [toptechnologieën] en onze [relevante projecten] bij YaWorks.  

Lijkt me leuk om te connecten!  

MvG  
[Recruiternaam]

Vul automatisch in op basis van de JSON. Max 270 tekens. Zakelijk, vriendelijk, direct.

Uitvoer alleen de tekst, geen JSON.
`;

  const completion = await client.responses.create({
    model: "gpt-4o-mini",
    input: prompt
      .replace("[Naam]", naamKandidaat)
      .replace("[Recruiternaam]", recruiterNaam),
    temperature: 0.4,
    max_output_tokens: 300,
  });

  return completion.output_text;
}

// 3️⃣ WhatsApp-stijl bericht
export async function whatsappMessage(profielJson, naamKandidaat) {
  const prompt = `
Opdracht:
Schrijf een hyper-gepersonaliseerd, kort en scanbaar WhatsApp-stijl recruiterbericht namens YaWorks.

Gebruik deze info uit JSON:
${JSON.stringify(profielJson)}

Hé [Naam], [persoonlijke openingszin]  

[Zin over certificeringen en skills]  
[Zin over match met YaWorks-projecten]  

[Zin over type projecten en omgeving bij YaWorks]  
[Zin waarin ambitie van kandidaat verbonden wordt aan YaWorks-mogelijkheden]  

Als je dat interessant vindt, vertel ik je graag meer.

Houd het compact (4–6 regels), scanbaar, geen marketingjargon, schrijfstijl matchen aan kandidaat.
`;

  const completion = await client.responses.create({
    model: "gpt-4o-mini",
    input: prompt.replace("[Naam]", naamKandidaat),
    temperature: 0.4,
    max_output_tokens: 500,
  });

  return completion.output_text;
}

// 4️⃣ Volledige JSON-extractor (GDPR-proof)
export async function fullProfileExtractor(profiel) {
  const prompt = `
ROL & DOEL:
Je bent een zeer strikte extractor. Gebruik alleen expliciete info uit het profiel.  
Geen gokwerk onder 80% zekerheid — alleen invullen als je met ≥80% zekerheid kunt afleiden.  
Als ≥80% zekerheid, mag je op basis van context afleiden (bijv. kandidaat werkt al jaren in Nederland → Nederlands = JA).

GDPR-regel:
Nooit bedrijfsnamen opnemen; gebruik generieke omschrijvingen.

JSON-SCHEMA:
${`{
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
}`}

Kandidaatprofiel:
${profiel}

Output: Alleen de JSON, geen extra tekst.
`;

  const completion = await client.responses.create({
    model: "gpt-4o-mini",
    input: prompt,
    temperature: 0.1,
    max_output_tokens: 4000,
  });

  return completion.output_text;
}

// 5️⃣ Flow
export async function generate(profiel, naamKandidaat, recruiterNaam) {
  const match = await matchCheck(profiel);
  const matchData = JSON.parse(match);

  if (matchData.aanschrijven === "NEE") {
    return { match: matchData, linkedin: null, whatsapp: null, fullJson: null };
  }

  const linkedin = await linkedinMessage(matchData, naamKandidaat, recruiterNaam);
  const whatsapp = await whatsappMessage(matchData, naamKandidaat);
  const fullJson = await fullProfileExtractor(profiel);

  return {
    match: matchData,
    linkedin,
    whatsapp,
    fullJson: JSON.parse(fullJson),
  };
}
