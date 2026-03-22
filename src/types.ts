export interface Ingredient {
  name: string;
  category: string;
}

export interface IngredientItem {
  amount: number;
  unit: string;
  name: string;
  importance: 'core' | 'supporting' | 'optional';
}

export interface Recipe {
  id: string;
  title: string;
  description: string;
  prepTime: string; // e.g., "15 mins"
  prepTimeMinutes: number; // for filtering
  cookTime: string;
  cookTimeMinutes: number; // for sorting
  difficulty: 'Easy' | 'Medium' | 'Hard';
  cuisine: string;
  ingredients: IngredientItem[];
  availableIngredientsUsed: string[];
  missingIngredients: string[];
  instructions: string[];
  servings: number;
  score: number; // 0-100 based on match, difficulty, time, etc.
  imageUrl?: string;
  appearance?: string;
  imagePrompt?: string;
  nutrition?: {
    calories: number;
    protein: string;
    carbs: string;
    fat: string;
  };
}

export interface AnalysisResult {
  ingredients: Ingredient[];
  recipes: Recipe[];
}
