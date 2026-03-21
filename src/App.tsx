import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Camera as CameraIcon, Upload, ChefHat, ArrowLeft, UtensilsCrossed, Sparkles, Loader2, ChevronDown, Plus, X, Heart, Zap, Info, RefreshCw, ShoppingCart, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Camera } from './components/Camera';
import { RecipeCard } from './components/RecipeCard';
import { Recipe, Ingredient, AnalysisResult } from './types';

export default function App() {
  const [showCamera, setShowCamera] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  // Store only the selected recipe ID; derive the full object from result
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  // Use a ref for imagePreview so handleCapture never closes over a stale value
  const imagePreviewRef = useRef<string | null>(null);

  // Manual Ingredients
  const [manualIngredients, setManualIngredients] = useState<string[]>([]);
  const [newIngredient, setNewIngredient] = useState('');
  const [recipeServings, setRecipeServings] = useState<number>(2);

  // In-UI error state instead of alert()
  const [error, setError] = useState<string | null>(null);

  // Favorites
  const [favorites, setFavorites] = useState<Recipe[]>(() => {
    try {
      const saved = localStorage.getItem('snapchef_favorites');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [viewingFavorites, setViewingFavorites] = useState(false);

  // Filtering state
  const [difficultyFilter, setDifficultyFilter] = useState<string>('All');
  const [cuisineFilter, setCuisineFilter] = useState<string>('All');
  const [prepTimeFilter, setPrepTimeFilter] = useState<string>('All');

  // Track which recipe IDs have already been queued for image generation
  const generatingRef = useRef<Set<string>>(new Set());

  // Derive selectedRecipe from result + selectedRecipeId.
  // Any imageUrl update in result.recipes is automatically reflected here.
  const selectedRecipe = useMemo(() => {
    if (!selectedRecipeId) return null;
    return (
      result?.recipes?.find(r => r.id === selectedRecipeId) ??
      favorites.find(f => f.id === selectedRecipeId) ??
      null
    );
  }, [result, favorites, selectedRecipeId]);

  // FIX: Only show the generating spinner if there is truly no imageUrl at all.
  // loremflickr URLs from analyze.ts are treated as valid images — they display
  // on the dashboard and carry through unchanged to the detail view, so clicking
  // a recipe card immediately shows the same image with no spinner or regeneration.
  const isGeneratingImage = useMemo(() => {
    if (!selectedRecipe) return false;
    return !selectedRecipe.imageUrl;
  }, [selectedRecipe]);

  // Pre-compute isFavorite for selected recipe once, not inline 3x in JSX
  const isCurrentFavorite = useMemo(
    () => favorites.some(f => f.id === selectedRecipe?.id),
    [favorites, selectedRecipe]
  );

  useEffect(() => {
    localStorage.setItem('snapchef_favorites', JSON.stringify(favorites));
  }, [favorites]);

  // Helper: generate image for a single recipe and update result state
  const generateImage = useCallback(async (recipe: Recipe) => {
    try {
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipe }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to generate image');

      const newImageUrl = data.imageUrl;

      setResult(prev => {
        if (!prev) return null;
        return {
          ...prev,
          recipes: prev.recipes.map(r =>
            r.id === recipe.id ? { ...r, imageUrl: newImageUrl } : r
          ),
        };
      });

      return newImageUrl;
    } catch (err) {
      console.error(`Image generation failed for ${recipe.title}:`, err);
      return null;
    }
  }, []);

  // Helper: generate a batch of recipes in parallel
  const generateBatch = useCallback(
    (recipes: Recipe[]) => Promise.all(recipes.map(generateImage)),
    [generateImage]
  );

  // Only queue recipes with no imageUrl at all — loremflickr URLs count as valid
  // and will not be replaced. Depends on stable recipe ID list so it won't
  // re-fire on imageUrl updates.
  useEffect(() => {
    const generateAllImages = async () => {
      if (!result?.recipes?.length) return;

      const toGenerate = result.recipes.filter(
        r => !r.imageUrl && !generatingRef.current.has(r.id)
      );

      if (toGenerate.length === 0) return;

      // Mark all as queued immediately to prevent double-firing
      toGenerate.forEach(r => generatingRef.current.add(r.id));

      // Priority: selected recipe first for a fast detail view load
      const priority = toGenerate.filter(r => r.id === selectedRecipeId);
      const rest = toGenerate.filter(r => r.id !== selectedRecipeId);

      if (priority.length) await generateBatch(priority);

      // Generate remaining in pairs to avoid hammering the API
      for (let i = 0; i < rest.length; i += 2) {
        await generateBatch(rest.slice(i, i + 2));
      }
    };

    generateAllImages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.recipes?.map(r => r.id).join(','), generateBatch]);

  const handleCapture = async (
    base64: string | null,
    currentManual: string[] = manualIngredients
  ) => {
    setShowCamera(false);
    setError(null);

    const finalImage = base64 || imagePreviewRef.current;

    if (base64) {
      setImagePreview(base64);
      imagePreviewRef.current = base64;
    }

    if (!finalImage) {
      setError('No image found. Please upload or capture an image first.');
      return;
    }

    setIsAnalyzing(true);
    setSelectedRecipeId(null);
    generatingRef.current = new Set();

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: finalImage,
          manualIngredients: currentManual,
          servings: recipeServings,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to analyze ingredients');

      setResult(data);
    } catch (err: any) {
      console.error('Analysis failed:', err);
      setError(err?.message || 'Failed to analyze ingredients. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const cuisines = useMemo(() => {
    const recipes = viewingFavorites ? favorites : (result?.recipes || []);
    const unique = Array.from(new Set(recipes.map(r => r.cuisine)));
    return ['All', ...unique];
  }, [result?.recipes, favorites, viewingFavorites]);

  const filteredRecipes = useMemo(() => {
    const recipes = viewingFavorites ? favorites : (result?.recipes || []);

    return recipes
      .filter(recipe => {
        const difficultyMatch = difficultyFilter === 'All' || recipe.difficulty === difficultyFilter;
        const cuisineMatch = cuisineFilter === 'All' || recipe.cuisine === cuisineFilter;

        let prepMatch = true;
        if (prepTimeFilter === '< 15 mins') prepMatch = recipe.prepTimeMinutes < 15;
        else if (prepTimeFilter === '15-30 mins') prepMatch = recipe.prepTimeMinutes >= 15 && recipe.prepTimeMinutes <= 30;
        else if (prepTimeFilter === '> 30 mins') prepMatch = recipe.prepTimeMinutes > 30;

        return difficultyMatch && cuisineMatch && prepMatch;
      })
      .sort((a, b) => (b.score || 0) - (a.score || 0));
  }, [result?.recipes, favorites, viewingFavorites, difficultyFilter, cuisineFilter, prepTimeFilter]);

  // Narrow dependency so shoppingRecommendation doesn't recalculate on imageUrl updates
  const missingIngredientKey = useMemo(
    () => result?.recipes?.map(r => r.missingIngredients.join('|')).join(',') ?? '',
    [result?.recipes]
  );

  const shoppingRecommendation = useMemo(() => {
    if (!result || viewingFavorites) return null;

    const missingCounts: Record<string, number> = {};
    result.recipes.forEach(recipe => {
      recipe.missingIngredients.forEach(ing => {
        const normalized = ing.toLowerCase().trim();
        missingCounts[normalized] = (missingCounts[normalized] || 0) + 1;
      });
    });

    const sortedMissing = Object.entries(missingCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2);

    if (sortedMissing.length === 0) return null;

    const topIngredients = sortedMissing.map(([name]) => name);

    const unlockedCount = result.recipes.filter(recipe => {
      if (recipe.missingIngredients.length === 0) return false;
      return recipe.missingIngredients.every(ing =>
        topIngredients.includes(ing.toLowerCase().trim())
      );
    }).length;

    if (unlockedCount === 0) return null;

    return { ingredients: topIngredients, count: unlockedCount };
  }, [missingIngredientKey, viewingFavorites]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        handleCapture(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const addManualIngredient = (e: React.FormEvent) => {
    e.preventDefault();
    if (newIngredient.trim()) {
      const updated = [...manualIngredients, newIngredient.trim()];
      setManualIngredients(updated);
      setNewIngredient('');
    }
  };

  const removeManualIngredient = (index: number) => {
    setManualIngredients(manualIngredients.filter((_, i) => i !== index));
  };

  const toggleFavorite = (recipe: Recipe, e: React.MouseEvent) => {
    e.stopPropagation();
    const isFav = favorites.some(f => f.id === recipe.id);
    if (isFav) {
      setFavorites(favorites.filter(f => f.id !== recipe.id));
    } else {
      setFavorites([...favorites, recipe]);
    }
  };

  const reset = () => {
    setResult(null);
    setSelectedRecipeId(null);
    setImagePreview(null);
    imagePreviewRef.current = null;
    setDifficultyFilter('All');
    setCuisineFilter('All');
    setPrepTimeFilter('All');
    setViewingFavorites(false);
    setManualIngredients([]);
    setError(null);
    generatingRef.current = new Set();
  };

  return (
    <div className="min-h-screen bg-[#FDFCFB] text-neutral-900 font-sans selection:bg-emerald-100 selection:text-emerald-900">
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-xl border-b border-black/5 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2 cursor-pointer" onClick={reset}>
          <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-200">
            <ChefHat className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">SnapChef</h1>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              setViewingFavorites(!viewingFavorites);
              setResult(null);
              setSelectedRecipeId(null);
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              viewingFavorites ? 'bg-rose-500 text-white shadow-lg shadow-rose-200' : 'text-neutral-500 hover:bg-neutral-100'
            }`}
          >
            <Heart className={`w-4 h-4 ${viewingFavorites ? 'fill-current' : ''}`} />
            <span className="hidden sm:inline">Favorites</span>
          </button>
          {(result || viewingFavorites) && !selectedRecipe && (
            <button
              onClick={reset}
              className="text-sm font-medium text-neutral-500 hover:text-neutral-900 transition-colors"
            >
              Start Over
            </button>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-12">
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mb-6 flex items-center gap-3 bg-rose-50 border border-rose-100 text-rose-700 rounded-2xl px-5 py-4 text-sm font-medium"
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-500" />
              <span className="flex-1">{error}</span>
              <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-600 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {!result && !isAnalyzing && !selectedRecipe && !viewingFavorites && (
            <motion.div
              key="landing"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="text-center space-y-12"
            >
              <div className="space-y-4">
                <h2 className="text-5xl font-bold tracking-tight leading-[1.1]">
                  What's in your <span className="text-emerald-600 italic font-serif">fridge?</span>
                </h2>
                <p className="text-neutral-500 text-lg max-w-md mx-auto leading-relaxed">
                  Snap a photo of your ingredients and let AI suggest delicious{' '}
                  <span className="text-neutral-900 font-medium">Global & Singaporean</span> recipes.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <button
                  onClick={() => setShowCamera(true)}
                  className="group relative overflow-hidden bg-neutral-900 text-white rounded-3xl p-8 flex flex-col items-center gap-4 shadow-2xl hover:bg-black transition-all"
                  id="open-camera-btn"
                >
                  <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                    <CameraIcon className="w-8 h-8" />
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-semibold">Take a Photo</div>
                    <div className="text-white/50 text-sm mt-1">Capture ingredients with your camera</div>
                  </div>
                </button>

                <label className="group cursor-pointer bg-white border-2 border-dashed border-neutral-200 rounded-3xl p-8 flex flex-col items-center gap-4 hover:border-emerald-500 hover:bg-emerald-50 transition-all">
                  <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                  <div className="w-16 h-16 bg-neutral-50 rounded-2xl flex items-center justify-center group-hover:bg-emerald-100 transition-colors">
                    <Upload className="w-8 h-8 text-neutral-400 group-hover:text-emerald-600" />
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-semibold text-neutral-900">Upload Image</div>
                    <div className="text-neutral-400 text-sm mt-1">Choose a photo from your gallery</div>
                  </div>
                </label>
              </div>
            </motion.div>
          )}

          {isAnalyzing && (
            <motion.div
              key="analyzing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-20 space-y-8"
            >
              <div className="relative">
                {imagePreview ? (
                  <img
                    src={imagePreview}
                    className="w-48 h-48 object-cover rounded-3xl opacity-50 grayscale blur-sm"
                    alt="Preview"
                  />
                ) : (
                  <div className="w-48 h-48 bg-neutral-100 rounded-3xl flex items-center justify-center">
                    <UtensilsCrossed className="w-12 h-12 text-neutral-300" />
                  </div>
                )}
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="w-12 h-12 text-emerald-600 animate-spin" />
                </div>
              </div>
              <div className="text-center space-y-4">
                <div className="flex items-center justify-center gap-2 text-emerald-600 font-bold uppercase tracking-widest text-xs">
                  <Zap className="w-4 h-4 fill-current" />
                  <span>Fast Analysis Active</span>
                </div>
                <h3 className="text-2xl font-bold">Brainstorming Ideas</h3>
                <p className="text-neutral-500 animate-pulse">Gemini is finding the perfect match...</p>
              </div>
            </motion.div>
          )}

          {(result || viewingFavorites) && !selectedRecipe && (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-12"
            >
              {viewingFavorites ? (
                <div className="space-y-2">
                  <h2 className="text-3xl font-bold tracking-tight">Your Favorites</h2>
                  <p className="text-neutral-500">Recipes you've saved for later.</p>
                </div>
              ) : (
                <section className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold uppercase tracking-widest text-neutral-400">Ingredients Found</h3>
                    <span className="text-xs font-medium bg-emerald-100 text-emerald-700 px-2 py-1 rounded-md">
                      {(result?.ingredients.filter(ing => !manualIngredients.some(m => m.toLowerCase() === ing.name.toLowerCase())).length || 0) + manualIngredients.length} Items
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {result?.ingredients
                      .filter(ing => !manualIngredients.some(m => m.toLowerCase() === ing.name.toLowerCase()))
                      .map((ing, i) => (
                        <span
                          key={i}
                          className="bg-white border border-black/5 px-4 py-2 rounded-2xl text-sm font-medium shadow-sm"
                        >
                          {ing.name}
                        </span>
                      ))}
                    {manualIngredients.map((ing, i) => (
                      <span
                        key={`manual-${i}`}
                        className="bg-emerald-50 border border-emerald-100 text-emerald-700 px-4 py-2 rounded-2xl text-sm font-bold shadow-sm flex items-center gap-2"
                      >
                        {ing}
                        <button onClick={() => removeManualIngredient(i)}>
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>

                  <div className="bg-white rounded-3xl p-6 border border-black/5 shadow-sm space-y-4">
                    <div className="flex items-center gap-2 text-neutral-900 font-bold text-sm">
                      <Plus className="w-4 h-4" />
                      <span>Add missing ingredient</span>
                    </div>
                    <form onSubmit={addManualIngredient} className="flex gap-2">
                      <input
                        type="text"
                        value={newIngredient}
                        onChange={e => setNewIngredient(e.target.value)}
                        placeholder="e.g., Oyster Sauce, Basil..."
                        className="flex-1 bg-neutral-50 border border-black/5 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
                      />
                      <button
                        type="submit"
                        className="bg-emerald-600 text-white px-6 rounded-2xl font-bold hover:bg-emerald-700 transition-colors"
                      >
                        Add
                      </button>
                    </form>
                    {manualIngredients.length > 0 && (
                      <button
                        onClick={() => handleCapture(null)}
                        className="w-full py-3 bg-neutral-900 text-white rounded-2xl font-bold hover:bg-black transition-all flex items-center justify-center gap-2"
                      >
                        <RefreshCw className="w-4 h-4" />
                        <span>Update Recipes</span>
                      </button>
                    )}
                  </div>

                  {shoppingRecommendation && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="bg-emerald-600 text-white rounded-3xl p-6 shadow-xl shadow-emerald-200 space-y-3 relative overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 p-4 opacity-10">
                        <ShoppingCart className="w-24 h-24 rotate-12" />
                      </div>
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-emerald-100">
                        <Sparkles className="w-4 h-4 fill-current" />
                        <span>Smart Recommendation</span>
                      </div>
                      <p className="text-lg font-bold leading-tight relative z-10">
                        Buying{' '}
                        <span className="text-emerald-200">
                          {shoppingRecommendation.ingredients.join(' and ')}
                        </span>{' '}
                        would unlock {shoppingRecommendation.count} more recipes!
                      </p>
                      <div className="text-xs text-emerald-100/80 italic">
                        Based on common missing ingredients across suggestions.
                      </div>
                    </motion.div>
                  )}
                </section>
              )}

              <section className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-neutral-400">
                    {viewingFavorites ? `${filteredRecipes.length} Saved Recipes` : 'Suggested Recipes'}
                  </h3>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative inline-block">
                      <select
                        value={cuisineFilter}
                        onChange={e => setCuisineFilter(e.target.value)}
                        className="appearance-none bg-white border border-black/5 rounded-xl px-4 py-2 pr-10 text-[10px] font-bold uppercase tracking-wider shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all cursor-pointer"
                      >
                        {cuisines.map(c => (
                          <option key={c} value={c}>{c} Cuisine</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-neutral-400 pointer-events-none" />
                    </div>

                    <div className="relative inline-block">
                      <select
                        value={difficultyFilter}
                        onChange={e => setDifficultyFilter(e.target.value)}
                        className="appearance-none bg-white border border-black/5 rounded-xl px-4 py-2 pr-10 text-[10px] font-bold uppercase tracking-wider shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all cursor-pointer"
                      >
                        <option value="All">All Difficulty</option>
                        <option value="Easy">Easy</option>
                        <option value="Medium">Medium</option>
                        <option value="Hard">Hard</option>
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-neutral-400 pointer-events-none" />
                    </div>

                    <div className="relative inline-block">
                      <select
                        value={prepTimeFilter}
                        onChange={e => setPrepTimeFilter(e.target.value)}
                        className="appearance-none bg-white border border-black/5 rounded-xl px-4 py-2 pr-10 text-[10px] font-bold uppercase tracking-wider shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all cursor-pointer"
                      >
                        <option value="All">All Prep Time</option>
                        <option value="< 15 mins">&lt; 15 mins</option>
                        <option value="15-30 mins">15-30 mins</option>
                        <option value="> 30 mins">&gt; 30 mins</option>
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-neutral-400 pointer-events-none" />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {filteredRecipes.length > 0 ? (
                    filteredRecipes.map(recipe => (
                      <RecipeCard
                        key={recipe.id}
                        recipe={recipe}
                        onClick={() => setSelectedRecipeId(recipe.id)}
                        isFavorite={favorites.some(f => f.id === recipe.id)}
                        onToggleFavorite={e => toggleFavorite(recipe, e)}
                      />
                    ))
                  ) : (
                    <div className="col-span-full py-12 text-center bg-neutral-50 rounded-3xl border border-dashed border-neutral-200">
                      <p className="text-neutral-400 text-sm">No recipes match your filters.</p>
                      <button
                        onClick={() => {
                          setDifficultyFilter('All');
                          setCuisineFilter('All');
                          setPrepTimeFilter('All');
                        }}
                        className="mt-2 text-emerald-600 text-sm font-medium hover:underline"
                      >
                        Clear Filters
                      </button>
                    </div>
                  )}
                </div>
              </section>
            </motion.div>
          )}

          {selectedRecipe && (
            <motion.div
              key="recipe-detail"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setSelectedRecipeId(null)}
                  className="flex items-center gap-2 text-neutral-500 hover:text-neutral-900 transition-colors group"
                >
                  <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                  <span className="text-sm font-medium">Back to suggestions</span>
                </button>
                <button
                  onClick={e => toggleFavorite(selectedRecipe, e)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                    isCurrentFavorite
                      ? 'bg-rose-500 text-white'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  }`}
                >
                  <Heart className={`w-4 h-4 ${isCurrentFavorite ? 'fill-current' : ''}`} />
                  <span>{isCurrentFavorite ? 'Saved' : 'Favorite'}</span>
                </button>
              </div>

              <div className="relative h-72 rounded-3xl overflow-hidden shadow-xl">
                <img
                  src={selectedRecipe.imageUrl || ''}
                  alt={selectedRecipe.title}
                  className={`w-full h-full object-cover transition-all duration-700 ${
                    isGeneratingImage ? 'scale-110 blur-sm opacity-50' : 'scale-100 blur-0 opacity-100'
                  }`}
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />

                {isGeneratingImage && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/20 backdrop-blur-[2px]">
                    <div className="bg-white/90 backdrop-blur-md px-6 py-4 rounded-2xl shadow-2xl flex flex-col items-center gap-3">
                      <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
                      <div className="text-center">
                        <div className="text-sm font-bold text-neutral-900">Loading Image</div>
                        <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mt-0.5">
                          Just a moment...
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="absolute bottom-6 left-6 right-6">
                  <div className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-2">
                    {selectedRecipe.cuisine}
                  </div>
                  <h2 className="text-3xl font-bold tracking-tight text-white">{selectedRecipe.title}</h2>
                </div>
              </div>

              <p className="text-neutral-500 text-lg leading-relaxed">{selectedRecipe.description}</p>

              {selectedRecipe.availableIngredientsUsed && selectedRecipe.availableIngredientsUsed.length > 0 && (
                <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-100 flex flex-wrap gap-2">
                  <span className="w-full text-[10px] font-bold uppercase tracking-widest text-emerald-600 mb-1">
                    Used from your fridge
                  </span>
                  {selectedRecipe.availableIngredientsUsed.map((ing, i) => (
                    <span
                      key={i}
                      className="bg-white px-3 py-1 rounded-xl text-xs font-bold text-emerald-700 shadow-sm border border-emerald-100"
                    >
                      {ing}
                    </span>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-3 gap-4 py-6 border-y border-black/5">
                <div className="text-center space-y-1">
                  <div className="text-xs font-bold uppercase tracking-widest text-neutral-400">Match Score</div>
                  <div className="font-bold text-emerald-600">
                    {Math.round(
                      !selectedRecipe.missingIngredients || selectedRecipe.missingIngredients.length === 0
                        ? 100
                        : selectedRecipe.score
                    )}%
                  </div>
                </div>
                <div className="text-center space-y-1 border-x border-black/5">
                  <div className="text-xs font-bold uppercase tracking-widest text-neutral-400">Prep</div>
                  <div className="font-semibold">{selectedRecipe.prepTime}</div>
                </div>
                <div className="text-center space-y-1">
                  <div className="text-xs font-bold uppercase tracking-widest text-neutral-400">Cook</div>
                  <div className="font-semibold">{selectedRecipe.cookTime}</div>
                </div>
              </div>

              <div className="flex items-center justify-center gap-8 py-4 bg-neutral-50 rounded-2xl">
                <div className="text-center space-y-1">
                  <div className="text-xs font-bold uppercase tracking-widest text-neutral-400">Serves</div>
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() => setRecipeServings(Math.max(1, recipeServings - 1))}
                      className="w-6 h-6 rounded-full bg-white border border-black/5 flex items-center justify-center text-neutral-600 hover:bg-emerald-100 hover:text-emerald-600 transition-colors"
                    >
                      -
                    </button>
                    <div className="font-semibold w-4">{recipeServings}</div>
                    <button
                      onClick={() => setRecipeServings(Math.min(12, recipeServings + 1))}
                      className="w-6 h-6 rounded-full bg-white border border-black/5 flex items-center justify-center text-neutral-600 hover:bg-emerald-100 hover:text-emerald-600 transition-colors"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              {selectedRecipe.nutrition && (
                <section className="bg-neutral-50 rounded-3xl p-6 border border-black/5 space-y-4">
                  <div className="flex items-center gap-2 text-neutral-900 font-bold">
                    <Info className="w-5 h-5 text-emerald-600" />
                    <h3>Nutrition Facts (for {recipeServings} servings)</h3>
                  </div>
                  <div className="grid grid-cols-4 gap-4">
                    <div className="space-y-1">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Calories</div>
                      <div className="text-sm font-bold">
                        {Math.round((selectedRecipe.nutrition.calories / selectedRecipe.servings) * recipeServings)} kcal
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Protein</div>
                      <div className="text-sm font-bold">
                        {parseFloat(selectedRecipe.nutrition.protein)
                          ? ((parseFloat(selectedRecipe.nutrition.protein) / selectedRecipe.servings) * recipeServings).toFixed(1) + 'g'
                          : selectedRecipe.nutrition.protein}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Carbs</div>
                      <div className="text-sm font-bold">
                        {parseFloat(selectedRecipe.nutrition.carbs)
                          ? ((parseFloat(selectedRecipe.nutrition.carbs) / selectedRecipe.servings) * recipeServings).toFixed(1) + 'g'
                          : selectedRecipe.nutrition.carbs}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Fat</div>
                      <div className="text-sm font-bold">
                        {parseFloat(selectedRecipe.nutrition.fat)
                          ? ((parseFloat(selectedRecipe.nutrition.fat) / selectedRecipe.servings) * recipeServings).toFixed(1) + 'g'
                          : selectedRecipe.nutrition.fat}
                      </div>
                    </div>
                  </div>
                </section>
              )}

              <div className="space-y-10">
                <section className="space-y-4">
                  <h3 className="text-xl font-bold">Ingredients</h3>
                  <ul className="space-y-3">
                    {selectedRecipe.ingredients.map((ing, i) => {
                      const scaledAmount = (ing.amount / selectedRecipe.servings) * recipeServings;
                      const displayAmount = scaledAmount % 1 === 0 ? scaledAmount : scaledAmount.toFixed(1);

                      const isMissing = selectedRecipe.missingIngredients?.some(
                        m =>
                          ing.name.toLowerCase().includes(m.toLowerCase()) ||
                          m.toLowerCase().includes(ing.name.toLowerCase())
                      );

                      const importanceColors: Record<string, string> = {
                        core: 'bg-rose-100 text-rose-700',
                        supporting: 'bg-rose-100 text-rose-700',
                        optional: 'bg-neutral-100 text-neutral-600',
                      };

                      const displayImportance = ing.importance === 'supporting' ? 'core' : ing.importance;

                      return (
                        <li key={i} className="flex items-center gap-3 text-neutral-600">
                          <div className={`w-1.5 h-1.5 rounded-full ${isMissing ? 'bg-rose-400' : 'bg-emerald-500'}`} />
                          <span className="font-bold text-neutral-900">
                            {displayAmount} {ing.unit}
                          </span>
                          <span className={isMissing ? 'text-rose-500' : ''}>{ing.name}</span>
                          <div className="flex items-center gap-2 ml-auto">
                            {isMissing && (
                              <>
                                <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md ${importanceColors[ing.importance]}`}>
                                  {displayImportance}
                                </span>
                                <span className="text-[10px] font-bold uppercase tracking-widest bg-rose-50 text-rose-500 px-2 py-0.5 rounded-md">
                                  Missing
                                </span>
                              </>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>

                {selectedRecipe.missingIngredients && selectedRecipe.missingIngredients.length > 0 && (
                  <section className="bg-rose-50 rounded-3xl p-6 border border-rose-100 space-y-4">
                    <div className="flex items-center gap-2 text-rose-900 font-bold">
                      <AlertCircle className="w-5 h-5 text-rose-500" />
                      <h3>Shopping List</h3>
                    </div>

                    {['core', 'optional'].map(displayImportance => {
                      const missingInThisCategory = selectedRecipe.missingIngredients.filter(missingName => {
                        const originalIng = selectedRecipe.ingredients.find(
                          ing =>
                            ing.name.toLowerCase().includes(missingName.toLowerCase()) ||
                            missingName.toLowerCase().includes(ing.name.toLowerCase())
                        );
                        if (!originalIng) return false;
                        const mappedImportance = originalIng.importance === 'supporting' ? 'core' : originalIng.importance;
                        return mappedImportance === displayImportance;
                      });

                      if (missingInThisCategory.length === 0) return null;

                      return (
                        <div key={displayImportance} className="space-y-2">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-rose-400">
                            Missing {displayImportance} items
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {missingInThisCategory.map((missingName, i) => {
                              const originalIng = selectedRecipe.ingredients.find(
                                ing =>
                                  ing.name.toLowerCase().includes(missingName.toLowerCase()) ||
                                  missingName.toLowerCase().includes(ing.name.toLowerCase())
                              );

                              const scaledAmount = originalIng
                                ? (originalIng.amount / selectedRecipe.servings) * recipeServings
                                : null;
                              const displayAmount =
                                scaledAmount !== null
                                  ? scaledAmount % 1 === 0
                                    ? scaledAmount
                                    : scaledAmount.toFixed(1)
                                  : '';
                              const unit = originalIng?.unit || '';

                              return (
                                <span
                                  key={i}
                                  className="bg-white px-3 py-1 rounded-xl text-sm font-medium text-rose-600 shadow-sm flex items-center gap-1 border border-rose-100"
                                >
                                  <span className="font-bold">{displayAmount} {unit}</span>
                                  <span>{missingName}</span>
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </section>
                )}

                <section className="space-y-6">
                  <h3 className="text-xl font-bold">Instructions</h3>
                  <div className="space-y-8">
                    {selectedRecipe.instructions.map((step, i) => (
                      <div key={i} className="flex gap-6">
                        <div className="flex-shrink-0 w-8 h-8 bg-neutral-100 rounded-full flex items-center justify-center text-sm font-bold text-neutral-400">
                          {i + 1}
                        </div>
                        <p className="text-neutral-600 leading-relaxed pt-1">{step}</p>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {showCamera && (
        <Camera onCapture={handleCapture} onClose={() => setShowCamera(false)} />
      )}

      <footer className="mt-20 py-12 border-t border-black/5 text-center">
        <p className="text-neutral-400 text-sm">Powered by Gemini AI • Global & Singaporean Cuisine</p>
      </footer>
    </div>
  );
}
