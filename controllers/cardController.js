import Card from '../models/Card.js';
import Board from '../models/Board.js';
import List from '../models/List.js';
import { analyzeCard } from '../utils/recommendations.js';
import { getCardInsights } from '../utils/geminiAI.js';

// Helper function to check if user has access to board
const checkBoardAccess = async (boardId, userId) => {
  const board = await Board.findById(boardId);
  
  if (!board) {
    return { hasAccess: false, error: 'Board not found' };
  }

  const isMember = board.members.some(
    member => member.user.toString() === userId.toString()
  );

  if (!isMember && board.owner.toString() !== userId.toString()) {
    return { hasAccess: false, error: 'Not authorized to access this board' };
  }

  return { hasAccess: true, board };
};

// @desc    Create a new card
// @route   POST /api/cards
// @access  Private
export const createCard = async (req, res) => {
  try {
    const { title, description, list, board, dueDate, labels, position } = req.body;

    if (!title || !list || !board) {
      return res.status(400).json({ message: 'Please provide title, list, and board' });
    }

    // Check board access
    const { hasAccess, error } = await checkBoardAccess(board, req.user._id);
    if (!hasAccess) {
      return res.status(error === 'Board not found' ? 404 : 403).json({ message: error });
    }

    // Verify list belongs to board
    const listDoc = await List.findById(list);
    if (!listDoc || listDoc.board.toString() !== board) {
      return res.status(400).json({ message: 'Invalid list for this board' });
    }

    // If no position provided, set to end
    let cardPosition = position;
    if (cardPosition === undefined || cardPosition === null) {
      const lastCard = await Card.findOne({ list }).sort({ position: -1 });
      cardPosition = lastCard ? lastCard.position + 1 : 0;
    }

    const card = await Card.create({
      title,
      description: description || '',
      list,
      board,
      position: cardPosition,
      dueDate: dueDate || null,
      labels: labels || [],
      createdBy: req.user._id
    });

    await card.populate('createdBy', 'name email');
    await card.populate('assignedTo', 'name email');

    res.status(201).json(card);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get all cards for a list
// @route   GET /api/cards/list/:listId
// @access  Private
export const getListCards = async (req, res) => {
  try {
    const { listId } = req.params;

    const list = await List.findById(listId);
    if (!list) {
      return res.status(404).json({ message: 'List not found' });
    }

    // Check board access
    const { hasAccess, error } = await checkBoardAccess(list.board, req.user._id);
    if (!hasAccess) {
      return res.status(403).json({ message: error });
    }

    const cards = await Card.find({ list: listId })
      .populate('createdBy', 'name email')
      .populate('assignedTo', 'name email')
      .sort({ position: 1 });

    res.json(cards);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get all cards for a board
// @route   GET /api/cards/board/:boardId
// @access  Private
export const getBoardCards = async (req, res) => {
  try {
    const { boardId } = req.params;

    // Check board access
    const { hasAccess, error } = await checkBoardAccess(boardId, req.user._id);
    if (!hasAccess) {
      return res.status(error === 'Board not found' ? 404 : 403).json({ message: error });
    }

    const cards = await Card.find({ board: boardId })
      .populate('createdBy', 'name email')
      .populate('assignedTo', 'name email')
      .populate('list', 'title')
      .sort({ position: 1 });

    res.json(cards);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get single card
// @route   GET /api/cards/:id
// @access  Private
export const getCard = async (req, res) => {
  try {
    const card = await Card.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('assignedTo', 'name email')
      .populate('list', 'title');

    if (!card) {
      return res.status(404).json({ message: 'Card not found' });
    }

    // Check board access
    const { hasAccess, error } = await checkBoardAccess(card.board, req.user._id);
    if (!hasAccess) {
      return res.status(403).json({ message: error });
    }

    res.json(card);
  } catch (error) {
    console.error(error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Card not found' });
    }
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get recommendations for a card
// @route   GET /api/cards/:id/recommendations
// @access  Private
export const getCardRecommendations = async (req, res) => {
  try {
    const card = await Card.findById(req.params.id);

    if (!card) {
      return res.status(404).json({ message: 'Card not found' });
    }

    // Check board access
    const { hasAccess, error } = await checkBoardAccess(card.board, req.user._id);
    if (!hasAccess) {
      return res.status(403).json({ message: error });
    }

    // Get all cards and lists for the board
    const [boardCards, boardLists] = await Promise.all([
      Card.find({ board: card.board }).lean(),
      List.find({ board: card.board }).lean()
    ]);

    // Get rule-based recommendations
    const ruleBasedRecommendations = analyzeCard(card.toObject(), boardCards, boardLists);

    // Get AI-powered insights (run in parallel but don't block if it fails)
    let aiInsights = null;
    try {
      aiInsights = await getCardInsights(card.toObject(), boardCards, boardLists);
    } catch (aiError) {
      console.error('AI insights failed:', aiError);
    }

    res.json({
      cardId: card._id,
      cardTitle: card.title,
      ...ruleBasedRecommendations,
      aiInsights: aiInsights
    });
  } catch (error) {
    console.error(error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Card not found' });
    }
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Update card
// @route   PUT /api/cards/:id
// @access  Private
export const updateCard = async (req, res) => {
  try {
    const card = await Card.findById(req.params.id);

    if (!card) {
      return res.status(404).json({ message: 'Card not found' });
    }

    // Check board access
    const { hasAccess, error } = await checkBoardAccess(card.board, req.user._id);
    if (!hasAccess) {
      return res.status(403).json({ message: error });
    }

    const { title, description, dueDate, labels, assignedTo } = req.body;

    if (title !== undefined) card.title = title;
    if (description !== undefined) card.description = description;
    if (dueDate !== undefined) card.dueDate = dueDate;
    if (labels !== undefined) card.labels = labels;
    if (assignedTo !== undefined) card.assignedTo = assignedTo;

    await card.save();
    await card.populate('createdBy', 'name email');
    await card.populate('assignedTo', 'name email');
    await card.populate('list', 'title');

    res.json(card);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Delete card
// @route   DELETE /api/cards/:id
// @access  Private
export const deleteCard = async (req, res) => {
  try {
    const card = await Card.findById(req.params.id);

    if (!card) {
      return res.status(404).json({ message: 'Card not found' });
    }

    // Check board access
    const { hasAccess, error } = await checkBoardAccess(card.board, req.user._id);
    if (!hasAccess) {
      return res.status(403).json({ message: error });
    }

    await card.deleteOne();

    res.json({ message: 'Card removed' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Move card to different list or position
// @route   PUT /api/cards/:id/move
// @access  Private
export const moveCard = async (req, res) => {
  try {
    const card = await Card.findById(req.params.id);

    if (!card) {
      return res.status(404).json({ message: 'Card not found' });
    }

    // Check board access
    const { hasAccess, error } = await checkBoardAccess(card.board, req.user._id);
    if (!hasAccess) {
      return res.status(403).json({ message: error });
    }

    const { listId, position } = req.body;

    if (!listId || position === undefined) {
      return res.status(400).json({ message: 'Please provide listId and position' });
    }

    // Verify list belongs to same board
    const newList = await List.findById(listId);
    if (!newList || newList.board.toString() !== card.board.toString()) {
      return res.status(400).json({ message: 'Invalid list for this board' });
    }

    card.list = listId;
    card.position = position;

    await card.save();
    await card.populate('createdBy', 'name email');
    await card.populate('assignedTo', 'name email');
    await card.populate('list', 'title');

    res.json(card);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Reorder cards within a list
// @route   PUT /api/cards/reorder
// @access  Private
export const reorderCards = async (req, res) => {
  try {
    const { listId, cardOrders } = req.body;

    if (!listId || !cardOrders || !Array.isArray(cardOrders)) {
      return res.status(400).json({ message: 'Please provide listId and cardOrders array' });
    }

    const list = await List.findById(listId);
    if (!list) {
      return res.status(404).json({ message: 'List not found' });
    }

    // Check board access
    const { hasAccess, error } = await checkBoardAccess(list.board, req.user._id);
    if (!hasAccess) {
      return res.status(403).json({ message: error });
    }

    // Update positions
    const updatePromises = cardOrders.map(({ cardId, position }) => 
      Card.findByIdAndUpdate(cardId, { position }, { new: true })
    );

    await Promise.all(updatePromises);

    const cards = await Card.find({ list: listId })
      .populate('createdBy', 'name email')
      .populate('assignedTo', 'name email')
      .sort({ position: 1 });

    res.json(cards);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};
