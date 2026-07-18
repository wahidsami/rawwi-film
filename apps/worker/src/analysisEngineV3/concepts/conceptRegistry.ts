import type { ConceptDefinition, ConceptRegistryEntry } from "./conceptTypes.js";

const DEFAULT_CONCEPTS: readonly ConceptRegistryEntry[] = [
  { id: "organized_crime", label: "Organized Crime", aliases: ["organized crime", "عصابة", "مافيا", "cartel", "gang"] },
  { id: "terrorism", label: "Terrorism", aliases: ["terrorism", "إرهاب", "إرهابي", "terrorist", "bombing", "extremism"] },
  { id: "violence", label: "Violence", aliases: ["violence", "violent", "threat", "attack", "ضرب", "قتل", "تهديد", "assault", "weapon", "knife", "gun"] },
  { id: "child_harm", label: "Child Harm", aliases: ["child harm", "child abuse", "طفل", "طفلة", "قاصر", "minor", "children", "kid", "baby"] },
  { id: "profanity", label: "Profanity", aliases: ["profanity", "يا كلب", "يا حمار", "يا خرا", "كس امة", "كس أمة", "يا نصاب", "يا حرامي", "شتيمة", "سباب", "قذف"] },
  { id: "drug_use", label: "Drug Use", aliases: ["drug use", "drugs", "مخدر", "حشيش", "narcotic", "cocaine", "heroin", "weed"] },
  { id: "bribery", label: "Bribery", aliases: ["bribery", "رشوة", "bribe", "bribed"] },
  { id: "corruption", label: "Corruption", aliases: ["corruption", "فساد", "فاسد", "corrupt"] },
  { id: "military", label: "Military", aliases: ["military", "army", "soldier", "جيش", "عسكري", "warfare"] },
  { id: "government", label: "Government", aliases: ["government", "governmental", "حكومة", "وزارة", "دولة", "state", "ministry", "official"] },
  { id: "religion", label: "Religion", aliases: ["religion", "religious", "دين", "إسلام", "مسلم", "مسيحي", "مسجد", "كنيسة", "صلاة", "prayer"] },
  { id: "sexuality", label: "Sexuality", aliases: ["sexuality", "sexual", "sex", "intercourse", "gay", "lesbian", "transgender"] },
  { id: "nudity", label: "Nudity", aliases: ["nudity", "nude", "naked", "عاري", "عري", "bare"] },
  { id: "suicide", label: "Suicide", aliases: ["suicide", "self-harm", "kill myself", "انتحار", "أقتل نفسي"] },
  { id: "gambling", label: "Gambling", aliases: ["gambling", "gamble", "bet", "casino", "قمار", "رهان"] },
  { id: "alcohol", label: "Alcohol", aliases: ["alcohol", "wine", "beer", "liquor", "خمر", "سكران", "drunk"] },
  { id: "smoking", label: "Smoking", aliases: ["smoking", "smoke", "cigarette", "tobacco", "سيجارة", "يدخن", "دخان"] },
];

export class ConceptRegistry {
  private readonly concepts = new Map<string, ConceptDefinition>();

  constructor(entries: readonly ConceptRegistryEntry[] = DEFAULT_CONCEPTS) {
    for (const entry of entries) this.register(entry);
  }

  register(entry: ConceptDefinition): ConceptDefinition {
    const normalized: ConceptDefinition = Object.freeze({
      id: entry.id.normalize("NFC").replace(/\s+/g, "_").trim().toLowerCase(),
      label: entry.label.normalize("NFC").replace(/\s+/g, " ").trim(),
      aliases: Object.freeze([...new Set(entry.aliases.map((alias) => alias.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase()).filter(Boolean))].sort((left, right) => left.localeCompare(right))),
    });
    this.concepts.set(normalized.id, normalized);
    return normalized;
  }

  unregister(id: string): boolean {
    return this.concepts.delete(id.normalize("NFC").replace(/\s+/g, "_").trim().toLowerCase());
  }

  load(id: string): ConceptDefinition | null {
    return this.concepts.get(id.normalize("NFC").replace(/\s+/g, "_").trim().toLowerCase()) ?? null;
  }

  list(): readonly ConceptDefinition[] {
    return Object.freeze([...this.concepts.values()].sort((left, right) => left.id.localeCompare(right.id)));
  }
}

export function createConceptRegistry(entries?: readonly ConceptRegistryEntry[]): ConceptRegistry {
  return new ConceptRegistry(entries);
}

export function createDefaultConceptRegistry(): ConceptRegistry {
  return new ConceptRegistry(DEFAULT_CONCEPTS);
}
