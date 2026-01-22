import { Router } from 'express';
import { query, SCHEMA, saveShops } from '../services/database.js';
import { getShops as fetchShopsFromAPI } from '../services/playauto.js';

const router = Router();

// 쇼핑몰 목록 조회 (DB에서)
router.get('/', async (req, res) => {
  try {
    const result = await query(`SELECT * FROM ${SCHEMA}.shops ORDER BY shop_name`);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching shops:', error);
    res.status(500).json({ error: error.message });
  }
});

// 쇼핑몰 목록 새로고침 (API에서 가져와서 DB에 저장)
router.post('/refresh', async (req, res) => {
  try {
    const shops = await fetchShopsFromAPI();
    const count = await saveShops(shops);
    res.json({
      success: true,
      message: `${count}개 쇼핑몰 정보 업데이트됨`,
      shops
    });
  } catch (error) {
    console.error('Error refreshing shops:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
