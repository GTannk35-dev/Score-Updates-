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

/**
 * Schools whose names contain a Big 9 school's name ("Winona Cotter" contains
 * "Winona") but are NOT Big 9 members. Substring matching must skip these.
 */
const NOT_BIG9_SCHOOLS = new Set([
  "Winona Cotter",
  "Winona State",
  "Albert Lea Area",
  "Austin Area",
  "Rochester Lourdes",
  "Rochester STEM Academy",
  "Schaeffer Academy",
  "Lyle/Austin Pacelli",
]);

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
  if (NOT_BIG9_SCHOOLS.has(clean)) return clean;
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

import schoolLogos from "./school-logos.json";

type SchoolBrand = { logo: string; color: string };
const brandBySchool = schoolLogos as Record<string, SchoolBrand>;

/** Local logo path for a Big 9 school, if we have one on disk. */
export function schoolLogo(value: string) {
  return brandBySchool[normalizeSchool(value)]?.logo;
}

/** School accent color (hex) for a Big 9 school, if known. */
export function schoolColor(value: string) {
  return brandBySchool[normalizeSchool(value)]?.color;
}
