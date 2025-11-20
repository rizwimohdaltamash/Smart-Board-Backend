import List from '../models/List.js';
import Board from '../models/Board.js';

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

// @desc    Create a new list
// @route   POST /api/lists
// @access  Private
export const createList = async (req, res) => {
  try {
    const { title, board, position } = req.body;

    if (!title || !board) {
      return res.status(400).json({ message: 'Please provide title and board' });
    }

    // Check board access
    const { hasAccess, error } = await checkBoardAccess(board, req.user._id);
    if (!hasAccess) {
      return res.status(error === 'Board not found' ? 404 : 403).json({ message: error });
    }

    // If no position provided, set to end
    let listPosition = position;
    if (listPosition === undefined || listPosition === null) {
      const lastList = await List.findOne({ board }).sort({ position: -1 });
      listPosition = lastList ? lastList.position + 1 : 0;
    }

    const list = await List.create({
      title,
      board,
      position: listPosition
    });

    res.status(201).json(list);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get all lists for a board
// @route   GET /api/lists/board/:boardId
// @access  Private
export const getBoardLists = async (req, res) => {
  try {
    const { boardId } = req.params;

    // Check board access
    const { hasAccess, error } = await checkBoardAccess(boardId, req.user._id);
    if (!hasAccess) {
      return res.status(error === 'Board not found' ? 404 : 403).json({ message: error });
    }

    const lists = await List.find({ board: boardId }).sort({ position: 1 });

    res.json(lists);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get single list
// @route   GET /api/lists/:id
// @access  Private
export const getList = async (req, res) => {
  try {
    const list = await List.findById(req.params.id);

    if (!list) {
      return res.status(404).json({ message: 'List not found' });
    }

    // Check board access
    const { hasAccess, error } = await checkBoardAccess(list.board, req.user._id);
    if (!hasAccess) {
      return res.status(403).json({ message: error });
    }

    res.json(list);
  } catch (error) {
    console.error(error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ message: 'List not found' });
    }
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Update list
// @route   PUT /api/lists/:id
// @access  Private
export const updateList = async (req, res) => {
  try {
    const list = await List.findById(req.params.id);

    if (!list) {
      return res.status(404).json({ message: 'List not found' });
    }

    // Check board access
    const { hasAccess, error } = await checkBoardAccess(list.board, req.user._id);
    if (!hasAccess) {
      return res.status(403).json({ message: error });
    }

    const { title, position } = req.body;

    if (title !== undefined) list.title = title;
    if (position !== undefined) list.position = position;

    await list.save();

    res.json(list);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Delete list
// @route   DELETE /api/lists/:id
// @access  Private
export const deleteList = async (req, res) => {
  try {
    const list = await List.findById(req.params.id);

    if (!list) {
      return res.status(404).json({ message: 'List not found' });
    }

    // Check board access
    const { hasAccess, error } = await checkBoardAccess(list.board, req.user._id);
    if (!hasAccess) {
      return res.status(403).json({ message: error });
    }

    await list.deleteOne();

    res.json({ message: 'List removed' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Reorder lists
// @route   PUT /api/lists/reorder
// @access  Private
export const reorderLists = async (req, res) => {
  try {
    const { boardId, listOrders } = req.body;

    if (!boardId || !listOrders || !Array.isArray(listOrders)) {
      return res.status(400).json({ message: 'Please provide boardId and listOrders array' });
    }

    // Check board access
    const { hasAccess, error } = await checkBoardAccess(boardId, req.user._id);
    if (!hasAccess) {
      return res.status(error === 'Board not found' ? 404 : 403).json({ message: error });
    }

    // Update positions
    const updatePromises = listOrders.map(({ listId, position }) => 
      List.findByIdAndUpdate(listId, { position }, { new: true })
    );

    await Promise.all(updatePromises);

    const lists = await List.find({ board: boardId }).sort({ position: 1 });

    res.json(lists);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};
