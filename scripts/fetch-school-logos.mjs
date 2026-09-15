import fs from "fs";

const html = fs.readFileSync("/tmp/mnscores-sep11.html", "utf8");
const big9 = ["Albert Lea", "Austin", "Faribault", "Mankato East", "Mankato West", "Northfield", "Owatonna", "Red Wing", "Rochester Century", "Rochester John Marshall", "Rochester Mayo", "Winona"];
const UA = { headers: { "User-Agent": "LMR-Media-Big9-Scoreboard/1.0" } };

const links = [...html.matchAll(/team\/details\/(\d+)">\s*([^<]+?)\s*<\/a>/g)]
  .map((m) => ({ id: m[1], name: m[2].trim() }))
  .filter((t) => big9.includes(t.name));

const byName = new Map(links.map((t) => [t.name, t.id]));
const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

fs.mkdirSync("public/schools", { recursive: true });
const manifest = {};

for (const school of big9) {
  const teamId = byName.get(school);
  if (!teamId) { console.log("no team id for", school); continue; }
  const page = await fetch(`https://www.minnesota-scores.net/boys-sports/football/team/details/${teamId}`, UA).then((r) => r.text());
  const img = page.match(/school-images\/(\d+)\.(\w+)/);
  if (!img) { console.log("no logo for", school); continue; }
  const url = `https://www.minnesota-scores.net/res/school/school-images/${img[1]}.${img[2]}`;
  const res = await fetch(url, UA);
  if (!res.ok) { console.log("download failed", school, res.status); continue; }
  const file = `${slug(school)}.${img[2]}`;
  fs.writeFileSync(`public/schools/${file}`, Buffer.from(await res.arrayBuffer()));
  manifest[school] = `/schools/${file}`;
  console.log("saved", school, "->", file, res.headers.get("content-type"));
}

fs.writeFileSync("lib/school-logos.json", JSON.stringify(manifest, null, 2) + "\n");
console.log("manifest written:", Object.keys(manifest).length, "schools");
