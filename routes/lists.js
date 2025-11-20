import express from 'express';
import {
  createList,
  getBoardLists,
  getList,
  updateList,
  deleteList,
  reorderLists
} from '../controllers/listController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.post('/', protect, createList);
router.put('/reorder', protect, reorderLists);
router.get('/board/:boardId', protect, getBoardLists);
router.route('/:id')
  .get(protect, getList)
  .put(protect, updateList)
  .delete(protect, deleteList);

export default router;
