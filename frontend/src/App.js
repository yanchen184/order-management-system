// src/App.js
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import axios from 'axios';

// 導入頁面和組件
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import OrderList from './pages/OrderList';
import OrderDetail from './pages/OrderDetail';
import CreateOrder from './pages/CreateOrder';
import ProductList from './pages/ProductList';
import Profile from './pages/Profile';
import Navbar from './components/Navbar';
import NotFound from './pages/NotFound';
import PrivateRoute from './components/PrivateRoute';
import AdminRoute from './components/AdminRoute';

// 配置全局 API 基礎 URL
axios.defaults.baseURL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 檢查存儲在本地的令牌並獲取用戶信息
    const token = localStorage.getItem('token');
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      axios.get('/user/profile')
        .then(response => {
          setUser(response.data.user);
        })
        .catch(error => {
          console.error('Error fetching user profile:', error);
          localStorage.removeItem('token');
          delete axios.defaults.headers.common['Authorization'];
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, []);

  const handleLogin = (userData, token) => {
    setUser(userData);
    localStorage.setItem('token', token);
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
  };

  if (loading) {
    return <div className="flex items-center justify-center h-screen">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
    </div>;
  }

  return (
    <Router>
      <div className="min-h-screen bg-gray-100">
        {user && <Navbar user={user} onLogout={handleLogout} />}
        
        <div className={user ? "container mx-auto px-4 py-4 pt-20" : ""}>
          <Routes>
            <Route path="/login" element={
              !user ? (
                <Login onLogin={handleLogin} />
              ) : (
                <Navigate to="/dashboard" />
              )
            } />
            
            <Route path="/" element={
              user ? (
                <Navigate to="/dashboard" />
              ) : (
                <Navigate to="/login" />
              )
            } />
            
            <Route 
              path="/dashboard" 
              element={
                <PrivateRoute user={user}>
                  <Dashboard user={user} />
                </PrivateRoute>
              } 
            />
            
            <Route 
              path="/orders" 
              element={
                <PrivateRoute user={user}>
                  <OrderList user={user} />
                </PrivateRoute>
              } 
            />
            
            <Route 
              path="/orders/:id" 
              element={
                <PrivateRoute user={user}>
                  <OrderDetail user={user} />
                </PrivateRoute>
              } 
            />
            
            <Route 
              path="/create-order" 
              element={
                <PrivateRoute user={user}>
                  <CreateOrder user={user} />
                </PrivateRoute>
              } 
            />
            
            <Route 
              path="/products" 
              element={
                <PrivateRoute user={user}>
                  <ProductList user={user} />
                </PrivateRoute>
              } 
            />
            
            <Route 
              path="/profile" 
              element={
                <PrivateRoute user={user}>
                  <Profile user={user} />
                </PrivateRoute>
              } 
            />
            
            <Route path="*" element={<NotFound />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;