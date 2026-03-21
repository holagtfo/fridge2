import { GoogleGenAI } from '@google/genai';

function safeJsonParse(text: string) {
  const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
  return JSON.parse(cleaned);
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { image, manualIngredients = [], servings = 2 } = req.body || {};

    if (!image) {
      return res.status(400).json({ error: 'No image provided' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Missing GEMINI_API_KEY in server environment' });
    }

    const ai = new GoogleGenAI({ apiKey });

    const mimeTypeMatch = image.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
    const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : 'image/jpeg';
    const base64Data = image.includes(',') ? image.split(',')[1] : image;

    const manualList =
      Array.isArray(manualIngredients) && manualIngredients.length > 0
        ? manualIngredients.join(', ')
        : 'None';

    const prompt = `
You are a food ingredient recognition and recipe recommendation assistant.

First, identify visible ingredients from the fridge image.
Then combine them with these manually added ingredients: ${manualList}.

Generate recipe suggestions based on the available ingredients.

Rules:
- Return ONLY valid JSON
- Do not wrap the JSON in markdown
- Each recipe must have a unique "id" string (e.g. "recipe_1", "recipe_2")
- prepTime and cookTime must look like "10 mins"
- prepTimeMinutes must be a number
- cuisine must be a fixed cuisine category such as "Chinese", "Italian", "Japanese", "Malay", "Indian", "Western", "Thai", "Korean", "Fusion", "Singaporean"
- ingredients array must include: name, amount, unit, importance
- importance must be one of: "core", "supporting", "optional"
- missingIngredients should only include ingredients not available from the image + manual list
- availableIngredientsUsed should list ingredients the user already has
- score should be 0 to 100
- servings should be ${servings}
- FIX: imageUrl must be unique per recipe using the recipe title words as the search term.
  Format: "https://loremflickr.com/1200/800/<keyword1>,<keyword2>,food/all"
  Example for "Tomato Egg Fried Rice": "https://loremflickr.com/1200/800/tomato,egg,food/all"
  Use 2–3 meaningful words from the recipe title, lowercase, comma-separated.

Return JSON in exactly this shape:
{
  "ingredients": [
    { "name": "egg" },
    { "name": "tomato" }
  ],
  "recipes": [
    {
      "id": "recipe_1",
      "title": "Tomato Egg Fried Rice",
      "description": "A quick savory rice dish with egg and tomato.",
      "cuisine": "Chinese",
      "difficulty": "Easy",
      "prepTime": "10 mins",
      "cookTime": "15 mins",
      "prepTimeMinutes": 10,
      "servings": ${servings},
      "ingredients": [
        { "name": "egg", "amount": 2, "unit": "", "importance": "core" },
        { "name": "cooked rice", "amount": 2, "unit": "cups", "importance": "core" },
        { "name": "tomato", "amount": 1, "unit": "", "importance": "supporting" },
        { "name": "spring onion", "amount": 1, "unit": "stalk", "importance": "optional" }
      ],
      "instructions": [
        "Beat the eggs and prepare the tomato.",
        "Heat oil and scramble the eggs.",
        "Add tomato and rice, then stir-fry well.",
        "Season and serve hot."
      ],
      "missingIngredients": [],
      "availableIngredientsUsed": ["egg", "tomato", "rice"],
      "score": 95,
      "nutrition": {
        "calories": 450,
        "protein": "18",
        "carbs": "52",
        "fat": "16"
      },
      "imageUrl": "https://loremflickr.com/1200/800/tomato,egg,food/all"
    }
  ]
}
`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType,
                data: base64Data,
              },
            },
          ],
        },
      ],
    });

    const rawText =
      typeof response?.text === 'function'
        ? response.text()
        : response?.text || response?.output_text || '';

    if (!rawText) {
      return res.status(500).json({ error: 'Gemini returned an empty response' });
    }

    let parsed;
    try {
      parsed = safeJsonParse(rawText);
    } catch (parseError) {
      console.error('Failed to parse Gemini JSON:', rawText);
      return res.status(500).json({
        error: 'Gemini response was not valid JSON',
        raw: rawText,
      });
    }

    if (!parsed.ingredients || !parsed.recipes) {
      return res.status(500).json({
        error: 'Gemini response missing ingredients or recipes',
      });
    }

    // FIX: Ensure every recipe has a unique id even if Gemini forgets to assign one.
    // The frontend uses recipe.id as a React key and to track image generation —
    // duplicate or missing IDs will cause images to be assigned to the wrong recipe.
    parsed.recipes = parsed.recipes.map((recipe: any, index: number) => ({
      ...recipe,
      id: recipe.id && recipe.id.trim() ? recipe.id : `recipe_${index + 1}`,
    }));

    return res.status(200).json(parsed);
  } catch (error: any) {
    console.error('Analyze API error:', error);
    return res.status(500).json({
      error: error?.message || 'Failed to analyze ingredients',
    });
  }
}
