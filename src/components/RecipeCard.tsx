import React from 'react';
import { Clock, ChefHat, Users, ChevronRight, Heart, Sparkles, AlertCircle } from 'lucide-react';
import { Recipe } from '../types';
import { motion } from 'motion/react';

interface RecipeCardProps {
  recipe: Recipe;
  onClick: () => void;
  isFavorite?: boolean;
  onToggleFavorite?: (e: React.MouseEvent) => void;
}

export const RecipeCard: React.FC<RecipeCardProps> = ({ recipe, onClick, isFavorite, onToggleFavorite }) => {
  return (
    <motion.div 
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="bg-white rounded-3xl overflow-hidden shadow-sm border border-black/5 cursor-pointer group hover:shadow-md transition-all flex flex-col"
    >
      <div className="relative h-48 overflow-hidden">
        <img 
          src={recipe.imageUrl || `https://loremflickr.com/800/600/${encodeURIComponent(recipe.title.split(' ').slice(0, 3).join(','))},food/all`}
          alt={recipe.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          referrerPolicy="no-referrer"
        />
        <div className="absolute top-4 right-4 z-10">
          <button 
            onClick={onToggleFavorite}
            className={`p-2 rounded-full backdrop-blur-md transition-all ${
              isFavorite ? 'bg-rose-500 text-white shadow-lg shadow-rose-200' : 'bg-black/20 text-white hover:bg-black/40'
            }`}
          >
            <Heart className={`w-4 h-4 ${isFavorite ? 'fill-current' : ''}`} />
          </button>
        </div>
        <div className="absolute bottom-4 left-4 flex gap-2">
          <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
            recipe.difficulty === 'Easy' ? 'bg-emerald-500 text-white' :
            recipe.difficulty === 'Medium' ? 'bg-amber-500 text-white' :
            'bg-rose-500 text-white'
          }`}>
            {recipe.difficulty}
          </span>
          {recipe.score && (
            <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-neutral-100 text-neutral-600 border border-black/5">
              {Math.round((!recipe.missingIngredients || recipe.missingIngredients.length === 0) ? 100 : recipe.score)}% Match
            </span>
          )}
        </div>
      </div>

      <div className="p-6">
        <div className="space-y-1 mb-4">
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">
              {recipe.cuisine}
            </div>
            {recipe.missingIngredients && recipe.missingIngredients.length > 0 && (
              <div className="flex items-center gap-1 text-[10px] font-bold text-rose-500 uppercase tracking-widest">
                <AlertCircle className="w-3 h-3" />
                <span>{recipe.missingIngredients.length} missing</span>
              </div>
            )}
          </div>
          <h3 className="text-xl font-semibold text-neutral-900 group-hover:text-emerald-600 transition-colors">
            {recipe.title}
          </h3>
        </div>
        
        <p className="text-neutral-500 text-sm line-clamp-2 mb-4 leading-relaxed">
          {recipe.description}
        </p>

        {recipe.availableIngredientsUsed && recipe.availableIngredientsUsed.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-6">
            {recipe.availableIngredientsUsed.slice(0, 3).map((ing, i) => (
              <span key={i} className="text-[9px] font-bold uppercase tracking-widest bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-md border border-emerald-100">
                {ing}
              </span>
            ))}
            {recipe.availableIngredientsUsed.length > 3 && (
              <span className="text-[9px] font-bold uppercase tracking-widest bg-neutral-50 text-neutral-400 px-2 py-0.5 rounded-md">
                +{recipe.availableIngredientsUsed.length - 3} more
              </span>
            )}
          </div>
        )}
        
        <div className="flex items-center gap-4 text-neutral-400 text-xs font-medium">
          <div className="flex items-center gap-1.5">
            <Clock className="w-4 h-4" />
            <span>{recipe.prepTime} Prep</span>
          </div>
          <div className="flex items-center gap-1.5">
            <ChefHat className="w-4 h-4" />
            <span>{recipe.cookTime} Cook</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Users className="w-4 h-4" />
            <span>{recipe.servings} servings</span>
          </div>
        </div>
        
        <div className="mt-6 pt-4 border-t border-black/5 flex items-center justify-between text-emerald-600 font-medium text-sm">
          <span>View Recipe</span>
          <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
        </div>
      </div>
    </motion.div>
  );
};
