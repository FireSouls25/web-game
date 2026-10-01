export interface CharacterDef {
  id: string;
  name: string;
  role: string;
  personality: string;
  notes: string;
}

/** Roster from docs/idea.md — static data; LLM context wiring comes later. */
export const CHARACTERS: CharacterDef[] = [
  { id: 'annie', name: 'Annie Fitz', role: 'Protagonist companion and lover', personality: 'Talks a lot, emotional and kind, observer', notes: '' },
  { id: 'victoria', name: 'Victoria Whitehouse', role: 'Distant family of the original owners', personality: 'Arrogant, closed about her knowledge', notes: 'Knows some things about the manor.' },
  { id: 'arthur', name: 'Arthur Blair', role: 'Academic researcher', personality: 'Curious, roams, loves mysteries', notes: 'Context giver for ancient things / time period.' },
  { id: 'thomas', name: 'Thomas Miller', role: 'Butler, cleaning and cooking', personality: 'Formal, reserved but kind and helpful', notes: 'Came with Victoria; gossip about the rich.' },
  { id: 'edward', name: 'Edward Cromwell', role: 'Doctor', personality: 'Well-behaved but scared, a bit paranoid', notes: 'Useful for bodies / weird substances.' },
  { id: 'samuel', name: 'Samuel Graves', role: 'Greedy journalist/traveller, arrives night 1', personality: 'Rude, egoist, a bit malicious', notes: 'Sees the manor as loot; may harm others.' },
  { id: 'clara', name: 'Clara Bell', role: 'Former servant, already lived in the manor', personality: 'Timid, traumatized by time alone', notes: 'Dies afternoon of day 1 unless saved; opens up after rescue.' },
];
