/**
 * Ingredient parser utility.
 * Parses raw ingredient strings into structured objects suitable for
 * serving-size scaling, grocery list building, and pantry matching.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ParsedIngredient {
  /** Numeric value for math operations; null if unparseable (e.g. "to taste") */
  numericQuantity: number | null;
  /** Normalised unit (e.g. "cup", "tbsp", "g"); null for count-only or freeform */
  unit: string | null;
  /** Cleaned ingredient name without quantity/unit/modifiers */
  item: string;
  /** Exact original string */
  originalText: string;
  /** Trailing qualifier — "to taste", "as needed", "or more" */
  modifier?: string;
  /** Parenthetical container size — "14 oz" from "1 (14 oz) can diced tomatoes" */
  size?: string;
  /** Lo/hi bounds for ranges — [2, 3] from "2-3 cloves garlic" */
  range?: [number, number];
}

// ── Vulgar fractions ──────────────────────────────────────────────────────────

const VULGAR_FRACTIONS: Record<string, number> = {
  '½': 0.5,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '¼': 0.25,
  '¾': 0.75,
  '⅕': 0.2,
  '⅖': 0.4,
  '⅗': 0.6,
  '⅘': 0.8,
  '⅙': 1 / 6,
  '⅚': 5 / 6,
  '⅛': 0.125,
  '⅜': 0.375,
  '⅝': 0.625,
  '⅞': 0.875,
};

// ── Unit normalisation map ────────────────────────────────────────────────────

const UNIT_MAP: Record<string, string> = {
  // tablespoon
  tablespoon: 'tbsp', tablespoons: 'tbsp', tbsp: 'tbsp', Tbsp: 'tbsp', tbs: 'tbsp',
  // teaspoon
  teaspoon: 'tsp', teaspoons: 'tsp', tsp: 'tsp',
  // cup
  cup: 'cup', cups: 'cup',
  // fluid ounce
  'fluid ounce': 'fl oz', 'fluid ounces': 'fl oz', 'fl oz': 'fl oz',
  // ounce (weight)
  ounce: 'oz', ounces: 'oz', oz: 'oz',
  // pound
  pound: 'lb', pounds: 'lb', lbs: 'lb', lb: 'lb',
  // gram
  gram: 'g', grams: 'g', g: 'g', gm: 'g',
  // kilogram
  kilogram: 'kg', kilograms: 'kg', kg: 'kg',
  // milligram
  milligram: 'mg', milligrams: 'mg', mg: 'mg',
  // milliliter
  milliliter: 'ml', milliliters: 'ml', ml: 'ml', mL: 'ml',
  // liter
  liter: 'l', liters: 'l', litre: 'l', litres: 'l', l: 'l', L: 'l',
  // piece / count
  piece: 'piece', pieces: 'piece', pcs: 'piece', pc: 'piece',
  // clove
  clove: 'clove', cloves: 'clove',
  // slice
  slice: 'slice', slices: 'slice',
  // can
  can: 'can', cans: 'can',
  // package / packet
  package: 'package', packages: 'package', pkg: 'package',
  packet: 'package', packets: 'package',
  // bag
  bag: 'bag', bags: 'bag',
  // bunch
  bunch: 'bunch', bunches: 'bunch',
  // head
  head: 'head', heads: 'head',
  // stalk / rib
  stalk: 'stalk', stalks: 'stalk', rib: 'stalk', ribs: 'stalk',
  // sprig
  sprig: 'sprig', sprigs: 'sprig',
  // leaf
  leaf: 'leaf', leaves: 'leaf',
  // pinch
  pinch: 'pinch', pinches: 'pinch',
  // dash
  dash: 'dash', dashes: 'dash',
  // handful
  handful: 'handful', handfuls: 'handful',
  // drop
  drop: 'drop', drops: 'drop',
  // quart
  quart: 'qt', quarts: 'qt', qt: 'qt',
  // pint
  pint: 'pt', pints: 'pt', pt: 'pt',
  // gallon
  gallon: 'gal', gallons: 'gal', gal: 'gal',
};

// Count descriptors that mean "N pieces" (not a unit themselves)
const COUNT_DESCRIPTORS = new Set([
  'large', 'medium', 'small', 'extra-large', 'xl', 'lg', 'sm',
  'whole', 'fresh', 'ripe', 'raw',
]);

// ── Trailing modifiers ────────────────────────────────────────────────────────

const TRAILING_MODIFIERS = [
  'to taste',
  'as needed',
  'as required',
  'or more',
  'or less',
  'or to taste',
  'optional',
  'if desired',
  'for serving',
  'for garnish',
  'to garnish',
  'to serve',
];

// ── Grocery aisle keyword lists ───────────────────────────────────────────────

type GroceryAisle =
  | 'produce' | 'dairy' | 'bakery' | 'meat'
  | 'frozen' | 'spices' | 'pantry' | 'beverages' | 'other';

const AISLE_KEYWORDS: Record<GroceryAisle, string[]> = {
  produce: [
    'garlic', 'onion', 'shallot', 'leek', 'scallion', 'chive',
    'tomato', 'potato', 'sweet potato', 'yam',
    'carrot', 'celery', 'parsnip', 'turnip', 'beet', 'radish',
    'spinach', 'kale', 'arugula', 'lettuce', 'cabbage', 'chard', 'bok choy',
    'broccoli', 'cauliflower', 'brussels sprout', 'zucchini', 'squash',
    'cucumber', 'eggplant', 'aubergine', 'artichoke', 'asparagus',
    'bell pepper', 'jalapeño', 'chili', 'pepper',
    'mushroom', 'corn', 'pea', 'green bean', 'snap pea', 'edamame',
    'avocado', 'apple', 'banana', 'lemon', 'lime', 'orange', 'grapefruit',
    'strawberry', 'blueberry', 'raspberry', 'blackberry', 'cherry',
    'grape', 'peach', 'plum', 'mango', 'papaya', 'pineapple', 'kiwi',
    'watermelon', 'melon', 'pear', 'fig', 'date',
    'basil', 'cilantro', 'parsley', 'mint', 'dill', 'rosemary',
    'thyme', 'sage', 'tarragon', 'chives', 'watercress',
    'ginger', 'turmeric', 'lemongrass',
  ],
  dairy: [
    'milk', 'whole milk', 'skim milk', 'buttermilk', 'heavy cream',
    'heavy whipping cream', 'whipping cream', 'half and half', 'half-and-half',
    'cream', 'sour cream', 'crème fraîche',
    'butter', 'unsalted butter', 'salted butter', 'ghee',
    'yogurt', 'greek yogurt',
    'cheese', 'cheddar', 'mozzarella', 'parmesan', 'parmigiano',
    'ricotta', 'cottage cheese', 'cream cheese', 'brie', 'gouda',
    'feta', 'goat cheese', 'gruyère', 'swiss cheese', 'provolone',
    'egg', 'eggs', 'egg white', 'egg yolk',
  ],
  bakery: [
    'bread', 'white bread', 'whole wheat bread', 'sourdough',
    'baguette', 'brioche', 'ciabatta', 'focaccia', 'pita',
    'naan', 'flatbread', 'tortilla', 'wrap',
    'bun', 'roll', 'dinner roll', 'hamburger bun',
    'bagel', 'english muffin', 'croissant',
  ],
  meat: [
    'chicken', 'chicken breast', 'chicken thigh', 'chicken leg', 'chicken wing',
    'ground chicken', 'rotisserie chicken',
    'beef', 'ground beef', 'steak', 'ribeye', 'sirloin', 'tenderloin',
    'brisket', 'chuck', 'roast beef', 'short rib',
    'pork', 'pork chop', 'pork loin', 'pork belly', 'bacon', 'ham',
    'prosciutto', 'pancetta', 'sausage', 'chorizo', 'salami',
    'lamb', 'lamb chop', 'ground lamb',
    'turkey', 'ground turkey', 'turkey breast',
    'fish', 'salmon', 'tuna', 'cod', 'tilapia', 'halibut', 'sea bass',
    'shrimp', 'prawn', 'crab', 'lobster', 'scallop', 'clam', 'mussel',
    'squid', 'octopus', 'anchovy',
    'duck', 'venison', 'veal',
  ],
  frozen: [
    'frozen', 'frozen peas', 'frozen corn', 'frozen spinach',
    'frozen broccoli', 'frozen berries', 'frozen mango',
    'ice cream', 'sorbet', 'gelato',
    'frozen shrimp', 'frozen fish',
  ],
  spices: [
    'salt', 'sea salt', 'kosher salt', 'black pepper', 'white pepper',
    'cumin', 'ground cumin', 'coriander', 'ground coriander',
    'paprika', 'smoked paprika', 'cayenne', 'chili powder', 'red pepper flake',
    'oregano', 'dried oregano', 'thyme', 'dried thyme',
    'cinnamon', 'ground cinnamon', 'nutmeg', 'ground nutmeg',
    'cardamom', 'cloves', 'allspice', 'star anise',
    'turmeric', 'curry powder', 'garam masala', 'five spice',
    'bay leaf', 'bay leaves', 'dried basil', 'dried parsley',
    'garlic powder', 'onion powder', 'celery salt',
    'mustard powder', 'mustard seed',
    'chili flake', 'red chili flake', 'crushed red pepper',
    'saffron', 'sumac', 'za\'atar', 'harissa',
    'vanilla', 'vanilla extract', 'almond extract',
  ],
  pantry: [
    // grains & pasta
    'flour', 'all-purpose flour', 'bread flour', 'whole wheat flour',
    'rice', 'white rice', 'brown rice', 'jasmine rice', 'basmati rice',
    'pasta', 'spaghetti', 'penne', 'fettuccine', 'linguine', 'rigatoni',
    'noodle', 'ramen', 'udon', 'soba',
    'quinoa', 'oat', 'rolled oat', 'oatmeal', 'barley', 'farro', 'couscous',
    'cornmeal', 'polenta', 'breadcrumb', 'panko',
    // legumes
    'bean', 'black bean', 'kidney bean', 'chickpea', 'garbanzo',
    'lentil', 'split pea', 'white bean', 'cannellini', 'navy bean',
    // canned
    'canned tomato', 'tomato paste', 'tomato sauce', 'crushed tomato',
    'diced tomato', 'whole tomato', 'coconut milk', 'coconut cream',
    // sweeteners
    'sugar', 'white sugar', 'brown sugar', 'powdered sugar',
    'confectioners sugar', 'honey', 'maple syrup', 'agave',
    'molasses', 'corn syrup',
    // oils & vinegars
    'olive oil', 'vegetable oil', 'canola oil', 'coconut oil',
    'sesame oil', 'avocado oil', 'neutral oil',
    'vinegar', 'white vinegar', 'apple cider vinegar', 'balsamic vinegar',
    'red wine vinegar', 'rice vinegar',
    // sauces & condiments
    'soy sauce', 'tamari', 'fish sauce', 'oyster sauce', 'hoisin',
    'worcestershire', 'hot sauce', 'sriracha', 'ketchup', 'mustard',
    'mayonnaise', 'tahini', 'miso', 'mirin', 'sake',
    // baking
    'baking powder', 'baking soda', 'yeast', 'gelatin', 'cornstarch',
    'cocoa', 'cocoa powder', 'chocolate chip', 'dark chocolate',
    'milk chocolate', 'white chocolate', 'chocolate',
    // nuts & seeds
    'almond', 'walnut', 'pecan', 'cashew', 'peanut', 'pistachio',
    'hazelnut', 'pine nut', 'sesame seed', 'sunflower seed',
    'pumpkin seed', 'chia seed', 'flax seed', 'hemp seed',
    'peanut butter', 'almond butter',
    // other
    'tofu', 'tempeh', 'seitan',
    'sun-dried tomato', 'olive', 'caper', 'pickle',
    'lard', 'shortening',
  ],
  beverages: [
    'broth', 'chicken broth', 'beef broth', 'vegetable broth',
    'stock', 'chicken stock', 'beef stock', 'vegetable stock', 'bone broth',
    'wine', 'white wine', 'red wine', 'dry wine', 'dry white wine',
    'beer', 'ale', 'lager',
    'apple juice', 'orange juice', 'lemon juice', 'lime juice',
    'tomato juice', 'pineapple juice',
    'sparkling water', 'club soda', 'tonic',
    'tea', 'green tea', 'black tea', 'coffee',
  ],
  other: [],
};

// ── Internal helpers ──────────────────────────────────────────────────────────

interface NumberResult {
  value: number;
  range?: [number, number];
  consumed: number; // characters consumed from the start of the string
}

function tryParseLeadingNumber(s: string): NumberResult | null {
  // 1. Vulgar fraction character (e.g. ½)
  for (const [ch, val] of Object.entries(VULGAR_FRACTIONS)) {
    if (s.startsWith(ch)) {
      return { value: val, consumed: ch.length };
    }
  }

  // 2. Range: 2-3 or 2 - 3 (must check before plain integer)
  const rangeM = s.match(/^(\d+)\s*[-–]\s*(\d+)/);
  if (rangeM) {
    const lo = parseInt(rangeM[1], 10);
    const hi = parseInt(rangeM[2], 10);
    if (hi > lo) {
      return {
        value: (lo + hi) / 2,
        range: [lo, hi],
        consumed: rangeM[0].length,
      };
    }
  }

  // 3. Mixed number: 2 1/2 (must check before plain integer)
  const mixedM = s.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)/);
  if (mixedM) {
    const whole = parseInt(mixedM[1], 10);
    const num = parseInt(mixedM[2], 10);
    const den = parseInt(mixedM[3], 10);
    if (den !== 0) {
      return { value: whole + num / den, consumed: mixedM[0].length };
    }
  }

  // 4. Fraction: 1/2
  const fracM = s.match(/^(\d+)\s*\/\s*(\d+)/);
  if (fracM) {
    const num = parseInt(fracM[1], 10);
    const den = parseInt(fracM[2], 10);
    if (den !== 0) {
      return { value: num / den, consumed: fracM[0].length };
    }
  }

  // 5. Decimal or whole integer
  const numM = s.match(/^(\d+(?:\.\d+)?)/);
  if (numM) {
    return { value: parseFloat(numM[1]), consumed: numM[0].length };
  }

  return null;
}

/** Extract a parenthetical size like "(14 oz)" or "(400g)" */
function extractParentheticalSize(s: string): { size: string; remainder: string } | null {
  const m = s.match(/\(\s*([^)]+)\s*\)/);
  if (!m) return null;
  // Only treat it as a "size" if it looks like a measurement
  if (/\d/.test(m[1])) {
    return {
      size: m[1].trim(),
      remainder: (s.slice(0, m.index) + s.slice(m.index! + m[0].length)).trim(),
    };
  }
  return null;
}

/** Strip and return a known trailing modifier */
function extractTrailingModifier(s: string): { modifier: string; remainder: string } | null {
  const lower = s.toLowerCase();
  for (const mod of TRAILING_MODIFIERS) {
    if (lower.endsWith(mod)) {
      return {
        modifier: mod,
        remainder: s.slice(0, s.length - mod.length).replace(/[,;]\s*$/, '').trim(),
      };
    }
    // Also check with comma before: "salt, to taste"
    const withComma = `, ${mod}`;
    if (lower.includes(withComma)) {
      const idx = lower.indexOf(withComma);
      return {
        modifier: mod,
        remainder: s.slice(0, idx).trim(),
      };
    }
  }
  return null;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Parse a raw ingredient string into structured fields.
 *
 * @example
 * parseIngredient('2 1/2 cups all-purpose flour')
 * // { numericQuantity: 2.5, unit: 'cup', item: 'all-purpose flour', ... }
 *
 * parseIngredient('salt to taste')
 * // { numericQuantity: null, unit: null, item: 'salt', modifier: 'to taste', ... }
 *
 * parseIngredient('2-3 cloves garlic')
 * // { numericQuantity: 2.5, unit: 'clove', item: 'garlic', range: [2, 3], ... }
 */
export function parseIngredient(text: string): ParsedIngredient {
  const originalText = text;
  let s = text.trim();

  const result: ParsedIngredient = {
    numericQuantity: null,
    unit: null,
    item: '',
    originalText,
  };

  // ── 1. Extract trailing modifier ──────────────────────────────────────────
  const modResult = extractTrailingModifier(s);
  if (modResult) {
    result.modifier = modResult.modifier;
    s = modResult.remainder;
  }

  // ── 2. Extract parenthetical size ─────────────────────────────────────────
  const sizeResult = extractParentheticalSize(s);
  if (sizeResult) {
    result.size = sizeResult.size;
    s = sizeResult.remainder;
  }

  // ── 3. Parse leading number ───────────────────────────────────────────────
  const numResult = tryParseLeadingNumber(s);
  if (numResult) {
    result.numericQuantity = numResult.value;
    if (numResult.range) result.range = numResult.range;
    s = s.slice(numResult.consumed).trimStart();
  }

  // ── 4. Parse unit word ────────────────────────────────────────────────────
  if (s.length > 0) {
    // Match the first word only — prevents greedily consuming "cups flour" as one token
    const firstWordM = s.match(/^([A-Za-z]+)/);
    if (firstWordM) {
      const word = firstWordM[1];
      // Try two-word unit first (e.g. "fl oz", "fluid ounce")
      const twoWordM = s.match(/^([A-Za-z]+\s+[A-Za-z]+)/);
      const twoWord = twoWordM?.[1];
      if (twoWord && UNIT_MAP[twoWord]) {
        result.unit = UNIT_MAP[twoWord];
        s = s.slice(twoWord.length).trimStart();
      } else if (UNIT_MAP[word]) {
        result.unit = UNIT_MAP[word];
        s = s.slice(word.length).trimStart();
      } else if (COUNT_DESCRIPTORS.has(word.toLowerCase())) {
        // e.g. "3 large eggs" → unit=piece, keep "large eggs" as item
        if (result.numericQuantity !== null) {
          result.unit = 'piece';
        }
        // Do NOT consume the descriptor — it belongs to the item name
      }
    }
  }

  // ── 5. Remainder is the item name ─────────────────────────────────────────
  result.item = s
    .replace(/^[,;]\s*/, '') // leading punctuation
    .trim();

  // If we have no quantity at all and no unit, everything is the item
  if (result.numericQuantity === null && result.unit === null && result.item === '') {
    result.item = text.trim();
  }

  return result;
}

/**
 * Normalise a unit string to its canonical form.
 * Returns the input unchanged if not recognised.
 *
 * @example
 * normalizeUnit('tablespoons') // 'tbsp'
 * normalizeUnit('cups')        // 'cup'
 * normalizeUnit('grams')       // 'g'
 */
export function normalizeUnit(unit: string): string {
  return UNIT_MAP[unit] ?? unit;
}

/**
 * Classify a cleaned ingredient name into a grocery store aisle.
 * Uses keyword matching; returns 'other' for unrecognised items.
 *
 * @example
 * classifyAisle('garlic')          // 'produce'
 * classifyAisle('heavy cream')     // 'dairy'
 * classifyAisle('all-purpose flour') // 'pantry'
 * classifyAisle('frozen peas')     // 'frozen'
 */
export function classifyAisle(item: string): GroceryAisle {
  const lower = item.toLowerCase().trim();

  // "frozen X" prefix always wins
  if (lower.startsWith('frozen ')) return 'frozen';

  // Find the aisle whose longest keyword matches — prefers specific over generic.
  // e.g. "black pepper" (11 chars in spices) beats "pepper" (6 chars in produce)
  let bestAisle: GroceryAisle = 'other';
  let bestLen = 0;

  for (const [aisle, keywords] of Object.entries(AISLE_KEYWORDS) as [GroceryAisle, string[]][]) {
    if (aisle === 'other') continue;
    for (const kw of keywords) {
      if ((lower === kw || lower.includes(kw)) && kw.length > bestLen) {
        bestLen = kw.length;
        bestAisle = aisle;
      }
    }
  }

  return bestAisle;
}

/**
 * Convenience: parse an ingredient string and also classify its aisle.
 */
export function parseAndClassify(text: string): ParsedIngredient & { groceryAisle: GroceryAisle } {
  const parsed = parseIngredient(text);
  return { ...parsed, groceryAisle: classifyAisle(parsed.item) };
}
