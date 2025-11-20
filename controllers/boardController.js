import Board from '../models/Board.js';
import User from '../models/User.js';
import Invite from '../models/Invite.js';
import Card from '../models/Card.js';
import List from '../models/List.js';
import crypto from 'crypto';

// @desc    Create a new board
// @route   POST /api/boards
// @access  Private
export const createBoard = async (req, res) => {
  try {
    const { title, background } = req.body;

    if (!title) {
      return res.status(400).json({ message: 'Please provide a board title' });
    }

    const board = await Board.create({
      title,
      owner: req.user._id,
      background: background || '#0079bf',
      members: [{
        user: req.user._id,
        role: 'admin'
      }]
    });

    await board.populate('owner', 'name email');
    await board.populate('members.user', 'name email');

    res.status(201).json(board);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get all boards for logged in user
// @route   GET /api/boards
// @access  Private
export const getUserBoards = async (req, res) => {
  try {
    const boards = await Board.find({
      $or: [
        { owner: req.user._id },
        { 'members.user': req.user._id }
      ]
    })
    .populate('owner', 'name email')
    .populate('members.user', 'name email')
    .sort({ updatedAt: -1 });

    res.json(boards);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get single board by ID
// @route   GET /api/boards/:id
// @access  Private
export const getBoard = async (req, res) => {
  try {
    const board = await Board.findById(req.params.id)
      .populate('owner', 'name email')
      .populate('members.user', 'name email');

    if (!board) {
      return res.status(404).json({ message: 'Board not found' });
    }

    // Check if user is owner or member
    const isMember = board.members.some(
      member => member.user._id.toString() === req.user._id.toString()
    );

    if (!isMember && board.owner._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to access this board' });
    }

    res.json(board);
  } catch (error) {
    console.error(error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Board not found' });
    }
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Update board
// @route   PUT /api/boards/:id
// @access  Private
export const updateBoard = async (req, res) => {
  try {
    const board = await Board.findById(req.params.id);

    if (!board) {
      return res.status(404).json({ message: 'Board not found' });
    }

    // Check if user is owner or admin
    const member = board.members.find(
      m => m.user.toString() === req.user._id.toString()
    );

    if (board.owner.toString() !== req.user._id.toString() && 
        (!member || member.role !== 'admin')) {
      return res.status(403).json({ message: 'Not authorized to update this board' });
    }

    const { title, background } = req.body;
    
    if (title) board.title = title;
    if (background) board.background = background;

    await board.save();
    await board.populate('owner', 'name email');
    await board.populate('members.user', 'name email');

    res.json(board);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Delete board
// @route   DELETE /api/boards/:id
// @access  Private
export const deleteBoard = async (req, res) => {
  try {
    const board = await Board.findById(req.params.id);

    if (!board) {
      return res.status(404).json({ message: 'Board not found' });
    }

    // Only owner can delete
    if (board.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to delete this board' });
    }

    await board.deleteOne();

    res.json({ message: 'Board removed' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get card recommendations within board context
// @route   GET /api/boards/:id/cards/:cardId/recommendations
// @access  Private
export const getCardRecommendationsInBoard = async (req, res) => {
  try {
    const { id: boardId, cardId } = req.params;

    // Check board access
    const { hasAccess, error } = await checkBoardAccess(boardId, req.user._id);
    if (!hasAccess) {
      return res.status(error === 'Board not found' ? 404 : 403).json({ message: error });
    }

    // Get card and verify it belongs to this board
    const card = await Card.findById(cardId);

    if (!card) {
      return res.status(404).json({ message: 'Card not found' });
    }

    if (card.board.toString() !== boardId) {
      return res.status(400).json({ message: 'Card does not belong to this board' });
    }

    // Get all cards and lists for the board
    const [boardCards, boardLists] = await Promise.all([
      Card.find({ board: boardId }).lean(),
      List.find({ board: boardId }).lean()
    ]);

    // Analyze card and get recommendations
    const { analyzeCard } = await import('../utils/recommendations.js');
    const recommendations = analyzeCard(card.toObject(), boardCards, boardLists);

    res.json({
      boardId,
      cardId: card._id,
      cardTitle: card.title,
      recommendations
    });
  } catch (error) {
    console.error(error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ message: 'Card or board not found' });
    }
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Add member to board
// @route   POST /api/boards/:id/members
// @access  Private
export const addMember = async (req, res) => {
  try {
    const { userId, role } = req.body;
    const board = await Board.findById(req.params.id);

    if (!board) {
      return res.status(404).json({ message: 'Board not found' });
    }

    // Check if user is owner or admin
    const member = board.members.find(
      m => m.user.toString() === req.user._id.toString()
    );

    if (board.owner.toString() !== req.user._id.toString() && 
        (!member || member.role !== 'admin')) {
      return res.status(403).json({ message: 'Not authorized to add members' });
    }

    // Check if user is already a member
    const existingMember = board.members.find(
      m => m.user.toString() === userId
    );

    if (existingMember) {
      return res.status(400).json({ message: 'User is already a member' });
    }

    board.members.push({
      user: userId,
      role: role || 'member'
    });

    await board.save();
    await board.populate('owner', 'name email');
    await board.populate('members.user', 'name email');

    res.json(board);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Invite user to board
// @route   POST /api/boards/:id/invite
// @access  Private
export const inviteUser = async (req, res) => {
  try {
    const { email, role } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Please provide an email address' });
    }

    const board = await Board.findById(req.params.id);

    if (!board) {
      return res.status(404).json({ message: 'Board not found' });
    }

    // Check if user is owner or admin
    const member = board.members.find(
      m => m.user.toString() === req.user._id.toString()
    );

    if (board.owner.toString() !== req.user._id.toString() && 
        (!member || member.role !== 'admin')) {
      return res.status(403).json({ message: 'Not authorized to invite members' });
    }

    // Check if inviting self
    if (email.toLowerCase() === req.user.email.toLowerCase()) {
      return res.status(400).json({ message: 'You cannot invite yourself' });
    }

    // Check if user exists
    const invitedUser = await User.findOne({ email: email.toLowerCase() });

    if (invitedUser) {
      // User exists - add directly to board
      const existingMember = board.members.find(
        m => m.user.toString() === invitedUser._id.toString()
      );

      if (existingMember) {
        return res.status(400).json({ message: 'User is already a member of this board' });
      }

      board.members.push({
        user: invitedUser._id,
        role: role || 'member'
      });

      await board.save();
      await board.populate('owner', 'name email');
      await board.populate('members.user', 'name email');

      return res.json({
        message: 'User added to board successfully',
        board
      });
    } else {
      // User doesn't exist - create pending invite
      
      // Check if there's already a pending invite
      const existingInvite = await Invite.findOne({
        email: email.toLowerCase(),
        board: board._id,
        status: 'pending'
      });

      if (existingInvite) {
        return res.status(400).json({ 
          message: 'An invitation has already been sent to this email',
          invite: {
            email: existingInvite.email,
            token: existingInvite.token,
            expiresAt: existingInvite.expiresAt
          }
        });
      }

      // Generate unique token
      const token = crypto.randomBytes(32).toString('hex');

      // Create invite that expires in 7 days
      const invite = await Invite.create({
        board: board._id,
        email: email.toLowerCase(),
        invitedBy: req.user._id,
        token,
        role: role || 'member',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });

      await invite.populate('board', 'title');
      await invite.populate('invitedBy', 'name email');

      return res.status(201).json({
        message: 'Invitation created successfully. User will be added when they register.',
        invite: {
          email: invite.email,
          token: invite.token,
          board: invite.board,
          invitedBy: invite.invitedBy,
          expiresAt: invite.expiresAt
        }
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Accept invite and join board
// @route   POST /api/boards/accept-invite/:token
// @access  Private
export const acceptInvite = async (req, res) => {
  try {
    const invite = await Invite.findOne({ 
      token: req.params.token,
      status: 'pending'
    })
    .populate('board')
    .populate('invitedBy', 'name email');

    if (!invite) {
      return res.status(404).json({ message: 'Invite not found or already used' });
    }

    // Check if invite has expired
    if (invite.expiresAt < new Date()) {
      invite.status = 'expired';
      await invite.save();
      return res.status(400).json({ message: 'Invite has expired' });
    }

    // Check if user's email matches invite email
    if (req.user.email.toLowerCase() !== invite.email.toLowerCase()) {
      return res.status(403).json({ message: 'This invite was sent to a different email address' });
    }

    const board = await Board.findById(invite.board._id);

    if (!board) {
      return res.status(404).json({ message: 'Board not found' });
    }

    // Check if already a member
    const existingMember = board.members.find(
      m => m.user.toString() === req.user._id.toString()
    );

    if (existingMember) {
      invite.status = 'accepted';
      await invite.save();
      return res.status(400).json({ message: 'You are already a member of this board' });
    }

    // Add user to board
    board.members.push({
      user: req.user._id,
      role: invite.role
    });

    await board.save();

    // Mark invite as accepted
    invite.status = 'accepted';
    await invite.save();

    await board.populate('owner', 'name email');
    await board.populate('members.user', 'name email');

    res.json({
      message: 'Successfully joined the board',
      board
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get pending invites for a board
// @route   GET /api/boards/:id/invites
// @access  Private
export const getBoardInvites = async (req, res) => {
  try {
    const board = await Board.findById(req.params.id);

    if (!board) {
      return res.status(404).json({ message: 'Board not found' });
    }

    // Check if user is owner or admin
    const member = board.members.find(
      m => m.user.toString() === req.user._id.toString()
    );

    if (board.owner.toString() !== req.user._id.toString() && 
        (!member || member.role !== 'admin')) {
      return res.status(403).json({ message: 'Not authorized to view invites' });
    }

    const invites = await Invite.find({
      board: board._id,
      status: 'pending'
    })
    .populate('invitedBy', 'name email')
    .sort({ createdAt: -1 });

    res.json(invites);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};
