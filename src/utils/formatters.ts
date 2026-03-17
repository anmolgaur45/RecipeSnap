import { Recipe, Ingredient } from '@/store/types';

export function formatShoppingList(recipe: Recipe): string {
  const grouped = groupIngredientsByCategory(recipe.ingredients);
  const lines: string[] = [`🛒 ${recipe.title} — Shopping List\n`];

  for (const [category, items] of Object.entries(grouped)) {
    lines.push(`${capitalize(category)}:`);
    for (const item of items) {
      const optional = item.isOptional ? ' (optional)' : '';
      lines.push(`  • ${item.quantity} ${item.item}${optional}`);
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}

export function groupIngredientsByCategory(
  ingredients: Ingredient[]
): Record<string, Ingredient[]> {
  return ingredients.reduce<Record<string, Ingredient[]>>((acc, ing) => {
    const key = ing.category;
    if (!acc[key]) acc[key] = [];
    acc[key].push(ing);
    return acc;
  }, {});
}

export function formatRecipeAsText(recipe: Recipe): string {
  const lines: string[] = [
    `📖 ${recipe.title}`,
    '',
  ];

  if (recipe.description) lines.push(recipe.description, '');

  const meta: string[] = [];
  if (recipe.servings) meta.push(`Serves: ${recipe.servings}`);
  if (recipe.prepTime) meta.push(`Prep: ${recipe.prepTime}`);
  if (recipe.cookTime) meta.push(`Cook: ${recipe.cookTime}`);
  if (meta.length) lines.push(meta.join(' · '), '');

  lines.push('INGREDIENTS', '----------');
  for (const ing of recipe.ingredients) {
    const optional = ing.isOptional ? ' (optional)' : '';
    lines.push(`• ${ing.quantity} ${ing.item}${optional}`);
  }
  lines.push('');

  lines.push('INSTRUCTIONS', '------------');
  for (const step of recipe.steps) {
    lines.push(`${step.stepNumber}. ${step.instruction}`);
    if (step.tip) lines.push(`   💡 Tip: ${step.tip}`);
  }

  if (recipe.notes) {
    lines.push('', 'NOTES', '-----', recipe.notes);
  }

  lines.push('', `Source: ${recipe.sourceUrl}`);

  return lines.join('\n');
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function detectPlatformFromUrl(url: string): 'instagram' | 'tiktok' | 'youtube' | 'unknown' {
  try {
    const { hostname } = new URL(url);
    if (hostname.includes('instagram.com')) return 'instagram';
    if (hostname.includes('tiktok.com')) return 'tiktok';
    if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) return 'youtube';
  } catch {
    // Invalid URL
  }
  return 'unknown';
}

export function isValidVideoUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    const supported = [
      'instagram.com', 'www.instagram.com',
      'tiktok.com', 'www.tiktok.com', 'vm.tiktok.com',
      'youtube.com', 'www.youtube.com', 'youtu.be',
    ];
    return supported.some((d) => hostname === d || hostname.endsWith(`.${d}`));
  } catch {
    return false;
  }
}
