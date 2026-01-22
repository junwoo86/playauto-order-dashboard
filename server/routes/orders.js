import { Router } from 'express';
import { query, SCHEMA } from '../services/database.js';

const router = Router();

// 주문 목록 조회 (DB에서, 페이징 지원)
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      shop_cd,
      sdate,
      edate,
      status,
      search
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    if (shop_cd) {
      whereConditions.push(`shop_cd = $${paramIndex}`);
      params.push(shop_cd);
      paramIndex++;
    }

    if (sdate) {
      whereConditions.push(`ord_time >= $${paramIndex}`);
      params.push(sdate);
      paramIndex++;
    }

    if (edate) {
      whereConditions.push(`ord_time <= $${paramIndex}`);
      params.push(edate + ' 23:59:59');
      paramIndex++;
    }

    if (status) {
      whereConditions.push(`ord_status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    if (search) {
      whereConditions.push(`(shop_sale_name ILIKE $${paramIndex} OR order_name ILIKE $${paramIndex} OR shop_ord_no ILIKE $${paramIndex})`);
      const searchTerm = `%${search}%`;
      params.push(searchTerm);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0
      ? 'WHERE ' + whereConditions.join(' AND ')
      : '';

    // 총 개수 조회
    const countResult = await query(`SELECT COUNT(*) as total FROM ${SCHEMA}.orders ${whereClause}`, params);
    const total = parseInt(countResult.rows[0].total);

    // 데이터 조회
    const dataResult = await query(`
      SELECT * FROM ${SCHEMA}.orders
      ${whereClause}
      ORDER BY ord_time DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, parseInt(limit), offset]);

    res.json({
      orders: dataResult.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: error.message });
  }
});

// 특정 주문 상세 조회
router.get('/:uniq', async (req, res) => {
  try {
    const result = await query(`SELECT * FROM ${SCHEMA}.orders WHERE uniq = $1`, [req.params.uniq]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
