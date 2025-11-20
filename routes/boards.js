import express from 'express';
import {
  createBoard,
  getUserBoards,
  getBoard,
  updateBoard,
  deleteBoard,
  addMember,
  inviteUser,
  acceptInvite,
  getBoardInvites,
  getCardRecommendationsInBoard
} from '../controllers/boardController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.route('/')
  .post(protect, createBoard)
  .get(protect, getUserBoards);

router.post('/accept-invite/:token', protect, acceptInvite);

router.route('/:id')
  .get(protect, getBoard)
  .put(protect, updateBoard)
  .delete(protect, deleteBoard);

router.post('/:id/members', protect, addMember);
router.post('/:id/invite', protect, inviteUser);
router.get('/:id/invites', protect, getBoardInvites);
router.get('/:id/cards/:cardId/recommendations', protect, getCardRecommendationsInBoard);

export default router;
