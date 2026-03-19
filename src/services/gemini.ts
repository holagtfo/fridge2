import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import { AnalysisResult } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function analyzeIngredients(
  base64Image: string | null, 
  manualIngredients: string[] = []
): Promise<AnalysisResult> {
  const model = "gemini-3-flash-preview";
  
  const parts: any[] = [];
  
  if (base64Image) {
    parts.push({
      inlineData: {
        mimeType: "image/jpeg",
        data: base64Image.split(',')[1] || base64Image,
      },
    });
  }

  const manualText = manualIngredients.length > 0 
    ? ` Additionally, the user has these extra ingredients: ${manualIngredients.join(", ")}.`
    : "";

  parts.push({
    text: `Identify ingredients from the image (if any) and suggest 3-4 recipes.${manualText} 
    Requirements:
    - SCALE ALL RECIPES FOR EXACTLY 2 SERVINGS.
    - 'ingredients' must be an array of objects with {amount: number, unit: string, name: string}.
    - 'prepTime' and 'cookTime' must be in simple format like "10 mins", "25 mins".
    - 'cuisine' must be a single, clear category (e.g., Chinese, Italian, Japanese, Singaporean, Indian, Western, Thai, Korean).
    - 'prepTimeMinutes' and 'cookTimeMinutes' (int).
    - Prioritize Singaporean/Asian style but allow global.
    - Nutrition facts (calories, protein, carbs, fat) for 2 servings.
    - 'appearance': A detailed visual description of the finished dish (e.g., "golden fried rice with scrambled egg pieces, red tomato chunks, and chopped spring onion on top").
    - 'imagePrompt': A detailed visual prompt for image generation based ONLY on the final recipe details.
    - INSTRUCTIONS: Provide highly specific, professional, step-by-step cooking instructions for 2 servings.
    - INGREDIENT IMPORTANCE: For every ingredient in a recipe, assign an 'importance' label:
      - 'core': Main ingredients (e.g., chicken, pasta, tofu).
      - 'supporting': Ingredients that complete the dish but aren't the main item (e.g., onion, garlic, broth).
      - 'optional': Non-essential items (e.g., garnish, extra seasoning, toppings).
    - SCORE CALCULATION (0-100):
      - Compute a 'weighted_match_score' based on available ingredients:
        - 'core' = 3 points
        - 'supporting' = 2 points
        - 'optional' = 1 point
      - Formula: (matched_weight / total_weight) * 100
      - If all ingredients are available (zero missing ingredients), the score MUST be 100.
      - Apply PENALTIES for missing ingredients:
        - Missing 'core': -20 points penalty
        - Missing 'supporting': -10 points penalty
        - Missing 'optional': 0 penalty
      - Final score should also consider cuisine match, difficulty, and prep time.
    - AVAILABLE INGREDIENTS USED: For each recipe, list the 'availableIngredientsUsed' (array of strings) that were found in the image or manual list and are used in this recipe.
    - MISSING INGREDIENTS: Identify 'missingIngredients' (array of strings) for each recipe. Every item in this list MUST correspond to one of the names in the 'ingredients' array for that recipe. Only include items that are NOT in the user's available ingredients list and are NOT common pantry staples (like salt, water, oil).
    Return JSON.`,
  });

  const response = await ai.models.generateContent({
    model,
    contents: [{ parts }],
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          ingredients: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                category: { type: Type.STRING },
              },
              required: ["name", "category"],
            },
          },
          recipes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                title: { type: Type.STRING },
                description: { type: Type.STRING },
                prepTime: { type: Type.STRING },
                prepTimeMinutes: { type: Type.INTEGER },
                cookTime: { type: Type.STRING },
                cookTimeMinutes: { type: Type.INTEGER },
                difficulty: { type: Type.STRING, enum: ["Easy", "Medium", "Hard"] },
                cuisine: { type: Type.STRING },
                score: { type: Type.NUMBER },
                availableIngredientsUsed: { type: Type.ARRAY, items: { type: Type.STRING } },
                missingIngredients: { type: Type.ARRAY, items: { type: Type.STRING } },
                ingredients: { 
                  type: Type.ARRAY, 
                  items: { 
                    type: Type.OBJECT,
                    properties: {
                      amount: { type: Type.NUMBER },
                      unit: { type: Type.STRING },
                      name: { type: Type.STRING },
                      importance: { type: Type.STRING, enum: ["core", "supporting", "optional"] },
                    },
                    required: ["amount", "unit", "name", "importance"],
                  } 
                },
                instructions: { type: Type.ARRAY, items: { type: Type.STRING } },
                servings: { type: Type.NUMBER },
                nutrition: {
                  type: Type.OBJECT,
                  properties: {
                    calories: { type: Type.NUMBER },
                    protein: { type: Type.STRING },
                    carbs: { type: Type.STRING },
                    fat: { type: Type.STRING },
                  },
                  required: ["calories", "protein", "carbs", "fat"],
                },
                appearance: { type: Type.STRING },
                imagePrompt: { type: Type.STRING },
              },
              required: ["id", "title", "description", "prepTime", "prepTimeMinutes", "cookTime", "cookTimeMinutes", "difficulty", "cuisine", "ingredients", "instructions", "servings", "nutrition", "appearance", "imagePrompt", "score", "availableIngredientsUsed", "missingIngredients"],
            },
          },
        },
        required: ["ingredients", "recipes"],
      },
    },
  });

  const text = response.text;
  if (!text) throw new Error("No response from Gemini");
  
  const result = JSON.parse(text) as any;

  // We don't generate images here anymore, as per user request to generate after selection
  result.recipes = result.recipes.map((r: any) => ({
    ...r,
    imageUrl: `https://loremflickr.com/800/600/${encodeURIComponent(r.title.split(' ').slice(0, 3).join(','))},food/all`
  }));

  return result as AnalysisResult;
}

export async function generateRecipeImage(recipe: any): Promise<string> {
  const model = "gemini-2.5-flash-image";
  
  // Construct a highly detailed prompt based on the final recipe details
  const prompt = `A professional, high-end food photography shot of ${recipe.title}. 
  Cuisine: ${recipe.cuisine}.
  Main Ingredients: ${recipe.ingredients.filter((i: any) => i.importance === 'core').map((i: any) => i.name).join(", ")}.
  Appearance: ${recipe.appearance}.
  Setting: Plated on a beautiful ceramic dish, natural soft side-lighting, shallow depth of field, 4k resolution, appetizing and vibrant colors. 
  NO text, NO people, NO logos.`;

  const response = await ai.models.generateContent({
    model,
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      imageConfig: {
        aspectRatio: "1:1",
      },
    },
  });

  for (const part of response.candidates[0].content.parts) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  
  throw new Error("Failed to generate image from Gemini");
}
