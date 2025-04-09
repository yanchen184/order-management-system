// app.js - 主應用程序入口
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

// 載入環境變量
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// 中間件
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// 數據庫連接池配置
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '123456',
  database: process.env.DB_NAME || 'demo1',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// 創建連接池
const pool = mysql.createPool(dbConfig);

// JWT 密鑰
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

// 驗證 JWT 中間件
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ message: '未提供授權令牌' });
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: '無效或過期的令牌' });
    req.user = user;
    next();
  });
};

// 用戶登錄
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ message: '電子郵件和密碼不能為空' });
    }
    
    const connection = await pool.getConnection();
    
    try {
      const [users] = await connection.query(
        'SELECT * FROM member WHERE email = ?',
        [email]
      );
      
      if (users.length === 0) {
        return res.status(401).json({ message: '電子郵件或密碼不正確' });
      }
      
      const user = users[0];
      
      // 檢查密碼
      const passwordMatch = await bcrypt.compare(password, user.password);
      
      if (!passwordMatch) {
        return res.status(401).json({ message: '電子郵件或密碼不正確' });
      }
      
      // 生成 JWT
      const token = jwt.sign(
        { 
          id: user.id, 
          email: user.email, 
          name: user.name, 
          role: user.role 
        }, 
        JWT_SECRET, 
        { expiresIn: '1h' }
      );
      
      return res.json({ 
        message: '登錄成功', 
        token, 
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          vip: user.vip
        }
      });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('登錄錯誤:', error);
    return res.status(500).json({ message: '服務器錯誤' });
  }
});

// 獲取所有訂單
app.get('/api/orders', authenticateToken, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    
    try {
      // 實現分頁
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const offset = (page - 1) * limit;
      
      // 根據用戶角色進行不同的查詢
      let query = `
        SELECT 
          b.id AS booking_id,
          DATE_FORMAT(b.date, '%Y-%m-%d') AS booking_date,
          m.name AS member_name,
          m.email AS member_email,
          m.vip AS member_vip,
          (SELECT SUM(bd_count.count) FROM booking_detail bd_count WHERE bd_count.booking_id = b.id) AS total_items,
          (SELECT SUM(bd_sum.count * p_sum.price) 
           FROM booking_detail bd_sum 
           JOIN product p_sum ON bd_sum.product_id = p_sum.id 
           WHERE bd_sum.booking_id = b.id) AS total_amount
        FROM 
          booking b
        JOIN 
          member m ON b.member_id = m.id
      `;
      
      // 非管理員用戶只能看到自己的訂單
      if (req.user.role !== 'ADMIN') {
        query += ' WHERE m.id = ?';
      }
      
      query += ' ORDER BY b.date DESC, b.id DESC LIMIT ? OFFSET ?';
      
      // 準備查詢參數
      const queryParams = req.user.role !== 'ADMIN' 
        ? [req.user.id, limit, offset]
        : [limit, offset];
      
      // 執行查詢
      const [orders] = await connection.query(query, queryParams);
      
      // 獲取訂單總數以計算總頁數
      let countQuery = 'SELECT COUNT(*) AS total FROM booking b';
      
      if (req.user.role !== 'ADMIN') {
        countQuery += ' JOIN member m ON b.member_id = m.id WHERE m.id = ?';
      }
      
      const countParams = req.user.role !== 'ADMIN' ? [req.user.id] : [];
      const [countResult] = await connection.query(countQuery, countParams);
      
      const totalOrders = countResult[0].total;
      const totalPages = Math.ceil(totalOrders / limit);
      
      return res.json({
        orders,
        pagination: {
          total: totalOrders,
          page,
          limit,
          totalPages
        }
      });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('獲取訂單錯誤:', error);
    return res.status(500).json({ message: '服務器錯誤' });
  }
});

// 獲取單個訂單詳情
app.get('/api/orders/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const connection = await pool.getConnection();
    
    try {
      // 獲取訂單基本信息
      let orderQuery = `
        SELECT 
          b.id AS booking_id,
          DATE_FORMAT(b.date, '%Y-%m-%d') AS booking_date,
          b.created_at,
          b.created_by,
          b.updated_at,
          b.updated_by,
          m.id AS member_id,
          m.name AS member_name,
          m.email AS member_email,
          m.vip AS member_vip
        FROM 
          booking b
        JOIN 
          member m ON b.member_id = m.id
        WHERE 
          b.id = ?
      `;
      
      // 非管理員用戶只能看到自己的訂單
      if (req.user.role !== 'ADMIN') {
        orderQuery += ' AND m.id = ?';
      }
      
      // 準備查詢參數
      const orderParams = req.user.role !== 'ADMIN' 
        ? [id, req.user.id]
        : [id];
      
      // 執行查詢
      const [orderResult] = await connection.query(orderQuery, orderParams);
      
      if (orderResult.length === 0) {
        return res.status(404).json({ message: '訂單不存在或無權訪問' });
      }
      
      const order = orderResult[0];
      
      // 獲取訂單詳情
      const [detailsResult] = await connection.query(`
        SELECT 
          bd.id AS detail_id,
          bd.count AS quantity,
          bd.priority,
          p.id AS product_id,
          p.name AS product_name,
          p.price AS unit_price,
          p.picture,
          (bd.count * p.price) AS subtotal,
          pc.name AS product_category
        FROM 
          booking_detail bd
        JOIN 
          product p ON bd.product_id = p.id
        JOIN 
          product_class pc ON p.product_class_id = pc.id
        WHERE 
          bd.booking_id = ?
        ORDER BY 
          bd.priority ASC
      `, [id]);
      
      // 計算訂單總額
      const totalAmount = detailsResult.reduce((sum, item) => sum + item.subtotal, 0);
      const totalItems = detailsResult.reduce((sum, item) => sum + item.quantity, 0);
      
      return res.json({
        ...order,
        details: detailsResult,
        total_amount: totalAmount,
        total_items: totalItems
      });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('獲取訂單詳情錯誤:', error);
    return res.status(500).json({ message: '服務器錯誤' });
  }
});

// 創建新訂單
app.post('/api/orders', authenticateToken, async (req, res) => {
  try {
    const { products } = req.body;
    
    if (!products || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ message: '請提供有效的產品清單' });
    }
    
    const connection = await pool.getConnection();
    
    try {
      // 開始事務
      await connection.beginTransaction();
      
      // 創建訂單主表記錄
      const [orderResult] = await connection.query(
        `INSERT INTO booking (created_at, created_by, updated_at, updated_by, date, member_id) 
         VALUES (NOW(), ?, NOW(), ?, NOW(), ?)`,
        [req.user.email, req.user.email, req.user.id]
      );
      
      const orderId = orderResult.insertId;
      
      // 添加訂單詳情
      let priority = 1;
      for (const product of products) {
        await connection.query(
          `INSERT INTO booking_detail (created_at, created_by, updated_at, updated_by, count, priority, booking_id, product_id) 
           VALUES (NOW(), ?, NOW(), ?, ?, ?, ?, ?)`,
          [req.user.email, req.user.email, product.quantity, priority, orderId, product.product_id]
        );
        priority++;
      }
      
      // 提交事務
      await connection.commit();
      
      return res.status(201).json({ 
        message: '訂單創建成功', 
        order_id: orderId 
      });
    } catch (error) {
      // 回滾事務
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('創建訂單錯誤:', error);
    return res.status(500).json({ message: '服務器錯誤' });
  }
});

// 獲取產品列表
app.get('/api/products', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    
    try {
      // 實現分頁和過濾
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const offset = (page - 1) * limit;
      const categoryId = req.query.category;
      const searchTerm = req.query.search;
      
      let query = `
        SELECT 
          p.id AS product_id,
          p.name AS product_name,
          p.price,
          p.picture,
          pc.id AS category_id,
          pc.name AS category_name
        FROM 
          product p
        JOIN 
          product_class pc ON p.product_class_id = pc.id
        WHERE 
          p.alive = b'1' AND p.disable = b'0'
      `;
      
      const queryParams = [];
      
      // 添加類別過濾
      if (categoryId) {
        query += ' AND p.product_class_id = ?';
        queryParams.push(categoryId);
      }
      
      // 添加搜索過濾
      if (searchTerm) {
        query += ' AND p.name LIKE ?';
        queryParams.push(`%${searchTerm}%`);
      }
      
      query += ' ORDER BY p.name ASC LIMIT ? OFFSET ?';
      queryParams.push(limit, offset);
      
      // 執行查詢
      const [products] = await connection.query(query, queryParams);
      
      // 獲取產品總數以計算總頁數
      let countQuery = `
        SELECT COUNT(*) AS total 
        FROM product p
        WHERE p.alive = b'1' AND p.disable = b'0'
      `;
      
      const countParams = [];
      
      if (categoryId) {
        countQuery += ' AND p.product_class_id = ?';
        countParams.push(categoryId);
      }
      
      if (searchTerm) {
        countQuery += ' AND p.name LIKE ?';
        countParams.push(`%${searchTerm}%`);
      }
      
      const [countResult] = await connection.query(countQuery, countParams);
      
      const totalProducts = countResult[0].total;
      const totalPages = Math.ceil(totalProducts / limit);
      
      return res.json({
        products,
        pagination: {
          total: totalProducts,
          page,
          limit,
          totalPages
        }
      });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('獲取產品錯誤:', error);
    return res.status(500).json({ message: '服務器錯誤' });
  }
});

// 獲取產品類別
app.get('/api/categories', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    
    try {
      const [categories] = await connection.query(`
        SELECT 
          id AS category_id,
          name AS category_name
        FROM 
          product_class
        WHERE 
          alive = b'1' AND disable = b'0'
        ORDER BY 
          name ASC
      `);
      
      return res.json({ categories });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('獲取類別錯誤:', error);
    return res.status(500).json({ message: '服務器錯誤' });
  }
});

// 獲取銷售數據統計
app.get('/api/stats/sales', authenticateToken, async (req, res) => {
  // 只允許管理員訪問
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ message: '無權訪問此資源' });
  }
  
  try {
    const connection = await pool.getConnection();
    
    try {
      // 獲取訂單總數和銷售總額
      const [orderStats] = await connection.query(`
        SELECT 
          COUNT(DISTINCT b.id) AS total_orders,
          SUM(bd.count) AS total_items,
          SUM(bd.count * p.price) AS total_sales
        FROM 
          booking b
        JOIN 
          booking_detail bd ON b.id = bd.booking_id
        JOIN 
          product p ON bd.product_id = p.id
      `);
      
      // 獲取類別銷售數據
      const [categorySales] = await connection.query(`
        SELECT 
          pc.name AS category_name,
          COUNT(DISTINCT p.id) AS product_count,
          SUM(bd.count) AS total_sold,
          SUM(bd.count * p.price) AS total_sales
        FROM 
          product_class pc
        JOIN 
          product p ON pc.id = p.product_class_id
        JOIN 
          booking_detail bd ON p.id = bd.product_id
        WHERE
          pc.alive = b'1'
        GROUP BY 
          pc.id, pc.name
        ORDER BY 
          total_sales DESC
      `);
      
      // 獲取熱銷產品
      const [topProducts] = await connection.query(`
        SELECT 
          p.id AS product_id,
          p.name AS product_name,
          pc.name AS category_name,
          p.price AS unit_price,
          SUM(bd.count) AS total_sold,
          SUM(bd.count * p.price) AS total_sales,
          COUNT(DISTINCT b.id) AS order_count
        FROM 
          product p
        JOIN 
          product_class pc ON p.product_class_id = pc.id
        JOIN 
          booking_detail bd ON p.id = bd.product_id
        JOIN 
          booking b ON bd.booking_id = b.id
        GROUP BY 
          p.id, p.name, pc.name, p.price
        ORDER BY 
          total_sold DESC
        LIMIT 10
      `);
      
      // 獲取會員消費數據
      const [memberStats] = await connection.query(`
        SELECT 
          m.id AS member_id,
          m.name AS member_name,
          m.email AS member_email,
          m.vip AS member_vip,
          COUNT(DISTINCT b.id) AS order_count,
          SUM(bd.count) AS total_items,
          SUM(bd.count * p.price) AS total_amount
        FROM 
          member m
        JOIN 
          booking b ON m.id = b.member_id
        JOIN 
          booking_detail bd ON b.id = bd.booking_id
        JOIN 
          product p ON bd.product_id = p.id
        GROUP BY 
          m.id, m.name, m.email, m.vip
        ORDER BY 
          total_amount DESC
        LIMIT 10
      `);
      
      return res.json({
        orderStats: orderStats[0],
        categorySales,
        topProducts,
        memberStats
      });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('獲取統計數據錯誤:', error);
    return res.status(500).json({ message: '服務器錯誤' });
  }
});

// 刪除訂單
app.delete('/api/orders/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const connection = await pool.getConnection();
    
    try {
      // 檢查訂單是否存在及權限
      const [orderCheck] = await connection.query(`
        SELECT b.id, b.member_id 
        FROM booking b 
        WHERE b.id = ?
      `, [id]);
      
      if (orderCheck.length === 0) {
        return res.status(404).json({ message: '訂單不存在' });
      }
      
      // 只有管理員可以刪除訂單
      if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ message: '無權刪除訂單' });
      }
      
      // 開始事務
      await connection.beginTransaction();
      
      // 刪除訂單詳情
      await connection.query('DELETE FROM booking_detail WHERE booking_id = ?', [id]);
      
      // 刪除訂單主表記錄
      await connection.query('DELETE FROM booking WHERE id = ?', [id]);
      
      // 提交事務
      await connection.commit();
      
      return res.json({ message: '訂單刪除成功' });
    } catch (error) {
      // 回滾事務
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('刪除訂單錯誤:', error);
    return res.status(500).json({ message: '服務器錯誤' });
  }
});

// 用戶模塊 - 獲取當前用戶信息
app.get('/api/user/profile', authenticateToken, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    
    try {
      const [users] = await connection.query(
        'SELECT id, name, email, role, vip, created_at FROM member WHERE id = ?',
        [req.user.id]
      );
      
      if (users.length === 0) {
        return res.status(404).json({ message: '用戶不存在' });
      }
      
      const user = users[0];
      
      return res.json({ user });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('獲取用戶資料錯誤:', error);
    return res.status(500).json({ message: '服務器錯誤' });
  }
});

// 啟動服務器
app.listen(PORT, () => {
  console.log(`服務器運行在端口 ${PORT}`);
});

module.exports = app;