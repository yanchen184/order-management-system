# 訂單管理系統

一個完整的訂單管理系統，包含前端界面和後端 API，用於管理、查詢和分析訂單數據。

## 功能特點

- 用戶認證與權限管理 (管理員/普通用戶)
- 完整的訂單管理 (創建、查詢、刪除)
- 產品管理與分類
- 訂單數據分析與可視化
- 響應式界面設計，適配桌面和移動設備

## 技術棧

### 後端
- Node.js
- Express
- MySQL
- JSON Web Token (JWT) 認證

### 前端
- React
- React Router
- Axios
- Recharts (圖表)
- Tailwind CSS (樣式)

## 系統結構

```
order-management-system/
├── backend/                # 後端代碼
│   ├── app.js              # 主應用程序入口
│   ├── controllers/        # 控制器
│   ├── middleware/         # 中間件
│   ├── routes/             # 路由
│   └── utils/              # 工具函數
├── frontend/               # 前端代碼
│   ├── public/             # 靜態資源
│   └── src/                # 源代碼
│       ├── components/     # 組件
│       ├── pages/          # 頁面
│       ├── App.js          # 主應用組件
│       └── index.js        # 入口文件
└── README.md               # 項目說明文檔
```

## 版本

**當前版本:** 1.0.0

## 許可協議

MIT License