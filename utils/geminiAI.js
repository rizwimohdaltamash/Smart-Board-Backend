import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Verify API key exists
if (!process.env.GEMINI_API_KEY) {
  console.error('⚠️ GEMINI_API_KEY is not set in environment variables');
}

// Initialize Gemini AI with API key from environment
const ai = new GoogleGenAI({});

/**
 * Get AI-powered suggestions for a card using Gemini
 * @param {Object} card - Card object with title and description
 * @param {Array} boardLists - All lists in the board
 * @param {Array} boardCards - All cards in the board
 * @returns {Object} - AI-generated suggestions
 */
export const getAISuggestions = async (card, boardLists = [], boardCards = []) => {
  try {
    // Check if API key is available
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'undefined') {
      console.error('Gemini API key is missing');
      return null;
    }

    console.log('🤖 Calling Gemini AI for card:', card.title);

    const listNames = boardLists.map(list => list.title).join(', ');
    const cardTitles = boardCards
      .filter(c => c._id.toString() !== card._id.toString())
      .slice(0, 10)
      .map(c => c.title)
      .join(', ');

    const prompt = `You are a smart project management assistant. Analyze this task card and provide helpful suggestions.

Task Title: "${card.title}"
Task Description: "${card.description || 'No description'}"
Available Lists: ${listNames || 'To Do, In Progress, Done'}
Other Cards in Board: ${cardTitles || 'None'}

Please provide suggestions in the following JSON format only (no markdown, no extra text):
{
  "dueDateSuggestion": {
    "hasDate": true/false,
    "suggestedDate": "YYYY-MM-DD or null",
    "reason": "Brief explanation"
  },
  "listMovement": {
    "shouldMove": true/false,
    "suggestedList": "list name or null",
    "reason": "Brief explanation"
  },
  "insights": {
    "priority": "high/medium/low",
    "estimatedEffort": "Brief estimate",
    "actionableSteps": ["step1", "step2"],
    "potentialBlockers": ["blocker1"]
  }
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-exp',
      contents: prompt,
    });
    const text = response.text;
    
    console.log('✅ Gemini AI response received');
    
    // Try to parse JSON from response
    let jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const suggestions = JSON.parse(jsonMatch[0]);
      return suggestions;
    }

    console.warn('⚠️ Could not parse JSON from Gemini response');
    return null;
  } catch (error) {
    console.error('❌ Gemini AI error:', error.message);
    if (error.message?.includes('API key')) {
      console.error('🔑 API Key issue detected. Please verify your Gemini API key.');
    }
    return null;
  }
};

/**
 * Get AI-powered card analysis and recommendations
 * @param {Object} card - Card to analyze
 * @param {Array} boardCards - All cards in the board
 * @param {Array} boardLists - All lists in the board
 * @returns {Object} - AI insights
 */
export const getCardInsights = async (card, boardCards = [], boardLists = []) => {
  try {
    const aiSuggestions = await getAISuggestions(card, boardLists, boardCards);
    
    if (!aiSuggestions) {
      return null;
    }

    return {
      aiPowered: true,
      dueDateSuggestion: aiSuggestions.dueDateSuggestion,
      listMovement: aiSuggestions.listMovement,
      insights: aiSuggestions.insights
    };
  } catch (error) {
    console.error('Failed to get AI insights:', error);
    return null;
  }
};
