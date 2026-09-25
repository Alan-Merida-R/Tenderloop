/**
 * Reads the "Team Involved" people out of a Scope of Work note's saved JSON
 * (see services/sowTemplate.html `collectState()` for the shape: fixed-role
 * fields under `fields.team_*` plus the freeform `tables.team_members_table`).
 * Used to feed the Task "responsible" picker with real names + areas instead
 * of a plain free-text field.
 */
export interface SowTeamMember {
  id: string;
  name: string;
  area: string;
}

const FIXED_ROLE_FIELDS: { key: string; area: string }[] = [
  { key: 'team_cse', area: 'Sales / CSE' },
  { key: 'team_tender', area: 'Tender Engineer' },
  { key: 'team_tsc_modicon', area: 'TSC - Modicon' },
  { key: 'team_tsc_foxboro', area: 'TSC - Foxboro' },
  { key: 'team_tsc_triconex', area: 'TSC - Triconex' },
  { key: 'team_delivery', area: 'Delivery / Project Execution' },
  { key: 'team_field', area: 'Field Services' },
  { key: 'team_foxmass', area: 'FoxMass / Cabinets' },
  { key: 'team_supply', area: 'Supply Chain / Resales' },
  { key: 'team_contracts', area: 'Commercial / Contracts' },
  { key: 'team_approver', area: 'Proposal approver' },
  { key: 'customer_decision', area: 'Customer decision maker' },
];

function stripHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseSowTeamMembers(noteContent: string | undefined | null): SowTeamMember[] {
  if (!noteContent) return [];
  let data: any;
  try { data = JSON.parse(noteContent); } catch { return []; }

  const members: SowTeamMember[] = [];
  const seen = new Set<string>();
  const add = (rawName: unknown, area: string) => {
    const name = stripHtml(rawName);
    if (!name) return;
    const id = `${name.toLowerCase()}|${area.toLowerCase()}`;
    if (seen.has(id)) return;
    seen.add(id);
    members.push({ id, name, area });
  };

  const fields = data?.fields || {};
  FIXED_ROLE_FIELDS.forEach(({ key, area }) => add(fields[key], area));

  const tableRows: unknown[][] = data?.tables?.team_members_table || [];
  tableRows.forEach(row => {
    const [area, name] = row || [];
    if (name) add(name, stripHtml(area) || 'Team member');
  });

  return members;
}

interface TeamStakeholder {
  id: string;
  name: string;
  role?: string;
  roles?: string[];
  roleContexts?: Record<string, string>;
  aliases?: string[];
}

const normalizePersonName = (value: string | undefined) => (value || '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * The people offered by the task pickers: the opportunity's stakeholders (one entry per role)
 * plus the SOW "Team Involved" names that are not stakeholders yet. The Seller is copied into
 * the SOW `team_cse` field, so without the name/alias match the same CSE was listed twice —
 * once as a stakeholder and once under its legacy SOW "name|area" id.
 * `legacyIds` maps each hidden SOW id to the stakeholder id that replaces it.
 */
export function buildOpportunityTeamMembers(
  stakeholders: TeamStakeholder[] | undefined,
  notes: { format?: string; content: string }[] | undefined,
): { members: SowTeamMember[]; legacyIds: Map<string, string> } {
  const people = stakeholders || [];
  const fromStakeholders = people.flatMap(person => {
    const roles = person.roles?.length ? person.roles : (person.role ? [person.role] : ['Stakeholder']);
    return roles.map(role => ({ id: person.id, name: person.name, area: person.roleContexts?.[role] ? `${role} · ${person.roleContexts[role]}` : role }));
  }).filter(member => member.name);
  const stakeholderByName = new Map<string, string>();
  people.forEach(person => {
    [person.name, ...(person.aliases || [])].forEach(name => {
      const key = normalizePersonName(name);
      if (key && !stakeholderByName.has(key)) stakeholderByName.set(key, person.id);
    });
  });
  const legacyIds = new Map<string, string>();
  const fromSow = collectSowTeamMembers(notes).filter(member => {
    const stakeholderId = stakeholderByName.get(normalizePersonName(member.name));
    if (!stakeholderId) return true;
    legacyIds.set(member.id, stakeholderId);
    return false;
  });
  const seen = new Set<string>();
  const members = [...fromStakeholders, ...fromSow].filter(member => !seen.has(member.id) && !!seen.add(member.id));
  return { members, legacyIds };
}

export function collectSowTeamMembers(notes: { format?: string; content: string }[] | undefined): SowTeamMember[] {
  if (!notes?.length) return [];
  const all: SowTeamMember[] = [];
  const seen = new Set<string>();
  notes.filter(n => n.format === 'sow').forEach(note => {
    parseSowTeamMembers(note.content).forEach(member => {
      if (seen.has(member.id)) return;
      seen.add(member.id);
      all.push(member);
    });
  });
  return all;
}
