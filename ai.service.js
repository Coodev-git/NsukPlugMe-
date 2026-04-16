'use strict';

const logger = require('../utils/logger');

// ── Attempt to load OpenAI (optional dependency) ─────────────
let openai = null;
try {
  if (process.env.OPENAI_API_KEY) {
    const { OpenAI } = require('openai');
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    logger.info('AI Service: OpenAI connected');
  } else {
    logger.info('AI Service: No OPENAI_API_KEY — using built-in optimizer');
  }
} catch {
  logger.warn('AI Service: OpenAI package not available — using built-in optimizer');
}

// ─────────────────────────────────────────────────────────────
// BUILT-IN OPTIMIZER (no API key needed)
// Simple rule-based text improvement
// ─────────────────────────────────────────────────────────────
const CATEGORY_HINTS = {
  laundry:     'Specify number of clothing items and preferred pickup time.',
  delivery:    'Include pickup location, destination, and item description.',
  tech:        'Describe the device, error message or issue in detail.',
  food:        'Mention dietary restrictions, quantity, and delivery location.',
  hair_beauty: 'State the service needed (e.g., haircut, braiding) and preferred style.',
  printing:    'State page count, paper type, and whether it needs binding.',
  tutoring:    'State the subject, topic, and your current level of understanding.',
  other:       'Be as specific as possible about what you need done.',
};

function builtInOptimize(title, description, category) {
  // Capitalise first letter of description
  let optimized = description.charAt(0).toUpperCase() + description.slice(1);

  // Ensure ends with period
  if (!/[.!?]$/.test(optimized.trim())) optimized = optimized.trim() + '.';

  // Add category hint if description is short
  const hint = CATEGORY_HINTS[category] || CATEGORY_HINTS.other;
  if (description.trim().split(' ').length < 12) {
    optimized += ` ${hint}`;
  }

  // Build improved title if too vague
  let improvedTitle = title;
  if (title.trim().split(' ').length < 3) {
    const categoryLabel = category.replace('_', ' ');
    improvedTitle = `${title} — ${categoryLabel} help needed`;
  }

  return {
    title:       improvedTitle,
    description: optimized,
    method:      'built-in',
  };
}

// ─────────────────────────────────────────────────────────────
// OpenAI OPTIMIZER
// ─────────────────────────────────────────────────────────────
async function openaiOptimize(title, description, category) {
  const systemPrompt = `You are a helpful assistant for a campus marketplace called NSUK PlugMe.
A student has posted a job request. Improve the TITLE and DESCRIPTION so that campus workers 
understand the task clearly. Keep it concise, specific, and natural.
Respond ONLY with valid JSON in this format:
{"title": "...", "description": "..."}`;

  const userPrompt = `Category: ${category}
Original title: ${title}
Original description: ${description}`;

  const response = await openai.chat.completions.create({
    model:       'gpt-3.5-turbo',
    messages:    [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt },
    ],
    max_tokens:  200,
    temperature: 0.4,
  });

  const raw  = response.choices[0].message.content.trim();
  const data = JSON.parse(raw);
  return { title: data.title, description: data.description, method: 'openai' };
}

// ─────────────────────────────────────────────────────────────
// EXPORTED FUNCTION
// ─────────────────────────────────────────────────────────────
const optimizeJobRequest = async (title, description, category) => {
  try {
    if (openai) {
      return await openaiOptimize(title, description, category);
    }
    return builtInOptimize(title, description, category);
  } catch (err) {
    logger.warn(`AI optimization failed (${err.message}) — using built-in fallback`);
    return builtInOptimize(title, description, category);
  }
};

module.exports = { optimizeJobRequest };
