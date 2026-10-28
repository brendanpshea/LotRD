// The heroes a student can play as. Each is a sprite strip in images/sprites/
// (stand, attack and recoil side by side), cut from a generated sheet by
// tools/sprite_sheets.py. The choice is cosmetic and stays in this browser.
//
// The default is the robot: it is nobody in particular, so nobody is cast as
// someone they are not before they have had a chance to choose.

export const HEROES = [
  { id: "robot",   name: "Byte Bot",         sprite: "robot.webp" },
  { id: "knight",  name: "Sword Knight",     sprite: "knight.webp" },
  { id: "mage",    name: "Star Mage",        sprite: "mage.webp" },
  { id: "brawler", name: "Gauntlet Brawler", sprite: "brawler.webp" },
  { id: "tinker",  name: "Hammer Tinker",    sprite: "tinker.webp" },
  { id: "lancer",  name: "Wind Lancer",      sprite: "lancer.webp" },
];

const HERO_KEY = "lotrd_hero";

/** The hero this browser plays as. */
export function chosenHero() {
  let id = null;
  try { id = localStorage.getItem(HERO_KEY); } catch (_) {}
  return HEROES.find(h => h.id === id) || HEROES[0];
}

export function chooseHero(id) {
  if (!HEROES.some(h => h.id === id)) return;
  try { localStorage.setItem(HERO_KEY, id); } catch (_) {}
}
