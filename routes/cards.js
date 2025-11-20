import express from 'express';
import {
  createCard,
  getListCards,
  getBoardCards,
  getCard,
  updateCard,
  deleteCard,
  moveCard,
  reorderCards,
  getCardRecommendations
} from '../controllers/cardController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.post('/', protect, createCard);
router.put('/reorder', protect, reorderCards);
router.get('/list/:listId', protect, getListCards);
router.get('/board/:boardId', protect, getBoardCards);

router.route('/:id')
  .get(protect, getCard)
  .put(protect, updateCard)
  .delete(protect, deleteCard);

router.get('/:id/recommendations', protect, getCardRecommendations);
router.put('/:id/move', protect, moveCard);

export default router;
