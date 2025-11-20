// Utility functions for card analysis and recommendations

/**
 * Parse natural language date keywords from text
 * @param {string} text - Text to analyze
 * @returns {Date|null} - Suggested due date or null
 */
export const parseDateKeywords = (text) => {
  if (!text) return null;

  const lowerText = text.toLowerCase();
  const now = new Date();

  // Today
  if (lowerText.includes('today')) {
    return new Date(now.setHours(23, 59, 59, 999));
  }

  // Tomorrow
  if (lowerText.includes('tomorrow')) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(23, 59, 59, 999);
    return tomorrow;
  }

  // Next week
  if (lowerText.includes('next week')) {
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);
    nextWeek.setHours(23, 59, 59, 999);
    return nextWeek;
  }

  // This week / end of week
  if (lowerText.includes('this week') || lowerText.includes('end of week') || lowerText.includes('eow')) {
    const endOfWeek = new Date(now);
    const daysUntilFriday = (5 - endOfWeek.getDay() + 7) % 7;
    endOfWeek.setDate(endOfWeek.getDate() + (daysUntilFriday === 0 ? 7 : daysUntilFriday));
    endOfWeek.setHours(23, 59, 59, 999);
    return endOfWeek;
  }

  // Next month
  if (lowerText.includes('next month')) {
    const nextMonth = new Date(now);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    nextMonth.setHours(23, 59, 59, 999);
    return nextMonth;
  }

  // "in X days" pattern
  const inDaysMatch = lowerText.match(/in (\d+) days?/);
  if (inDaysMatch) {
    const days = parseInt(inDaysMatch[1]);
    const future = new Date(now);
    future.setDate(future.getDate() + days);
    future.setHours(23, 59, 59, 999);
    return future;
  }

  // "in X weeks" pattern
  const inWeeksMatch = lowerText.match(/in (\d+) weeks?/);
  if (inWeeksMatch) {
    const weeks = parseInt(inWeeksMatch[1]);
    const future = new Date(now);
    future.setDate(future.getDate() + (weeks * 7));
    future.setHours(23, 59, 59, 999);
    return future;
  }

  return null;
};

/**
 * Suggest list movement based on keywords in title/description
 * @param {Object} card - Card object with title and description
 * @param {Array} allLists - All lists in the board with their titles
 * @returns {Object|null} - Suggested list with reason or null
 */
export const suggestListMovement = (card, allLists) => {
  if (!card || !allLists || allLists.length === 0) return null;

  const text = `${card.title} ${card.description}`.toLowerCase();

  // Keywords for different list types
  const listPatterns = [
    {
      keywords: ['started', 'working on', 'in progress', 'doing', 'currently'],
      listTitles: ['in progress', 'doing', 'work in progress', 'wip'],
      reason: 'Keywords suggest work has started'
    },
    {
      keywords: ['done', 'completed', 'finished', 'complete'],
      listTitles: ['done', 'completed', 'finished'],
      reason: 'Keywords suggest task is completed'
    },
    {
      keywords: ['testing', 'test', 'review', 'qa'],
      listTitles: ['testing', 'review', 'qa', 'quality assurance'],
      reason: 'Keywords suggest task needs testing/review'
    },
    {
      keywords: ['blocked', 'waiting', 'stuck', 'pending'],
      listTitles: ['blocked', 'waiting', 'on hold'],
      reason: 'Keywords suggest task is blocked'
    }
  ];

  // Check each pattern
  for (const pattern of listPatterns) {
    // Check if text contains any of the keywords
    const hasKeyword = pattern.keywords.some(keyword => text.includes(keyword));
    
    if (hasKeyword) {
      // Find matching list
      const matchingList = allLists.find(list => 
        pattern.listTitles.some(title => list.title.toLowerCase().includes(title))
      );
      
      if (matchingList && matchingList._id.toString() !== card.list.toString()) {
        return {
          listId: matchingList._id,
          listTitle: matchingList.title,
          reason: pattern.reason
        };
      }
    }
  }

  return null;
};

/**
 * Calculate Jaccard similarity between two sets of words
 * @param {Set} set1 - First set of words
 * @param {Set} set2 - Second set of words
 * @returns {number} - Similarity score between 0 and 1
 */
const jaccardSimilarity = (set1, set2) => {
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  
  return union.size === 0 ? 0 : intersection.size / union.size;
};

/**
 * Extract meaningful words from text (remove common stop words)
 * @param {string} text - Text to process
 * @returns {Set} - Set of meaningful words
 */
const extractWords = (text) => {
  if (!text) return new Set();

  const stopWords = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
    'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
    'to', 'was', 'will', 'with', 'this', 'but', 'they', 'have', 'had',
    'what', 'when', 'where', 'who', 'which', 'why', 'how'
  ]);

  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));

  return new Set(words);
};

/**
 * Find related cards based on text similarity
 * @param {Object} card - Current card
 * @param {Array} allCards - All cards in the board
 * @param {number} limit - Maximum number of related cards to return
 * @param {number} threshold - Minimum similarity threshold (0-1)
 * @returns {Array} - Array of related cards with similarity scores
 */
export const findRelatedCards = (card, allCards, limit = 5, threshold = 0.2) => {
  if (!card || !allCards || allCards.length === 0) return [];

  const currentCardText = `${card.title} ${card.description}`;
  const currentWords = extractWords(currentCardText);

  if (currentWords.size === 0) return [];

  const similarities = allCards
    .filter(c => c._id.toString() !== card._id.toString()) // Exclude current card
    .map(otherCard => {
      const otherText = `${otherCard.title} ${otherCard.description}`;
      const otherWords = extractWords(otherText);
      const similarity = jaccardSimilarity(currentWords, otherWords);

      return {
        card: {
          _id: otherCard._id,
          title: otherCard.title,
          list: otherCard.list,
          dueDate: otherCard.dueDate
        },
        similarity
      };
    })
    .filter(item => item.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);

  return similarities;
};

/**
 * Main analysis function that combines all recommendation logic
 * @param {Object} card - Card to analyze
 * @param {Array} boardCards - All cards in the board
 * @param {Array} boardLists - All lists in the board
 * @returns {Object} - Analysis results with recommendations
 */
export const analyzeCard = (card, boardCards = [], boardLists = []) => {
  const analysis = {
    suggestedDueDates: [],
    suggestedListMovement: null,
    relatedCards: []
  };

  // Helper function to extract reason from text
  const extractDateReason = (text) => {
    const lowerText = text?.toLowerCase() || '';
    if (lowerText.includes('tomorrow')) return 'Mentioned "tomorrow"';
    if (lowerText.includes('today')) return 'Mentioned "today"';
    if (lowerText.includes('next week')) return 'Mentioned "next week"';
    if (lowerText.includes('this week') || lowerText.includes('end of week')) return 'Mentioned "this week"';
    if (lowerText.includes('next month')) return 'Mentioned "next month"';
    const inDaysMatch = lowerText.match(/in (\d+) days?/);
    if (inDaysMatch) return `Mentioned "in ${inDaysMatch[1]} days"`;
    const inWeeksMatch = lowerText.match(/in (\d+) weeks?/);
    if (inWeeksMatch) return `Mentioned "in ${inWeeksMatch[1]} weeks"`;
    return 'Based on card content';
  };

  // Parse due dates from title and description
  const titleDate = parseDateKeywords(card.title);
  const descriptionDate = parseDateKeywords(card.description);

  if (titleDate) {
    analysis.suggestedDueDates.push({
      date: titleDate,
      source: 'title',
      confidence: 'high',
      reason: extractDateReason(card.title)
    });
  }

  if (descriptionDate && (!titleDate || descriptionDate.getTime() !== titleDate.getTime())) {
    analysis.suggestedDueDates.push({
      date: descriptionDate,
      source: 'description',
      confidence: 'medium',
      reason: extractDateReason(card.description)
    });
  }

  // Suggest list movement
  const listSuggestion = suggestListMovement(card, boardLists);
  if (listSuggestion) {
    analysis.suggestedListMovement = listSuggestion;
  }

  // Find related cards
  const relatedCards = findRelatedCards(card, boardCards);
  analysis.relatedCards = relatedCards;

  // Add smart fallback suggestions if nothing was found
  if (!analysis.suggestedDueDates.length && !analysis.suggestedListMovement && !analysis.relatedCards.length) {
    // Provide generic helpful suggestions
    analysis.smartTips = [
      {
        icon: '💡',
        tip: 'Add time keywords like "tomorrow", "next week", or "in 3 days" to get due date suggestions'
      },
      {
        icon: '🎯',
        tip: 'Use keywords like "started working", "completed", or "testing" to get list movement suggestions'
      },
      {
        icon: '🔗',
        tip: 'Create similar cards with related topics to see related card recommendations'
      }
    ];
  }

  return analysis;
};
