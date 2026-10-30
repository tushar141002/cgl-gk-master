import type { SectionId } from "../types";

export interface Subtopic {
  id: string;
  name: string;
  short: string;
  hi: string;
}

export interface Section {
  id: SectionId;
  name: string;
  hi: string;
  short: string;
  emoji: string;
  accent: string;
  subtopics: Subtopic[];
}

export const SECTIONS: Section[] = [
  {
    id: "history",
    name: "History",
    hi: "इतिहास",
    short: "History",
    emoji: "🏛️",
    accent: "#b45309",
    subtopics: [
      {
        id: "prehistoric-ivc",
        name: "Prehistoric India & Indus Valley Civilization",
        short: "Prehistoric & IVC",
        hi: "प्रागैतिहासिक भारत एवं सिंधु घाटी सभ्यता",
      },
      {
        id: "vedic-mauryan-gupta",
        name: "Vedic Age; Mauryan & Gupta Empires",
        short: "Vedic, Mauryan & Gupta",
        hi: "वैदिक काल; मौर्य एवं गुप्त साम्राज्य",
      },
      {
        id: "medieval-india",
        name: "Medieval India: Delhi Sultanate, Mughals, Regional Kingdoms",
        short: "Medieval India",
        hi: "मध्यकालीन भारत: दिल्ली सल्तनत, मुगल, क्षेत्रीय राज्य",
      },
      {
        id: "freedom-struggle",
        name: "Socio-Religious Reform Movements & Freedom Struggle",
        short: "Reform & Freedom",
        hi: "सामाजिक-धार्मिक सुधार आंदोलन एवं स्वतंत्रता संग्राम",
      },
      {
        id: "post-independence",
        name: "Post-Independence Landmarks & Constitutional Developments",
        short: "Post-Independence",
        hi: "स्वतंत्रता के बाद की उपलब्धियाँ एवं संवैधानिक विकास",
      },
    ],
  },
  {
    id: "geography",
    name: "Geography",
    hi: "भूगोल",
    short: "Geography",
    emoji: "🌏",
    accent: "#0f766e",
    subtopics: [
      {
        id: "physical-features",
        name: "Physical Features: Mountains, Plateaus, Rivers, Plains",
        short: "Physical Features",
        hi: "भौतिक विशेषताएँ: पर्वत, पठार, नदियाँ, मैदान",
      },
      {
        id: "climate-monsoon",
        name: "Climate & Monsoon System of India",
        short: "Climate & Monsoon",
        hi: "भारत की जलवायु एवं मानसून प्रणाली",
      },
      {
        id: "soil-vegetation",
        name: "Soil, Vegetation, Natural Resources, Minerals",
        short: "Soil, Vegetation & Minerals",
        hi: "मिट्टी, वनस्पति, प्राकृतिक संसाधन, खनिज",
      },
      {
        id: "agriculture",
        name: "Agriculture & Cropping Systems",
        short: "Agriculture",
        hi: "कृषि एवं फसल प्रणालियाँ",
      },
      {
        id: "map-static",
        name: "Map-based Static GK",
        short: "Map-based GK",
        hi: "मानचित्र आधारित स्थैतिक जी.के.",
      },
    ],
  },
  {
    id: "polity",
    name: "Polity & Governance",
    hi: "राजव्यवस्था एवं शासन",
    short: "Polity",
    emoji: "⚖️",
    accent: "#1d4ed8",
    subtopics: [
      {
        id: "constitution-basics",
        name: "Constitution Basics: Preamble, Fundamental Rights, DPSP",
        short: "Constitution Basics",
        hi: "संविधान की मूल बातें: प्रस्तावना, मौलिक अधिकार, नीति निर्देशक तत्व",
      },
      {
        id: "parliament",
        name: "Parliament, President, PM & Council of Ministers",
        short: "Parliament & Executive",
        hi: "संसद, राष्ट्रपति, प्रधानमंत्री एवं मंत्रिपरिषद",
      },
      {
        id: "judiciary",
        name: "Judiciary: Supreme Court & High Courts",
        short: "Judiciary",
        hi: "न्यायपालिका: सर्वोच्च न्यायालय एवं उच्च न्यायालय",
      },
      {
        id: "panchayati-raj",
        name: "Local Governance: Panchayati Raj",
        short: "Panchayati Raj",
        hi: "स्थानीय शासन: पंचायती राज",
      },
      {
        id: "amendments-acts",
        name: "Important Constitutional Amendments & Acts",
        short: "Amendments & Acts",
        hi: "महत्वपूर्ण संवैधानिक संशोधन एवं अधिनियम",
      },
    ],
  },
  {
    id: "economy",
    name: "Economy & Budget",
    hi: "अर्थव्यवस्था एवं बजट",
    short: "Economy",
    emoji: "📊",
    accent: "#a16207",
    subtopics: [
      {
        id: "macro-micro",
        name: "Basic Macro & Micro Concepts: GDP, Inflation, Fiscal Deficit",
        short: "Macro & Micro",
        hi: "मूल समष्टि एवं व्यष्टि अवधारणाएँ: जीडीपी, मुद्रास्फीति, राजकोषीय घाटा",
      },
      {
        id: "budget-taxation",
        name: "Budget & Taxation Basics",
        short: "Budget & Tax",
        hi: "बजट एवं कराधान की मूल बातें",
      },
      {
        id: "banking-rbi",
        name: "Banking: RBI, Monetary Policy, Financial Inclusion",
        short: "Banking & RBI",
        hi: "बैंकिंग: आरबीआई, मौद्रिक नीति, वित्तीय समावेशन",
      },
      {
        id: "schemes-welfare",
        name: "Major Government Schemes, Subsidy & Welfare Programs",
        short: "Schemes & Welfare",
        hi: "प्रमुख सरकारी योजनाएँ, सब्सिडी एवं कल्याण कार्यक्रम",
      },
    ],
  },
  {
    id: "science",
    name: "Science & Technology",
    hi: "विज्ञान एवं प्रौद्योगिकी",
    short: "Science",
    emoji: "🔬",
    accent: "#7e22ce",
    subtopics: [
      {
        id: "physics-chemistry",
        name: "Basic Physics & Chemistry (everyday relevance)",
        short: "Physics & Chemistry",
        hi: "मूल भौतिकी एवं रसायन (दैनिक जीवन में उपयोग)",
      },
      {
        id: "biology-health",
        name: "Biology: Human Body, Diseases, Vaccines",
        short: "Biology & Health",
        hi: "जीव विज्ञान: मानव शरीर, रोग, टीके",
      },
      {
        id: "inventions",
        name: "Important Inventions & Discoveries",
        short: "Inventions",
        hi: "महत्वपूर्ण आविष्कार एवं खोजें",
      },
      {
        id: "recent-science",
        name: "Recent Advances: Space Missions, IT, Biotech Headlines",
        short: "Recent Advances",
        hi: "हाल के विकास: अंतरिक्ष मिशन, आईटी, बायोटेक",
      },
    ],
  },
  {
    id: "static",
    name: "Static GK & Current Affairs",
    hi: "सामान्य ज्ञान एवं करेंट अफेयर्स",
    short: "Static GK",
    emoji: "🌐",
    accent: "#be123c",
    subtopics: [
      {
        id: "dates-awards",
        name: "Important Dates, Events, Awards & Honours",
        short: "Dates & Awards",
        hi: "महत्वपूर्ण तिथियाँ, घटनाएँ, पुरस्कार एवं सम्मान",
      },
      {
        id: "sports",
        name: "Sports: Tournaments & Winners",
        short: "Sports",
        hi: "खेल: टूर्नामेंट एवं विजेता",
      },
      {
        id: "books-authors",
        name: "Books & Authors",
        short: "Books & Authors",
        hi: "पुस्तकें एवं लेखक",
      },
      {
        id: "international-bodies",
        name: "International Bodies (UN, WHO, IMF, WTO etc.): Basics & Headquarters",
        short: "International Bodies",
        hi: "अंतर्राष्ट्रीय संगठन (यूएन, डब्ल्यूएचओ, आईएमएफ, डब्ल्यूटीओ आदि)",
      },
      {
        id: "recent-news",
        name: "Recent News (last 12 months): National & International",
        short: "Recent News",
        hi: "हाल की खबरें (पिछले 12 महीने): राष्ट्रीय एवं अंतर्राष्ट्रीय",
      },
    ],
  },
];

export const SECTION_MAP: Record<SectionId, Section> = Object.fromEntries(
  SECTIONS.map((s) => [s.id, s]),
) as Record<SectionId, Section>;

export function getSubtopic(section: SectionId, subtopicId: string): Subtopic | undefined {
  return SECTION_MAP[section]?.subtopics.find((t) => t.id === subtopicId);
}

export function subtopicName(section: SectionId, subtopicId: string): string {
  return getSubtopic(section, subtopicId)?.name ?? subtopicId;
}

export function topicKey(section: SectionId, subtopicId: string): string {
  return `${section}/${subtopicId}`;
}

export const ALL_SUBTOPICS = SECTIONS.flatMap((s) =>
  s.subtopics.map((t) => ({ ...t, section: s.id, sectionName: s.name })),
);

export const DIFFICULTY_LABELS = ["Easy", "Easy+", "Medium", "Hard", "Very hard"];
export const DIFFICULTY_LABELS_HI = ["आसान", "आसान+", "मध्यम", "कठिन", "बहुत कठिन"];
