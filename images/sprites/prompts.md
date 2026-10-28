# Sprite sheet prompts

> Built by `tools/sprite_prompts.py` from `roster.json`. Edit those and rerun it;
> changes made here are overwritten.

Each prompt makes one sheet: up to three characters (rows) in three poses
(columns: stand, attack, recoil) on flat magenta, which gets keyed out later.
Everything faces right; the game mirrors monsters so they face the hero.

1. Paste one prompt into the image generator and ask for the aspect ratio it names.
2. Save the result as `images/sprites/sheets/<name>.png` (or .jpg/.webp), using the
   name in the prompt's heading. Saving it there marks the sheet done below.
3. Regenerate if a character changes between its poses, a sprite crosses into
   another cell, or pink shows up on a character.

Redrawn in new colors so the background keys out cleanly: Crawling Claw, Pixie, Stirge, Flumph, Pseudodragon, Origami Dragon, Yarn Elemental, Soap Golem, Mosaic Guardian, Prism Beast, Crystaline Warrior, Vampire, Coral Colossus, Beholder, Quantum Dragon.

**Done: 22 of 22 sheets.**

| Sheet | Characters | Status |
| --- | --- | --- |
| 01-heroes | Sword Knight, Star Mage, Gauntlet Brawler | ✅ done |
| 02-heroes | Hammer Tinker, Wind Lancer, Byte Bot | ✅ done |
| 03-monsters | Kobold, Animated Broom, Awakened Shrub | ✅ done |
| 04-monsters | Crawling Claw, Pixie, Stirge | ✅ done |
| 05-monsters | Goblin, Evil Duck, Skeleton | ✅ done |
| 06-monsters | Flumph, Flying Sword, Pseudodragon | ✅ done |
| 07-monsters | Sentient Scarecrow, Haunted Lantern, Swamp Dragon | ✅ done |
| 08-monsters | Rust Monster, Origami Dragon, Possessed Painting | ✅ done |
| 09-monsters | Yarn Elemental, Teapot Dragon, Soap Golem | ✅ done |
| 10-monsters | Mirror Shade, Gelatinous Cube, Living Topiary | ✅ done |
| 11-monsters | Bookwyrm, Soup Spirit, Fungal Knight | ✅ done |
| 12-monsters | Echo Knight, Grumpy Cloud, Frog Paladin | ✅ done |
| 13-monsters | Candy Witch, Mimic, Ink Elemental | ✅ done |
| 14-monsters | Cheese Golem, Marble Sphinx, Mosaic Guardian | ✅ done |
| 15-monsters | Prism Beast, Puzzle Golem, Bone Jelly | ✅ done |
| 16-monsters | Button Golem, Werewolf, Clockwork Knight | ✅ done |
| 17-monsters | Crystaline Warrior, Living Constellation, Clockwork Phoenix | ✅ done |
| 18-monsters | Textile Titan, Vampire, Orchestra Elemental | ✅ done |
| 19-monsters | Coral Colossus, Troll, Paradox Sphinx | ✅ done |
| 20-monsters | Dozing Drake, Library Leviathan, Bureaucracy Demon | ✅ done |
| 21-monsters | Storm Sovereign, Beholder, Quantum Dragon | ✅ done |
| 22-monsters | Recursion Wyrm | ✅ done |

## 01-heroes: Sword Knight, Star Mage, Gauntlet Brawler ✅ done

```text
A square sprite sheet: 3 rows by 3 columns of chibi JRPG battle sprites on one flat, solid magenta (#FF00FF) background. No gradient, floor, shadows or texture anywhere in the background.

Each row is one character, drawn three times. Every character faces RIGHT, toward an unseen opponent, in a side three-quarter view. The columns are the same three poses in every row:
1. STAND: idle battle stance, weapon ready.
2. ATTACK: lunging to the right mid-strike, weapon fully extended toward the opponent, body leaning into the blow.
3. RECOIL: knocked back to the left, leaning away from the opponent, eyes squeezed shut, weapon held loosely.

Row 1, Sword Knight: a young woman with deep brown skin and short black natural hair, in silver plate armor over a royal-blue tabard, gripping a broadsword taller than she is. Attack: a huge two-handed overhead slash, the blade sweeping down in front of her. Recoil: staggers backward, the sword's tip dragging on the ground.
Row 2, Star Mage: a young man with pale, freckled skin, messy copper-orange hair and round glasses, in a navy wizard hat and robe dotted with gold stars, holding a staff twice his height topped with a glowing cyan crystal. Attack: thrusts the staff forward with both hands, the crystal flaring bright cyan. Recoil: stumbles back, one hand holding his hat on.
Row 3, Gauntlet Brawler: a young woman with warm medium-brown skin, wearing a teal sport hijab and a white-and-orange martial-arts outfit, with huge iron gauntlets as big as her torso. Attack: a lunging punch, one giant gauntlet thrown straight out in front of her. Recoil: skids back with both gauntlets raised to guard her face.

Style: 16-bit pixel art like SNES-era JRPG battle sprites. Chibi proportions: big heads, small bodies, expressive faces and oversized weapons. A thick, dark outline around every character, flat cel shading with few colors, and high contrast, so each sprite still reads when shrunk to 96 pixels tall.

Rules:
- Each character looks identical in all three of its poses: same colors, outfit, proportions and weapon. Only the pose changes.
- Each row is a different character. Don't let their colors or features blend.
- Each sprite is centered in its own cell with clear magenta space all around it. Nothing crosses into a neighboring cell.
- In each row, the three sprites are the same size and stand on the same baseline.
- No magenta, pink or purple anywhere on the characters.
- No text, labels, numbers, grid lines, borders, shadows, motion lines, or effects that float free of the character.
```

## 02-heroes: Hammer Tinker, Wind Lancer, Byte Bot ✅ done

```text
A square sprite sheet: 3 rows by 3 columns of chibi JRPG battle sprites on one flat, solid magenta (#FF00FF) background. No gradient, floor, shadows or texture anywhere in the background.

Each row is one character, drawn three times. Every character faces RIGHT, toward an unseen opponent, in a side three-quarter view. The columns are the same three poses in every row:
1. STAND: idle battle stance, weapon ready.
2. ATTACK: lunging to the right mid-strike, weapon fully extended toward the opponent, body leaning into the blow.
3. RECOIL: knocked back to the left, leaning away from the opponent, eyes squeezed shut, weapon held loosely.

Row 1, Hammer Tinker: a stocky older man with light-brown skin, a thick gray beard and brass goggles pushed up on his forehead, in a leather apron over a mustard-yellow work shirt, carrying an enormous brass-headed hammer. Attack: a big overhead hammer smash in front of him. Recoil: rocks back on his heels, the hammer head thudding down behind him.
Row 2, Wind Lancer: an androgynous young adult with light skin and a straight black bob haircut, in a green hooded cloak with a long scarf, wielding a spear twice their height with a leaf-shaped blade. Attack: a long forward lunge, the spear thrust straight out. Recoil: pushed back, cloak and scarf whipping forward, spear tilted up.
Row 3, Byte Bot: a small, round white-and-cyan robot with stubby arms and legs and a screen for a face showing two big pixel eyes, holding an oversized sword whose glowing cyan blade is shaped like a computer mouse-pointer arrow. Attack: a wide horizontal sword swing. Recoil: knocked back, the screen-face showing X eyes.

Style: 16-bit pixel art like SNES-era JRPG battle sprites. Chibi proportions: big heads, small bodies, expressive faces and oversized weapons. A thick, dark outline around every character, flat cel shading with few colors, and high contrast, so each sprite still reads when shrunk to 96 pixels tall.

Rules:
- Each character looks identical in all three of its poses: same colors, outfit, proportions and weapon. Only the pose changes.
- Each row is a different character. Don't let their colors or features blend.
- Each sprite is centered in its own cell with clear magenta space all around it. Nothing crosses into a neighboring cell.
- In each row, the three sprites are the same size and stand on the same baseline.
- No magenta, pink or purple anywhere on the characters.
- No text, labels, numbers, grid lines, borders, shadows, motion lines, or effects that float free of the character.
```

## 03-monsters: Kobold, Animated Broom, Awakened Shrub ✅ done

```text
A square sprite sheet: 3 rows by 3 columns of chibi JRPG battle sprites on one flat, solid magenta (#FF00FF) background. No gradient, floor, shadows or texture anywhere in the background.

Each row is one character, drawn three times. Every character faces RIGHT, toward an unseen opponent, in a side three-quarter view. The columns are the same three poses in every row:
1. STAND: idle battle stance, weapon ready.
2. ATTACK: lunging to the right mid-strike, weapon fully extended toward the opponent, body leaning into the blow.
3. RECOIL: knocked back to the left, leaning away from the opponent, eyes squeezed shut, weapon held loosely.

Row 1, Kobold: a small green lizard-folk with two little horns, a long tail and a brown vest and belt, carrying a giant soup ladle bigger than itself over one shoulder. Attack: whacks the giant ladle down in front of it. Recoil: stumbles back, tail curled, the ladle wobbling.
Row 2, Animated Broom: a straw broom with a long wooden handle, a scowling face with angry eyebrows on its bristles, and two tiny black legs. Attack: swings its bristle end forward in a big sweeping whack. Recoil: bends backward like a bow, bristles splayed out.
Row 3, Awakened Shrub: a round, lumpy, leafy green bush with small angry eyes and a frown, wielding a thick thorny branch like a club. Attack: lunges and swings the thorny branch. Recoil: squashed backward, leaves ruffled.

Style: 16-bit pixel art like SNES-era JRPG battle sprites. Chibi proportions: big heads, small bodies, expressive faces and oversized weapons. A thick, dark outline around every character, flat cel shading with few colors, and high contrast, so each sprite still reads when shrunk to 96 pixels tall.

Rules:
- Each character looks identical in all three of its poses: same colors, outfit, proportions and weapon. Only the pose changes.
- Each row is a different character. Don't let their colors or features blend.
- Each sprite is centered in its own cell with clear magenta space all around it. Nothing crosses into a neighboring cell.
- In each row, the three sprites are the same size and stand on the same baseline.
- No magenta, pink or purple anywhere on the characters.
- No text, labels, numbers, grid lines, borders, shadows, motion lines, or effects that float free of the character.
```

## 04-monsters: Crawling Claw, Pixie, Stirge ✅ done

```text
A square sprite sheet: 3 rows by 3 columns of chibi JRPG battle sprites on one flat, solid magenta (#FF00FF) background. No gradient, floor, shadows or texture anywhere in the background.

Each row is one character, drawn three times. Every character faces RIGHT, toward an unseen opponent, in a side three-quarter view. The columns are the same three poses in every row:
1. STAND: idle battle stance, weapon ready.
2. ATTACK: lunging to the right mid-strike, weapon fully extended toward the opponent, body leaning into the blow.
3. RECOIL: knocked back to the left, leaning away from the opponent, eyes squeezed shut, weapon held loosely.

Row 1, Crawling Claw: a small brick-red crab-like creature with a ridged, segmented shell on its back, beady black eyes, six spindly legs and one oversized pincer. Attack: scuttles forward snapping the giant pincer. Recoil: flipped halfway onto its back, legs flailing.
Row 2, Pixie: a tiny fairy with bright orange hair, pointed ears, pale-cyan dragonfly wings, a green tunic and brown boots, carrying a giant double-headed battle axe with a red heart painted on the blade. Attack: a huge overhead axe chop. Recoil: tumbles backward in the air, wings fluttering.
Row 3, Stirge: a round, tangerine-orange blob of a creature with big cute eyes, feathery gray wings and a long, sharp needle of a nose. Attack: dives forward, needle-nose first. Recoil: bounced back, wings flapping wildly.

Style: 16-bit pixel art like SNES-era JRPG battle sprites. Chibi proportions: big heads, small bodies, expressive faces and oversized weapons. A thick, dark outline around every character, flat cel shading with few colors, and high contrast, so each sprite still reads when shrunk to 96 pixels tall.

Rules:
- Each character looks identical in all three of its poses: same colors, outfit, proportions and weapon. Only the pose changes.
- Each row is a different character. Don't let their colors or features blend.
- Each sprite is centered in its own cell with clear magenta space all around it. Nothing crosses into a neighboring cell.
- In each row, the three sprites are the same size and stand on the same baseline.
- No magenta, pink or purple anywhere on the characters.
- No text, labels, numbers, grid lines, borders, shadows, motion lines, or effects that float free of the character.
```

## 05-monsters: Goblin, Evil Duck, Skeleton ✅ done

```text
A square sprite sheet: 3 rows by 3 columns of chibi JRPG battle sprites on one flat, solid magenta (#FF00FF) background. No gradient, floor, shadows or texture anywhere in the background.

Each row is one character, drawn three times. Every character faces RIGHT, toward an unseen opponent, in a side three-quarter view. The columns are the same three poses in every row:
1. STAND: idle battle stance, weapon ready.
2. ATTACK: lunging to the right mid-strike, weapon fully extended toward the opponent, body leaning into the blow.
3. RECOIL: knocked back to the left, leaning away from the opponent, eyes squeezed shut, weapon held loosely.

Row 1, Goblin: a green-skinned goblin with huge pointed ears, a tuft of dark hair and a toothy grin, in a ragged green shirt and brown trousers, gripping a spiked wooden club as big as itself. Attack: a big two-handed club swing. Recoil: knocked back, ears flopping, club drooping.
Row 2, Evil Duck: a stout slate-gray duck with narrowed, angry eyes, a smug scowl and an oversized, gleaming, sharp orange bill. Attack: lunges forward stabbing with its bill, wings flared. Recoil: knocked back, feathers ruffled.
Row 3, Skeleton: a chibi skeleton with a big round skull, dark hollow eye sockets and a grin, its bones shaded gray-blue, swinging an oversized rusty sword. Attack: a wide forward slash. Recoil: rattles backward, jaw dropped open.

Style: 16-bit pixel art like SNES-era JRPG battle sprites. Chibi proportions: big heads, small bodies, expressive faces and oversized weapons. A thick, dark outline around every character, flat cel shading with few colors, and high contrast, so each sprite still reads when shrunk to 96 pixels tall.

Rules:
- Each character looks identical in all three of its poses: same colors, outfit, proportions and weapon. Only the pose changes.
- Each row is a different character. Don't let their colors or features blend.
- Each sprite is centered in its own cell with clear magenta space all around it. Nothing crosses into a neighboring cell.
- In each row, the three sprites are the same size and stand on the same baseline.
- No magenta, pink or purple anywhere on the characters.
- No text, labels, numbers, grid lines, borders, shadows, motion lines, or effects that float free of the character.
```

## 06-monsters: Flumph, Flying Sword, Pseudodragon ✅ done

```text
A square sprite sheet: 3 rows by 3 columns of chibi JRPG battle sprites on one flat, solid magenta (#FF00FF) background. No gradient, floor, shadows or texture anywhere in the background.

Each row is one character, drawn three times. Every character faces RIGHT, toward an unseen opponent, in a side three-quarter view. The columns are the same three poses in every row:
1. STAND: idle battle stance, weapon ready.
2. ATTACK: lunging to the right mid-strike, weapon fully extended toward the opponent, body leaning into the blow.
3. RECOIL: knocked back to the left, leaning away from the opponent, eyes squeezed shut, weapon held loosely.

Row 1, Flumph: a floating sky-blue jellyfish-like creature with a glossy round dome, big sparkly eyes, a sweet smile and dangling aqua tentacles, gripping an oversized golden trident in two tentacles. Attack: bobs forward and jabs the big trident ahead of it. Recoil: bounced back, tentacles trailing, dome dented.
Row 2, Flying Sword: a steel broadsword with a pale-blue blade, a brown leather-wrapped hilt, a cute round-eyed face on the blade and a little white cloud puff at each end, hovering tip-first. Attack: spins and stabs forward, point first. Recoil: knocked back, tilting tip-up, eyes squeezed shut.
Row 3, Pseudodragon: a cat-sized mint-green dragon with two small horns, big amber eyes, little bat wings with cyan veins, a cream belly and a curling tail, hugging a giant spiked tail-club. Attack: a big club swing, wings flared. Recoil: tumbles back, wings crumpled, tail drooping.

Style: 16-bit pixel art like SNES-era JRPG battle sprites. Chibi proportions: big heads, small bodies, expressive faces and oversized weapons. A thick, dark outline around every character, flat cel shading with few colors, and high contrast, so each sprite still reads when shrunk to 96 pixels tall.

Rules:
- Each character looks identical in all three of its poses: same colors, outfit, proportions and weapon. Only the pose changes.
- Each row is a different character. Don't let their colors or features blend.
- Each sprite is centered in its own cell with clear magenta space all around it. Nothing crosses into a neighboring cell.
- In each row, the three sprites are the same size and stand on the same baseline.
- No magenta, pink or purple anywhere on the characters.
- No text, labels, numbers, grid lines, borders, shadows, motion lines, or effects that float free of the character.
```

## 07-monsters: Sentient Scarecrow, Haunted Lantern, Swamp Dragon ✅ done

```text
A square sprite sheet: 3 rows by 3 columns of chibi JRPG battle sprites on one flat, solid magenta (#FF00FF) background. No gradient, floor, shadows or texture anywhere in the background.

Each row is one character, drawn three times. Every character faces RIGHT, toward an unseen opponent, in a side three-quarter view. The columns are the same three poses in every row:
1. STAND: idle battle stance, weapon ready.
2. ATTACK: lunging to the right mid-strike, weapon fully extended toward the opponent, body leaning into the blow.
3. RECOIL: knocked back to the left, leaning away from the opponent, eyes squeezed shut, weapon held loosely.

Row 1, Sentient Scarecrow: a patchy straw scarecrow with a floppy brown hat with a yellow flower, button eyes, a stitched grin, an orange patched shirt, a rope belt and straw poking from its sleeves, carrying a giant pitchfork. Attack: lurches forward, thrusting the pitchfork out. Recoil: staggers back, straw puffing from its sleeves, hat askew.
Row 2, Haunted Lantern: a dark-iron hanging lantern with a ring and short chain on top, glass panes glowing warm gold, a little smiling orange flame-face inside and two stubby legs, swinging a giant iron hook. Attack: swings forward, bashing with the big hook. Recoil: rocks back, chain jangling, the flame shrunk small.
Row 3, Swamp Dragon: a small, round, olive-green dragon with a pale-blue belly, big hazel eyes, a lumpy ridged back, a stubby tail and oversized jaws full of tiny teeth. Attack: lunges forward with the huge jaws chomping, a short orange flame burst at its mouth. Recoil: tumbles back, tail in the air, a tiny puff of smoke from its nose.

Style: 16-bit pixel art like SNES-era JRPG battle sprites. Chibi proportions: big heads, small bodies, expressive faces and oversized weapons. A thick, dark outline around every character, flat cel shading with few colors, and high contrast, so each sprite still reads when shrunk to 96 pixels tall.

Rules:
- Each character looks identical in all three of its poses: same colors, outfit, proportions and weapon. Only the pose changes.
- Each row is a different character. Don't let their colors or features blend.
- Each sprite is centered in its own cell with clear magenta space all around it. Nothing crosses into a neighboring cell.
- In each row, the three sprites are the same size and stand on the same baseline.
- No magenta, pink or purple anywhere on the characters.
- No text, labels, numbers, grid lines, borders, shadows, motion lines, or effects that float free of the character.
```

## 08-monsters: Rust Monster, Origami Dragon, Possessed Painting ✅ done

```text
A square sprite sheet: 3 rows by 3 columns of chibi JRPG battle sprites on one flat, solid magenta (#FF00FF) background. No gradient, floor, shadows or texture anywhere in the background.

Each row is one character, drawn three times. Every character faces RIGHT, toward an unseen opponent, in a side three-quarter view. The columns are the same three poses in every row:
1. STAND: idle battle stance, weapon ready.
2. ATTACK: lunging to the right mid-strike, weapon fully extended toward the opponent, body leaning into the blow.
3. RECOIL: knocked back to the left, leaning away from the opponent, eyes squeezed shut, weapon held loosely.

Row 1, Rust Monster: a round, rust-brown monster with a lumpy pitted hide, small dark eyes, a big toothy mouth, stubby legs and two giant segmented, ridged claws. Attack: swings a giant claw forward in a crushing slam. Recoil: knocked back, hide flaking, claws drooping.
Row 2, Origami Dragon: a sleek paper dragon folded from orange-and-cream paper, with sharp crease lines, a long folded tail, a pointed snout, two angular horns and huge razor-edged folded wings. Attack: lunges forward slashing with a wing-blade. Recoil: crumples back, creased and wrinkled, wings folded.
Row 3, Possessed Painting: a dark-haired man with a wide eerie smile in a dark suit, stepping out of a wooden picture frame as flat as a cutout, with long thin arms and a huge fencing foil. Attack: lunges, one thin arm thrusting the giant foil forward. Recoil: knocked back, the frame tilted crooked, eyes wide.

Style: 16-bit pixel art like SNES-era JRPG battle sprites. Chibi proportions: big heads, small bodies, expressive faces and oversized weapons. A thick, dark outline around every character, flat cel shading with few colors, and high contrast, so each sprite still reads when shrunk to 96 pixels tall.

Rules:
- Each character looks identical in all three of its poses: same colors, outfit, proportions and weapon. Only the pose changes.
- Each row is a different character. Don't let their colors or features blend.
- Each sprite is centered in its own cell with clear magenta space all around it. Nothing crosses into a neighboring cell.
- In each row, the three sprites are the same size and stand on the same baseline.
- No magenta, pink or purple anywhere on the characters.
- No text, labels, numbers, grid lines, borders, shadows, motion lines, or effects that float free of the character.
```

## 09-monsters: Yarn Elemental, Teapot Dragon, Soap Golem ✅ done

```text
A square sprite sheet: 3 rows by 3 columns of chibi JRPG battle sprites on one flat, solid magenta (#FF00FF) background. No gradient, floor, shadows or texture anywhere in the background.

Each row is one character, drawn three times. Every character faces RIGHT, toward an unseen opponent, in a side three-quarter view. The columns are the same three poses in every row:
1. STAND: idle battle stance, weapon ready.
2. ATTACK: lunging to the right mid-strike, weapon fully extended toward the opponent, body leaning into the blow.
3. RECOIL: knocked back to the left, leaning away from the opponent, eyes squeezed shut, weapon held loosely.

Row 1, Yarn Elemental: a round, squishy bundle of orange yarn with a happy face, tiny arms, a yarn topknot, a trailing strand and a teal stripe around its middle, holding two giant knitting needles like swords. Attack: jabs forward with both giant knitting needles. Recoil: bounces back, loose strands flying.
Row 2, Teapot Dragon: a round, stubby dragon with a blue-and-white floral porcelain teapot body, little brown horns, a spout snout puffing a curl of steam, a curling blue tail and tiny wings. Attack: spins and whips its heavy porcelain tail around in front of it. Recoil: knocked back, wobbling, lid rattling.
Row 3, Soap Golem: a lumpy humanoid golem of white and pale-blue soap bars with a happy face, a mint-green patch on its belly, foamy bubbles clinging all over it and huge foam-covered fists. Attack: swings a giant soapy fist forward in a big slam. Recoil: slips backward, squashed, bubbles popping.

Style: 16-bit pixel art like SNES-era JRPG battle sprites. Chibi proportions: big heads, small bodies, expressive faces and oversized weapons. A thick, dark outline around every character, flat cel shading with few colors, and high contrast, so each sprite still reads when shrunk to 96 pixels tall.

Rules:
- Each character looks identical in all three of its poses: same colors, outfit, proportions and weapon. Only the pose changes.
- Each row is a different character. Don't let their colors or features blend.
- Each sprite is centered in its own cell with clear magenta space all around it. Nothing crosses into a neighboring cell.
- In each row, the three sprites are the same size and stand on the same baseline.
- No magenta, pink or purple anywhere on the characters.
- No text, labels, numbers, grid lines, borders, shadows, motion lines, or effects that float free of the character.
```

## 10-monsters: Mirror Shade, Gelatinous Cube, Living Topiary ✅ done

```text
A square sprite sheet: 3 rows by 3 columns of chibi JRPG battle sprites on one flat, solid magenta (#FF00FF) background. No gradient, floor, shadows or texture anywhere in the background.

Each row is one character, drawn three times. Every character faces RIGHT, toward an unseen opponent, in a side three-quarter view. The columns are the same three poses in every row:
1. STAND: idle battle stance, weapon ready.
2. ATTACK: lunging to the right mid-strike, weapon fully extended toward the opponent, body leaning into the blow.
3. RECOIL: knocked back to the left, leaning away from the opponent, eyes squeezed shut, weapon held loosely.

Row 1, Mirror Shade: a black shadow-creature with a spiky silhouette, glowing red eyes and a jagged grin, leaning out of an old wooden mirror frame on long arms ending in huge claws. Attack: lunges forward, clawed fingers stretched wide. Recoil: flung back, eyes narrowed, arms flailing.
Row 2, Gelatinous Cube: a bright lime-green wobbly cube of jelly with a cute face, small bubbles inside and a puddle at its base, with one giant jagged block of jelly raised like a hammer. Attack: hops forward and slams down in a big squash. Recoil: squished sideways, wobbling.
Row 3, Living Topiary: a bushy green unicorn-shaped topiary with a clipped leafy mane, a tufted tail, hedge-clipped hooves and a golden spiral horn grown long and sharp. Attack: charges forward, horn lowered. Recoil: knocked back, leaves scattering, horn dipping.

Style: 16-bit pixel art like SNES-era JRPG battle sprites. Chibi proportions: big heads, small bodies, expressive faces and oversized weapons. A thick, dark outline around every character, flat cel shading with few colors, and high contrast, so each sprite still reads when shrunk to 96 pixels tall.

Rules:
- Each character looks identical in all three of its poses: same colors, outfit, proportions and weapon. Only the pose changes.
- Each row is a different character. Don't let their colors or features blend.
- Each sprite is centered in its own cell with clear magenta space all around it. Nothing crosses into a neighboring cell.
- In each row, the three sprites are the same size and stand on the same baseline.
- No magenta, pink or purple anywhere on the characters.
- No text, labels, numbers, grid lines, borders, shadows, motion lines, or effects that float free of the character.
```

## 11-monsters: Bookwyrm, Soup Spirit, Fungal Knight ✅ done

```text
A square sprite sheet: 3 rows by 3 columns of chibi JRPG battle sprites on one flat, solid magenta (#FF00FF) background. No gradient, floor, shadows or texture anywhere in the background.

Each row is one character, drawn three times. Every character faces RIGHT, toward an unseen opponent, in a side three-quarter view. The columns are the same three poses in every row:
1. STAND: idle battle stance, weapon ready.
2. ATTACK: lunging to the right mid-strike, weapon fully extended toward the opponent, body leaning into the blow.
3. RECOIL: knocked back to the left, leaning away from the opponent, eyes squeezed shut, weapon held loosely.

Row 1, Bookwyrm: a serpentine worm made of stacked brown books with blank pages sticking out, a dragon-like head with big jaws and two antennae tipped with bright ribbon bookmarks. Attack: lunges forward, jaws snapping, pages flapping. Recoil: recoils back, coils bunched, pages ruffled.
Row 2, Soup Spirit: a round, glossy, tomato-red soup spirit shaped like a bowl, with a happy face, tiny arms, a steam wisp on top and a green basil leaf, carrying an enormous silver ladle. Attack: scoops the giant ladle forward. Recoil: sloshes backward, steam puffing, ladle wobbling.
Row 3, Fungal Knight: a small knight in a steel helmet under a big spotted orange-brown mushroom cap, with a green tunic, brown boots and a leaf-green shield, carrying an oversized sword with a mushroom for a pommel. Attack: a forward sword slash, shield raised. Recoil: stumbles backward, cap bobbing, shield sagging.

Style: 16-bit pixel art like SNES-era JRPG battle sprites. Chibi proportions: big heads, small bodies, expressive faces and oversized weapons. A thick, dark outline around every character, flat cel shading with few colors, and high contrast, so each sprite still reads when shrunk to 96 pixels tall.

Rules:
- Each character looks identical in all three of its poses: same colors, outfit, proportions and weapon. Only the pose changes.
- Each row is a different character. Don't let their colors or features blend.
- Each sprite is centered in its own cell with clear magenta space all around it. Nothing crosses into a neighboring cell.
- In each row, the three sprites are the same size and stand on the same baseline.
- No magenta, pink or purple anywhere on the characters.
- No text, labels, numbers, grid lines, borders, shadows, motion lines, or effects that float free of the character.
```

## 12-monsters: Echo Knight, Grumpy Cloud, Frog Paladin ✅ done

```text
A square sprite sheet: 3 rows by 3 columns of chibi JRPG battle sprites on one flat, solid magenta (#FF00FF) background. No gradient, floor, shadows or texture anywhere in the background.

Each row is one character, drawn three times. Every character faces RIGHT, toward an unseen opponent, in a side three-quarter view. The columns are the same three poses in every row:
1. STAND: idle battle stance, weapon ready.
2. ATTACK: lunging to the right mid-strike, weapon fully extended toward the opponent, body leaning into the blow.
3. RECOIL: knocked back to the left, leaning away from the opponent, eyes squeezed shut, weapon held loosely.

Row 1, Echo Knight: a tall knight in sleek pale ice-white and light-blue armor, with long wavy white hair and a blank glowing face, holding two huge matching swords. Attack: a wide double-sword slash forward. Recoil: drifts backward, wavy hair streaming, swords crossed.
Row 2, Grumpy Cloud: a small, round, dark-gray storm cloud with a deeply furrowed brow and an angry scowl, tiny yellow lightning bolts on its body, a patch of blue rain beneath it and two huge cloud fists. Attack: drives a huge fist forward, lightning crackling on its body. Recoil: puffs backward, squashed, rain pattering.
Row 3, Frog Paladin: a sturdy green frog in dented silver plate armor with a brown cloak and a very long lance, its long red tongue stretched out in front. Attack: charges forward, lance thrust ahead, tongue lashing out. Recoil: knocked back, armor rattling, lance tilted.

Style: 16-bit pixel art like SNES-era JRPG battle sprites. Chibi proportions: big heads, small bodies, expressive faces and oversized weapons. A thick, dark outline around every character, flat cel shading with few colors, and high contrast, so each sprite still reads when shrunk to 96 pixels tall.

Rules:
- Each character looks identical in all three of its poses: same colors, outfit, proportions and weapon. Only the pose changes.
- Each row is a different character. Don't let their colors or features blend.
- Each sprite is centered in its own cell with clear magenta space all around it. Nothing crosses into a neighboring cell.
- In each row, the three sprites are the same size and stand on the same baseline.
- No magenta, pink or purple anywhere on the characters.
- No text, labels, numbers, grid lines, borders, shadows, motion lines, or effects that float free of the character.
```

## 13-monsters: Candy Witch, Mimic, Ink Elemental ✅ done

```text
A square sprite sheet: 3 rows by 3 columns of chibi JRPG battle sprites on one flat, solid magenta (#FF00FF) background. No gradient, floor, shadows or texture anywhere in the background.

Each row is one character, drawn three times. Every character faces RIGHT, toward an unseen opponent, in a side three-quarter view. The columns are the same three poses in every row:
1. STAND: idle battle stance, weapon ready.
2. ATTACK: lunging to the right mid-strike, weapon fully extended toward the opponent, body leaning into the blow.
3. RECOIL: knocked back to the left, leaning away from the opponent, eyes squeezed shut, weapon held loosely.

Row 1, Candy Witch: a gingerbread woman with brown skin and long dark licorice hair, mint-green, orange and yellow hard-candy gems, holding a giant swirly candy-cane staff. Attack: swings the giant candy-cane staff down in front of her. Recoil: knocked back, hair flying, staff tilting.
Row 2, Mimic: a dark wooden treasure chest with gold bands and a golden lock, a wide toothy mouth with a long red tongue, two little eyes and stubby legs. Attack: chomps forward, the lid thrown wide like huge jaws. Recoil: bounced back, lid flapping, tongue lolling.
Row 3, Ink Elemental: a black, glossy ink-blob ghost with round white eyes, a toothy grin and a wavy swirling tail, wielding a huge sharp quill like a spear. Attack: jabs forward with the quill, tail whipping. Recoil: splashes back, squashed, ink dripping off it.

Style: 16-bit pixel art like SNES-era JRPG battle sprites. Chibi proportions: big heads, small bodies, expressive faces and oversized weapons. A thick, dark outline around every character, flat cel shading with few colors, and high contrast, so each sprite still reads when shrunk to 96 pixels tall.

Rules:
- Each character looks identical in all three of its poses: same colors, outfit, proportions and weapon. Only the pose changes.
- Each row is a different character. Don't let their colors or features blend.
- Each sprite is centered in its own cell with clear magenta space all around it. Nothing crosses into a neighboring cell.
- In each row, the three sprites are the same size and stand on the same baseline.
- No magenta, pink or purple anywhere on the characters.
- No text, labels, numbers, grid lines, borders, shadows, motion lines, or effects that float free of the character.
```

## 14-monsters: Cheese Golem, Marble Sphinx, Mosaic Guardian ✅ done

```text
A square sprite sheet: 3 rows by 3 columns of chibi JRPG battle sprites on one flat, solid magenta (#FF00FF) background. No gradient, floor, shadows or texture anywhere in the background.

Each row is one character, drawn three times. Every character faces RIGHT, toward an unseen opponent, in a side three-quarter view. The columns are the same three poses in every row:
1. STAND: idle battle stance, weapon ready.
2. ATTACK: lunging to the right mid-strike, weapon fully extended toward the opponent, body leaning into the blow.
3. RECOIL: knocked back to the left, leaning away from the opponent, eyes squeezed shut, weapon held loosely.

Row 1, Cheese Golem: a hulking yellow-orange cheese golem full of round holes, with a big head, a square jaw and two heavy fists. Attack: slams a giant cheesy fist down. Recoil: knocked back, a chunk crumbling off, eyes wide.
Row 2, Marble Sphinx: a chubby cream-and-beige marble sphinx cub with a striped royal headdress, big brown eyes, a golden forehead ornament, a lion body and huge stone paws. Attack: swipes forward with a big stone paw. Recoil: knocked back, dust puffing, paws up.
Row 3, Mosaic Guardian: a stout guardian built of tiny red, blue, orange and gold tiles, with a big crested helmet, round shoulders, a teal gem on its chest and a huge tile-covered hammer. Attack: a big overhead hammer smash. Recoil: rocks back, tiles loosened and rattling.

Style: 16-bit pixel art like SNES-era JRPG battle sprites. Chibi proportions: big heads, small bodies, expressive faces and oversized weapons. A thick, dark outline around every character, flat cel shading with few colors, and high contrast, so each sprite still reads when shrunk to 96 pixels tall.

Rules:
- Each character looks identical in all three of its poses: same colors, outfit, proportions and weapon. Only the pose changes.
- Each row is a different character. Don't let their colors or features blend.
- Each sprite is centered in its own cell with clear magenta space all around it. Nothing crosses into a neighboring cell.
- In each row, the three sprites are the same size and stand on the same baseline.
- No magenta, pink or purple anywhere on the characters.
- No text, labels, numbers, grid lines, borders, shadows, motion lines, or effects that float free of the character.
```

## 15-monsters: Prism Beast, Puzzle Golem, Bone Jelly ✅ done

```text
A square sprite sheet: 3 rows by 3 columns of chibi JRPG battle sprites on one flat, solid magenta (#FF00FF) background. No gradient, floor, shadows or texture anywhere in the background.

Each row is one character, drawn three times. Every character faces RIGHT, toward an unseen opponent, in a side three-quarter view. The columns are the same three poses in every row:
1. STAND: idle battle stance, weapon ready.
2. ATTACK: lunging to the right mid-strike, weapon fully extended toward the opponent, body leaning into the blow.
3. RECOIL: knocked back to the left, leaning away from the opponent, eyes squeezed shut, weapon held loosely.

Row 1, Prism Beast: a diamond-shaped crystal creature with vertical bands of red, orange, yellow, green and blue, a happy face, stubby teal legs and two giant crystal fists. Attack: slams forward with a giant crystal fist. Recoil: jolts back, eyes squeezed shut.
Row 2, Puzzle Golem: a hulking, blocky golem built of interlocking jigsaw pieces in tan, rust and olive-green, with glowing cyan eyes and huge hands. Attack: a huge overhead double-fist slam. Recoil: knocked back, a few pieces popping loose.
Row 3, Bone Jelly: a dome-shaped bright green slime with a skeleton suspended inside it, a big skull pressing out of the front and a puddle at its base. Attack: oozes forward, a bony arm swinging out of the goo. Recoil: squashed back, bones jiggling, skull rattling.

Style: 16-bit pixel art like SNES-era JRPG battle sprites. Chibi proportions: big heads, small bodies, expressive faces and oversized weapons. A thick, dark outline around every character, flat cel shading with few colors, and high contrast, so each sprite still reads when shrunk to 96 pixels tall.

Rules:
- Each character looks identical in all three of its poses: same colors, outfit, proportions and weapon. Only the pose changes.
- Each row is a different character. Don't let their colors or features blend.
- Each sprite is centered in its own cell with clear magenta space all around it. Nothing crosses into a neighboring cell.
- In each row, the three sprites are the same size and stand on the same baseline.
- No magenta, pink or purple anywhere on the characters.
- No text, labels, numbers, grid lines, borders, shadows, motion lines, or effects that float free of the character.
```

## 16-monsters: Button Golem, Werewolf, Clockwork Knight ✅ done

```text
A square sprite sheet: 3 rows by 3 columns of chibi JRPG battle sprites on one flat, solid magenta (#FF00FF) background. No gradient, floor, shadows or texture anywhere in the background.

Each row is one character, drawn three times. Every character faces RIGHT, toward an unseen opponent, in a side three-quarter view. The columns are the same three poses in every row:
1. STAND: idle battle stance, weapon ready.
2. ATTACK: lunging to the right mid-strike, weapon fully extended toward the opponent, body leaning into the blow.
3. RECOIL: knocked back to the left, leaning away from the opponent, eyes squeezed shut, weapon held loosely.

Row 1, Button Golem: a lumpy tan cloth humanoid stitched with patches, with a head of mismatched multicolored buttons for eyes, a stringy thread beard and long needle fingers. Attack: stabs forward with its needle fingers. Recoil: falls back, stuffing poking out, buttons rattling.
Row 2, Werewolf: a gray wolf-headed man in a dark suit, white shirt and tie, with fierce eyes, pointed ears, a toothy snarl and enormous clawed hands. Attack: swipes forward with a huge clawed hand. Recoil: staggers back, tie flapping, ears flat.
Row 3, Clockwork Knight: a knight in bronze and silver armor with a red plume, a round gear on its chest, a round brass shield with a sunburst and an oversized brass sword. Attack: a forward sword slash, shield held out. Recoil: clanks backward, plume drooping.

Style: 16-bit pixel art like SNES-era JRPG battle sprites. Chibi proportions: big heads, small bodies, expressive faces and oversized weapons. A thick, dark outline around every character, flat cel shading with few colors, and high contrast, so each sprite still reads when shrunk to 96 pixels tall.

Rules:
- Each character looks identical in all three of its poses: same colors, outfit, proportions and weapon. Only the pose changes.
- Each row is a different character. Don't let their colors or features blend.
- Each sprite is centered in its own cell with clear magenta space all around it. Nothing crosses into a neighboring cell.
- In each row, the three sprites are the same size and stand on the same baseline.
- No magenta, pink or purple anywhere on the characters.
- No text, labels, numbers, grid lines, borders, shadows, motion lines, or effects that float free of the character.
```

## 17-monsters: Crystaline Warrior, Living Constellation, Clockwork Phoenix ✅ done

```text
A square sprite sheet: 3 rows by 3 columns of chibi JRPG battle sprites on one flat, solid magenta (#FF00FF) background. No gradient, floor, shadows or texture anywhere in the background.

Each row is one character, drawn three times. Every character faces RIGHT, toward an unseen opponent, in a side three-quarter view. The columns are the same three poses in every row:
1. STAND: idle battle stance, weapon ready.
2. ATTACK: lunging to the right mid-strike, weapon fully extended toward the opponent, body leaning into the blow.
3. RECOIL: knocked back to the left, leaning away from the opponent, eyes squeezed shut, weapon held loosely.

Row 1, Crystaline Warrior: a small warrior in pale ice-blue and cyan crystal armor with a spiked crystal helmet, a round crystal shield and a huge crystal sword. Attack: a heavy sword slash forward, shield out. Recoil: knocked back, shield sagging, helmet askew.
Row 2, Living Constellation: a hooded warrior in deep-blue armor patterned with gold star shapes and linked dots, with glowing yellow eyes and a huge golden sword. Attack: a huge forward sword sweep. Recoil: knocked back, one arm flung out.
Row 3, Clockwork Phoenix: a bird with orange-red feathers, teal metal plates, brass gears, a flame-like crest and huge wings, with giant talons. Attack: swoops forward, wings flared and talons out. Recoil: tumbles back, feathers loose, wings fluttering.

Style: 16-bit pixel art like SNES-era JRPG battle sprites. Chibi proportions: big heads, small bodies, expressive faces and oversized weapons. A thick, dark outline around every character, flat cel shading with few colors, and high contrast, so each sprite still reads when shrunk to 96 pixels tall.

Rules:
- Each character looks identical in all three of its poses: same colors, outfit, proportions and weapon. Only the pose changes.
- Each row is a different character. Don't let their colors or features blend.
- Each sprite is centered in its own cell with clear magenta space all around it. Nothing crosses into a neighboring cell.
- In each row, the three sprites are the same size and stand on the same baseline.
- No magenta, pink or purple anywhere on the characters.
- No text, labels, numbers, grid lines, borders, shadows, motion lines, or effects that float free of the character.
```

## 18-monsters: Textile Titan, Vampire, Orchestra Elemental ✅ done

```text
A square sprite sheet: 3 rows by 3 columns of chibi JRPG battle sprites on one flat, solid magenta (#FF00FF) background. No gradient, floor, shadows or texture anywhere in the background.

Each row is one character, drawn three times. Every character faces RIGHT, toward an unseen opponent, in a side three-quarter view. The columns are the same three poses in every row:
1. STAND: idle battle stance, weapon ready.
2. ATTACK: lunging to the right mid-strike, weapon fully extended toward the opponent, body leaning into the blow.
3. RECOIL: knocked back to the left, leaning away from the opponent, eyes squeezed shut, weapon held loosely.

Row 1, Textile Titan: a hulking, muscular giant sewn of tan fabric with red patchwork stripes, two horns and a snarl, holding a giant sewing needle like a sword. Attack: a mighty forward needle thrust. Recoil: staggers back, stitches straining, thread trailing.
Row 2, Vampire: a pale woman with tall black hair, red eyes, big fangs, a huge ruffled collar and a crimson ball gown, flaring a long black cape lined in red. Attack: lunges forward, fangs bared, cape flared wide. Recoil: reels back, hand to her forehead, collar crumpled.
Row 3, Orchestra Elemental: a horned figure in golden-orange armor assembled from brass horns, a cello and a keyboard, swinging a huge golden trumpet like a club. Attack: a wide trumpet swing forward. Recoil: staggers back, instruments clanging.

Style: 16-bit pixel art like SNES-era JRPG battle sprites. Chibi proportions: big heads, small bodies, expressive faces and oversized weapons. A thick, dark outline around every character, flat cel shading with few colors, and high contrast, so each sprite still reads when shrunk to 96 pixels tall.

Rules:
- Each character looks identical in all three of its poses: same colors, outfit, proportions and weapon. Only the pose changes.
- Each row is a different character. Don't let their colors or features blend.
- Each sprite is centered in its own cell with clear magenta space all around it. Nothing crosses into a neighboring cell.
- In each row, the three sprites are the same size and stand on the same baseline.
- No magenta, pink or purple anywhere on the characters.
- No text, labels, numbers, grid lines, borders, shadows, motion lines, or effects that float free of the character.
```

## 19-monsters: Coral Colossus, Troll, Paradox Sphinx ✅ done

```text
A square sprite sheet: 3 rows by 3 columns of chibi JRPG battle sprites on one flat, solid magenta (#FF00FF) background. No gradient, floor, shadows or texture anywhere in the background.

Each row is one character, drawn three times. Every character faces RIGHT, toward an unseen opponent, in a side three-quarter view. The columns are the same three poses in every row:
1. STAND: idle battle stance, weapon ready.
2. ATTACK: lunging to the right mid-strike, weapon fully extended toward the opponent, body leaning into the blow.
3. RECOIL: knocked back to the left, leaning away from the opponent, eyes squeezed shut, weapon held loosely.

Row 1, Coral Colossus: a hulking branching-coral golem in orange, teal, blue and yellow, with thick arms, small glowing eyes and a spiky coral crown. Attack: slams down a huge coral-branch fist. Recoil: knocked back, a few branches snapping.
Row 2, Troll: a hulking, round gray stone troll with a big head, two tusks, a glowing yellow eye and mossy shoulders, holding a boulder-sized club. Attack: a heavy overhead smash. Recoil: knocked back, fists drooping.
Row 3, Paradox Sphinx: a winged sphinx of bronze and gold with a royal headdress, a lion body, big spread feathered wings and huge talons. Attack: pounces forward, wings flared. Recoil: reels back, wings fluttering, head shaking.

Style: 16-bit pixel art like SNES-era JRPG battle sprites. Chibi proportions: big heads, small bodies, expressive faces and oversized weapons. A thick, dark outline around every character, flat cel shading with few colors, and high contrast, so each sprite still reads when shrunk to 96 pixels tall.

Rules:
- Each character looks identical in all three of its poses: same colors, outfit, proportions and weapon. Only the pose changes.
- Each row is a different character. Don't let their colors or features blend.
- Each sprite is centered in its own cell with clear magenta space all around it. Nothing crosses into a neighboring cell.
- In each row, the three sprites are the same size and stand on the same baseline.
- No magenta, pink or purple anywhere on the characters.
- No text, labels, numbers, grid lines, borders, shadows, motion lines, or effects that float free of the character.
```

## 20-monsters: Dozing Drake, Library Leviathan, Bureaucracy Demon ✅ done

```text
A square sprite sheet: 3 rows by 3 columns of chibi JRPG battle sprites on one flat, solid magenta (#FF00FF) background. No gradient, floor, shadows or texture anywhere in the background.

Each row is one character, drawn three times. Every character faces RIGHT, toward an unseen opponent, in a side three-quarter view. The columns are the same three poses in every row:
1. STAND: idle battle stance, weapon ready.
2. ATTACK: lunging to the right mid-strike, weapon fully extended toward the opponent, body leaning into the blow.
3. RECOIL: knocked back to the left, leaning away from the opponent, eyes squeezed shut, weapon held loosely.

Row 1, Dozing Drake: a round green dragon curled up asleep with closed eyes, folded wings, flames puffing from its snout and a huge heavy tail. Attack: a lazy big tail swing forward, still asleep. Recoil: rolled back, snoring, a puff of flame.
Row 2, Library Leviathan: a hulking whale-shaped beast built of stacked books, with a tiny tower on its back and a huge mouth. Attack: lunges forward, huge jaws open. Recoil: bounces back, books loosened.
Row 3, Bureaucracy Demon: a bald, red-horned demon in a torn gray suit with a red tie and a fanged scowl, carrying a giant fountain pen like a spear. Attack: a downward stab with the huge pen. Recoil: reels back, tie flapping.

Style: 16-bit pixel art like SNES-era JRPG battle sprites. Chibi proportions: big heads, small bodies, expressive faces and oversized weapons. A thick, dark outline around every character, flat cel shading with few colors, and high contrast, so each sprite still reads when shrunk to 96 pixels tall.

Rules:
- Each character looks identical in all three of its poses: same colors, outfit, proportions and weapon. Only the pose changes.
- Each row is a different character. Don't let their colors or features blend.
- Each sprite is centered in its own cell with clear magenta space all around it. Nothing crosses into a neighboring cell.
- In each row, the three sprites are the same size and stand on the same baseline.
- No magenta, pink or purple anywhere on the characters.
- No text, labels, numbers, grid lines, borders, shadows, motion lines, or effects that float free of the character.
```

## 21-monsters: Storm Sovereign, Beholder, Quantum Dragon ✅ done

```text
A square sprite sheet: 3 rows by 3 columns of chibi JRPG battle sprites on one flat, solid magenta (#FF00FF) background. No gradient, floor, shadows or texture anywhere in the background.

Each row is one character, drawn three times. Every character faces RIGHT, toward an unseen opponent, in a side three-quarter view. The columns are the same three poses in every row:
1. STAND: idle battle stance, weapon ready.
2. ATTACK: lunging to the right mid-strike, weapon fully extended toward the opponent, body leaning into the blow.
3. RECOIL: knocked back to the left, leaning away from the opponent, eyes squeezed shut, weapon held loosely.

Row 1, Storm Sovereign: a regal figure of pale-blue lightning and crackling energy, with branching antlers, glowing cyan eyes and a towering crown. Attack: a huge forward sweep of both crackling hands. Recoil: jolted back, crackling.
Row 2, Beholder: a round teal-green monster with a huge central eye, six smaller eyestalks, a wide fanged grin and a big mouth. Attack: lunges forward, eyestalks stretching. Recoil: knocked back, eyestalks wobbling.
Row 3, Quantum Dragon: a slender silver-blue dragon with cyan-lit wings, shimmering scales, long horns, a curling tail and huge claws. Attack: dives forward with claws out. Recoil: knocked back, wings flickering.

Style: 16-bit pixel art like SNES-era JRPG battle sprites. Chibi proportions: big heads, small bodies, expressive faces and oversized weapons. A thick, dark outline around every character, flat cel shading with few colors, and high contrast, so each sprite still reads when shrunk to 96 pixels tall.

Rules:
- Each character looks identical in all three of its poses: same colors, outfit, proportions and weapon. Only the pose changes.
- Each row is a different character. Don't let their colors or features blend.
- Each sprite is centered in its own cell with clear magenta space all around it. Nothing crosses into a neighboring cell.
- In each row, the three sprites are the same size and stand on the same baseline.
- No magenta, pink or purple anywhere on the characters.
- No text, labels, numbers, grid lines, borders, shadows, motion lines, or effects that float free of the character.
```

## 22-monsters: Recursion Wyrm ✅ done

```text
A wide sprite sheet (3:1): 1 row by 3 columns of chibi JRPG battle sprites on one flat, solid magenta (#FF00FF) background. No gradient, floor, shadows or texture anywhere in the background.

Each row is one character, drawn three times. Every character faces RIGHT, toward an unseen opponent, in a side three-quarter view. The columns are the same three poses in every row:
1. STAND: idle battle stance, weapon ready.
2. ATTACK: lunging to the right mid-strike, weapon fully extended toward the opponent, body leaning into the blow.
3. RECOIL: knocked back to the left, leaning away from the opponent, eyes squeezed shut, weapon held loosely.

Row 1, Recursion Wyrm: a brown-and-gold dragon with copper wings and green wing tips, small dragon heads sprouting from its body, and huge claws. Attack: lunges forward, claws out. Recoil: reels back, wings drooping.

Style: 16-bit pixel art like SNES-era JRPG battle sprites. Chibi proportions: big heads, small bodies, expressive faces and oversized weapons. A thick, dark outline around every character, flat cel shading with few colors, and high contrast, so each sprite still reads when shrunk to 96 pixels tall.

Rules:
- Each character looks identical in all three of its poses: same colors, outfit, proportions and weapon. Only the pose changes.
- Each row is a different character. Don't let their colors or features blend.
- Each sprite is centered in its own cell with clear magenta space all around it. Nothing crosses into a neighboring cell.
- In each row, the three sprites are the same size and stand on the same baseline.
- No magenta, pink or purple anywhere on the characters.
- No text, labels, numbers, grid lines, borders, shadows, motion lines, or effects that float free of the character.
```
