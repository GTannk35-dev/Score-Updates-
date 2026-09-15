export const BIG9_SCHOOLS = [
  "Albert Lea",
  "Austin",
  "Faribault",
  "Mankato East",
  "Mankato West",
  "Northfield",
  "Owatonna",
  "Red Wing",
  "Rochester Century",
  "Rochester John Marshall",
  "Rochester Mayo",
  "Winona",
] as const;

const aliases: Record<string, string> = {
  "Albert Lea Tigers": "Albert Lea",
  "Austin Packers": "Austin",
  "Faribault Falcons": "Faribault",
  "Mankato East Cougars": "Mankato East",
  "Mankato West Scarlets": "Mankato West",
  "Northfield Raiders": "Northfield",
  "Owatonna Huskies": "Owatonna",
  "Red Wing Wingers": "Red Wing",
  "Rochester Century Panthers": "Rochester Century",
  "Rochester John Marshall Rockets": "Rochester John Marshall",
  "Rochester Mayo Spartans": "Rochester Mayo",
  "Winona Winhawks": "Winona",
};

export function normalizeSchool(value: string) {
  const clean = value.replace(/\s+/g, " ").trim();
  if (aliases[clean]) return aliases[clean];
  return BIG9_SCHOOLS.find((school) => clean.toLowerCase().includes(school.toLowerCase())) ?? clean;
}

export function isBig9School(value: string) {
  const normalized = normalizeSchool(value).toLowerCase();
  return BIG9_SCHOOLS.some((school) => school.toLowerCase() === normalized);
}

export function shortSchoolName(value: string) {
  return value
    .replace("Rochester ", "")
    .replace("Mankato ", "Mankato ")
    .replace("John Marshall", "J. Marshall");
}
