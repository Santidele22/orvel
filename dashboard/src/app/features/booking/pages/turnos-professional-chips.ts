export type ProfessionalChip = {
  id: string;
  name: string;
};

export type ProfessionalChipMember = {
  id: string;
  name: string;
  active?: boolean;
};

export function buildProfessionalFilterChips(
  team: ProfessionalChipMember[],
  bookedNames: string[]
): ProfessionalChip[] {
  const activeTeam = team
    .filter((member) => member.active !== false && member.name.trim() && member.id.trim())
    .map((member) => ({ id: member.id.trim(), name: member.name.trim() }));

  if (activeTeam.length > 0) {
    return [...activeTeam].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  const uniqueNames = [...new Set(bookedNames.map((name) => name.trim()).filter(Boolean))];
  return uniqueNames
    .sort((a, b) => a.localeCompare(b, 'es'))
    .map((name) => ({ id: name, name }));
}

export function turnoMatchesProfessionalFilter(
  turno: { professionalId?: string; professionalNombre?: string },
  filter: string,
  chips: ProfessionalChip[]
): boolean {
  if (filter === 'todas') return true;

  const chip = chips.find((candidate) => candidate.id === filter || candidate.name === filter);
  if (!chip) {
    return turno.professionalId === filter || turno.professionalNombre === filter;
  }

  return turno.professionalId === chip.id || turno.professionalNombre === chip.name;
}
