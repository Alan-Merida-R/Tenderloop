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
