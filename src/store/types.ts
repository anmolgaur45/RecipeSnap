export type Platform = 'instagram_reel' | 'tiktok' | 'youtube_short' | 'unknown';

export type Difficulty = 'easy' | 'medium' | 'hard';

export type Confidence = 'high' | 'medium' | 'low';

export type IngredientCategory =
  | 'produce'
  | 'dairy'
  | 'protein'
  | 'spices'
  | 'pantry'
  | 'other';

export type GroceryAisle =
  | 'produce'
  | 'dairy'
  | 'bakery'
  | 'meat'
  | 'frozen'
  | 'spices'
  | 'pantry'
  | 'beverages'
  | 'other';

export type RecipeTagType = 'cuisine' | 'diet' | 'difficulty' | 'method' | 'time' | 'custom' | 'category';

export type AdaptationType =
  | 'vegan'
  | 'vegetarian'
  | 'gluten-free'
  | 'dairy-free'
  | 'keto'
  | 'halal'
  | 'nut-free'
  | 'custom';

// ── Nutrition ─────────────────────────────────────────────────────────────────

export interface NutritionInfo {
  caloriesPerServing: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  fiberGrams: number;
  sugarGrams: number;
  sodiumMg: number;
  confidence: 'high' | 'medium' | 'low';
}

// ── Core recipe types ─────────────────────────────────────────────────────────

export interface Ingredient {
  id: string;
  item: string;
  quantity: string;
  category: IngredientCategory;
  isOptional: boolean;
  sortOrder?: number;
  // Parsed quantity fields (populated by ingredientParser)
  originalQuantity?: string;
  unit?: string | null;
  numericQuantity?: number | null;
  groceryAisle?: GroceryAisle;
  // Session-only: true when user applied a substitution in the current view
  substituted?: boolean;
}

export interface RecipeStep {
  stepNumber: number;
  instruction: string;
  duration: string | null;
  tip: string | null;
}

export interface SourceQuality {
  captionUseful: boolean;
  transcriptUseful: boolean;
  ocrUseful: boolean;
}

export interface Recipe {
  id: string;
  title: string;
  description: string;
  servings: string | null;
  prepTime: string | null;
  cookTime: string | null;
  difficulty: Difficulty;
  cuisine: string | null;
  ingredients: Ingredient[];
  steps: RecipeStep[];
  tags: string[];
  notes: string | null;
  confidence: Confidence;
  sourceQuality?: SourceQuality;
  sourceUrl: string;
  platform: Platform;
  createdAt: string;
  updatedAt: string;
  // Extended fields (optional — populated when available)
  originalServings?: number;
  nutrition?: NutritionInfo;
  // Adaptation provenance (set when this recipe was AI-adapted from another)
  adaptedFrom?: string | null;
  adaptationType?: string | null;
}

// ── Pantry ────────────────────────────────────────────────────────────────────

export type ExpiryStatus = 'fresh' | 'expiring_soon' | 'expired';

export interface PantryItem {
  id: number;
  item: string;
  displayName: string | null;
  quantity: string | null;
  unit: string | null;
  category: GroceryAisle | null;
  addedAt: string;
  expiresAt: string | null;
  isStaple: boolean;
  notes: string | null;
  expiryStatus: ExpiryStatus;
}

// ── Cook Sessions ─────────────────────────────────────────────────────────────

export interface CookSession {
  id: number;
  recipeId: string;
  mealPlanEntryId: number | null;
  startedAt: string;
  completedAt: string | null;
  servingsCooked: number;
  rating: number | null;
  notes: string | null;
}

// ── Meal Plans ────────────────────────────────────────────────────────────────

export type MealSlot = 'breakfast' | 'morning_snack' | 'lunch' | 'evening_snack' | 'dinner';

export interface MealPlanEntry {
  id: number;
  mealPlanId: number;
  recipeId: string;
  date: string;
  mealSlot: MealSlot;
  servings: number;
  isCooked: boolean;
  cookedAt: string | null;
  sortOrder: number;
  notes: string | null;
  // Hydrated fields (populated when fetching plan with entries)
  recipeTitle?: string;
  recipeCuisine?: string | null;
  recipeTime?: string | null;
  nutrition?: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
  } | null;
}

export interface MealPlan {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  entries?: MealPlanEntry[];
}

export interface NutritionGoal {
  id: number;
  caloriesTarget: number;
  proteinTarget: number;
  carbsTarget: number;
  fatTarget: number;
  fiberTarget: number;
  isActive: boolean;
}

export interface DayNutrition {
  date: string;
  totals: { calories: number; protein: number; carbs: number; fat: number; fiber: number };
  goals: NutritionGoal;
  percentages: { calories: number; protein: number; carbs: number; fat: number; fiber: number };
}

// ── Grocery lists ─────────────────────────────────────────────────────────────

export interface GroceryListItem {
  id: number;
  listId: number;
  recipeId: string | null;
  recipeIds: string[];        // all contributing recipe IDs
  item: string;
  quantity: string | null;
  unit: string | null;
  numericQuantity: number | null;
  aisle: GroceryAisle | null;
  isChecked: boolean;
  sortOrder: number;
}

export interface GroceryListAisle {
  aisle: string;
  items: GroceryListItem[];
}

export interface GroceryList {
  id: number;
  name: string;
  createdAt: string;
  isActive: boolean;
  recipeIds: string[];
  items?: GroceryListItem[];
  aisles?: GroceryListAisle[];
  progress?: { checked: number; total: number };
}

// ── Collections ───────────────────────────────────────────────────────────────

export interface Collection {
  id: number;
  name: string;
  emoji: string | null;
  createdAt: string;
  recipeCount: number;
  recipeIds: string[];
}

// ── Tag groups ────────────────────────────────────────────────────────────────

export interface TagGroup {
  cuisine?: string[];
  diet?: string[];
  method?: string[];
  time?: string[];
  category?: string[];
  custom?: string[];
}

// ── Tags (normalized) ─────────────────────────────────────────────────────────

export interface RecipeTag {
  id: number;
  recipeId: string;
  tag: string;
  type: RecipeTagType;
}

// ── Adaptation history ────────────────────────────────────────────────────────

export interface RecipeAdaptation {
  id: number;
  originalRecipeId: string;
  adaptedRecipeId: string;
  adaptationType: AdaptationType;
  prompt: string | null;
  createdAt: string;
}

export interface ChangedIngredient {
  original: string;
  replacement: string;
  reason: string;
}

export interface AdaptationResult {
  alreadyCompliant: boolean;
  adaptedRecipe?: Recipe;
  changedIngredients?: ChangedIngredient[];
  adaptationNotes?: string;
  confidenceScore?: 'high' | 'medium' | 'low';
  flavorImpactNote?: string | null;
  adaptationType?: string;
}

// ── Ingredient substitution ───────────────────────────────────────────────────

export type SubstitutionReason = 'dietary' | 'unavailable' | 'allergy' | 'budget';

export interface SubstitutionSuggestion {
  replacement: string;
  quantity: string;
  quantityNote: string;
  flavorImpact: string;
  textureImpact: string;
  bestFor: string;
  notRecommendedFor: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface SubstitutionResult {
  originalIngredient: string;
  substitutions: SubstitutionSuggestion[];
  recipeSpecificAdvice: string;
}

// ── Processing pipeline ───────────────────────────────────────────────────────

export type ProcessingStage =
  | 'idle'
  | 'resolving'
  | 'downloading'
  | 'extracting_audio'
  | 'transcribing'
  | 'extracting_captions'
  | 'running_ocr'
  | 'structuring'
  | 'complete'
  | 'error';

export interface ProcessingStatus {
  stage: ProcessingStage;
  message: string;
  completedSteps: ProcessingStage[];
  failedSteps: ProcessingStage[];
}

export interface ExtractionResult {
  recipe: Recipe;
  processingMeta: {
    durationMs: number;
    sourcesUsed: string[];
  };
}
